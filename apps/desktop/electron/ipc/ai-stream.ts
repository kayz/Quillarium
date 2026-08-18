import { randomUUID } from 'node:crypto'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import type { AIStreamEvent } from '@quillarium/ai'
import { typedHandle, type DesktopAIStreamEvent } from './contract.js'

interface ActiveStream {
  controller: AbortController
  requestId: string
  senderId: number
}

export interface DesktopAIStreamContext {
  executionId: string
  requestId: string
  signal: AbortSignal
  onStreamEvent(event: AIStreamEvent & { child_execution_id?: string; batch_key?: string }): void
}

const activeStreams = new Map<string, ActiveStream>()

export function registerAIStreamHandlers(): void {
  typedHandle('ai:cancelStream', async (event, executionId, requestId) => {
    const active = activeStreams.get(executionId)
    if (!active || active.requestId !== requestId || active.senderId !== event.sender.id) return false
    active.controller.abort(new DOMException('Cancelled by the author', 'AbortError'))
    return true
  })
}

export async function withDesktopAIStream<Result>(
  event: IpcMainInvokeEvent,
  operation: DesktopAIStreamEvent['operation'],
  clientRequestId: string | undefined,
  action: (context: DesktopAIStreamContext) => Promise<Result>
): Promise<Result> {
  const executionId = `desktop-${Date.now()}-${randomUUID().toLowerCase()}`
  const requestId = randomUUID().toLowerCase()
  const controller = new AbortController()
  const sender = event.sender
  activeStreams.set(executionId, { controller, requestId, senderId: sender.id })
  const startedAt = Date.now()
  const emit = (
    payload: Omit<DesktopAIStreamEvent, 'execution_id' | 'request_id' | 'client_request_id' | 'operation'>
  ) => {
    sendIfAlive(sender, {
      execution_id: executionId,
      request_id: requestId,
      client_request_id: clientRequestId ?? '',
      operation,
      ...payload
    })
  }
  const onDestroyed = (): void => controller.abort(new DOMException('Renderer closed', 'AbortError'))
  sender.once('destroyed', onDestroyed)
  emit({ type: 'started', elapsed_ms: 0 })

  try {
    const result = await action({
      executionId,
      requestId,
      signal: controller.signal,
      onStreamEvent: (streamEvent) => {
        const common = {
          elapsed_ms: streamEvent.elapsed_ms,
          ...(streamEvent.child_execution_id ? { child_execution_id: streamEvent.child_execution_id } : {}),
          ...(streamEvent.batch_key ? { batch_key: streamEvent.batch_key } : {})
        }
        if (streamEvent.type === 'content_delta') {
          emit({ ...common, type: 'content_delta', content_delta: streamEvent.delta })
        } else if (streamEvent.type === 'phase') {
          emit({ ...common, type: 'phase', phase: streamEvent.phase })
        } else if (streamEvent.type === 'attempt') {
          emit({ ...common, type: 'attempt', attempt: streamEvent.attempt })
        }
      }
    })
    emit({ type: 'completed', elapsed_ms: Date.now() - startedAt })
    return result
  } catch (cause) {
    emit({
      type: controller.signal.aborted ? 'cancelled' : 'failed',
      elapsed_ms: Date.now() - startedAt
    })
    throw cause
  } finally {
    sender.removeListener('destroyed', onDestroyed)
    activeStreams.delete(executionId)
  }
}

function sendIfAlive(sender: WebContents, event: DesktopAIStreamEvent): void {
  if (!sender.isDestroyed()) sender.send('ai:streamEvent', event)
}
