import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Bot, Check, LoaderCircle, MessageSquareText, RotateCcw, X } from 'lucide-react'
import type {
  LanguageName,
  PlanningChatMessage,
  PlanningDocumentKind,
  PlanningDraft,
  PlanningProposal,
  PlanningSession
} from '../../app/types.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { fieldPresentation } from '../metadata/field-presentation.js'
import { MetadataEditor } from '../outline/OutlineShared.js'
import {
  PLANNING_KIND_LABELS,
  confirmAllPlanningProposals,
  planningKindForContext,
  planningKindsForContext,
  planningProposalDependencies
} from './planning-model.js'

export function PlanningCreationDialog({
  root,
  module,
  sessionId: initialSessionId,
  documentId,
  language,
  onClose,
  onCreated
}: {
  root: string
  module: string
  sessionId?: string
  documentId?: string
  language: LanguageName
  onClose: () => void
  onCreated: (result: { path: string; document: { data: Record<string, unknown>; content: string } }) => void
}) {
  const titleId = useId()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [messages, setMessages] = useState<PlanningChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [proposals, setProposals] = useState<PlanningProposal[]>([])
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [session, setSession] = useState<PlanningSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'load' | 'discuss' | 'confirm' | null>('load')
  const zh = language === 'zh'
  const suggestedKind = planningKindForContext(module as never)
  const proposalRecord = proposals.find((item) => item.id === selectedProposalId) ?? proposals[0] ?? null
  const proposal = proposalRecord?.draft ?? null
  const editing = proposalRecord?.operation === 'update'
  const extractingReference = Boolean(session?.source_document)
  const originalKind = proposalRecord?.target?.type
  const allowedKinds = planningKindsForContext(session?.module ?? module, originalKind)
  const proposalKindOptions =
    proposal && !allowedKinds.includes(proposal.kind) ? [proposal.kind, ...allowedKinds] : allowedKinds
  const changingType = Boolean(originalKind && proposal && originalKind !== proposal.kind)
  const reviewableProposals = proposals.filter((item) => item.status !== 'applied')
  const confirmedCount = proposals.filter((item) => item.status === 'confirmed').length
  const allReviewableConfirmed =
    reviewableProposals.length > 0 && reviewableProposals.every((item) => item.status === 'confirmed')
  const pendingDependencies = proposalRecord
    ? planningProposalDependencies(proposalRecord, proposals).filter(
        (item) => item.operation === 'create' && item.status === 'draft'
      )
    : []

  const close = useCallback(async () => {
    if (session) {
      try {
        await bridge.savePlanningSession(root, session.id, {
          messages,
          proposals,
          selectedProposalId
        })
      } catch (cause) {
        setError(formatDesktopError(cause, language))
        return
      }
    }
    onClose()
  }, [messages, onClose, proposals, root, selectedProposalId, session])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const loaded = initialSessionId
          ? await bridge.loadPlanningSession(root, initialSessionId)
          : await bridge.startPlanningSession(root, module, documentId)
        if (!active) return
        setSession(loaded)
        setMessages(loaded.messages)
        setProposals(loaded.proposals)
        setSelectedProposalId(loaded.selected_proposal_id)
        setBusy(null)
      } catch (cause) {
        if (!active) return
        setError(formatDesktopError(cause, language))
        setBusy(null)
      }
    })()
    return () => {
      active = false
    }
  }, [documentId, initialSessionId, module, root])

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) void close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, close])

  useEffect(() => {
    if (!session || busy === 'load') return
    const handle = window.setTimeout(() => {
      void bridge
        .savePlanningSession(root, session.id, { messages, proposals, selectedProposalId })
        .catch((cause: unknown) => {
          setError(formatDesktopError(cause, language))
        })
    }, 500)
    return () => window.clearTimeout(handle)
  }, [busy, messages, proposals, root, selectedProposalId, session])

  const discuss = async (retry = false) => {
    const authorMessage = retry ? (messages.at(-1)?.content ?? '') : message.trim()
    if ((!authorMessage && !retry) || !session) return
    const nextMessages = retry ? messages : [...messages, { role: 'author' as const, content: authorMessage }]
    setMessages(nextMessages)
    setMessage('')
    setError(null)
    setBusy('discuss')
    try {
      const response = await bridge.discussPlanningRecord(root, {
        module,
        messages: nextMessages,
        proposals,
        selectedProposalId,
        sessionId: session.id
      })
      setMessages([...nextMessages, { role: 'assistant', content: response.message }])
      setProposals(response.proposals)
      setSelectedProposalId(response.selectedProposalId)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    if (!session || !proposals.some((item) => item.status === 'confirmed')) return
    setBusy('confirm')
    setError(null)
    try {
      const result = await bridge.confirmPlanningRecord(root, {
        sessionId: session.id,
        messages,
        proposals,
        selectedProposalId
      })
      onCreated(result)
    } catch (cause) {
      setError(formatDesktopError(cause, language))
      setBusy(null)
    }
  }

  const updateProposal = (draft: PlanningDraft) => {
    if (!proposalRecord) return
    setProposals((current) =>
      current.map((item) =>
        item.id === proposalRecord.id ? { ...item, draft, status: 'draft' as const } : item
      )
    )
  }

  const toggleConfirmation = () => {
    if (!proposalRecord) return
    setProposals((current) =>
      current.map((item) =>
        item.id === proposalRecord.id
          ? { ...item, status: item.status === 'confirmed' ? ('draft' as const) : ('confirmed' as const) }
          : item
      )
    )
  }

  const toggleAllConfirmations = () => {
    setProposals((current) => {
      const pending = current.filter((item) => item.status !== 'applied')
      const allConfirmed = pending.length > 0 && pending.every((item) => item.status === 'confirmed')
      return allConfirmed
        ? current.map((item) => (item.status === 'confirmed' ? { ...item, status: 'draft' as const } : item))
        : confirmAllPlanningProposals(current)
    })
  }

  const confirmPendingDependencies = () => {
    const dependencyIds = new Set(pendingDependencies.map((item) => item.id))
    setProposals((current) =>
      current.map((item) =>
        dependencyIds.has(item.id) && item.status !== 'applied'
          ? { ...item, status: 'confirmed' as const }
          : item
      )
    )
  }

  return (
    <div
      className="modal-backdrop planning-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) void close()
      }}
    >
      <section className="modal planning-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="planning-dialog-head">
          <div>
            <span className="planning-kicker">
              {extractingReference
                ? zh
                  ? '参考原文 · 只读生卡'
                  : 'Reference source · read-only extraction'
                : editing
                  ? zh
                    ? '恢复 AI 对话'
                    : 'Restored AI conversation'
                  : zh
                    ? 'AI 对话式建档'
                    : 'AI guided record'}
            </span>
            <h2 id={titleId}>
              {extractingReference
                ? zh
                  ? `与 AI 讨论“${session?.source_document?.title ?? ''}”并生成设定卡`
                  : `Discuss “${session?.source_document?.title ?? ''}” and create setting cards`
                : editing
                  ? zh
                    ? '继续讨论并编辑这张卡片'
                    : 'Continue the conversation and edit this card'
                  : zh
                    ? '把想法整理成规划资料'
                    : 'Shape an idea into a planning record'}
            </h2>
            <p>
              {zh
                ? extractingReference
                  ? `参考文档 ${session?.source_document?.id ?? ''} 不会成为可编辑提案。AI 只能生成待审阅的新卡，确认后才写入项目。`
                  : editing
                    ? '已恢复这张卡片的完整对话与上次草案。继续讨论或直接修改，确认后原位更新。'
                    : `使用背景 AI。它会参考当前项目和“${module}”栏目，多轮确认后提出可修改草案。`
                : extractingReference
                  ? `Reference ${session?.source_document?.id ?? ''} remains immutable. AI may only propose new reviewable cards, which are written after explicit confirmation.`
                  : `Uses the background AI profile with project and “${module}” context.`}
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => void close()}
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
                    ? extractingReference
                      ? '请说明想从这份参考中整理哪些设定。我可以同时提出人物、势力、关系、世界书、时间线、地点等多张候选卡，但不会改动参考原文。'
                      : `请描述你要补充的资料。可以只给一个模糊想法，我会在当前栏目允许的类型内追问和整理${suggestedKind ? `（当前栏目：${PLANNING_KIND_LABELS[suggestedKind].zh}）` : ''}。`
                    : extractingReference
                      ? 'Describe what should be extracted. I can propose multiple setting cards, but the uploaded reference remains unchanged.'
                      : 'Describe the record you need. I will ask questions and stay within the current module’s allowed document types.'}
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
            {proposals.length > 0 && (
              <div className="planning-proposal-collection">
                <div className="planning-proposal-collection-head">
                  <span>
                    <strong>
                      {zh ? `本会话 ${proposals.length} 张卡片` : `${proposals.length} session cards`}
                    </strong>
                    <small>
                      {zh
                        ? `${confirmedCount} 张已确认；点击任一卡片切换编辑。`
                        : `${confirmedCount} confirmed; select any card to edit it.`}
                    </small>
                  </span>
                  <button
                    className="secondary"
                    type="button"
                    onClick={toggleAllConfirmations}
                    disabled={Boolean(busy) || reviewableProposals.length === 0}
                  >
                    <Check size={14} />
                    {allReviewableConfirmed
                      ? zh
                        ? '撤回全部确认'
                        : 'Undo all confirmations'
                      : zh
                        ? `确认全部 ${reviewableProposals.length} 张`
                        : `Confirm all ${reviewableProposals.length}`}
                  </button>
                </div>
                <div
                  className="planning-proposal-rail"
                  role="tablist"
                  aria-label={zh ? '会话卡片' : 'Session cards'}
                >
                  {proposals.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={item.id === proposalRecord?.id}
                      className={item.id === proposalRecord?.id ? 'active' : ''}
                      onClick={() => setSelectedProposalId(item.id)}
                    >
                      <span className={`proposal-operation ${item.operation}`}>
                        {item.operation === 'update' ? (zh ? '更新' : 'UPDATE') : zh ? '新卡' : 'NEW'}
                      </span>
                      <strong>
                        {index + 1}. {item.draft.title}
                      </strong>
                      <small>
                        {item.source === 'anchor' ? (zh ? '锚定卡片 · ' : 'Anchor · ') : ''}
                        {PLANNING_KIND_LABELS[item.draft.kind]?.[language] ?? item.draft.kind} · {item.id}
                      </small>
                      <span className={`proposal-state ${item.status}`}>
                        {proposalStatusCopy(item.status, language)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {proposal ? (
              <>
                <div className="proposal-status">
                  <span>
                    <Check size={14} /> {proposalStatusCopy(proposalRecord!.status, language)}
                  </span>
                  <small>
                    {changingType
                      ? zh
                        ? '确认后迁移类型；卡片 ID 与对话记录保持不变'
                        : 'Confirmation migrates the type while preserving the card ID and conversation'
                      : editing
                        ? zh
                          ? '确认后更新原卡片'
                          : 'Updates the original card'
                        : zh
                          ? '尚未写入项目'
                          : 'Not written yet'}
                  </small>
                </div>
                {proposalRecord?.validation_error && (
                  <p className="proposal-validation-error" role="status">
                    {proposalRecord.validation_error}
                  </p>
                )}
                {pendingDependencies.length > 0 && (
                  <div className="proposal-dependency-warning" role="status">
                    <span>
                      <strong>
                        {zh ? '这张卡依赖尚未确认的新卡' : 'This card needs unconfirmed new cards'}
                      </strong>
                      <small>
                        {pendingDependencies.map((item) => item.draft.title).join('、')}
                        {zh
                          ? '。应用前必须显式确认这些依赖，避免写入悬空引用。'
                          : '. Confirm these dependencies before applying to avoid dangling references.'}
                      </small>
                    </span>
                    <button
                      className="secondary"
                      type="button"
                      onClick={confirmPendingDependencies}
                      disabled={Boolean(busy)}
                    >
                      <Check size={14} /> {zh ? '确认所需依赖' : 'Confirm dependencies'}
                    </button>
                  </div>
                )}
                <label>
                  <PlanningFieldCopy name="title" language={language} />
                  <input
                    value={proposal.title}
                    onChange={(event) => updateProposal({ ...proposal, title: event.target.value })}
                    aria-label={zh ? '提案标题' : 'Proposal title'}
                  />
                </label>
                <label>
                  <PlanningFieldCopy name="document_type" language={language} />
                  <select
                    value={proposal.kind}
                    onChange={(event) =>
                      updateProposal({ ...proposal, kind: event.target.value as PlanningDocumentKind })
                    }
                    aria-label={zh ? '提案文档类型' : 'Proposal document type'}
                  >
                    {proposalKindOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {zh ? PLANNING_KIND_LABELS[kind].zh : PLANNING_KIND_LABELS[kind].en}
                      </option>
                    ))}
                  </select>
                  {changingType && (
                    <small className="planning-type-change-note">
                      {zh
                        ? `将从“${PLANNING_KIND_LABELS[originalKind!].zh}”迁移为“${PLANNING_KIND_LABELS[proposal.kind].zh}”。保存失败时不会删除原卡片。`
                        : `This changes “${PLANNING_KIND_LABELS[originalKind!].en}” to “${PLANNING_KIND_LABELS[proposal.kind].en}”. The original card is retained if saving fails.`}
                    </small>
                  )}
                </label>
                <section className="proposal-fields" aria-label={zh ? '提案结构化字段' : 'Proposal fields'}>
                  <MetadataEditor
                    data={proposal.fields}
                    language={language}
                    onChange={(fields) => updateProposal({ ...proposal, fields })}
                  />
                </section>
                <MarkdownBodyEditor
                  value={proposal.content}
                  onChange={(content) => updateProposal({ ...proposal, content })}
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
          <button className="secondary" type="button" onClick={() => void close()} disabled={Boolean(busy)}>
            {zh ? '取消' : 'Cancel'}
          </button>
          <span>
            {zh
              ? `关闭会保留全部 ${proposals.length} 张卡片；已确认 ${confirmedCount} 张。`
              : `Closing keeps all ${proposals.length} cards; ${confirmedCount} confirmed.`}
          </span>
          <button
            className="secondary"
            type="button"
            onClick={toggleConfirmation}
            disabled={Boolean(busy) || !proposal?.title.trim()}
          >
            {proposalRecord?.status === 'confirmed'
              ? zh
                ? '撤回确认'
                : 'Undo confirmation'
              : zh
                ? '确认此卡'
                : 'Confirm this card'}
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => void confirm()}
            disabled={Boolean(busy) || !proposals.some((item) => item.status === 'confirmed')}
          >
            {busy === 'confirm' ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
            {busy === 'confirm'
              ? zh
                ? '正在原子写入…'
                : 'Writing atomically…'
              : zh
                ? '应用全部已确认卡片'
                : 'Apply all confirmed cards'}
          </button>
        </footer>
      </section>
    </div>
  )
}

function PlanningFieldCopy({ name, language }: { name: string; language: LanguageName }) {
  const presentation = fieldPresentation(name, language)
  return (
    <span className="localized-field-copy">
      <strong>{presentation.label}</strong>
      <small>{presentation.description}</small>
    </span>
  )
}

function proposalStatusCopy(status: PlanningProposal['status'], language: LanguageName): string {
  const labels = {
    draft: { zh: '可编辑草案', en: 'Editable draft' },
    confirmed: { zh: '已确认，仍可编辑', en: 'Confirmed, still editable' },
    applied: { zh: '已应用，可继续讨论', en: 'Applied, discussion can continue' }
  }
  return labels[status][language]
}
