import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIRequestError, DEFAULT_AI_TIMEOUT_MS, generateText, type AIConfig } from './index.js'

const config: AIConfig = {
  provider: 'openai',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  temperature: 0.4,
  maxTokens: 512
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
