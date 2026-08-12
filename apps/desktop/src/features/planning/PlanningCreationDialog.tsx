import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bot, Check, LoaderCircle, MessageSquareText, RotateCcw, X } from 'lucide-react'
import type {
  LanguageName,
  PlanningChatMessage,
  PlanningDocumentKind,
  PlanningDraft
} from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { PLANNING_KIND_LABELS, planningKindForContext } from './planning-model.js'

export function PlanningCreationDialog({
  root,
  module,
  language,
  onClose,
  onCreated
}: {
  root: string
  module: string
  language: LanguageName
  onClose: () => void
  onCreated: (result: { path: string; document: { data: Record<string, unknown>; content: string } }) => void
}) {
  const titleId = useId()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [messages, setMessages] = useState<PlanningChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [proposal, setProposal] = useState<PlanningDraft | null>(null)
  const [fieldsDraft, setFieldsDraft] = useState('{}')
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'discuss' | 'confirm' | null>(null)
  const zh = language === 'zh'
  const suggestedKind = planningKindForContext(module as never)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const discuss = async (retry = false) => {
    const authorMessage = retry ? (messages.at(-1)?.content ?? '') : message.trim()
    if (!authorMessage && !retry) return
    const nextMessages = retry ? messages : [...messages, { role: 'author' as const, content: authorMessage }]
    setMessages(nextMessages)
    setMessage('')
    setError(null)
    setBusy('discuss')
    try {
      const response = await bridge.discussPlanningRecord(root, {
        module,
        messages: nextMessages,
        proposal
      })
      setMessages([...nextMessages, { role: 'assistant', content: response.message }])
      if (response.proposal) {
        setProposal(response.proposal)
        setFieldsDraft(JSON.stringify(response.proposal.fields, null, 2))
        setFieldsError(null)
      }
    } catch (cause) {
      setError(formatDesktopError(cause))
    } finally {
      setBusy(null)
    }
  }

  const updateFields = (value: string) => {
    setFieldsDraft(value)
    try {
      const parsed: unknown = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(zh ? '需要 JSON 对象' : 'Expected a JSON object')
      }
      setFieldsError(null)
      setProposal((current) =>
        current ? { ...current, fields: parsed as Record<string, unknown> } : current
      )
    } catch (cause) {
      setFieldsError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const confirm = async () => {
    if (!proposal || fieldsError) return
    setBusy('confirm')
    setError(null)
    try {
      const result = await bridge.confirmPlanningRecord(root, proposal)
      onCreated(result)
    } catch (cause) {
      setError(formatDesktopError(cause))
      setBusy(null)
    }
  }

  return (
    <div
      className="modal-backdrop planning-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section className="modal planning-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="planning-dialog-head">
          <div>
            <span className="planning-kicker">{zh ? 'AI 对话式建档' : 'AI guided record'}</span>
            <h2 id={titleId}>{zh ? '把想法整理成规划资料' : 'Shape an idea into a planning record'}</h2>
            <p>
              {zh
                ? `使用背景 AI。它会参考当前项目和“${module}”栏目，多轮确认后提出可修改草案。`
                : `Uses the background AI profile with project and “${module}” context.`}
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            aria-label={zh ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </header>

        <div className="planning-dialog-grid">
          <section className="planning-conversation" aria-label={zh ? '建档讨论' : 'Planning discussion'}>
            <div className="conversation-stream" aria-live="polite" aria-busy={busy === 'discuss'}>
              <article className="conversation-message assistant">
                <Bot size={16} />
                <p>
                  {zh
                    ? `请描述你要补充的资料。可以只给一个模糊想法，我会追问并判断最合适的文档类型${suggestedKind ? `（当前栏目常用：${PLANNING_KIND_LABELS[suggestedKind].zh}）` : ''}。`
                    : 'Describe the record you need. A rough idea is enough; I will ask questions and choose the best document type.'}
                </p>
              </article>
              {messages.map((item, index) => (
                <article key={`${item.role}-${index}`} className={`conversation-message ${item.role}`}>
                  {item.role === 'assistant' ? <Bot size={16} /> : <MessageSquareText size={16} />}
                  <p className="conversation-content">{item.content}</p>
                </article>
              ))}
              {busy === 'discuss' && (
                <article className="conversation-message assistant thinking">
                  <LoaderCircle className="spin" size={16} />
                  <p>{zh ? '正在整理上下文并形成下一步…' : 'Reviewing context and forming the next step…'}</p>
                </article>
              )}
            </div>
            <label className="planning-message-box">
              <span>{zh ? '继续讨论' : 'Continue discussion'}</span>
              <textarea
                ref={inputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void discuss()
                }}
                placeholder={
                  zh
                    ? '例如：这是一个前期盟友，但我还没决定他是否会背叛…'
                    : 'Describe the idea, uncertainty, and intended story use…'
                }
                disabled={Boolean(busy)}
                aria-label={zh ? '建档讨论消息' : 'Planning discussion message'}
              />
            </label>
            <div className="planning-chat-actions">
              <small>{zh ? 'Ctrl / ⌘ + Enter 发送' : 'Ctrl / ⌘ + Enter to send'}</small>
              <button
                className="primary"
                type="button"
                onClick={() => void discuss()}
                disabled={Boolean(busy) || !message.trim()}
              >
                <MessageSquareText size={15} /> {zh ? '发送给背景 AI' : 'Send to background AI'}
              </button>
            </div>
          </section>

          <section className="planning-proposal" aria-label={zh ? '建档提案' : 'Record proposal'}>
            {proposal ? (
              <>
                <div className="proposal-status">
                  <span>
                    <Check size={14} /> {zh ? '可修改提案' : 'Editable proposal'}
                  </span>
                  <small>{zh ? '尚未写入项目' : 'Not written yet'}</small>
                </div>
                <label>
                  {zh ? '标题' : 'Title'}
                  <input
                    value={proposal.title}
                    onChange={(event) => setProposal({ ...proposal, title: event.target.value })}
                    aria-label={zh ? '提案标题' : 'Proposal title'}
                  />
                </label>
                <label>
                  {zh ? '文档类型' : 'Document type'}
                  <select
                    value={proposal.kind}
                    onChange={(event) =>
                      setProposal({ ...proposal, kind: event.target.value as PlanningDocumentKind })
                    }
                    aria-label={zh ? '提案文档类型' : 'Proposal document type'}
                  >
                    {(Object.keys(PLANNING_KIND_LABELS) as PlanningDocumentKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {zh ? PLANNING_KIND_LABELS[kind].zh : PLANNING_KIND_LABELS[kind].en}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="proposal-fields">
                  <span>{zh ? '结构化字段（JSON）' : 'Structured fields (JSON)'}</span>
                  <textarea
                    value={fieldsDraft}
                    onChange={(event) => updateFields(event.target.value)}
                    spellCheck={false}
                    aria-invalid={Boolean(fieldsError)}
                    aria-label={zh ? '提案结构化字段 JSON' : 'Proposal structured fields JSON'}
                  />
                  {fieldsError && <small className="field-error">{fieldsError}</small>}
                </label>
                <MarkdownBodyEditor
                  value={proposal.content}
                  onChange={(content) => setProposal({ ...proposal, content })}
                  language={language}
                />
              </>
            ) : (
              <div className="proposal-empty">
                <Bot size={28} />
                <h3>{zh ? '提案将在这里出现' : 'The proposal will appear here'}</h3>
                <p>
                  {zh
                    ? '先在左侧讨论。信息充分后，AI 会给出标题、类型、结构化字段与 Markdown 正文。'
                    : 'Discuss on the left; AI will propose a title, type, fields, and Markdown body.'}
                </p>
              </div>
            )}
          </section>
        </div>

        {error && (
          <div className="planning-error" role="alert">
            <p>{error}</p>
            <div>
              <button className="secondary" type="button" onClick={() => setError(null)}>
                <ArrowLeft size={14} /> {zh ? '返回修改' : 'Back'}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void discuss(true)}
                disabled={Boolean(busy) || messages.length === 0}
              >
                <RotateCcw size={14} /> {zh ? '重试' : 'Retry'}
              </button>
            </div>
          </div>
        )}
        <footer className="modal-actions planning-final-actions">
          <button className="secondary" type="button" onClick={onClose} disabled={Boolean(busy)}>
            {zh ? '取消' : 'Cancel'}
          </button>
          <span>
            {zh ? '只有确认后才创建 Markdown 文件。' : 'A Markdown file is created only after confirmation.'}
          </span>
          <button
            className="primary"
            type="button"
            onClick={() => void confirm()}
            disabled={Boolean(busy) || !proposal?.title.trim() || Boolean(fieldsError)}
          >
            {busy === 'confirm' ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
            {busy === 'confirm'
              ? zh
                ? '正在原子写入…'
                : 'Writing atomically…'
              : zh
                ? '确认并创建'
                : 'Confirm and create'}
          </button>
        </footer>
      </section>
    </div>
  )
}
