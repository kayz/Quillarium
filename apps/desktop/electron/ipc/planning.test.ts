import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt, createReference, createWorldEntry, listDocs, type IssueDoc } from '@quillarium/core'
import type { AIConfig } from '@quillarium/ai'
import {
  confirmPlanningRecord,
  discussPlanningRecord,
  loadPlanningSession,
  normalizePlanningDraft,
  parsePlanningAIResponse,
  runPlanningCheck,
  startPlanningSession
} from './planning.js'
import type { PlanningDocumentKind } from './contract.js'

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
})

describe('manual project-wide planning check', () => {
  it('excludes material and disabled cards, persists findings, and updates stable issues on rerun', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-check-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-check', title: '中性检查项目' })
    await createReference(root, '外部材料', { id: 'ref-source' }, '不应发送给检查 AI 的材料正文。')
    await createWorldEntry(
      root,
      '启用知识',
      { id: 'world-enabled', enabled: true, triggers: ['通行证'] },
      '启用卡正文。'
    )
    await createWorldEntry(
      root,
      '停用知识',
      { id: 'world-disabled', enabled: false, triggers: ['旧规则'] },
      '不应发送给检查 AI 的停用正文。'
    )
    let prompt = ''
    const dependencies = {
      runRules: async () => ({
        generated_at: '2026-08-13T00:00:00.000Z',
        checked_card_ids: ['world-enabled'],
        skipped_disabled_ids: ['world-disabled'],
        issues: [
          {
            severity: 'info' as const,
            code: 'planning-isolated-card',
            message: 'Card world-enabled is isolated.',
            related_ids: ['world-enabled']
          }
        ]
      }),
      loadAIProfile: async () => configuredAI,
      isAIConfigured: () => true,
      generate: async (value: string) => {
        prompt = value
        return JSON.stringify({
          issues: [
            {
              category: 'world',
              severity: 'warning',
              title: '世界知识与规则冲突',
              message: '启用知识中的通行规则与当前规划不一致。',
              evidence: '“通行证”同时被描述为必须与可选。',
              related_ids: ['world-enabled']
            }
          ]
        })
      },
      now: () => new Date('2026-08-13T01:02:03.000Z')
    }

    const first = await runPlanningCheck(root, 'zh', dependencies)
    expect(first).toMatchObject({
      checked_cards: 1,
      skipped_disabled: 1,
      rule_findings: 1,
      ai_findings: 1
    })
    expect(first.created_issue_ids).toHaveLength(2)
    expect(first.updated_issue_ids).toHaveLength(0)
    expect(prompt).toContain('world-enabled')
    expect(prompt).toContain('启用卡正文')
    expect(prompt).not.toContain('ref-source')
    expect(prompt).not.toContain('不应发送给检查 AI 的材料正文')
    expect(prompt).not.toContain('world-disabled')
    expect(prompt).not.toContain('不应发送给检查 AI 的停用正文')

    const issues = await listDocs<IssueDoc>(root, 'issue')
    expect(issues).toHaveLength(2)
    expect(issues.every((issue) => issue.data.state === 'open')).toBe(true)
    expect(issues.every((issue) => Boolean(issue.data.check_fingerprint))).toBe(true)
    expect(issues.every((issue) => issue.data.related_docs.includes('world-enabled'))).toBe(true)
    expect(
      issues.every((issue) => issue.data.relations.some((relation) => relation.target_id === 'world-enabled'))
    ).toBe(true)

    const second = await runPlanningCheck(root, 'zh', dependencies)
    expect(second.created_issue_ids).toHaveLength(0)
    expect(second.updated_issue_ids).toHaveLength(2)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(2)
  })

  it('does not write rule findings when the manual AI check cannot start', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-check-'))
    roots.push(root)
    await createProjectAt(root, { id: 'unconfigured-check', title: '未配置检查' })
    await createWorldEntry(root, '待检查知识', { id: 'world-check', enabled: true, triggers: [] })

    await expect(
      runPlanningCheck(root, 'zh', {
        runRules: async () => ({
          generated_at: '2026-08-13T00:00:00.000Z',
          checked_card_ids: ['world-check'],
          skipped_disabled_ids: [],
          issues: [
            {
              severity: 'warning',
              code: 'planning-world-entry-without-trigger',
              message: 'missing trigger',
              related_ids: ['world-check']
            }
          ]
        }),
        loadAIProfile: async () => ({ ...configuredAI, apiKey: '' }),
        isAIConfigured: () => false,
        generate: async () => {
          throw new Error('must not run')
        },
        now: () => new Date('2026-08-13T01:02:03.000Z')
      })
    ).rejects.toThrow(/检查 AI 尚未配置/)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)
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
