import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createProjectAt,
  applyIssueBatchAction,
  createForeshadowing,
  createLocation,
  createReference,
  createTimelineEventAtNode,
  createTimelineNode,
  createWorldEntry,
  listDocs,
  pathExists,
  type IssueDoc,
  type LocationDoc,
  type WorldEntryDoc
} from '@quillarium/core'
import type { AIConfig } from '@quillarium/ai'
import {
  applyPlanningCheckDecision,
  confirmPlanningRecord,
  createPlanningCheckDecision,
  discussPlanningRecord,
  loadPlanningSession,
  normalizePlanningDraft,
  normalizeIssueStateFromAI,
  parsePlanningAIResponse,
  runPlanningCheck,
  savePlanningSession,
  startPlanningSession
} from './planning.js'
import type { PlanningDocumentKind } from './contract.js'
import { applyPlanningCheckForIPC, decidePlanningCheckForIPC } from './agent-check.js'

const roots: string[] = []
const configuredAI: AIConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-only',
  model: 'planning-test',
  temperature: 0,
  maxTokens: 1000
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('planning proposal validation', () => {
  const representative: Array<[PlanningDocumentKind, Record<string, unknown>]> = [
    ['character', { role: 'supporting', relationships: { ally: 'char-2' } }],
    ['world_entry', { role: 'both', entry_status: 'candidate', used_in: [] }],
    ['timeline_event', { date: '第三日', characters: ['char-1'] }],
    ['location', { parent_location: null, description: '临河旧城' }],
    ['foreshadowing', { level: 'L3', state: 'planned', related_characters: [] }],
    ['strategy', { category: 'style', scope: 'project', principles: ['克制'] }],
    ['pattern', { kind: 'writing', scope: 'project', source: 'user' }],
    ['issue', { priority: 'high', state: 'open', related_docs: [] }],
    ['reference', { material_type: 'book', reading_status: 'reading' }]
  ]

  it.each(representative)('normalizes a schema-valid %s proposal', (kind, fields) => {
    const result = normalizePlanningDraft({ kind, title: `测试 ${kind}`, fields, content: '## 正文' })
    expect(result.kind).toBe(kind)
    expect(result.fields).not.toHaveProperty('id')
    expect(result.fields).not.toHaveProperty('type')
  })

  it('rejects invalid AI JSON with an actionable retry message', () => {
    expect(() => parsePlanningAIResponse('{not-json')).toThrow(/提案无效.*重试/)
  })

  it('repairs provider issue states into stable product states without rejecting the page', () => {
    expect(normalizeIssueStateFromAI('received')).toEqual({ state: 'open', repaired: true })
    expect(normalizeIssueStateFromAI('closed')).toEqual({ state: 'resolved', repaired: true })
    expect(normalizeIssueStateFromAI('provider-only-state')).toMatchObject({
      state: 'open',
      repaired: true,
      error: expect.stringContaining('provider-only-state')
    })
  })
})

describe('planning discussion side effects', () => {
  it('can seed an editable AI conversation from an existing non-AI card', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    await createWorldEntry(root, 'Harbor permits', {
      id: 'world-harbor-permits',
      triggers: ['permit'],
      enabled: true
    })

    const session = await startPlanningSession(root, 'world', 'world-harbor-permits')

    expect(session.document).toMatchObject({ id: 'world-harbor-permits', type: 'world_entry' })
    expect(session.proposal).toMatchObject({
      kind: 'world_entry',
      title: 'Harbor permits',
      fields: { triggers: ['permit'], enabled: true }
    })
  })

  it('uses project/module context and writes no file before confirmation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    const before = await snapshotPaths(root)
    let prompt = ''
    const response = await discussPlanningRecord(
      root,
      {
        module: 'characters',
        messages: [{ role: 'author', content: '建立一个谨慎的档案管理员。' }]
      },
      {
        loadAIProfile: async () => configuredAI,
        generate: async (value) => {
          prompt = value
          return JSON.stringify({
            message: '已形成可修改提案。',
            proposal: {
              kind: 'character',
              title: '档案管理员',
              fields: { role: 'supporting', desire: '保护记录' },
              content: '## Profile\n\n谨慎核对每条记录。'
            }
          })
        }
      }
    )
    expect(response.proposal?.kind).toBe('character')
    expect(prompt).toContain('Planning module opened by the author: characters')
    expect(prompt).toContain('Current project: 中性样例')
    expect(await snapshotPaths(root)).toEqual(before)
  })

  it('limits timeline assistance context and proposals to timeline nodes and events', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-timeline-scope-'))
    roots.push(root)
    await createProjectAt(root, { id: 'timeline-scope', title: '时间线范围' })
    await createTimelineNode(root, '第一日', { id: 'time-first', year: 1, month: 1 })
    await createTimelineEventAtNode(root, 'time-first', '启程', { id: 'event-departure' })
    await createLocation(root, '北门', { id: 'location-north-gate' })
    await createForeshadowing(root, '旧印', {
      id: 'foreshadow-old-seal',
      trigger_conditions: []
    })
    await createWorldEntry(root, '杂史', { id: 'world-chronicle', triggers: ['旧闻'] })
    let prompt = ''

    await expect(
      discussPlanningRecord(
        root,
        { module: 'timeline', messages: [{ role: 'author', content: '整理启程事件。' }] },
        {
          loadAIProfile: async () => configuredAI,
          generate: async (value) => {
            prompt = value
            return JSON.stringify({
              message: '错误地提出地点卡。',
              proposals: [
                {
                  id: 'proposal-out-of-scope-location',
                  kind: 'location',
                  title: '新地点',
                  fields: { kind: 'position', scale: 'estate' },
                  content: ''
                }
              ]
            })
          }
        }
      )
    ).rejects.toThrow(/超出当前“timeline”页面范围：location/u)

    expect(prompt).toContain('Allowed proposal kinds for this module: timeline_node, timeline_event')
    expect(prompt).toContain('time-first')
    expect(prompt).toContain('event-departure')
    expect(prompt).not.toContain('location-north-gate')
    expect(prompt).not.toContain('foreshadow-old-seal')
    expect(prompt).not.toContain('world-chronicle')
  })

  it('keeps multiple proposals independently switchable, restorable, confirmable, and editable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-multi-'))
    roots.push(root)
    await createProjectAt(root, { id: 'multi-sample', title: '多卡样例' })
    const session = await startPlanningSession(root, 'characters')
    const response = await discussPlanningRecord(
      root,
      {
        module: 'characters',
        sessionId: session.id,
        messages: [{ role: 'author', content: '建立两个人物。' }]
      },
      {
        loadAIProfile: async () => configuredAI,
        generate: async () =>
          JSON.stringify({
            message: '给出两张独立卡片。',
            proposals: [
              {
                id: 'proposal-character-one',
                operation: 'create',
                kind: 'character',
                title: '守门人',
                fields: { role: 'supporting' },
                content: '谨慎。'
              },
              {
                id: 'proposal-character-two',
                operation: 'create',
                kind: 'character',
                title: '副守门人',
                fields: { role: 'supporting' },
                content: '负责交接。'
              }
            ]
          })
      }
    )
    expect(response.proposals.map((proposal) => proposal.id)).toEqual([
      'proposal-character-one',
      'proposal-character-two'
    ])
    const confirmed = response.proposals.map((proposal) => ({ ...proposal, status: 'confirmed' as const }))
    await savePlanningSession(root, session.id, {
      messages: [{ role: 'author', content: '建立两个人物。' }],
      proposals: confirmed,
      selectedProposalId: 'proposal-character-two'
    })
    const restored = await loadPlanningSession(root, session.id)
    expect(restored.selected_proposal_id).toBe('proposal-character-two')
    expect(restored.proposals.every((proposal) => proposal.status === 'confirmed')).toBe(true)

    const edited = confirmed.map((proposal) =>
      proposal.id === 'proposal-character-two'
        ? {
            ...proposal,
            draft: { ...proposal.draft, title: '副守门人乙' }
          }
        : proposal
    )
    const afterEdit = await savePlanningSession(root, session.id, {
      messages: restored.messages,
      proposals: edited,
      selectedProposalId: 'proposal-character-two'
    })
    expect(afterEdit.proposals.find((proposal) => proposal.id === 'proposal-character-one')?.status).toBe(
      'confirmed'
    )
    expect(afterEdit.proposals.find((proposal) => proposal.id === 'proposal-character-two')).toMatchObject({
      status: 'draft',
      draft: { title: '副守门人乙' }
    })
  })

  it('keeps the real anchor first and performs zero project writes on an external hash conflict', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-anchor-'))
    roots.push(root)
    await createProjectAt(root, { id: 'anchor-sample', title: '锚定样例' })
    await createWorldEntry(root, 'Original anchor', { id: 'world-anchor', triggers: ['anchor'] })
    const session = await startPlanningSession(root, 'world', 'world-anchor')
    const response = await discussPlanningRecord(
      root,
      {
        module: 'world',
        sessionId: session.id,
        messages: [{ role: 'author', content: '更新原卡，并新增一张世界书卡。' }]
      },
      {
        loadAIProfile: async () => configuredAI,
        generate: async () =>
          JSON.stringify({
            message: '锚定卡之后新增同栏资料。',
            proposals: [
              {
                id: session.anchor_proposal_id,
                operation: 'update',
                target_id: 'world-anchor',
                kind: 'world_entry',
                title: 'Updated anchor',
                fields: { role: 'both', entry_status: 'candidate', triggers: ['anchor'] },
                content: '候选更新。'
              },
              {
                id: 'proposal-new-world-entry',
                operation: 'create',
                kind: 'world_entry',
                title: 'Anchor harbor permits',
                fields: { role: 'both', entry_status: 'candidate', triggers: ['permit'] },
                content: '候选参考知识。'
              }
            ]
          })
      }
    )
    expect(response.proposals[0]).toMatchObject({
      id: session.anchor_proposal_id,
      source: 'anchor',
      operation: 'update',
      target: { id: 'world-anchor' }
    })
    const anchorPath = session.document!.path
    await writeFile(anchorPath, `${await readFile(anchorPath, 'utf8')}\nExternal edit.\n`, 'utf8')
    const docsBefore = (await listDocs(root)).map((doc) => doc.data.id).sort()
    await expect(
      confirmPlanningRecord(root, {
        sessionId: session.id,
        messages: [{ role: 'author', content: '确认两张。' }],
        proposals: response.proposals.map((proposal) => ({ ...proposal, status: 'confirmed' as const })),
        selectedProposalId: response.proposals[1]!.id
      })
    ).rejects.toThrow(
      /--- current external file[\s\S]*External edit\.[\s\S]*\+\+\+ proposed card[\s\S]*Updated anchor/u
    )
    expect((await listDocs(root)).map((doc) => doc.data.id).sort()).toEqual(docsBefore)
    expect(await readFile(anchorPath, 'utf8')).toContain('External edit.')
  })

  it('reports a missing background profile before calling AI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    await expect(
      discussPlanningRecord(
        root,
        { module: 'world', messages: [{ role: 'author', content: '补一个制度。' }] },
        {
          loadAIProfile: async () => ({ ...configuredAI, apiKey: '' }),
          generate: async () => {
            throw new Error('must not run')
          }
        }
      )
    ).rejects.toThrow(/设置.*背景/)
  })

  it('creates exactly one schema-valid Markdown document after confirmation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    const before = await snapshotPaths(root)

    const session = await startPlanningSession(root, 'world')
    const proposal = {
      kind: 'world_entry' as const,
      title: '河港通行规则',
      fields: {
        role: 'constraint',
        entry_status: 'candidate',
        triggers: ['河港', '通行证'],
        used_in: [{ scene: 'scene-sample', usage: '限制夜间出城' }]
      },
      content: '## 规则\n\n夜间通行需要凭证。'
    }
    const result = await confirmPlanningRecord(root, {
      sessionId: session.id,
      messages: [{ role: 'author', content: '建立河港通行规则。' }],
      proposal
    })

    const added = (await snapshotPaths(root)).filter((entry) => !before.includes(entry))
    expect(added.filter((entry) => entry.endsWith('.md'))).toHaveLength(1)
    expect(added).toContainEqual(expect.stringMatching(/^world\/world-/))
    expect(result.document.data).toMatchObject({
      type: 'world_entry',
      title: '河港通行规则',
      role: 'constraint',
      triggers: ['河港', '通行证'],
      used_in: [{ scene: 'scene-sample', usage: '限制夜间出城' }]
    })
    expect(result.document.content).toBe('## 规则\n\n夜间通行需要凭证。\n')
    expect(result.document.data.quillarium_origin).toMatchObject({
      kind: 'ai-conversation',
      session_id: session.id
    })

    const restored = await loadPlanningSession(root, session.id)
    expect(restored.messages).toEqual([{ role: 'author', content: '建立河港通行规则。' }])
    expect(restored.document?.path).toBe(result.path)

    const updated = await confirmPlanningRecord(root, {
      sessionId: session.id,
      messages: [...restored.messages, { role: 'author', content: '把标题改短一些。' }],
      proposal: { ...proposal, title: '河港夜行规则', content: '## 规则\n\n凭证只在夜间使用。' }
    })
    expect(updated.path).toBe(result.path)
    expect(updated.document.data.id).toBe(result.document.data.id)
    expect(updated.document.data.title).toBe('河港夜行规则')
    expect((await snapshotPaths(root)).filter((entry) => entry.endsWith('.md'))).toHaveLength(
      before.filter((entry) => entry.endsWith('.md')).length + 1
    )
  })

  it('blocks a cross-module type migration without writing the project', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    await createWorldEntry(root, 'Riverside inn', {
      id: 'world-riverside-inn',
      tags: ['lodging'],
      triggers: ['inn']
    })
    const session = await startPlanningSession(root, 'world', 'world-riverside-inn')
    const source = session.document!.path

    await expect(
      confirmPlanningRecord(root, {
        sessionId: session.id,
        messages: [{ role: 'author', content: '这实际是一个地点，请改为地点卡。' }],
        proposal: {
          kind: 'location',
          title: 'Riverside inn',
          fields: { kind: 'position', scale: 'estate' },
          content: '## Place\n\nA lodging beside the river.'
        }
      })
    ).rejects.toThrow(/超出当前“world”页面范围：location/u)

    expect(await pathExists(source)).toBe(true)
    expect(await listDocs<WorldEntryDoc>(root, 'world_entry')).toHaveLength(1)
    expect(await listDocs<LocationDoc>(root, 'location')).toHaveLength(0)
    expect(await loadPlanningSession(root, session.id)).toMatchObject({
      document: { id: 'world-riverside-inn', type: 'world_entry', path: source },
      proposal: { kind: 'world_entry' }
    })
  })

  it('keeps the original card when the final conversation log cannot be saved', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    await createWorldEntry(root, 'Hill archive', { id: 'world-hill-archive', triggers: ['archive'] })
    const session = await startPlanningSession(root, 'world', 'world-hill-archive')
    const source = session.document!.path

    await expect(
      confirmPlanningRecord(
        root,
        {
          sessionId: session.id,
          messages: [{ role: 'author', content: '更新档案说明。' }],
          proposal: {
            kind: 'world_entry',
            title: 'Hill archive',
            fields: { role: 'both', entry_status: 'candidate', triggers: ['archive'] },
            content: 'Updated archive knowledge.'
          }
        },
        {
          writeSession: async () => {
            throw new Error('simulated session log failure')
          },
          removeFile: async (file) => rm(file, { force: false })
        }
      )
    ).rejects.toThrow(/simulated session log failure/)

    expect(await pathExists(source)).toBe(true)
    expect(await listDocs<WorldEntryDoc>(root, 'world_entry')).toHaveLength(1)
    expect(await listDocs<LocationDoc>(root, 'location')).toHaveLength(0)
    expect(await loadPlanningSession(root, session.id)).toMatchObject({
      document: { id: 'world-hill-archive', type: 'world_entry', path: source }
    })
  })
})

describe('manual project-wide planning check', () => {
  it('keeps the migrated IPC adapter free of prompt, parser, provider, and domain-write code', async () => {
    const source = await readFile(new URL('./agent-check.ts', import.meta.url), 'utf8')

    expect(source).toContain('executeAgentTask')
    expect(source).not.toMatch(
      /generateText|generateMessages|parseStructuredResponse|compileContextBlocks|createIssue|writeMarkdown/u
    )
  })

  it('returns review proposals without writing issues until a trusted author decision is applied', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-check-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-check', title: '中性检查项目' })
    await createReference(root, '外部材料', { id: 'ref-source' }, '不应发送给检查 AI 的材料正文。')
    await createWorldEntry(
      root,
      '启用知识',
      { id: 'world-enabled', enabled: true, triggers: [] },
      '不应发送给检查 AI 的世界书正文。'
    )
    await createWorldEntry(
      root,
      '停用知识',
      { id: 'world-disabled', enabled: false, triggers: ['旧规则'] },
      '不应发送给检查 AI 的停用正文。'
    )
    await createForeshadowing(
      root,
      '启用伏笔',
      { id: 'foreshadow-enabled', enabled: true, trigger_conditions: [] },
      '应发送给检查 AI 的确定性卡片正文。'
    )
    await createForeshadowing(root, '停用伏笔', {
      id: 'foreshadow-disabled',
      enabled: false,
      trigger_conditions: []
    })
    let sent = ''
    const outcome = await runPlanningCheck(root, 'zh', {
      loadAIProfile: async () => ({ ...configuredAI, contextWindowTokens: 32_000 }),
      invokeProvider: async (request) => {
        sent = request.messages.map((message) => message.content).join('\n')
        return JSON.stringify({
          issues: [
            {
              category: 'foreshadowing',
              severity: 'warning',
              title: '伏笔缺少回收条件',
              message: '启用伏笔尚未提供回收条件。',
              evidence: '卡片只描述了埋设。',
              related_ids: ['foreshadow-enabled']
            }
          ]
        })
      },
      executionId: () => 'agent-desktop-check',
      now: () => new Date('2026-08-17T00:00:00.000Z')
    })

    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect(outcome.result.checked_cards).toBe(1)
    expect(outcome.result.skipped_disabled).toBe(1)
    expect(outcome.result.semantic_proposals).toHaveLength(1)
    expect(sent).toContain('foreshadow-enabled')
    expect(sent).toContain('应发送给检查 AI 的确定性卡片正文')
    expect(sent).not.toContain('ref-source')
    expect(sent).not.toContain('不应发送给检查 AI 的材料正文')
    expect(sent).not.toContain('world-enabled')
    expect(sent).not.toContain('不应发送给检查 AI 的世界书正文')
    expect(sent).not.toContain('world-disabled')
    expect(sent).not.toContain('foreshadow-disabled')
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)

    const missingDecision = await applyPlanningCheckForIPC(root, outcome.execution_id, 'approval-missing')
    expect(missingDecision).toMatchObject({
      status: 'failed',
      error: { code: 'AGENT_APPROVAL_REQUIRED', execution_id: outcome.execution_id }
    })
    const invalidSelection = await decidePlanningCheckForIPC(root, {
      executionId: outcome.execution_id,
      selectedResultIds: ['proposal-not-from-this-run'],
      decision: 'approved'
    })
    expect(invalidSelection).toMatchObject({
      status: 'failed',
      error: { code: 'AGENT_APPROVAL_INVALID', execution_id: outcome.execution_id }
    })

    const selected = [...outcome.result.deterministic_findings, ...outcome.result.semantic_proposals].map(
      (proposal) => proposal.id
    )
    const decision = await createPlanningCheckDecision(root, {
      executionId: outcome.execution_id,
      selectedResultIds: selected,
      decision: 'approved'
    })
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)
    const applied = await applyPlanningCheckDecision(root, outcome.execution_id, decision.id)
    expect(applied.created_issue_ids.length + applied.updated_issue_ids.length).toBe(selected.length)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(selected.length)
  })

  it('keeps deterministic findings available when the check profile is not configured', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-check-'))
    roots.push(root)
    await createProjectAt(root, { id: 'unconfigured-check', title: '未配置检查' })
    await createForeshadowing(root, '待检查伏笔', {
      id: 'foreshadow-check',
      enabled: true,
      trigger_conditions: []
    })

    const outcome = await runPlanningCheck(root, 'zh', {
      loadAIProfile: async () => ({ ...configuredAI, apiKey: '' }),
      invokeProvider: async () => {
        throw new Error('must not run')
      },
      executionId: () => 'agent-desktop-no-ai',
      now: () => new Date('2026-08-17T00:00:00.000Z')
    })
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect(outcome.result.semantic_status).toBe('not-configured')
    expect(outcome.result.deterministic_findings.length).toBeGreaterThan(0)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)
  })

  it('sends only timeline nodes and events for a timeline-page semantic check', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-timeline-check-scope-'))
    roots.push(root)
    await createProjectAt(root, { id: 'timeline-check-scope', title: '时间线检查范围' })
    await createTimelineNode(root, '第二日', { id: 'time-second', year: 1, month: 2 })
    await createTimelineEventAtNode(root, 'time-second', '抵达', { id: 'event-arrival' })
    await createLocation(root, '南城', { id: 'location-south-city' })
    await createForeshadowing(root, '暗线', {
      id: 'foreshadow-hidden-thread',
      trigger_conditions: []
    })
    await createWorldEntry(
      root,
      '参考历法',
      { id: 'world-calendar-reference', triggers: ['历法'] },
      '不属于确定性时间线检查。'
    )
    let sent = ''

    const outcome = await runPlanningCheck(
      root,
      'zh',
      {
        loadAIProfile: async () => configuredAI,
        invokeProvider: async (request) => {
          sent = request.messages.map((message) => message.content).join('\n')
          return JSON.stringify({
            issues: [
              {
                category: 'spatial',
                severity: 'warning',
                title: '越界地点建议',
                message: '时间线页不应产生地点检查。',
                evidence: '模型尝试越界。',
                related_ids: ['event-arrival']
              }
            ]
          })
        },
        executionId: () => 'agent-timeline-scope',
        now: () => new Date('2026-08-17T00:00:00.000Z')
      },
      'timeline'
    )

    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect(outcome.result.scope).toBe('timeline')
    expect(outcome.result.checked_cards).toBe(2)
    expect(outcome.result.semantic_proposals).toHaveLength(0)
    expect(sent).toContain('time-second')
    expect(sent).toContain('event-arrival')
    expect(sent).not.toContain('location-south-city')
    expect(sent).not.toContain('foreshadow-hidden-thread')
    expect(sent).not.toContain('world-calendar-reference')
    expect(sent).not.toContain('不属于确定性时间线检查')
  })

  it('suppresses ignored fingerprints but allows a resolved fingerprint to be detected and created again', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-suppression-'))
    roots.push(root)
    await createProjectAt(root, { id: 'suppression-check', title: '抑制检查项目' })
    await createForeshadowing(root, '缺少提醒条件的伏笔', {
      id: 'foreshadow-suppression-target',
      enabled: true,
      trigger_conditions: []
    })
    const run = (executionId: string) =>
      runPlanningCheck(root, 'zh', {
        loadAIProfile: async () => ({ ...configuredAI, apiKey: '' }),
        invokeProvider: async () => {
          throw new Error('must not run')
        },
        executionId: () => executionId,
        now: () => new Date('2026-08-17T00:00:00.000Z')
      })
    const first = await run('agent-suppression-first')
    expect(first.status).toBe('completed')
    if (first.status !== 'completed') return
    const proposal = first.result.deterministic_findings.find((item) =>
      item.related_ids.includes('foreshadow-suppression-target')
    )!
    const firstDecision = await createPlanningCheckDecision(root, {
      executionId: first.execution_id,
      selectedResultIds: [proposal.id],
      decision: 'approved'
    })
    const firstApply = await applyPlanningCheckDecision(root, first.execution_id, firstDecision.id)
    expect(firstApply.created_issue_ids).toHaveLength(1)
    const firstIssueId = firstApply.created_issue_ids[0]!

    await applyIssueBatchAction(root, [firstIssueId], 'ignore')
    const suppressed = await run('agent-suppression-second')
    expect(suppressed.status).toBe('completed')
    if (suppressed.status !== 'completed') return
    expect(
      [...suppressed.result.deterministic_findings, ...suppressed.result.semantic_proposals].some(
        (item) => item.fingerprint === proposal.fingerprint
      )
    ).toBe(false)

    await applyIssueBatchAction(root, [firstIssueId], 'resolve')
    expect(
      (await listDocs<IssueDoc>(root, 'issue')).find((issue) => issue.data.id === firstIssueId)?.data.state
    ).toBe('resolved')
    const redetected = await run('agent-suppression-third')
    expect(redetected.status).toBe('completed')
    if (redetected.status !== 'completed') return
    const repeated = redetected.result.deterministic_findings.find(
      (item) => item.fingerprint === proposal.fingerprint
    )!
    expect(repeated).toBeDefined()
    const repeatedDecision = await createPlanningCheckDecision(root, {
      executionId: redetected.execution_id,
      selectedResultIds: [repeated.id],
      decision: 'approved'
    })
    const repeatedApply = await applyPlanningCheckDecision(root, redetected.execution_id, repeatedDecision.id)
    expect(repeatedApply).toMatchObject({ created_issue_ids: [expect.any(String)], updated_issue_ids: [] })
    expect(repeatedApply.created_issue_ids[0]).not.toBe(firstIssueId)
  })
})

async function snapshotPaths(root: string): Promise<string[]> {
  const paths: string[] = []
  async function walk(dir: string, prefix = ''): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relative = path.posix.join(prefix, entry.name)
      paths.push(relative)
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative)
    }
  }
  await walk(root)
  return paths.sort()
}
