import {
  createProjectAt,
  loadConfig,
  migrateAIProfileApiKeys,
  readRunFile,
  withStoredAIProfileApiKey,
  withUpdatedAIProfileApiKey
} from '@quillarium/core'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AIRequestError,
  DEFAULT_AI_TIMEOUT_MS,
  generateText,
  loadAIConfig,
  loadAIProfile,
  createGenerationRun,
  type AIConfig
} from './index.js'

vi.mock('@quillarium/core', async () => {
  const actual = await vi.importActual<typeof import('@quillarium/core')>('@quillarium/core')
  return { ...actual, loadConfig: vi.fn() }
})

const loadConfigMock = vi.mocked(loadConfig)

const config: AIConfig = {
  provider: 'openai',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  temperature: 0.4,
  maxTokens: 512
}

beforeEach(() => {
  loadConfigMock.mockResolvedValue({})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('loadAIConfig', () => {
  it('uses provider-aware DeepSeek defaults', () => {
    expect(loadAIConfig({ QUILL_AI_PROVIDER: 'deepseek' })).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-v4-flash',
      temperature: 0.7,
      maxTokens: 2000
    })
  })

  it('preserves explicit environment overrides for DeepSeek', () => {
    expect(
      loadAIConfig({
        QUILL_AI_PROVIDER: 'deepseek',
        QUILL_AI_BASE_URL: 'https://gateway.example.test/deepseek',
        QUILL_AI_API_KEY: 'environment-key',
        QUILL_AI_MODEL: 'deepseek-v4-pro',
        QUILL_AI_TEMPERATURE: '0.2',
        QUILL_AI_MAX_TOKENS: '4096'
      })
    ).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://gateway.example.test/deepseek',
      apiKey: 'environment-key',
      model: 'deepseek-v4-pro',
      temperature: 0.2,
      maxTokens: 4096
    })
  })
})

describe('generation run snapshots', () => {
  it('stores the exact shared guidance bytes and metadata used by the run', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-ai-run-'))
    try {
      const project = await createProjectAt(path.join(tmp, 'project'), {
        id: 'sample-project',
        title: 'Sample Project'
      })
      const guidance = [
        {
          id: 'chapter-method',
          path: 'methodology/chapter.md',
          scope: 'scene' as const,
          content: 'Keep the scene focused.',
          sha256: '0123456789abcdef',
          read_at: '2026-08-12T00:00:00.000Z'
        }
      ]
      const run = await createGenerationRun(project.root, 'scene-one', 'context', config, {}, guidance)

      await expect(readRunFile(project.root, run.id, 'shared-guidance.md')).resolves.toContain(
        'Keep the scene focused.'
      )
      await expect(readRunFile(project.root, run.id, 'shared-guidance.json')).resolves.toContain(
        'chapter-method'
      )
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})

describe('loadAIProfile', () => {
  it('prefers QUILL_AI_API_KEY without invoking the decryptor', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext',
          apiKey: 'legacy-key'
        }
      }
    })
    const decrypt = vi.fn().mockReturnValue('decrypted-key')

    const profile = await loadAIProfile('prose', { QUILL_AI_API_KEY: 'environment-key' }, decrypt)

    expect(profile.apiKey).toBe('environment-key')
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('prefers a decrypted key over a legacy plaintext key', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext',
          apiKey: 'legacy-key'
        }
      }
    })
    const decrypt = vi.fn().mockResolvedValue('decrypted-key')

    const profile = await loadAIProfile('prose', {}, decrypt)

    expect(profile.apiKey).toBe('decrypted-key')
    expect(decrypt).toHaveBeenCalledWith('ciphertext')
  })

  it('falls back to the legacy plaintext key when decryption fails', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext',
          apiKey: 'legacy-key'
        }
      }
    })
    const decrypt = vi.fn().mockRejectedValue(new Error('decryption failed'))

    const profile = await loadAIProfile('prose', {}, decrypt)

    expect(profile.apiKey).toBe('legacy-key')
  })

  it('returns an empty key when encrypted decryption fails without a legacy key', async () => {
    loadConfigMock.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'openai',
          apiKeyEncrypted: 'ciphertext'
        }
      }
    })

    const profile = await loadAIProfile('prose', {}, () => {
      throw new Error('decryption failed')
    })

    expect(profile.apiKey).toBe('')
    expect(profile.apiKey).not.toContain('ciphertext')
  })
})

describe('AI profile key persistence', () => {
  it('serializes only ciphertext when encryption is available', () => {
    const secret = 'plain-secret-that-must-not-reach-disk'
    const stored = withStoredAIProfileApiKey(
      {
        provider: 'openai',
        apiKey: 'old-plaintext',
        apiKeyEncrypted: 'old-ciphertext'
      },
      secret,
      (value) => {
        expect(value).toBe(secret)
        return 'encrypted-base64-payload'
      }
    )
    const serialized = JSON.stringify({ aiProfiles: { prose: stored } })

    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBe('encrypted-base64-payload')
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('old-plaintext')
  })

  it('migrates plaintext profiles into a disk payload with no plaintext key fields', () => {
    const secret = 'legacy-secret-on-disk'
    const migrated = migrateAIProfileApiKeys(
      {
        language: 'en',
        aiProfiles: {
          prose: { provider: 'openai', apiKey: secret },
          check: { provider: 'deepseek', apiKey: 'second-legacy-secret' }
        }
      },
      (value) => `encrypted:${value.length}`
    )
    const serialized = JSON.stringify(migrated)

    expect(migrated.aiProfiles?.prose?.apiKey).toBeUndefined()
    expect(migrated.aiProfiles?.check?.apiKey).toBeUndefined()
    expect(migrated.aiProfiles?.prose?.apiKeyEncrypted).toBe(`encrypted:${secret.length}`)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('second-legacy-secret')
  })

  it('removes a stale plaintext field without replacing existing ciphertext', () => {
    const migrated = migrateAIProfileApiKeys(
      {
        aiProfiles: {
          prose: {
            provider: 'openai',
            apiKey: 'stale-plaintext',
            apiKeyEncrypted: 'existing-ciphertext'
          }
        }
      },
      () => {
        throw new Error('existing ciphertext must not be replaced')
      }
    )

    expect(migrated.aiProfiles?.prose?.apiKey).toBeUndefined()
    expect(migrated.aiProfiles?.prose?.apiKeyEncrypted).toBe('existing-ciphertext')
    expect(JSON.stringify(migrated)).not.toContain('stale-plaintext')
  })

  it('preserves existing ciphertext when an ordinary settings save submits an empty key', () => {
    const stored = withUpdatedAIProfileApiKey(
      { provider: 'openai', model: 'next-model' },
      { provider: 'openai', apiKeyEncrypted: 'existing-ciphertext' },
      ''
    )

    expect(stored.model).toBe('next-model')
    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBe('existing-ciphertext')
  })

  it('clears both key fields only when explicitly requested', () => {
    const stored = withUpdatedAIProfileApiKey(
      { provider: 'openai' },
      { provider: 'openai', apiKeyEncrypted: 'existing-ciphertext' },
      '',
      { clear: true }
    )

    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBeUndefined()
  })

  it('keeps the legacy plaintext field only when no encryptor is supplied', () => {
    const stored = withStoredAIProfileApiKey(
      { provider: 'openai', apiKeyEncrypted: 'stale-ciphertext' },
      'fallback-key'
    )

    expect(stored.apiKey).toBe('fallback-key')
    expect(stored.apiKeyEncrypted).toBeUndefined()
  })
})

describe('generateText', () => {
  it('returns a successful completion without changing the existing call shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('Generated prose'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateText('Continue the scene', config, undefined, { timeoutMs: 0 })).resolves.toBe(
      'Generated prose'
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.test/v1/chat/completions')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' })
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'test-model',
      messages: [{ role: 'system' }, { role: 'user', content: 'Continue the scene' }]
    })
    expect(JSON.parse(String(init.body))).not.toHaveProperty('thinking')
    expect(JSON.parse(String(init.body))).not.toHaveProperty('response_format')
  })

  it('uses the DeepSeek endpoint with non-thinking and optional JSON response modes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('{"issues":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    const deepseekConfig = loadAIConfig({
      QUILL_AI_PROVIDER: 'deepseek',
      QUILL_AI_API_KEY: 'deepseek-test-key'
    })

    await expect(
      generateText('Check the scene', deepseekConfig, undefined, {
        timeoutMs: 0,
        responseFormat: 'json_object'
      })
    ).resolves.toBe('{"issues":[]}')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' }
    })
  })

  it('allows callers to opt into DeepSeek thinking mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('Thoughtful response'))
    vi.stubGlobal('fetch', fetchMock)
    const deepseekConfig = loadAIConfig({
      QUILL_AI_PROVIDER: 'deepseek',
      QUILL_AI_API_KEY: 'deepseek-test-key'
    })

    await generateText('Prompt', deepseekConfig, undefined, { timeoutMs: 0, thinkingMode: 'enabled' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ thinking: { type: 'enabled' } })
  })

  it('throws a structured error before fetching when the API key is missing', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', { ...config, apiKey: '' }, undefined, { timeoutMs: 0 })
    )

    expect(error).toMatchObject({
      name: 'AIRequestError',
      provider: 'openai',
      status: undefined,
      hint: 'Set QUILL_AI_API_KEY or use a local OpenAI-compatible endpoint.'
    })
    expect(error.message).toContain('Missing QUILL_AI_API_KEY')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses a 120 second default timeout and reports timeout details', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    let settled = false

    const errorPromise = captureRequestError(generateText('Prompt', config)).then((error) => {
      settled = true
      return error
    })

    await vi.advanceTimersByTimeAsync(DEFAULT_AI_TIMEOUT_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const error = await errorPromise
    expect(DEFAULT_AI_TIMEOUT_MS).toBe(120_000)
    expect(error).toMatchObject({
      provider: 'openai',
      status: undefined,
      hint: 'Increase timeoutMs or check whether the provider endpoint is responding.'
    })
    expect(error.message).toContain('timed out after 120000ms')
    expect(error.cause).toBeInstanceOf(Error)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('wraps network failures with provider context and the original cause', async () => {
    const cause = new TypeError('socket closed')
    const fetchMock = vi.fn().mockRejectedValue(cause)
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error.provider).toBe('openai')
    expect(error.status).toBeUndefined()
    expect(error.cause).toBe(cause)
    expect(error.message).toContain('AI connection failed')
    expect(error.message).toContain('socket closed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('applies the timeout while reading a stalled success body', async () => {
    vi.useFakeTimers()
    const stalledResponse = {
      ok: true,
      status: 200,
      json: vi.fn(() => new Promise<unknown>(() => undefined))
    } as unknown as Response
    const fetchMock = vi.fn().mockResolvedValue(stalledResponse)
    vi.stubGlobal('fetch', fetchMock)

    const errorPromise = captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 25 }))
    await vi.advanceTimersByTimeAsync(25)

    const error = await errorPromise
    expect(error.message).toContain('timed out after 25ms')
    expect(stalledResponse.json).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 response once and can make the backoff immediate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerErrorResponse(429, { error: { message: 'rate limited' } }))
      .mockResolvedValueOnce(completionResponse('Recovered'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(generateText('Prompt', config, undefined, { timeoutMs: 0, retryDelayMs: 0 })).resolves.toBe(
      'Recovered'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a 500 once, safely parses provider errors, and exposes the final failure', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerErrorResponse(500, '{ malformed provider json'))
      .mockResolvedValueOnce(providerErrorResponse(500, { error: { message: 'still unavailable' } }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', config, undefined, { timeoutMs: 0, retryDelayMs: 0 })
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(error).toMatchObject({
      provider: 'openai',
      status: 500,
      hint: 'The provider service is temporarily unavailable; try again later.'
    })
    expect(error.message).toContain('still unavailable')
  })

  it('can disable retries for retryable provider errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerErrorResponse(500, 'upstream failed'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(
      generateText('Prompt', config, undefined, { timeoutMs: 0, maxRetries: 0 })
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(error.status).toBe(500)
    expect(error.message).toContain('upstream failed')
  })

  it('reports malformed success JSON with status and parse cause', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('returned malformed JSON')
    expect(error.cause).toBeInstanceOf(SyntaxError)
  })

  it('reports a successful JSON response with an incompatible shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: 'unexpected' }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('choices[0].message.content')
  })

  it('rejects whitespace-only completion content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completionResponse('  \n\t'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await captureRequestError(generateText('Prompt', config, undefined, { timeoutMs: 0 }))

    expect(error).toMatchObject({ provider: 'openai', status: 200 })
    expect(error.message).toContain('empty choices[0].message.content')
  })
})

function completionResponse(content: string): Response {
  return jsonResponse({ choices: [{ message: { content } }] })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function providerErrorResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

async function captureRequestError(request: Promise<unknown>): Promise<AIRequestError> {
  try {
    await request
  } catch (error) {
    expect(error).toBeInstanceOf(AIRequestError)
    return error as AIRequestError
  }
  throw new Error('Expected the AI request to fail')
}
