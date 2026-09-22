import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChapterProse,
  createOutline,
  createProjectAt,
  listDocs,
  readMarkdown,
  writeMarkdown,
  type ChapterEvalProposalSet
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
