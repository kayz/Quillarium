import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\logs'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false
  }
}))

import { sanitizeLogContext, serializeErrorForLog } from './logging.js'

describe('desktop diagnostic logging', () => {
  it('retains actionable error details while removing credentials', () => {
    const error = new Error('authorization: Bearer private-token')
    const serialized = serializeErrorForLog(error)

    expect(serialized.message).toBe('authorization: [redacted]')
    expect(serialized.stack).toContain('[redacted]')
    expect(serialized.stack).not.toContain('private-token')
  })

  it('redacts sensitive context keys without discarding ordinary diagnostics', () => {
    expect(
      sanitizeLogContext({
        channel: 'planning:confirm',
        apiKey: 'private-token',
        nested: { sessionId: 'planning-test', password: 'private-password' }
      })
    ).toEqual({
      channel: 'planning:confirm',
      apiKey: '[redacted]',
      nested: { sessionId: 'planning-test', password: '[redacted]' }
    })
  })
})
