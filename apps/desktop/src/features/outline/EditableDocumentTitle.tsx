import { PencilLine } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { fieldDescription, fieldLabel } from '../metadata/field-presentation.js'

export function EditableDocumentTitle({
  value,
  language,
  disabled = false,
  onChange
}: {
  value: unknown
  language: LanguageName
  disabled?: boolean
  onChange: (title: string) => void
}) {
  const title = String(value ?? '')
  const zh = language === 'zh'

  return (
    <label className="editable-document-title">
      <span className="editable-document-title-label">
        <span className="localized-field-copy">
          <strong>{fieldLabel('title', language)}</strong>
          <small>{fieldDescription('title', language)}</small>
        </span>
        <span className="editable-document-title-hint">
          <PencilLine size={12} /> {disabled ? (zh ? '只读' : 'Read only') : zh ? '可修改' : 'Editable'}
        </span>
      </span>
      <span className="editable-document-title-control">
        <input
          value={title}
          onChange={(event) => onChange(event.target.value)}
          placeholder={zh ? '输入名称' : 'Enter a name'}
          aria-label={zh ? '文档名称' : 'Document name'}
          disabled={disabled}
        />
      </span>
      {!title.trim() && <small>{zh ? '名称不能为空，填写后再保存。' : 'Enter a name before saving.'}</small>}
    </label>
  )
}
