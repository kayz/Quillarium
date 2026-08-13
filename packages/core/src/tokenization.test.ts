import { describe, expect, it } from 'vitest'
import {
  UnsupportedContextTokenizerError,
  createContextTokenCounter,
  resolveContextTokenizer
} from './tokenization.js'

describe('context tokenization', () => {
  it('maps supported model families without guessing unknown models', () => {
    expect(resolveContextTokenizer({ provider: 'deepseek', model: 'deepseek-v4-flash' })).toBe('deepseek-v4')
    expect(resolveContextTokenizer({ provider: 'openai', model: 'gpt-5.2' })).toBe('o200k')
    expect(resolveContextTokenizer({ provider: 'openai', model: 'gpt-4-turbo' })).toBe('cl100k')
    expect(() => resolveContextTokenizer({ provider: 'ollama', model: 'private-model' })).toThrow(
      UnsupportedContextTokenizerError
    )
  })

  it('uses the packaged exact DeepSeek V4 vocabulary and can truncate by token ID', async () => {
    const counter = await createContextTokenCounter({
      provider: 'deepseek',
      model: 'deepseek-v4-flash'
    })
    expect(counter.descriptor).toMatchObject({
      id: 'deepseek-v4',
      exact: true,
      source_revision: '60d8d70770c6776ff598c94bb586a859a38244f1',
      source_sha256: '8f9f37ca37fdc4f5fd36d5cf4d3b0e8392edb4e894fd10cc0d70b4957c8633cf'
    })
    expect(counter.count('你好，世界！')).toBe(4)
    const result = counter.truncate('你好，世界！', 2, 'head')
    expect(result).toMatchObject({ token_count: 2, original_token_count: 4, truncated: true })
    expect(counter.count(result.text)).toBe(2)
  })
})
