import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'

export type ToastKind = 'error' | 'status'

export function toastAutoDismissMs(kind: ToastKind): number {
  return kind === 'error' ? 8_000 : 5_000
}

export function ToastNotice({
  message,
  kind,
  language,
  onDismiss
}: {
  message: string
  kind: ToastKind
  language: LanguageName
  onDismiss: () => void
}) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => dismissRef.current(), toastAutoDismissMs(kind))
    return () => window.clearTimeout(timer)
  }, [kind, message])

  if (!message) return null
  const closeLabel = language === 'zh' ? '关闭提示' : 'Dismiss notification'
  return (
    <div className={`toast ${kind === 'error' ? 'error' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{message}</span>
      <button
        type="button"
        className="toast-dismiss"
        onClick={onDismiss}
        aria-label={closeLabel}
        title={closeLabel}
      >
        <X size={15} />
      </button>
    </div>
  )
}
