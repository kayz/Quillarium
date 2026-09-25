import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChapterProse,
  createCharacter,
  createOutline,
  createProjectAt,
  createTimelineNode,
  listDocs,
  MISSING_CHARACTER,
  MISSING_TRACK,
  NO_CHARACTER_SELECTION,
  NO_TRACK_SELECTION,
  readMarkdown,
  writeMarkdown,
  type ChapterEvalProposalSet,
  type ForeshadowManageProposalSet,
  type OutlineOrganizeProposalSet,
  type RelationAnalyzeProposalSet,
  type TimelineManageProposalSet,
  type WorldOrganizeProposalSet
} from '@quillarium/core'
import { EXPERT_LANE_ONLY, executeExpertTask } from './expert-facade.js'
import type { AgentRuntimeDependencies } from './contracts.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-expert-facade-'))
  roots.push(root)
  await createProjectAt(root, { id: 'expert-facade-test', title: 'Expert Facade Test' })
  await createOutline(root, 'overview', '作品总览', { id: 'overview' })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', '第一篇', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', '第一章', { id: 'chapter', parent: 'part' })
  return root
}

function deps(invokeProvider: AgentRuntimeDependencies['invokeProvider']): AgentRuntimeDependencies {
  return {
    loadAIProfile: async () => ({
      provider: 'openai-compatible',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-only-secret',
      model: 'gpt-4',
      temperature: 0,
      maxTokens: 1_000,
      contextWindowTokens: 32_000
    }),
    invokeProvider
  }
}

describe('executeExpertTask fail-closed gate', () => {
  it('refuses scene-generation without calling the provider', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask({ projectRoot: root, task_id: 'scene-generation', input: {} }, deps(invokeProvider))
    ).rejects.toThrow(EXPERT_LANE_ONLY)
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('refuses display-card-design without calling the provider', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'display-card-design', input: {} },
        deps(invokeProvider)
      )
    ).rejects.toThrow(EXPERT_LANE_ONLY)
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('refuses continuity-check when chapter prose is missing', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'continuity-check', input: { chapter_id: 'chapter' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow('没有章正文，不能评估。')
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('refuses continuity-check when chapter prose is empty', async () => {
    const root = await fixture()
    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '   \n\t  ')
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'continuity-check', input: { chapter_id: 'chapter' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow('没有章正文，不能评估。')
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })
})

describe('executeExpertTask continuity-check', () => {
  it('returns chapter eval proposals without writing issue or world files', async () => {
    const root = await fixture()
    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '章正文内容。')
    const invokeProvider = vi.fn(async () =>
      JSON.stringify({
        issues: [{ title: '时间线冲突', body: '...' }],
        settings: [{ title: '北港', content: '...' }]
      })
    )

    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'continuity-check', input: { chapter_id: 'chapter' } },
      { ...deps(invokeProvider), executionId: () => 'continuity-eval-1' }
    )
    if (outcome.status === 'failed') {
      throw new Error(`${outcome.error.code}: ${outcome.error.technical_detail}`)
    }

    expect(outcome.status).toBe('completed')
    const result = outcome.result as ChapterEvalProposalSet
    expect(result.eval_id).toBe('continuity-eval-1')
    expect(result.chapter_id).toBe('chapter')
    expect(result.issues.map((item) => item.title)).toContain('时间线冲突')
    expect(result.settings.map((item) => item.title)).toContain('北港')
    expect(await listDocs(root, 'issue')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })
})

describe('executeExpertTask organize-outline pre-gates', () => {
  it('refuses organize-outline without a selected node', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'organize-outline', input: { outline_id: '' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow('没有选中大纲节点，不能整理。')
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('refuses organize-outline on a chapter leaf', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'organize-outline', input: { outline_id: 'chapter' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow('当前选中的是章，不能再创建下级。')
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })
})

describe('executeExpertTask organize handlers', () => {
  it('returns world-book proposals without writing world files', async () => {
    const root = await fixture()
    const before = await listDocs(root, 'world_entry')
    const invokeProvider = vi.fn(async () => JSON.stringify({ creates: [], updates: [] }))

    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'organize-worldbook', input: {} },
      { ...deps(invokeProvider), executionId: () => 'world-organize-eval-1' }
    )
    if (outcome.status === 'failed') {
      throw new Error(`${outcome.error.code}: ${outcome.error.technical_detail}`)
    }

    expect(outcome.status).toBe('completed')
    const result = outcome.result as WorldOrganizeProposalSet
    expect(result.eval_id).toBe('world-organize-eval-1')
    expect(result.creates).toEqual([])
    expect(result.updates).toEqual([])
    expect(await listDocs(root, 'world_entry')).toHaveLength(before.length)
  })

  it('returns outline proposals on a volume without creating outline files', async () => {
    const root = await fixture()
    const before = await listDocs(root, 'outline')
    const invokeProvider = vi.fn(async () => JSON.stringify({ creates: [] }))

    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'organize-outline', input: { outline_id: 'volume' } },
      { ...deps(invokeProvider), executionId: () => 'outline-organize-eval-1' }
    )
    if (outcome.status === 'failed') {
      throw new Error(`${outcome.error.code}: ${outcome.error.technical_detail}`)
    }

    expect(outcome.status).toBe('completed')
    const result = outcome.result as OutlineOrganizeProposalSet
    expect(result.eval_id).toBe('outline-organize-eval-1')
    expect(result.outline_id).toBe('volume')
    expect(result.creates).toEqual([])
    expect(await listDocs(root, 'outline')).toHaveLength(before.length)
  })
})

describe('executeExpertTask analyze-relations pre-gates', () => {
  it('refuses analyze-relations without a selected character', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'analyze-relations', input: { character_id: '' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow(NO_CHARACTER_SELECTION)
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('refuses analyze-relations when the character is missing', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'analyze-relations', input: { character_id: 'missing-char' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow(MISSING_CHARACTER)
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })
})

describe('executeExpertTask relation and foreshadowing handlers', () => {
  it('returns relation proposals without writing relation files', async () => {
    const root = await fixture()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    const beforeRelations = await listDocs(root, 'character_relation')
    const beforeMemberships = await listDocs(root, 'faction_membership')
    const beforeFactionRelations = await listDocs(root, 'faction_relation')
    const invokeProvider = vi.fn(async () =>
      JSON.stringify({
        character_id: 'model-should-not-win',
        creates: [],
        updates: []
      })
    )

    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'analyze-relations', input: { character_id: 'char-lin' } },
      { ...deps(invokeProvider), executionId: () => 'relation-eval-1' }
    )
    if (outcome.status === 'failed') {
      throw new Error(`${outcome.error.code}: ${outcome.error.technical_detail}`)
    }

    expect(outcome.status).toBe('completed')
    expect(invokeProvider).toHaveBeenCalledTimes(1)
    const result = outcome.result as RelationAnalyzeProposalSet
    expect(result.eval_id).toBe('relation-eval-1')
    expect(result.character_id).toBe('char-lin')
    expect(result.creates).toEqual([])
    expect(result.updates).toEqual([])
    expect(await listDocs(root, 'character_relation')).toHaveLength(beforeRelations.length)
    expect(await listDocs(root, 'faction_membership')).toHaveLength(beforeMemberships.length)
    expect(await listDocs(root, 'faction_relation')).toHaveLength(beforeFactionRelations.length)
  })

  it('returns foreshadowing proposals without writing foreshadowing files', async () => {
    const root = await fixture()
    const before = await listDocs(root, 'foreshadowing')
    const invokeProvider = vi.fn(async () => JSON.stringify({ creates: [], updates: [], bindings: [] }))

    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'manage-foreshadowing', input: {} },
      { ...deps(invokeProvider), executionId: () => 'foreshadow-eval-1' }
    )
    if (outcome.status === 'failed') {
      throw new Error(`${outcome.error.code}: ${outcome.error.technical_detail}`)
    }

    expect(outcome.status).toBe('completed')
    expect(invokeProvider).toHaveBeenCalledTimes(1)
    const result = outcome.result as ForeshadowManageProposalSet
    expect(result.eval_id).toBe('foreshadow-eval-1')
    expect(result.creates).toEqual([])
    expect(result.updates).toEqual([])
    expect(result.bindings).toEqual([])
    expect(await listDocs(root, 'foreshadowing')).toHaveLength(before.length)
  })
})

describe('executeExpertTask manage-timeline', () => {
  it('refuses manage-timeline without a track id', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'manage-timeline', input: { track_id: '   ' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow(NO_TRACK_SELECTION)
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('refuses manage-timeline when the track is missing', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn()
    await expect(
      executeExpertTask(
        { projectRoot: root, task_id: 'manage-timeline', input: { track_id: 'missing-track' } },
        deps(invokeProvider)
      )
    ).rejects.toThrow(MISSING_TRACK)
    expect(invokeProvider).toHaveBeenCalledTimes(0)
  })

  it('returns timeline proposals without writing event files and stamps track_id', async () => {
    const root = await fixture()
    const before = await listDocs(root, 'timeline_event')
    const invokeProvider = vi.fn(async () =>
      JSON.stringify({
        track_id: 'forged',
        creates: [],
        updates: [],
        placements: [],
        orders: []
      })
    )
    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'manage-timeline', input: { track_id: 'main' } },
      { ...deps(invokeProvider), executionId: () => 'timeline-eval-1' }
    )
    if (outcome.status === 'failed') throw new Error(outcome.error.technical_detail)
    const result = outcome.result as TimelineManageProposalSet
    expect(result.eval_id).toBe('timeline-eval-1')
    expect(result.track_id).toBe('main')
    expect(await listDocs(root, 'timeline_event')).toHaveLength(before.length)
  })

  it('omits placements that set both event_id and create_proposal_id', async () => {
    const root = await fixture()
    const invokeProvider = vi.fn(async () =>
      JSON.stringify({
        creates: [],
        updates: [],
        placements: [
          {
            node_id: 'node-both',
            event_id: 'evt-existing',
            create_proposal_id: 'tl-create-0'
          },
          {
            node_id: 'node-ok',
            event_id: 'evt-ok'
          }
        ],
        orders: []
      })
    )
    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'manage-timeline', input: { track_id: 'main' } },
      { ...deps(invokeProvider), executionId: () => 'timeline-eval-xor' }
    )
    if (outcome.status === 'failed') throw new Error(outcome.error.technical_detail)
    const result = outcome.result as TimelineManageProposalSet
    expect(result.placements).toEqual([
      {
        proposal_id: 'tl-place-0',
        node_id: 'node-ok',
        event_id: 'evt-ok'
      }
    ])
  })

  it('remaps numeric create_proposal_id and order ids to tl-create-N', async () => {
    const root = await fixture()
    await createTimelineNode(root, 'Dawn', { id: 'node-dawn', year: 1, month: 1 })
    const invokeProvider = vi.fn(async () =>
      JSON.stringify({
        creates: [{ title: 'Harbor', content: 'Ships dock.', fields: {} }],
        updates: [],
        placements: [{ node_id: 'node-dawn', create_proposal_id: '0' }],
        orders: [{ node_id: 'node-dawn', event_ids: ['0', 'evt-existing'] }]
      })
    )
    const outcome = await executeExpertTask(
      { projectRoot: root, task_id: 'manage-timeline', input: { track_id: 'main' } },
      { ...deps(invokeProvider), executionId: () => 'timeline-eval-remap' }
    )
    if (outcome.status === 'failed') throw new Error(outcome.error.technical_detail)
    const result = outcome.result as TimelineManageProposalSet
    expect(result.creates[0]?.proposal_id).toBe('tl-create-0')
    expect(result.placements).toEqual([
      {
        proposal_id: 'tl-place-0',
        node_id: 'node-dawn',
        create_proposal_id: 'tl-create-0'
      }
    ])
    expect(result.orders).toEqual([
      {
        proposal_id: 'tl-order-0',
        node_id: 'node-dawn',
        event_ids: ['tl-create-0', 'evt-existing']
      }
    ])
    expect(invokeProvider).toHaveBeenCalled()
    const firstCall = invokeProvider.mock.calls.at(0)
    const request = firstCall
      ? (firstCall as unknown as [{ messages?: Array<{ role: string; content: string }> }])[0]
      : undefined
    const promptText = (request?.messages ?? []).map((item) => item.content).join('\n')
    expect(promptText).toMatch(/tl-create-i|tl-create-N|creates\[i\]/i)
  })
})
