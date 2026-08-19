import { describe, expect, it } from 'vitest'
import {
  SensitiveContentError,
  assertSensitiveSourcesSafe,
  sanitizeSensitiveText,
  sanitizeSensitiveValue,
  scanSensitiveText,
  scanSensitiveValue
} from './sensitive-data.js'

describe('browser-safe sensitive data boundary', () => {
  const samples = [
    'Bearer synthetic-token-value',
    'Basic ZmFrZTpmYWtl',
    'sk-ant-syntheticcredential123',
    'ghp_syntheticcredential123',
    'github_pat_syntheticcredential123456',
    'AIzaSyntheticCredentialValue123456',
    'ya29.syntheticGoogleAccessToken123',
    'AKIA1234567890ABCDEF',
    'aws_secret_access_key=syntheticAwsSecretValue1234567890',
    'endpoint=https://private.example/v1',
    'C:\\Users\\writer\\novel.md',
    '\\\\server\\share\\novel.md',
    'file:///C:/Users/writer/novel.md',
    '/root/private/novel.md'
  ]

  it.each(samples)('detects and sanitizes %s', (sample) => {
    expect(scanSensitiveText(sample)).not.toHaveLength(0)
    expect(scanSensitiveText(sanitizeSensitiveText(sample))).toHaveLength(0)
  })

  it('redacts sensitive object keys and nested text without changing ordinary values', () => {
    expect(
      sanitizeSensitiveValue({
        model: 'fixture-model',
        endpoint: 'https://private.example/v1',
        headers: { authorization: 'Bearer synthetic-token-value' },
        messages: [{ content: 'Read C:\\Users\\writer\\novel.md' }]
      })
    ).toEqual({
      model: 'fixture-model',
      endpoint: '[REDACTED]',
      headers: { authorization: '[REDACTED]' },
      messages: [{ content: 'Read [LOCAL_PATH_REDACTED]' }]
    })
  })

  it('detects credential-bearing object fields without returning their values', () => {
    const findings = scanSensitiveValue({ aws_secret_access_key: 'synthetic-value' }, 'request')
    expect(findings).toEqual([{ kind: 'credential', source: 'request.aws_secret_access_key' }])
    expect(JSON.stringify(findings)).not.toContain('synthetic-value')
  })

  it('reports only source identifiers and finding kinds when blocking prompt input', () => {
    expect(() =>
      assertSensitiveSourcesSafe([{ source: 'prompt-block:canon-a', text: 'github_pat_neverecho123456' }])
    ).toThrow(SensitiveContentError)
    try {
      assertSensitiveSourcesSafe([{ source: 'author-input', text: 'github_pat_neverecho123456' }])
    } catch (error) {
      expect(String(error)).toContain('author-input:credential')
      expect(String(error)).not.toContain('neverecho')
    }
  })
})
