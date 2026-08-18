import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { StructuredOutputError, generateStructured, parseStructuredResponse, type AIConfig } from './index.js'

const outputSchema = z
  .object({
    reply: z.string().min(1),
    issues: z.array(z.string())
  })
  .strict()

const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'issues'],
  properties: {
    reply: { type: 'string', minLength: 1 },
    issues: { type: 'array', items: { type: 'string' } }
  }
}

const openAI: AIConfig = {
  provider: 'openai',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  temperature: 0,
  maxTokens: 512
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('structured AI output', () => {
  it('parses valid JSON and a single JSON code fence locally', () => {
    expect(parseStructuredResponse('{"reply":"ok","issues":[]}', outputSchema)).toEqual({
      success: true,
      value: { reply: 'ok', issues: [] }
    })
    expect(parseStructuredResponse('```json\n{"reply":"fenced","issues":[]}\n```', outputSchema)).toEqual({
      success: true,
      value: { reply: 'fenced', issues: [] }
    })
  })

  it('reports stable invalid-JSON and schema-mismatch codes', () => {
    const invalid = parseStructuredResponse('{"reply":', outputSchema)
    const mismatch = parseStructuredResponse('{"reply":"ok"}', outputSchema)
    expect(invalid.success ? null : invalid.error).toMatchObject({
      code: 'STRUCTURED_OUTPUT_INVALID_JSON',
      raw_response: '{"reply":'
    })
    expect(mismatch.success ? null : mismatch.error).toMatchObject({
      code: 'STRUCTURED_OUTPUT_SCHEMA_MISMATCH',
      validation_issues: expect.arrayContaining([expect.stringContaining('issues')])
    })
  })

  it('uses provider-native JSON schema and returns the original response without repair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"reply":"ok","issues":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateStructured(
      {
        messages: [
          { role: 'system', content: 'Return structured data.' },
          { role: 'user', content: 'Review this.' }
        ],
        schema: outputSchema,
        schemaName: 'review_output',
        jsonSchema
      },
      openAI,
      { timeoutMs: 0 }
    )
    expect(result).toMatchObject({
      value: { reply: 'ok', issues: [] },
      repaired: false,
      response_format: 'json_schema',
      raw_response: '{"reply":"ok","issues":[]}'
    })
    const body = requestBody(fetchMock, 0)
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'review_output', strict: true, schema: jsonSchema }
    })
  })

  it('falls back to JSON object mode for compatible providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(completion('{"reply":"ok","issues":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateStructured(
      {
        messages: [
          { role: 'system', content: 'Return structured data.' },
          { role: 'user', content: 'Review this.' }
        ],
        schema: outputSchema,
        schemaName: 'review_output',
        jsonSchema
      },
      { ...openAI, provider: 'deepseek' },
      { timeoutMs: 0 }
    )
    expect(result.response_format).toBe('json_object')
    expect(requestBody(fetchMock, 0).response_format).toEqual({ type: 'json_object' })
    expect(requestBody(fetchMock, 0)).toMatchObject({ thinking: { type: 'disabled' } })
    const messages = requestBody(fetchMock, 0).messages as Array<{ role: string; content: string }>
    expect(messages[0]?.content).toContain('Full JSON Schema:')
    expect(messages[0]?.content).toContain('"required": [\n    "reply",\n    "issues"\n  ]')
  })

  it('makes one bounded repair attempt and preserves both raw responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion('```json\n{"reply":"truncated"\n```'))
      .mockResolvedValueOnce(completion('{"reply":"repaired","issues":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateStructured(
      {
        messages: [
          { role: 'system', content: 'Return structured data.' },
          { role: 'user', content: 'Review this.' }
        ],
        schema: outputSchema,
        schemaName: 'review_output',
        jsonSchema
      },
      openAI,
      { timeoutMs: 0 }
    )
    expect(result).toMatchObject({
      value: { reply: 'repaired', issues: [] },
      repaired: true,
      raw_response: '```json\n{"reply":"truncated"\n```',
      repair_response: '{"reply":"repaired","issues":[]}'
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const repairMessages = requestBody(fetchMock, 1).messages as Array<{
      role: string
      content: string
    }>
    expect(repairMessages.at(-1)?.content).toContain('Return one corrected JSON object only')
  })

  it('repeats the code-owned contract and a valid example during non-native repair', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion('{"reply":"missing issues"}'))
      .mockResolvedValueOnce(completion('{"reply":"fixed","issues":[]}'))
    vi.stubGlobal('fetch', fetchMock)
    await generateStructured(
      {
        messages: [{ role: 'user', content: 'Review this.' }],
        schema: outputSchema,
        schemaName: 'review_output',
        jsonSchema
      },
      { ...openAI, provider: 'deepseek' },
      { timeoutMs: 0 }
    )
    const repairMessages = requestBody(fetchMock, 1).messages as Array<{ role: string; content: string }>
    const repairPrompt = repairMessages.at(-1)?.content ?? ''
    expect(repairPrompt).toContain('Full JSON Schema:')
    expect(repairPrompt).toContain('Validation paths:')
    expect(repairPrompt).toContain('Minimum valid structure example:')
    expect(repairPrompt).toContain('"issues": []')
  })

  it('fails after one repair and exposes both responses for Run auditing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion('{"reply":"missing issues"}'))
      .mockResolvedValueOnce(completion('still not json'))
    vi.stubGlobal('fetch', fetchMock)
    let error: unknown
    try {
      await generateStructured(
        {
          messages: [
            { role: 'system', content: 'Return structured data.' },
            { role: 'user', content: 'Review this.' }
          ],
          schema: outputSchema,
          schemaName: 'review_output',
          jsonSchema
        },
        openAI,
        { timeoutMs: 0 }
      )
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(StructuredOutputError)
    expect(error).toMatchObject({
      code: 'STRUCTURED_OUTPUT_REPAIR_FAILED',
      raw_response: '{"reply":"missing issues"}',
      repair_response: 'still not json'
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

function requestBody(mock: ReturnType<typeof vi.fn>, index: number): Record<string, unknown> {
  const [, init] = mock.mock.calls[index] as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, unknown>
}
