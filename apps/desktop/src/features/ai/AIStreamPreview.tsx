import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import type { DesktopAIStreamEvent, DesktopAIStreamOperation } from '../../../electron/ipc/contract.js'
import type { LanguageName } from '../../app/types.js'
import { bridge } from '../../app/bridge.js'

export interface AIStreamPreviewState {
  clientRequestId: string
  executionId: string
  requestId: string
  operation: DesktopAIStreamOperation
  active: boolean
  content: string
  phase: DesktopAIStreamEvent['phase']
  elapsedMs: number
  attempt: number
  terminal: DesktopAIStreamEvent['type'] | null
}

export function useAIStreamPreview(operation: DesktopAIStreamOperation) {
  const [state, setState] = useState<AIStreamPreviewState | null>(null)

  useEffect(
    () =>
      bridge.onAIStreamEvent((event) => {
        setState((current) => {
          if (
            !current ||
            event.client_request_id !== current.clientRequestId ||
            event.operation !== operation
          ) {
            return current
          }
          if (event.type === 'started') {
            return {
              ...current,
              executionId: event.execution_id,
              requestId: event.request_id,
              active: true,
              elapsedMs: event.elapsed_ms,
              terminal: null
            }
          }
          if (event.execution_id !== current.executionId || event.request_id !== current.requestId)
            return current
          if (event.type === 'attempt') {
            return {
              ...current,
              attempt: event.attempt ?? current.attempt,
              content: (event.attempt ?? 0) > current.attempt ? '' : current.content,
              elapsedMs: event.elapsed_ms
            }
          }
          if (event.type === 'content_delta') {
            return {
              ...current,
              content: `${current.content}${event.content_delta ?? ''}`,
              elapsedMs: event.elapsed_ms
            }
          }
          if (event.type === 'phase') {
            return { ...current, phase: event.phase, elapsedMs: event.elapsed_ms }
          }
          return {
            ...current,
            active: false,
            elapsedMs: event.elapsed_ms,
            terminal: event.type
          }
        })
      }),
    [operation]
  )

  const begin = (): string => {
    const clientRequestId = globalThis.crypto?.randomUUID?.() ?? `renderer-${Date.now()}-${Math.random()}`
    setState({
      clientRequestId,
      executionId: '',
      requestId: '',
      operation,
      active: true,
      content: '',
      phase: 'connecting',
      elapsedMs: 0,
      attempt: 0,
      terminal: null
    })
    return clientRequestId
  }

  const cancel = async (): Promise<boolean> => {
    if (!state?.executionId || !state.requestId || !state.active) return false
    return bridge.cancelAIStream(state.executionId, state.requestId)
  }

  const clear = (): void => setState(null)
  return { state, begin, cancel, clear }
}

export function AIStreamPreview({
  state,
  language,
  className = ''
}: {
  state: AIStreamPreviewState | null
  language: LanguageName
  className?: string
}) {
  const outputRef = useRef<HTMLPreElement>(null)
  const zh = language === 'zh'
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [state?.content])
  if (!state || (!state.active && !state.content)) return null
  const phase = localizedPhase(state.phase, language)
  return (
    <section className={`ai-stream-preview ${className}`.trim()} aria-live="polite" aria-atomic="false">
      <header>
        {state.active && <LoaderCircle className="spin" size={14} aria-hidden="true" />}
        <strong>{zh ? '生成中，内容尚未校验' : 'Generating — content is not validated yet'}</strong>
        <span>
          {phase} · {(state.elapsedMs / 1_000).toFixed(1)}s
        </span>
      </header>
      {state.content ? (
        <pre ref={outputRef}>{state.content}</pre>
      ) : (
        <div className="ai-stream-waiting">{phase}</div>
      )}
    </section>
  )
}

export function AILongTaskProgressDialog({
  state,
  language,
  title,
  onCancel
}: {
  state: AIStreamPreviewState | null
  language: LanguageName
  title: string
  onCancel: () => Promise<void>
}) {
  if (!state?.active) return null
  const zh = language === 'zh'
  return (
    <div className="agent-task-backdrop" role="presentation">
      <section className="ai-long-task-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <span className="planning-kicker">{zh ? '模型执行状态' : 'Model execution status'}</span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => void onCancel()}
            aria-label={zh ? '取消模型请求并关闭' : 'Cancel provider request and close'}
          >
            <X size={18} />
          </button>
        </header>
        <AIStreamPreview state={state} language={language} />
        <p>
          {zh
            ? '这里只显示模型正式输出。取消后，已接收的部分内容不会成为检查结果。'
            : 'Only formal model output appears here. Partial content is discarded after cancellation.'}
        </p>
      </section>
    </div>
  )
}

function localizedPhase(phase: DesktopAIStreamEvent['phase'], language: LanguageName): string {
  const labels = {
    connecting: language === 'zh' ? '正在连接模型' : 'Connecting to model',
    waiting: language === 'zh' ? '等待模型响应' : 'Waiting for model',
    streaming: language === 'zh' ? '正在接收正式输出' : 'Receiving formal output',
    validating: language === 'zh' ? '正在组装并校验' : 'Assembling and validating'
  }
  return labels[phase ?? 'waiting']
}
