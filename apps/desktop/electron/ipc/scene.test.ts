import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig, AIRequestOptions } from '@quillarium/ai'
import { SEMANTIC_CHECK_TIMEOUT_MS, type CheckReport, type SemanticAIInvoke } from '@quillarium/checks'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { createSemanticCheckReport, type SemanticCheckDependencies } from './scene.js'

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
})

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
