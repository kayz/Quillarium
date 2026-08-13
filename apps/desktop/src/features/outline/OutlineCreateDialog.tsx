import { useEffect, useId, useRef, useState } from 'react'
import { FilePlus2, X } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'

export function OutlineCreateDialog({
  label,
  parentTitle,
  language,
  busy,
  onClose,
  onConfirm
}: {
  label: string
  parentTitle?: string | null
  language: LanguageName
  busy: boolean
  onClose: () => void
  onConfirm: (title: string) => Promise<void>
}) {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const zh = language === 'zh'

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async () => {
    const value = title.trim()
    if (!value) {
      setError(zh ? `请输入${label}名称。` : `Enter a ${label} name.`)
      inputRef.current?.focus()
      return
    }
    setError('')
    try {
      await onConfirm(value)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    }
  }

  return (
    <div
      className="modal-backdrop outline-create-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="modal outline-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="outline-create-head">
          <div className="outline-create-icon">
            <FilePlus2 size={20} />
          </div>
          <div>
            <span className="planning-kicker">{zh ? '建立下一层结构' : 'Add to the outline tree'}</span>
            <h2 id={titleId}>{zh ? `新建${label}` : `New ${label}`}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        {parentTitle && (
          <p className="outline-create-parent">
            {zh ? '创建位置' : 'Parent'} <strong>{parentTitle}</strong>
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label>
            {zh ? `${label}名称` : `${label} name`}
            <input
              ref={inputRef}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                if (error) setError('')
              }}
              placeholder={zh ? `例如：${label}一` : `For example: ${label} one`}
              disabled={busy}
              aria-invalid={Boolean(error)}
            />
          </label>
          {error && (
            <p className="outline-create-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>
              {zh ? '取消' : 'Cancel'}
            </button>
            <button type="submit" className="primary" disabled={busy || !title.trim()}>
              {busy ? (zh ? '创建中…' : 'Creating…') : zh ? `创建${label}` : `Create ${label}`}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
