import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() }
}))

import type { AIConfig } from '@quillarium/ai'
import type { ImportSession } from '@quillarium/core'
import {
  chooseImportSourceFiles,
  generateAIImportResponse,
  planAIImportRequest,
  type ImportSourceDialog
} from './import.js'

describe('AI import source picker', () => {
  it('returns supported text and Markdown paths from the desktop dialog', async () => {
    const showOpenDialog = vi.fn(async () => ({
      canceled: false,
      filePaths: ['C:\\notes\\story.md', 'C:\\notes\\timeline.txt']
    }))

    await expect(chooseImportSourceFiles({ showOpenDialog } as ImportSourceDialog)).resolves.toEqual([
      'C:\\notes\\story.md',
      'C:\\notes\\timeline.txt'
    ])
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: '选择要拆分的文本或 Markdown 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文本与 Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
  })

  it('returns an empty list when the author cancels file selection', async () => {
    const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] }))

    await expect(chooseImportSourceFiles({ showOpenDialog } as ImportSourceDialog)).resolves.toEqual([])
  })
})

describe('AI import generation', () => {
  const session = {
    id: 'import-test',
    created_at: '2026-08-16T00:00:00.000Z',
    source_kind: 'text',
    sources: [
      {
        source: 'pasted-markdown',
        relative_path: 'pasted-markdown',
        size: 12,
        mtime_ms: 0,
        sha256: 'abc',
        status: 'new'
      }
    ],
    prompt: 'Split the source into records.',
    input_excerpt: 'A compact source.',
    candidates: [],
    issues: [],
    landed: [],
    status: 'planned'
  } satisfies ImportSession

  const config = {
    provider: 'deepseek',
    baseUrl: 'https://api.example.test/v1',
    apiKey: 'test-key',
    model: 'deepseek-v4-pro',
    temperature: 0.7,
    maxTokens: 384_000,
    contextWindowTokens: 1_000_000
  } satisfies AIConfig

  it('uses JSON mode and the author-configured model output limit', async () => {
    const generate = vi.fn(async () => '{"items":[],"issues":[]}')

    await expect(generateAIImportResponse(session, config, generate)).resolves.toContain('"items"')

    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining('# 输入正文'),
      expect.objectContaining({ maxTokens: 384_000 }),
      expect.stringContaining('Return strict JSON only'),
      expect.objectContaining({ responseFormat: 'json_object' })
    )
  })

  it('does not lower a larger author-configured output budget', async () => {
    const generate = vi.fn(async () => '{}')

    await generateAIImportResponse(session, { ...config, maxTokens: 9_000 }, generate)

    expect(generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokens: 9_000 }),
      expect.any(String),
      expect.objectContaining({ responseFormat: 'json_object' })
    )
  })

  it('keeps input plus output inside the configured context window', async () => {
    const plan = await planAIImportRequest(session, {
      ...config,
      contextWindowTokens: 1_500
    })

    expect(plan.inputTokens).toBeTypeOf('number')
    expect(plan.maxOutputTokens).toBeGreaterThan(0)
    expect(plan.maxOutputTokens).toBeLessThan(1_500)
  })
})
