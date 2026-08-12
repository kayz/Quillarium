import { useState } from 'react'
import { Eye, FileCode2 } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { MarkdownPreview } from './MarkdownPreview.js'

export function MarkdownBodyEditor({
  value,
  onChange,
  language,
  readOnly = false
}: {
  value: string
  onChange: (value: string) => void
  language: LanguageName
  readOnly?: boolean
}) {
  const [mode, setMode] = useState<'source' | 'preview'>('source')
  const zh = language === 'zh'
  return (
    <section className="markdown-body-editor">
      <div className="markdown-mode-tabs" role="tablist" aria-label={zh ? '正文显示模式' : 'Body view mode'}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'source'}
          className={mode === 'source' ? 'active' : ''}
          onClick={() => setMode('source')}
        >
          <FileCode2 size={14} /> {zh ? '源码' : 'Source'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'preview'}
          className={mode === 'preview' ? 'active' : ''}
          onClick={() => setMode('preview')}
        >
          <Eye size={14} /> {zh ? '预览' : 'Preview'}
        </button>
      </div>
      {mode === 'source' ? (
        <label className="detail-editor markdown-source-editor">
          <span>{zh ? 'Markdown 正文' : 'Markdown body'}</span>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            readOnly={readOnly}
            spellCheck={false}
          />
        </label>
      ) : (
        <MarkdownPreview content={value} className="detail-markdown-preview" />
      )}
    </section>
  )
}
