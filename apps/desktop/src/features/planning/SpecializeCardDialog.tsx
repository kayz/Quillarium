import { useEffect, useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { requiredSpecializationFields, specializationTargets } from '@quillarium/core'
import type { LanguageName, PlanningDocumentKind } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'
import { fieldLabel } from '../metadata/field-presentation.js'
import { PLANNING_KIND_LABELS } from './planning-model.js'

export function SpecializeCardDialog({
  language,
  sourceType,
  onCancel,
  onConfirm,
  targetType: initialTargetType,
  fields: initialFields
}: {
  language: LanguageName
  sourceType: string
  onCancel: () => void
  onConfirm: (targetType: string, fields: Record<string, unknown>) => void | Promise<void>
  targetType?: string
  fields?: Record<string, string>
}) {
  const titleId = useId()
  const zh = language === 'zh'
  const targets = useMemo(() => specializationTargets(sourceType), [sourceType])
  const [targetType, setTargetType] = useState(() => {
    if (initialTargetType && targets.includes(initialTargetType as (typeof targets)[number])) {
      return initialTargetType
    }
    return targets[0] ?? ''
  })
  const [fields, setFields] = useState<Record<string, string>>(initialFields ?? {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const required = requiredSpecializationFields(targetType)
  const ready = Boolean(targetType) && required.every((key) => fields[key]?.trim())
  const onlyWorldEntry = targets.length === 1 && targets[0] === 'world_entry'
  const title = onlyWorldEntry ? (zh ? '转回世界书' : 'Return to world entry') : zh ? '特化为' : 'Specialize'

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const submit = async () => {
    if (!ready || busy) return
    const payload: Record<string, unknown> = {}
    for (const key of required) payload[key] = fields[key].trim()
    setError('')
    setBusy(true)
    try {
      await onConfirm(targetType, payload)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-backdrop outline-create-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        className="modal outline-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="outline-create-head">
          <div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {!onlyWorldEntry && (
            <label>
              {title}
              <select
                value={targetType}
                onChange={(event) => {
                  setTargetType(event.target.value)
                  setFields({})
                  if (error) setError('')
                }}
                disabled={busy}
                aria-label={title}
              >
                {targets.map((kind) => (
                  <option key={kind} value={kind}>
                    {PLANNING_KIND_LABELS[kind as PlanningDocumentKind]?.[language] ?? kind}
                  </option>
                ))}
              </select>
            </label>
          )}
          {required.map((key) => (
            <label key={key}>
              {fieldLabel(key, language)}
              <input
                name={key}
                value={fields[key] ?? ''}
                onChange={(event) => {
                  setFields((current) => ({ ...current, [key]: event.target.value }))
                  if (error) setError('')
                }}
                disabled={busy}
              />
            </label>
          ))}
          {error && (
            <p className="outline-create-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
              {zh ? '取消' : 'Cancel'}
            </button>
            <button type="submit" className="primary" disabled={busy || !ready}>
              {busy ? (zh ? '特化中…' : 'Specializing…') : title}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
