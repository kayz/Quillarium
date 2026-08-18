import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
    getVersion: () => 'test',
    isPackaged: false
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMocks.handlers.set(channel, handler)
      electronMocks.handle(channel, handler)
    }
  }
}))

import { registerAIStreamHandlers, withDesktopAIStream } from './ai-stream.js'

function renderer(id: number) {
  const events = new EventEmitter() as EventEmitter & {
    id: number
    send: ReturnType<typeof vi.fn>
    isDestroyed: () => boolean
  }
  events.id = id
  events.send = vi.fn()
  events.isDestroyed = () => false
  return events
}

describe('desktop AI stream channel', () => {
  beforeEach(() => {
    electronMocks.handlers.clear()
    electronMocks.handle.mockClear()
  })

  it('keeps concurrent execution and request events isolated by renderer', async () => {
    const first = renderer(1)
    const second = renderer(2)
    await Promise.all([
      withDesktopAIStream({ sender: first } as never, 'import-split', 'client-first', async (stream) => {
        stream.onStreamEvent({ type: 'content_delta', delta: 'FIRST', attempt: 0, elapsed_ms: 1 })
        return 'first-result'
      }),
      withDesktopAIStream({ sender: second } as never, 'planning-check', 'client-second', async (stream) => {
        stream.onStreamEvent({ type: 'content_delta', delta: 'SECOND', attempt: 0, elapsed_ms: 1 })
        return 'second-result'
      })
    ])

    const firstPayloads = first.send.mock.calls.map((call) => call[1])
    const secondPayloads = second.send.mock.calls.map((call) => call[1])
    expect(firstPayloads.every((event) => event.client_request_id === 'client-first')).toBe(true)
    expect(secondPayloads.every((event) => event.client_request_id === 'client-second')).toBe(true)
    expect(JSON.stringify(firstPayloads)).toContain('FIRST')
    expect(JSON.stringify(firstPayloads)).not.toContain('SECOND')
    expect(JSON.stringify(secondPayloads)).toContain('SECOND')
    expect(new Set(firstPayloads.map((event) => event.execution_id))).toHaveLength(1)
    expect(new Set(secondPayloads.map((event) => event.execution_id))).toHaveLength(1)
  })

  it('only reports cancellation after aborting the matching live provider signal', async () => {
    registerAIStreamHandlers()
    const sender = renderer(7)
    const running = withDesktopAIStream(
      { sender } as never,
      'import-split',
      'client-cancel',
      async (stream) =>
        new Promise((_resolve, reject) => {
          stream.signal.addEventListener('abort', () => reject(stream.signal.reason), { once: true })
        })
    )
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalled())
    const started = sender.send.mock.calls[0]![1]
    const cancel = electronMocks.handlers.get('ai:cancelStream')
    expect(cancel).toBeTypeOf('function')
    await expect(cancel!({ sender }, started.execution_id, 'wrong-request-id')).resolves.toBe(false)
    await expect(cancel!({ sender }, started.execution_id, started.request_id)).resolves.toBe(true)
    await expect(running).rejects.toMatchObject({ name: 'AbortError' })
    expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({ type: 'cancelled' })
  })
})
