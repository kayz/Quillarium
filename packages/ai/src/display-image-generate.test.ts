import {
  migrateConfigCredentials,
  withStoredDisplayImageProfileApiKey,
  withUpdatedDisplayImageProfileApiKey,
  type DisplayImageProfileConfig
} from '@quillarium/core'
import { describe, expect, it, vi } from 'vitest'
import { generateDisplayImageCandidate, type DisplayImageProfile } from './display-image-generate.js'

const UNSUPPORTED = '当前生图凭证不支持生图。'

describe('generateDisplayImageCandidate', () => {
  it('does not fetch when the profile is missing an api key', async () => {
    const fetchFn = vi.fn()
    await expect(
      generateDisplayImageCandidate(
        { prompt: '水手', profile: { provider: 'openai', apiKey: '', model: 'gpt-image-1' } },
        { fetch: fetchFn }
      )
    ).rejects.toThrow(UNSUPPORTED)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not fetch when the prompt is empty', async () => {
    const fetchFn = vi.fn()
    await expect(
      generateDisplayImageCandidate(
        { prompt: '   ', profile: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-image-1' } },
        { fetch: fetchFn }
      )
    ).rejects.toThrow(UNSUPPORTED)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does not fetch for an unsupported provider', async () => {
    const fetchFn = vi.fn()
    await expect(
      generateDisplayImageCandidate(
        {
          prompt: '水手',
          profile: {
            provider: 'claude',
            apiKey: 'sk-test',
            model: 'claude-3'
          } as unknown as DisplayImageProfile
        },
        { fetch: fetchFn }
      )
    ).rejects.toThrow(UNSUPPORTED)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('decodes OpenAI b64_json without writing files', async () => {
    const pngB64 = Buffer.from('png').toString('base64')
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ data: [{ b64_json: pngB64 }] }), { status: 200 })
    })
    const result = await generateDisplayImageCandidate(
      { prompt: '水手', profile: { provider: 'openai', apiKey: 'sk-test', model: 'gpt-image-1' } },
      { fetch: fetchFn as unknown as typeof fetch }
    )
    expect(result.mime).toBe('image/png')
    expect(Buffer.from(result.bytes).toString()).toBe('png')
    const [openAIUrl, openAIInit] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(openAIUrl).toContain('/images/generations')
    expect(openAIInit.headers).toMatchObject({ Authorization: 'Bearer sk-test' })
    expect(JSON.parse(String(openAIInit.body))).toEqual({
      model: 'gpt-image-1',
      prompt: '水手',
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json'
    })
  })

  it('posts openai-compatible images to a trimmed custom base URL', async () => {
    const pngB64 = Buffer.from('compat').toString('base64')
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ data: [{ b64_json: pngB64 }] }), { status: 200 })
    })
    const result = await generateDisplayImageCandidate(
      {
        prompt: '水手',
        profile: {
          provider: 'openai-compatible',
          baseUrl: 'https://gateway.example.test/v1/',
          apiKey: 'compat-key',
          model: 'local-image'
        }
      },
      { fetch: fetchFn as unknown as typeof fetch }
    )
    expect(Buffer.from(result.bytes).toString()).toBe('compat')
    const [compatUrl] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(compatUrl).toBe('https://gateway.example.test/v1/images/generations')
  })

  it('decodes Gemini inlineData without writing files', async () => {
    const pngB64 = Buffer.from('gemini-png').toString('base64')
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: pngB64 } }]
              }
            }
          ]
        }),
        { status: 200 }
      )
    })
    const result = await generateDisplayImageCandidate(
      {
        prompt: '水手',
        profile: {
          provider: 'gemini',
          apiKey: 'gem-test',
          model: 'gemini-2.0-flash-preview-image-generation'
        }
      },
      { fetch: fetchFn as unknown as typeof fetch }
    )
    expect(result.mime).toBe('image/png')
    expect(Buffer.from(result.bytes).toString()).toBe('gemini-png')
    const [geminiUrl, geminiInit] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(geminiUrl).toContain('/models/gemini-2.0-flash-preview-image-generation:generateContent')
    expect(geminiInit.headers).toMatchObject({ 'x-goog-api-key': 'gem-test' })
    expect(JSON.parse(String(geminiInit.body))).toEqual({
      contents: [{ parts: [{ text: '水手' }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
    })
  })
})

describe('displayImageProfile persistence', () => {
  it('serializes only ciphertext when encryption is available', () => {
    const secret = 'image-secret-that-must-not-reach-disk'
    const stored = withStoredDisplayImageProfileApiKey(
      {
        provider: 'openai',
        model: 'gpt-image-1',
        apiKey: 'old-plaintext',
        apiKeyEncrypted: 'old-ciphertext'
      },
      secret,
      (value) => {
        expect(value).toBe(secret)
        return 'encrypted-image-payload'
      }
    )
    const serialized = JSON.stringify({ displayImageProfile: stored })

    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBe('encrypted-image-payload')
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('old-plaintext')
  })

  it('migrates a plaintext displayImageProfile without leaving the key on disk', () => {
    const secret = 'legacy-image-key'
    const migrated = migrateConfigCredentials(
      {
        language: 'zh',
        displayImageProfile: { provider: 'gemini', model: 'gemini-2.0-flash', apiKey: secret }
      },
      (value) => `encrypted:${value.length}`
    )
    const serialized = JSON.stringify(migrated)

    expect(migrated.displayImageProfile?.apiKey).toBeUndefined()
    expect(migrated.displayImageProfile?.apiKeyEncrypted).toBe(`encrypted:${secret.length}`)
    expect(serialized).not.toContain(secret)
  })

  it('preserves existing ciphertext when an ordinary save submits an empty key', () => {
    const next: DisplayImageProfileConfig = { provider: 'openai', model: 'gpt-image-1' }
    const stored = withUpdatedDisplayImageProfileApiKey(
      next,
      { provider: 'openai', model: 'dall-e-3', apiKeyEncrypted: 'existing-ciphertext' },
      ''
    )

    expect(stored.model).toBe('gpt-image-1')
    expect(stored.apiKey).toBeUndefined()
    expect(stored.apiKeyEncrypted).toBe('existing-ciphertext')
  })
})
