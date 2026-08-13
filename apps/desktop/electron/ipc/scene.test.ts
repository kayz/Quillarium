import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { contextCompileOptions, type AIConfig, type AIRequestOptions } from '@quillarium/ai'
import { SEMANTIC_CHECK_TIMEOUT_MS, type CheckReport, type SemanticAIInvoke } from '@quillarium/checks'
import {
  appendTimelineEvent,
  assembleContextPacket,
  createCharacter,
  createLocation,
  createOutline,
  createProjectAt,
  createScene,
  listDocs,
  renderContextPacket,
  type SceneDoc
} from '@quillarium/core'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import {
  createDesktopContextPreview,
  createSemanticCheckReport,
  ensureSceneForOutline,
  prepareSceneForOutline,
  type SemanticCheckDependencies
} from './scene.js'

const temporaryProjects: string[] = []

const deterministicReport: CheckReport = {
  scene_id: 'scene-main',
  target_type: 'scene',
  target_id: 'scene-main',
  generated_at: '2026-08-02T00:00:00.000Z',
  issues: [{ severity: 'warning', code: 'deterministic-warning', message: 'Deterministic finding.' }]
}

const configuredAI: AIConfig = {
  provider: 'openai',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-only-key',
  model: 'test-model',
  temperature: 0,
  maxTokens: 128
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

afterEach(async () => {
  await Promise.all(temporaryProjects.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('desktop semantic check handler helper', () => {
  it('keeps deterministic findings and skips semantic invocation when check AI is unconfigured', async () => {
    const runSemanticChecks = vi.fn(async () => [])
    const generateText = vi.fn(async (_prompt: string, _config: AIConfig) => '')
    const dependencies = semanticDependencies({
      isAIConfigured: () => false,
      runSemanticChecks,
      generateText
    })

    const report = await createSemanticCheckReport('project-root', 'scene-main', dependencies)

    expect(report).toMatchObject({
      scene_id: 'scene-main',
      issues: [{ code: 'deterministic-warning' }, { severity: 'info', code: 'semantic-check-unavailable' }]
    })
    expect(dependencies.loadAIProfile).toHaveBeenCalledWith('check')
    expect(runSemanticChecks).not.toHaveBeenCalled()
    expect(generateText).not.toHaveBeenCalled()
  })

  it('injects generateText for three semantic responses and returns one unified report', async () => {
    const generateText = vi
      .fn(
        async (_prompt: string, _config: AIConfig, _systemPrompt?: string, _options?: AIRequestOptions) => ''
      )
      .mockResolvedValueOnce('ooc-response')
      .mockResolvedValueOnce('state-response')
      .mockResolvedValueOnce('canon-response')
    const runSemanticChecks = vi.fn(async (_root: string, _sceneId: string, aiInvoke: SemanticAIInvoke) => {
      const responses = await Promise.all([
        aiInvoke('ooc-prompt'),
        aiInvoke('state-prompt'),
        aiInvoke('canon-prompt')
      ])
      return responses.map((message, index) => ({
        severity: 'info' as const,
        code: `semantic-${index + 1}`,
        message
      }))
    })
    const dependencies = semanticDependencies({ runSemanticChecks, generateText })

    const report = await createSemanticCheckReport('project-root', 'scene-main', dependencies)

    expect(report.issues.map((issue) => issue.code)).toEqual([
      'deterministic-warning',
      'semantic-1',
      'semantic-2',
      'semantic-3'
    ])
    expect(report.issues.slice(1).map((issue) => issue.message)).toEqual([
      'ooc-response',
      'state-response',
      'canon-response'
    ])
    expect(runSemanticChecks).toHaveBeenCalledWith('project-root', 'scene-main', expect.any(Function))
    expect(generateText).toHaveBeenCalledTimes(3)
    expect(generateText.mock.calls).toEqual([
      ['ooc-prompt', configuredAI, undefined, { timeoutMs: SEMANTIC_CHECK_TIMEOUT_MS }],
      ['state-prompt', configuredAI, undefined, { timeoutMs: SEMANTIC_CHECK_TIMEOUT_MS }],
      ['canon-prompt', configuredAI, undefined, { timeoutMs: SEMANTIC_CHECK_TIMEOUT_MS }]
    ])
  })

  it('checks the current edited candidate instead of only the stored scene body', async () => {
    const checkScene = vi.fn(async () => ({
      ...deterministicReport,
      content_sha256: 'edited-content-hash',
      checked_characters: 18
    }))
    const runSemanticChecks = vi.fn(async () => [])
    const dependencies = semanticDependencies({ checkScene, runSemanticChecks })

    const report = await createSemanticCheckReport(
      'project-root',
      'scene-main',
      dependencies,
      'the currently edited candidate'
    )

    expect(checkScene).toHaveBeenCalledWith('project-root', 'scene-main', 'the currently edited candidate')
    expect(runSemanticChecks).toHaveBeenCalledWith(
      'project-root',
      'scene-main',
      expect.any(Function),
      'the currently edited candidate'
    )
    expect(report).toMatchObject({
      content_sha256: 'edited-content-hash',
      checked_characters: 18,
      semantic_status: 'completed'
    })
  })
})

describe('desktop context preview', () => {
  it('returns the exact PromptBlocks and ContextTrace produced for the selected model', async () => {
    const root = await projectFixture()
    const previewConfig: AIConfig = {
      ...configuredAI,
      model: 'gpt-4o-mini'
    }
    const loadAIProfile = vi.fn(async () => previewConfig)

    const preview = await createDesktopContextPreview(
      root,
      { type: 'outline', id: 'book-main' },
      { loadAIProfile }
    )
    const direct = await assembleContextPacket(
      root,
      { type: 'outline', id: 'book-main' },
      contextCompileOptions(previewConfig)
    )

    expect(loadAIProfile).toHaveBeenCalledOnce()
    expect(preview.packet.prompt_blocks).toEqual(direct.prompt_blocks)
    expect(preview.packet.context_trace).toEqual(direct.context_trace)
    expect(preview.markdown).toBe(renderContextPacket(direct))
    expect(preview.packet.context_trace.tokenizer).toMatchObject({
      id: 'o200k',
      provider: 'openai',
      model: 'gpt-4o-mini',
      exact: true
    })
  })
})

describe('chapter scene prerequisites', () => {
  it('prepares distinct draft scenes before every generation prerequisite is available', async () => {
    const root = await projectFixture()
    await createCharacter(root, 'Opening POV', { id: 'character-opening' })
    await appendTimelineEvent(
      root,
      'Opening Event',
      { id: 'event-opening', characters: ['Opening POV'], previous: null },
      '关联章节: 1-3'
    )
    await createOutline(root, 'chapter', '第一章', {
      id: 'chapter-opening',
      parent: 'part-main',
      order: 0
    })

    const first = await prepareSceneForOutline(root, 'chapter-opening')
    const second = await prepareSceneForOutline(root, 'chapter-opening')
    const stored = await listDocs<SceneDoc>(root, 'scene')

    expect(first.data.id).not.toBe(second.data.id)
    expect(stored).toHaveLength(2)
    expect(stored.map((item) => item.data.order)).toEqual([0, 1])
    expect(stored.map((item) => item.data.timeline_node)).toEqual(['event-opening', 'event-opening'])
    expect(stored.map((item) => item.data.location)).toEqual(['', ''])
    expect(stored.map((item) => item.data.pov)).toEqual(['character-opening', 'character-opening'])
  })

  it('uses an inferred chapter-range timeline and its named POV character', async () => {
    const root = await projectFixture()
    await createCharacter(root, 'Opening POV', { id: 'character-opening' })
    await appendTimelineEvent(
      root,
      'Opening Event',
      { id: 'event-opening', characters: ['Opening POV'], location: 'location-opening', previous: null },
      '关联章节: 1-3'
    )
    await createOutline(root, 'chapter', '第一章', {
      id: 'chapter-opening',
      parent: 'part-main',
      order: 0
    })

    await expect(ensureSceneForOutline(root, 'chapter-opening')).rejects.toThrow(
      'Cannot create a chapter scene; missing location.'
    )
    expect(await listDocs<SceneDoc>(root, 'scene')).toHaveLength(0)
  })

  it('repairs an empty generated placeholder with the inferred event, location, and named POV', async () => {
    const root = await projectFixture()
    await createCharacter(root, 'Opening POV', { id: 'character-opening' })
    await createCharacter(root, 'Wrong POV', { id: 'character-wrong' })
    await createLocation(root, 'Opening Room', { id: 'location-opening' }, '第一章的核心场景。')
    await appendTimelineEvent(
      root,
      'Opening Event',
      { id: 'event-opening', characters: ['Opening POV'], previous: null },
      '关联章节: 1-3'
    )
    await createOutline(root, 'chapter', '第一章', {
      id: 'chapter-opening',
      parent: 'part-main',
      order: 0
    })
    await createScene(
      root,
      '第一章 正文',
      {
        id: 'scene-opening',
        section: 'chapter-opening',
        timeline_node: 'event-wrong',
        location: 'location-opening',
        pov: 'character-wrong',
        characters: ['character-wrong']
      },
      '## Draft\n'
    )

    const repaired = await ensureSceneForOutline(root, 'chapter-opening')
    const [stored] = await listDocs<SceneDoc>(root, 'scene')

    expect(repaired.data).toMatchObject({
      timeline_node: 'event-opening',
      location: 'location-opening',
      pov: 'character-opening',
      characters: ['character-opening']
    })
    expect(stored.data).toMatchObject({
      timeline_node: 'event-opening',
      location: 'location-opening',
      pov: 'character-opening',
      characters: ['character-opening']
    })
  })

  it('does not rewrite bindings on a draft that already contains prose', async () => {
    const root = await projectFixture()
    await createCharacter(root, 'Opening POV', { id: 'character-opening' })
    await createCharacter(root, 'Chosen POV', { id: 'character-chosen' })
    await createLocation(root, 'Opening Room', { id: 'location-opening' }, '第一章的核心场景。')
    await appendTimelineEvent(
      root,
      'Opening Event',
      { id: 'event-opening', characters: ['Opening POV'], previous: null },
      '关联章节: 1-3'
    )
    await createOutline(root, 'chapter', '第一章', {
      id: 'chapter-opening',
      parent: 'part-main',
      order: 0
    })
    await createScene(
      root,
      '第一章 正文',
      {
        id: 'scene-opening',
        section: 'chapter-opening',
        timeline_node: 'event-chosen',
        location: 'location-opening',
        pov: 'character-chosen',
        characters: ['character-chosen']
      },
      '## Draft\n\n作者已经写下正文。'
    )

    const existing = await ensureSceneForOutline(root, 'chapter-opening')

    expect(existing.data).toMatchObject({
      timeline_node: 'event-chosen',
      pov: 'character-chosen',
      characters: ['character-chosen']
    })
    expect(existing.content).toContain('作者已经写下正文。')
  })

  it('uses the explicitly selected draft when a chapter has multiple unaccepted scenes', async () => {
    const root = await projectFixture()
    await createCharacter(root, 'Opening POV', { id: 'character-opening' })
    await createLocation(root, 'Opening Room', { id: 'location-opening' }, '')
    await appendTimelineEvent(
      root,
      'Opening Event',
      {
        id: 'event-opening',
        characters: ['Opening POV'],
        location: 'Opening Room',
        previous: null
      },
      '关联章节: 1-3'
    )
    await createOutline(root, 'chapter', '第一章', {
      id: 'chapter-opening',
      parent: 'part-main',
      order: 0
    })
    const first = await prepareSceneForOutline(root, 'chapter-opening')
    const second = await prepareSceneForOutline(root, 'chapter-opening')

    const selected = await ensureSceneForOutline(root, 'chapter-opening', second.data.id)

    expect(selected.data.id).toBe(second.data.id)
    expect(selected.data.id).not.toBe(first.data.id)
  })
})

async function projectFixture(): Promise<string> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-scene-ipc-'))
  temporaryProjects.push(base)
  const root = (await createProjectAt(path.join(base, 'project'), { id: 'scene-ipc', title: 'Scene IPC' }))
    .root
  await createOutline(root, 'book', '总纲', { id: 'book-main' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume-main', parent: 'book-main' })
  await createOutline(root, 'part', '第一篇', { id: 'part-main', parent: 'volume-main' })
  return root
}

function semanticDependencies(overrides: Partial<SemanticCheckDependencies> = {}): SemanticCheckDependencies {
  return {
    checkScene: vi.fn(async () => deterministicReport),
    loadAIProfile: vi.fn(async () => configuredAI),
    isAIConfigured: vi.fn(() => true),
    runSemanticChecks: vi.fn(async () => []),
    generateText: vi.fn(async (_prompt: string, _config: AIConfig) => ''),
    ...overrides
  }
}
