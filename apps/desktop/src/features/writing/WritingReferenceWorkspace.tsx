import { useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { formatDesktopError } from '../../shared/errors.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { OutlineCreateDialog } from '../outline/OutlineCreateDialog.js'

type ReferenceDraft = { path: string; content: string; data: Record<string, unknown> }

export function WritingReferenceWorkspace({
  docs,
  doc,
  dirty,
  busy,
  language,
  onSelect,
  onCreate,
  onImport,
  onDraft,
  onDocChange,
  onSave
}: {
  docs: DocEntry[]
  doc: ReferenceDraft | null
  dirty: boolean
  busy: boolean
  language: LanguageName
  onSelect: (doc: DocEntry) => void
  onCreate: (input: Record<string, unknown>) => Promise<void>
  onImport: () => Promise<void>
  onDraft: (request: string) => Promise<{ title: string; content: string }>
  onDocChange: (doc: ReferenceDraft) => void
  onSave: () => Promise<void>
}) {
  const zh = language === 'zh'
  const [createOpen, setCreateOpen] = useState(false)
  const [dialogueOpen, setDialogueOpen] = useState(false)
  const [dialogueRequest, setDialogueRequest] = useState('')
  const [dialogueDraft, setDialogueDraft] = useState<{ title: string; content: string } | null>(null)
  const [dialogueError, setDialogueError] = useState('')
  const [dialogueBusy, setDialogueBusy] = useState(false)
  const cards = docs.filter((item) => item.data.type === 'reference' && item.data.prompt_material === true)
  const selected = doc?.data.type === 'reference' && doc.data.prompt_material === true ? doc : null
  const selectedTitle = String(selected?.data.title ?? '')

  return (
    <section className="writing-ledger">
      <aside className="writing-ledger-list">
        <div className="writing-ledger-head">
          <strong>{zh ? 'AI 参考资料' : 'Writing references'}</strong>
          <span className="writing-ledger-actions">
            <button type="button" onClick={() => setCreateOpen(true)} disabled={busy}>
              <Plus size={14} /> {zh ? '手写' : 'Write'}
            </button>
            <button type="button" onClick={() => void onImport()} disabled={busy}>
              <Upload size={14} /> {zh ? '导入' : 'Import'}
            </button>
            <button type="button" onClick={() => setDialogueOpen(true)} disabled={busy}>
              {zh ? '对话' : 'Discuss'}
            </button>
          </span>
        </div>
        <p className="muted">
          {zh
            ? '冲突、戏剧理论、文风和写作指导。节打开时，它们按提示词模板进入生文，方式和世界书相同。只归档的资料不在这里。'
            : 'Conflict, drama, style, and writing guidance. With scenes on, templates pull these into the prompt the same way as the world book. Archives stay out.'}
        </p>
        {cards.map((card) => (
          <button
            key={card.data.id}
            type="button"
            className={selected?.data.id === card.data.id ? 'active' : ''}
            onClick={() => onSelect(card)}
          >
            <strong>{card.data.title}</strong>
          </button>
        ))}
        {!cards.length && (
          <p className="empty-row">{zh ? '还没有会进提示词的资料。' : 'No prompt references yet.'}</p>
        )}
      </aside>
      <div className="writing-ledger-detail">
        {selected ? (
          <>
            <label className="metadata-field">
              <span>{zh ? '名称' : 'Name'}</span>
              <input
                value={selectedTitle}
                onChange={(event) =>
                  onDocChange({ ...selected, data: { ...selected.data, title: event.target.value } })
                }
              />
            </label>
            <MarkdownBodyEditor
              value={selected.content}
              language={language}
              onChange={(content) => onDocChange({ ...selected, content })}
            />
            <div className="detail-actions">
              <button type="button" onClick={() => void onSave()} disabled={!dirty || busy}>
                {zh ? '保存' : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <p className="empty-row">
            {zh
              ? '选手写的一条，或新建冲突、文风、戏剧理论、写作指导。'
              : 'Select a note, or write a new one.'}
          </p>
        )}
      </div>
      {dialogueOpen && (
        <div className="modal-backdrop outline-create-backdrop">
          <section className="modal outline-create-dialog" role="dialog" aria-modal="true">
            <header className="outline-create-head">
              <div>
                <span className="planning-kicker">
                  {zh ? '确认前不写入' : 'Nothing is written until you confirm'}
                </span>
                <h2>{zh ? '对话起草参考资料' : 'Draft a reference'}</h2>
              </div>
            </header>
            <label>
              {zh ? '想要什么样的冲突、文风、戏剧理论或写作指导' : 'What should the note cover?'}
              <textarea
                value={dialogueRequest}
                onChange={(event) => setDialogueRequest(event.target.value)}
                disabled={dialogueBusy}
              />
            </label>
            {dialogueDraft && (
              <div>
                <strong>{dialogueDraft.title}</strong>
                <p>{dialogueDraft.content}</p>
              </div>
            )}
            {dialogueError && (
              <p className="outline-create-error" role="alert">
                {dialogueError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={dialogueBusy}
                onClick={() => {
                  setDialogueOpen(false)
                  setDialogueDraft(null)
                  setDialogueError('')
                }}
              >
                {zh ? '放弃' : 'Discard'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={dialogueBusy || !dialogueRequest.trim()}
                onClick={() => {
                  setDialogueBusy(true)
                  setDialogueError('')
                  void onDraft(dialogueRequest)
                    .then((draft) => setDialogueDraft(draft))
                    .catch((cause) => setDialogueError(formatDesktopError(cause, language)))
                    .finally(() => setDialogueBusy(false))
                }}
              >
                {zh ? '起草' : 'Draft'}
              </button>
              <button
                type="button"
                className="primary"
                disabled={dialogueBusy || !dialogueDraft}
                onClick={() => {
                  if (!dialogueDraft) return
                  setDialogueBusy(true)
                  setDialogueError('')
                  void onCreate({
                    title: dialogueDraft.title,
                    content: dialogueDraft.content,
                    prompt_material: true,
                    status: 'draft'
                  })
                    .then(() => {
                      setDialogueOpen(false)
                      setDialogueDraft(null)
                      setDialogueRequest('')
                    })
                    .catch((cause) => setDialogueError(formatDesktopError(cause, language)))
                    .finally(() => setDialogueBusy(false))
                }}
              >
                {zh ? '确认写入' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}
      {createOpen && (
        <OutlineCreateDialog
          label={zh ? '参考资料' : 'Reference'}
          mode="setting"
          language={language}
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onConfirm={async (title) => {
            await onCreate({ title, content: '', prompt_material: true, status: 'draft' })
            setCreateOpen(false)
          }}
        />
      )}
    </section>
  )
}
