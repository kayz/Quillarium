import { CheckCircle2, FileText, LockKeyhole, Save, Send } from 'lucide-react'
import type { LanguageName } from '../../app/types.js'
import { t } from '../../app/i18n.js'

type EditableDoc = { data: Record<string, unknown>; content: string; path: string }

export function ChapterProseWorkspace({
  chapterTitle,
  doc,
  targetWords,
  dirty,
  busy,
  onDocChange,
  onSave,
  onFinalize,
  onPublish,
  language
}: {
  chapterTitle: string
  doc: EditableDoc
  targetWords: number
  dirty: boolean
  busy: boolean
  onDocChange: (doc: EditableDoc) => void
  onSave: () => Promise<void>
  onFinalize: () => Promise<void>
  onPublish: (confirmation: string) => Promise<void>
  language: LanguageName
}) {
  const zh = language === 'zh'
  const status = String(doc.data.status ?? 'draft')
  const published = status === 'published'
  const count = countProseCharacters(doc.content)
  const progress = targetWords > 0 ? Math.min(100, Math.round((count / targetWords) * 100)) : 0

  return (
    <section className="chapter-prose-workspace">
      <header className="chapter-prose-head">
        <div>
          <span className="badge ok">
            <FileText size={13} /> {zh ? '章正文' : 'Chapter prose'}
          </span>
          <h2>{chapterTitle}</h2>
          <div className="chapter-status-line">
            <span className={`chapter-status ${status}`}>{statusLabel(status, language)}</span>
            <span>
              {count.toLocaleString()} / {targetWords.toLocaleString()} {zh ? '字' : 'characters'}
            </span>
          </div>
        </div>
        <div className="chapter-prose-actions">
          {!published && (
            <button onClick={onSave} disabled={busy || !dirty}>
              <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
            </button>
          )}
          {status === 'draft' && (
            <button
              onClick={async () => {
                if (!window.confirm(zh ? '确认将本章定稿？定稿后 AI 与节编辑会锁定。' : 'Finalize chapter?'))
                  return
                await onFinalize()
              }}
              disabled={busy || !doc.content.trim()}
            >
              <CheckCircle2 size={15} /> {zh ? '定稿' : 'Finalize'}
            </button>
          )}
          {status === 'final' && (
            <button
              className="danger"
              onClick={async () => {
                if (
                  !window.confirm(
                    zh
                      ? '发布会永久锁定正文，并删除各节提示词和 AI 产物。第一次确认：继续吗？'
                      : 'Publishing permanently locks the prose and deletes scene-generation artifacts. Continue?'
                  )
                )
                  return
                const confirmation = window.prompt(
                  zh ? `第二次确认：请输入完整章名“${chapterTitle}”` : `Type “${chapterTitle}”`
                )
                if (confirmation !== chapterTitle) return
                await onPublish(confirmation)
              }}
              disabled={busy || !doc.content.trim()}
            >
              <Send size={15} /> {zh ? '发布并清理节产物' : 'Publish'}
            </button>
          )}
          {published && (
            <span className="chapter-prose-lock">
              <LockKeyhole size={14} /> {zh ? '已发布，永久锁定' : 'Published and locked'}
            </span>
          )}
        </div>
      </header>

      <div className="chapter-word-progress" aria-label={zh ? '章字数进度' : 'Chapter word progress'}>
        <i style={{ width: `${progress}%` }} />
      </div>

      <label className="chapter-prose-editor">
        <span>
          <strong>{zh ? '正文 · 纯文字' : 'Prose · plain text'}</strong>
          <small>
            {status === 'draft'
              ? zh
                ? '草稿可自由编辑'
                : 'Draft: freely editable'
              : status === 'final'
                ? zh
                  ? '已定稿：仅允许作者小幅修改'
                  : 'Final: limited author edits only'
                : zh
                  ? '已发布：禁止修改'
                  : 'Published: read only'}
          </small>
        </span>
        <textarea
          value={doc.content}
          readOnly={published}
          onChange={(event) => onDocChange({ ...doc, content: event.target.value })}
          spellCheck
          aria-label={zh ? '章正文纯文字编辑区' : 'Chapter prose editor'}
        />
      </label>

      <p className="chapter-prose-note">
        {zh
          ? '可以完全手写正文；接受某一节的成果时，系统会按节顺序写入这里，不加入标题或分隔符。'
          : 'Write directly, or accept scene results into this prose in scene order without headings or separators.'}
      </p>
    </section>
  )
}

export function countProseCharacters(value: string): number {
  return [...value.replace(/\s/gu, '')].length
}

function statusLabel(status: string, language: LanguageName): string {
  if (language === 'en') return status
  if (status === 'final') return '已定稿'
  if (status === 'published') return '已发布'
  return '草稿'
}
