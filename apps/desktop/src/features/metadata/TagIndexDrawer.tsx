import { useEffect, useMemo } from 'react'
import { Hash, X } from 'lucide-react'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import { docTypeLabel } from '../outline/outline-model.js'
import { fieldLabel } from './field-presentation.js'
import { displayTag, findTagMatches } from './tag-index.js'

export function TagIndexDrawer({
  tag,
  displayValue,
  docs,
  language,
  onClose,
  onSelect
}: {
  tag: string | null
  displayValue?: string
  docs: DocEntry[]
  language: LanguageName
  onClose: () => void
  onSelect: (target: TargetSelection, doc: DocEntry) => void
}) {
  const zh = language === 'zh'
  const matches = useMemo(() => (tag ? findTagMatches(docs, tag) : []), [docs, tag])
  useEffect(() => {
    if (!tag) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tag, onClose])
  if (!tag) return null
  return (
    <div className="tag-drawer-layer">
      <button
        className="tag-drawer-scrim"
        type="button"
        onClick={onClose}
        aria-label={zh ? '关闭标签结果' : 'Close tag results'}
      />
      <aside className="tag-index-drawer" aria-label={zh ? '标签关联内容' : 'Tagged records'}>
        <header>
          <div>
            <span className="tag-drawer-kicker">
              <Hash size={13} /> {zh ? '项目标签索引' : 'Project tag index'}
            </span>
            <h2>{displayTag(displayValue ?? tag)}</h2>
            <p>{zh ? `${matches.length} 条内容，按类型标记` : `${matches.length} records, marked by type`}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={zh ? '关闭' : 'Close'}>
            <X size={18} />
          </button>
        </header>
        <div className="tag-result-list">
          {matches.map(({ doc, fields }) => (
            <button
              type="button"
              className={`tag-result type-${doc.data.type}`}
              key={`${doc.data.type}:${doc.data.id}`}
              onClick={() => {
                onSelect({ type: doc.data.type, id: doc.data.id }, doc)
                onClose()
              }}
            >
              <span className="tag-result-spine" aria-hidden="true" />
              <span className="tag-result-copy">
                <span className="tag-result-type">{docTypeLabel(doc, language)}</span>
                <strong>{doc.data.title}</strong>
                <small>{fields.map((field) => fieldLabel(field, language)).join(' · ')}</small>
                <p>
                  {doc.content
                    .replace(/[#|*_>`\n-]+/gu, ' ')
                    .trim()
                    .slice(0, 100) || (zh ? '没有正文摘要' : 'No body summary')}
                </p>
              </span>
            </button>
          ))}
          {!matches.length && (
            <div className="tag-result-empty">
              <Hash size={24} />
              <strong>{zh ? '没有找到关联内容' : 'No tagged records found'}</strong>
              <p>
                {zh
                  ? '标签匹配采用完全相同的词，不会模糊合并相近概念。'
                  : 'Tags use exact matching and do not merge similar concepts.'}
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
