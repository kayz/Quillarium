import { useId, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { displayTag } from './tag-index.js'
import { addUniqueTag, removeArrayItem } from './value-editing.js'

export function TagEditor({
  label,
  description,
  values,
  suggestions = [],
  language,
  onChange,
  onInspectTag
}: {
  label: string
  description: string
  values: string[]
  suggestions?: string[]
  language: LanguageName
  onChange: (values: string[]) => void
  onInspectTag?: (tag: string, displayValue?: string) => void
}) {
  const [draft, setDraft] = useState('')
  const zh = language === 'zh'
  const inputId = useId()
  const add = () => {
    const next = draft.trim().replace(/^#+\s*/u, '')
    if (!next) return
    onChange(addUniqueTag(values, next))
    setDraft('')
  }
  return (
    <div className="tag-field">
      <div className="metadata-field-label">
        <span className="localized-field-copy">
          <strong>{label}</strong>
          <small>{description}</small>
        </span>
        <small className="metadata-field-count">{values.length}</small>
      </div>
      <div className="tag-editor" aria-label={label}>
        <div className="tag-chip-list">
          {values.map((value, index) => (
            <span className="tag-chip" key={`${value}-${index}`}>
              {onInspectTag ? (
                <button
                  type="button"
                  className="tag-chip-open"
                  title={
                    zh ? `查看所有“${displayTag(value)}”内容` : `Show all records tagged ${displayTag(value)}`
                  }
                  onClick={() => onInspectTag(value)}
                >
                  {displayTag(value)}
                </button>
              ) : (
                <span className="tag-chip-open">{displayTag(value)}</span>
              )}
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={zh ? `移除 ${value}` : `Remove ${value}`}
                onClick={() => onChange(removeArrayItem(values, index))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <div className="tag-add-control">
            <input
              value={draft}
              list={inputId}
              aria-label={zh ? `添加${label}` : `Add ${label}`}
              placeholder={
                values.length
                  ? zh
                    ? '继续添加…'
                    : 'Add another…'
                  : zh
                    ? '输入后回车添加'
                    : 'Type and press Enter'
              }
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  add()
                }
              }}
              onBlur={add}
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={add}
              disabled={!draft.trim()}
            >
              <Plus size={14} />
              <span className="sr-only">{zh ? '添加' : 'Add'}</span>
            </button>
            <datalist id={inputId}>
              {suggestions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        </div>
      </div>
    </div>
  )
}
