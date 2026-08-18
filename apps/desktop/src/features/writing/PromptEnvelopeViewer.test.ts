import { describe, expect, it } from 'vitest'
import {
  createLegacyPromptViewerData,
  modelVisiblePromptText,
  sanitizePromptMessages,
  sanitizePromptValue
} from './PromptEnvelopeViewer.js'

describe('full prompt copy safety', () => {
  it('copies only model-visible content and removes credentials, endpoints, and local paths', () => {
    const messages = sanitizePromptMessages([
      {
        role: 'system',
        content: 'Boundary. Bearer secret-token-value sk-visiblecredential12345 api_key=hidden-value'
      },
      { role: 'user', content: 'Use C:\\Users\\writer\\private.md and continue.' }
    ])
    const full = modelVisiblePromptText(messages)
    expect(full).toBe(
      'Boundary. Bearer [REDACTED] [REDACTED_CREDENTIAL] api_key: [REDACTED]\n\nUse [LOCAL_PATH_REDACTED] and continue.'
    )
    expect(full).not.toMatch(/role|system|user/u)
    expect(
      sanitizePromptValue({
        model: 'gpt-test',
        endpoint: 'https://private.example/v1',
        api_key: 'secret',
        max_tokens: 400,
        messages
      })
    ).toEqual({
      model: 'gpt-test',
      endpoint: '[REDACTED]',
      api_key: '[REDACTED]',
      max_tokens: 400,
      messages
    })
  })

  it('reads an old run from its saved prompt and preset without reconstructing current project state', () => {
    const legacy = createLegacyPromptViewerData(
      'Exact historical user prompt.',
      JSON.stringify({ prompt_stack: { system_prompt: 'Exact historical system prompt.' } })
    )

    expect(legacy.promptEnvelope.messages).toEqual([
      { role: 'system', content: 'Exact historical system prompt.' },
      { role: 'user', content: 'Exact historical user prompt.' }
    ])
    expect(legacy.providerRequest).toEqual({ messages: legacy.promptEnvelope.messages })
    expect(legacy.promptBlocks).toEqual([])
    expect(legacy.providerTransformed).toBe(false)
  })
})
