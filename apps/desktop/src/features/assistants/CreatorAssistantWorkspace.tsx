import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  BookKey,
  Bot,
  Check,
  Eye,
  FileStack,
  GitFork,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  X
} from 'lucide-react'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import type {
  AgentPromptEnvelopeV1,
  AgentTaskDefinitionV1,
  LoadedAgentSession,
  LoadedAgentSessionDetail,
  LoadedAssistantPromptVersion,
  LoadedContextBundle,
  LoadedCreatorRole,
  ResolvedContextBundle,
  CreatorAssistantId,
  AssistantPromptVersionV1
} from '@quillarium/core'
import type { CreatorAssistantWorkflowInputV1 } from '@quillarium/core/assistant-workflows'
import {
  continuityRangeCandidatesFromDocuments,
  selectCharacterTimePointContext,
  validateContinuityReviewRange
} from '@quillarium/core/assistant-workflows'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { documentTypeLabel } from '../metadata/field-presentation.js'
import { PlanningCardSelector } from '../planning/PlanningCardSelector.js'

interface AssistantState {
  tasks: AgentTaskDefinitionV1[]
  roles: LoadedCreatorRole[]
  bundles: LoadedContextBundle[]
  sessions: LoadedAgentSession[]
  prompts: LoadedAssistantPromptVersion[]
  prompt_binding_issues: Array<{
    role_id: string
    assistant_id: CreatorAssistantId
    missing_prompt_id: string
    recovery_snapshots: Array<{
      session_id: string
      prompt: AssistantPromptVersionV1
      prompt_sha256: string
    }>
    available_prompt_ids: string[]
  }>
}
type SessionDetail = LoadedAgentSessionDetail
interface RunPreview {
  session: LoadedAgentSessionDetail
  resolved_context: ResolvedContextBundle
  prompt_envelope: AgentPromptEnvelopeV1
  knows: Array<{
    source_type: string
    source_id: string
    authority: string
    required: boolean
    token_count: number
    reason: string
    outcome: string
    display_title: string
    purpose: string
  }>
  can_do: string[]
  result_destination: string
  temporal_context?: ReturnType<typeof selectCharacterTimePointContext>
}

export function CreatorAssistantWorkspace({
  root,
  projectId,
  docs,
  selectedTarget,
  preferredRoleId,
  initialMessage,
  onProjectChanged,
  language
}: {
  root: string
  projectId: string
  docs: DocEntry[]
  selectedTarget: TargetSelection | null
  preferredRoleId?: string
  initialMessage?: string
  onProjectChanged: () => Promise<void>
  language: LanguageName
}) {
  const zh = language === 'zh'
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [leftWidth, setLeftWidth] = useState(260)
  const [rightWidth, setRightWidth] = useState(340)
  const [state, setState] = useState<AssistantState | null>(null)
  const [roleId, setRoleId] = useState('')
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [targetKey, setTargetKey] = useState('')
  const [authorInput, setAuthorInput] = useState('')
  const [preview, setPreview] = useState<RunPreview | null>(null)
  const [sentPrompt, setSentPrompt] = useState('')
  const [previewStaleReason, setPreviewStaleReason] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [promptEditorOpen, setPromptEditorOpen] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [promptName, setPromptName] = useState('')
  const [promptVersion, setPromptVersion] = useState('')
  const [rehearsalEventId, setRehearsalEventId] = useState('')
  const [rehearsalTimelineId, setRehearsalTimelineId] = useState('')
  const [rehearsalLocationId, setRehearsalLocationId] = useState('')
  const [continuityRangeIds, setContinuityRangeIds] = useState<string[]>([])

  const refresh = async () => {
    const next = await bridge.initializeAssistants(root)
    setState(next)
    setRoleId((current) => current || chooseRoleId(preferredRoleId, selectedTarget, next))
  }

  useEffect(() => {
    setError('')
    void refresh().catch((cause) => setError(formatDesktopError(cause, language)))
  }, [root])

  useEffect(() => {
    if (!state) return
    setRoleId(chooseRoleId(preferredRoleId, selectedTarget, state))
  }, [preferredRoleId, selectedTarget?.type, selectedTarget?.id, state?.roles.length])

  useEffect(() => {
    const target = targetFromSelection(selectedTarget, projectId)
    setTargetKey(`${target.document_type}:${target.document_id}`)
    if (selectedTarget && ['outline', 'scene', 'chapter_prose'].includes(selectedTarget.type)) {
      setContinuityRangeIds([selectedTarget.id])
    }
  }, [selectedTarget?.type, selectedTarget?.id, projectId])

  useEffect(() => {
    if (initialMessage?.trim()) {
      setAuthorInput(initialMessage)
      setPreview(null)
      setSentPrompt('')
      setPreviewStaleReason('author-input-changed')
    }
  }, [initialMessage])

  const activeRole = state?.roles.find((item) => item.value.id === roleId) ?? null
  const activePromptBindingIssue =
    state?.prompt_binding_issues.find((issue) => issue.role_id === roleId) ?? null
  const activeBundle = state?.bundles.find((item) => item.value.id === activeRole?.value.context_bundle_id)
  const activeAssistantId = activeRole?.value.task_id as CreatorAssistantId | undefined
  const rolePrompts = useMemo(() => {
    if (!activeAssistantId) return []
    const prompts = (state?.prompts ?? []).filter((prompt) => prompt.value.assistant_id === activeAssistantId)
    const boundPromptId = activeRole?.value.assistant_prompt_id
    const recent = prompts.slice(0, 5)
    if (!boundPromptId || recent.some((prompt) => prompt.value.id === boundPromptId)) return recent
    const pinned = prompts.find((prompt) => prompt.value.id === boundPromptId)
    return pinned ? [pinned, ...recent.slice(0, 4)] : recent
  }, [activeAssistantId, activeRole?.value.assistant_prompt_id, state?.prompts])
  const selectedPrompt =
    rolePrompts.find((prompt) => prompt.value.id === activeRole?.value.assistant_prompt_id) ?? rolePrompts[0]
  const targetDocs = useMemo(() => assistantTargetDocumentsForRole(docs, roleId), [docs, roleId])
  const targetSelectorDocs = useMemo<DocEntry[]>(
    () => [
      ...(['character-rehearsal', 'continuity-review'].includes(roleId)
        ? []
        : [
            {
              path: '',
              data: {
                id: projectId,
                type: 'project',
                title: zh ? '整个项目' : 'Whole project',
                tags: []
              },
              content: ''
            }
          ]),
      ...targetDocs
    ],
    [projectId, roleId, targetDocs, zh]
  )
  const roleSessions = useMemo(
    () => (state?.sessions ?? []).filter((item) => item.session.configuration.creator_role.id === roleId),
    [state?.sessions, roleId]
  )
  const rehearsalEvents = useMemo(
    () => docs.filter((document) => document.data.type === 'timeline_event'),
    [docs]
  )
  const rehearsalLocations = useMemo(
    () => docs.filter((document) => ['location', 'scene'].includes(document.data.type)),
    [docs]
  )
  const rehearsalTimelineOptions = useMemo(() => {
    const event = docs.find(
      (document) => document.data.type === 'timeline_event' && document.data.id === rehearsalEventId
    )
    if (!event) return []
    const placements = Array.isArray(event.data.placements) ? event.data.placements : []
    if (!placements.length && typeof event.data.timeline_node === 'string' && event.data.timeline_node) {
      return ['main']
    }
    return [
      ...new Set(
        placements
          .map((placement) =>
            placement && typeof placement === 'object'
              ? String((placement as Record<string, unknown>)['timeline_id'] ?? '')
              : ''
          )
          .filter(Boolean)
      )
    ].sort((left, right) => left.localeCompare(right, 'en'))
  }, [docs, rehearsalEventId])

  useEffect(() => {
    setRehearsalTimelineId((current) => {
      if (rehearsalTimelineOptions.includes(current)) return current
      if (rehearsalTimelineOptions.length === 1) return rehearsalTimelineOptions[0]!
      if (rehearsalTimelineOptions.includes('main')) return 'main'
      return ''
    })
  }, [rehearsalTimelineOptions.join('\0')])
  const continuityCandidates = useMemo(() => continuityRangeCandidatesFromDocuments(docs), [docs])
  const continuityValidation = validateContinuityReviewRange(continuityCandidates, continuityRangeIds)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      if (session) {
        const recovered = await bridge.loadAssistantSession(root, session.session.id).catch(() => null)
        if (recovered) setSession(recovered)
        await refresh().catch(() => undefined)
      }
      setError(formatDesktopError(cause, language))
    } finally {
      setBusy(false)
    }
  }

  const start = () =>
    run(async () => {
      if (!roleId) return
      let target = parseTargetKey(targetKey, projectId)
      let workflowInput: CreatorAssistantWorkflowInputV1 | undefined
      if (roleId === 'character-rehearsal') {
        workflowInput = {
          schema_version: 1,
          task_id: 'character-rehearsal',
          character_id: target.document_id,
          timeline_event_id: rehearsalEventId,
          ...(rehearsalTimelineId ? { timeline_id: rehearsalTimelineId } : {}),
          location_id: rehearsalLocationId,
          workflow_step: 'propose'
        }
      } else if (roleId === 'continuity-review' && continuityValidation.valid) {
        const firstId = continuityValidation.ordered_ids[0]!
        const firstDocument = docs.find((document) => document.data.id === firstId)
        const firstCandidate = continuityCandidates.find((candidate) => candidate.id === firstId)
        if (!firstDocument || !firstCandidate) throw new Error('CONTINUITY_RANGE_UNKNOWN_DOCUMENT')
        target = { document_type: firstDocument.data.type, document_id: firstId }
        workflowInput = {
          schema_version: 1,
          task_id: 'continuity-review',
          document_ids: continuityValidation.ordered_ids,
          chapter_id: firstCandidate.chapter_id
        }
      }
      const created = await bridge.startAssistantSession(root, roleId, target, undefined, workflowInput)
      const loaded = await bridge.loadAssistantSession(root, created.session.id)
      setSession(loaded)
      setPreview(null)
      setSentPrompt('')
      setPreviewStaleReason(initialMessage?.trim() ? 'previewing' : 'not-previewed')
      if (roleId === 'character-rehearsal') {
        setAuthorInput(
          rehearsalWorkflowMessage(target.document_id, rehearsalEventId, rehearsalLocationId, language)
        )
        setPreviewStaleReason('author-input-changed')
      } else if (roleId === 'continuity-review' && continuityValidation.valid) {
        setAuthorInput(continuityWorkflowMessage(continuityValidation.ordered_ids, language))
        setPreviewStaleReason('author-input-changed')
      }
      if (initialMessage?.trim()) {
        setPreviewing(true)
        try {
          const result = await bridge.previewAssistantTurn(root, loaded.session.id, initialMessage)
          setPreview(result)
          setSession(result.session)
          setSentPrompt(result.prompt_envelope.messages.at(-1)?.content ?? '')
          setPreviewStaleReason('')
        } finally {
          setPreviewing(false)
        }
      }
      await refresh()
    })

  const openSession = (sessionId: string) =>
    run(async () => {
      setSession(await bridge.loadAssistantSession(root, sessionId))
      setPreview(null)
      setSentPrompt('')
      setPreviewStaleReason('not-previewed')
      setAuthorInput('')
    })

  const previewTurn = () =>
    run(async () => {
      if (!session || !authorInput.trim()) return
      setPreviewing(true)
      try {
        const result = await bridge.previewAssistantTurn(root, session.session.id, authorInput)
        setPreview(result)
        setSession(result.session)
        setSentPrompt(result.prompt_envelope.messages.at(-1)?.content ?? '')
        setPreviewStaleReason('')
      } finally {
        setPreviewing(false)
      }
    })

  const sendTurn = () =>
    run(async () => {
      if (!session || !preview || previewStaleReason || !authorInput.trim()) return
      const updated = await bridge.sendAssistantTurn(
        root,
        session.session.id,
        session.source_sha256,
        authorInput,
        sentPrompt
      )
      setSession(updated)
      setAuthorInput('')
      setPreview(null)
      setSentPrompt('')
      setPreviewStaleReason('not-previewed')
      await refresh()
    })

  const fork = () =>
    run(async () => {
      if (!session) return
      const created = await bridge.forkAssistantSession(root, session.session.id)
      setSession(await bridge.loadAssistantSession(root, created.session.id))
      setPreview(null)
      await refresh()
    })

  const bindContextBundle = (bundleId: string) =>
    run(async () => {
      if (!activeRole || activeRole.value.context_bundle_id === bundleId) return
      if (
        !window.confirm(
          zh
            ? '将这个资料包绑定到创作助手？变更只影响以后开始的新会话。'
            : 'Bind this ContextBundle to the creator assistant? Only new sessions are affected.'
        )
      ) {
        return
      }
      await bridge.updateCreatorRole(
        root,
        {
          ...activeRole.value,
          version: nextPatchVersion(activeRole.value.version),
          context_bundle_id: bundleId
        },
        activeRole.source_sha256
      )
      setPreview(null)
      await refresh()
    })

  const bindAssistantPrompt = (promptId: string) =>
    run(async () => {
      if (!activeRole || activeRole.value.assistant_prompt_id === promptId) return
      await bridge.updateCreatorRole(
        root,
        {
          ...activeRole.value,
          version: nextPatchVersion(activeRole.value.version),
          assistant_prompt_id: promptId
        },
        activeRole.source_sha256
      )
      await refresh()
    })

  const openPromptEditor = () => {
    if (!activeAssistantId) return
    setPromptText(selectedPrompt?.value.instructions ?? '')
    setPromptName('')
    setPromptVersion(nextPatchVersion(selectedPrompt?.value.version ?? '1.0.0'))
    setPromptEditorOpen(true)
  }

  const savePrompt = () =>
    run(async () => {
      if (!activeRole || !activeAssistantId || !promptText.trim()) return
      await bridge.saveAssistantPromptVersion(root, {
        role_id: activeRole.value.id,
        expected_role_sha256: activeRole.source_sha256,
        prompt: {
          assistant_id: activeAssistantId,
          base_version: selectedPrompt?.value.version,
          version: promptVersion,
          name: promptName || undefined,
          instructions: promptText
        }
      })
      setPromptEditorOpen(false)
      await refresh()
    })

  const recoverPromptBinding = (
    selection:
      | { kind: 'existing'; prompt_id: string }
      | { kind: 'session_snapshot'; session_id: string; prompt_sha256: string }
  ) =>
    run(async () => {
      if (!activeRole) return
      await bridge.recoverAssistantPromptBinding(root, {
        role_id: activeRole.value.id,
        expected_role_sha256: activeRole.source_sha256,
        selection
      })
      await refresh()
    })

  const actOnProposal = (turnId: string, proposalId: string, action: 'apply' | 'reject') =>
    run(async () => {
      if (!session) return
      if (
        action === 'apply' &&
        !window.confirm(
          zh
            ? '确认把这条提案写入项目？AI 不能直接写入，只有本次确认会执行。'
            : 'Apply this proposal to the project? AI cannot write it without this confirmation.'
        )
      ) {
        return
      }
      const result =
        action === 'apply'
          ? await bridge.applyAssistantProposal(
              root,
              session.session.id,
              turnId,
              proposalId,
              session.turn_source_sha256[turnId] ?? ''
            )
          : await bridge.rejectAssistantProposal(
              root,
              session.session.id,
              turnId,
              proposalId,
              session.turn_source_sha256[turnId] ?? ''
            )
      setSession(result.session)
      if (result.document) await onProjectChanged()
      await refresh()
    })

  const actOnConfigurationProposal = (turnId: string, proposalId: string, action: 'apply' | 'reject') =>
    run(async () => {
      if (!session) return
      if (
        action === 'apply' &&
        !window.confirm(
          zh
            ? '确认应用这项助手配置变更？它只影响新会话；当前会话仍使用冻结配置。'
            : 'Apply this creator-assistant configuration change? It affects new sessions only.'
        )
      ) {
        return
      }
      const expected = session.turn_source_sha256[turnId] ?? ''
      const result =
        action === 'apply'
          ? await bridge.applyAssistantConfigurationProposal(
              root,
              session.session.id,
              turnId,
              proposalId,
              expected
            )
          : await bridge.rejectAssistantConfigurationProposal(
              root,
              session.session.id,
              turnId,
              proposalId,
              expected
            )
      setSession(result.session)
      await refresh()
    })

  if (!state) {
    return (
      <section className="creator-assistant-loading module-view-full">
        <Bot size={24} /> {zh ? '正在准备创作助手…' : 'Preparing creator assistants…'}
        {error && <p className="error-box">{error}</p>}
      </section>
    )
  }

  const detailPreview = preview
  return (
    <section
      ref={shellRef}
      className="creator-assistant-workspace module-view-full"
      style={
        {
          '--assistant-left': `${leftWidth}px`,
          '--assistant-right': `${rightWidth}px`
        } as CSSProperties
      }
    >
      <aside className="assistant-library">
        <header>
          <span className="assistant-kicker">{zh ? '创作助手' : 'CREATOR ASSISTANTS'}</span>
          <h2>{zh ? '助手与会话' : 'Roles & sessions'}</h2>
        </header>
        <div className="assistant-role-spines" aria-label={zh ? '创作助手列表' : 'Creator role list'}>
          {state.roles.map((role, index) => (
            <button
              key={role.value.id}
              className={roleId === role.value.id ? 'active' : ''}
              type="button"
              aria-pressed={roleId === role.value.id}
              aria-current={roleId === role.value.id ? 'true' : undefined}
              onClick={() => {
                setRoleId(role.value.id)
                setSession(null)
                setPreview(null)
                setPreviewStaleReason('not-previewed')
              }}
            >
              <span className="spine-index">{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{role.value.title}</strong>
                <small>{role.value.description}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="assistant-session-head">
          <strong>{zh ? '历史会话' : 'History'}</strong>
          <span>{roleSessions.length}</span>
        </div>
        <div className="assistant-session-list">
          {roleSessions.map((item) => (
            <button
              key={item.session.id}
              className={session?.session.id === item.session.id ? 'active' : ''}
              onClick={() => void openSession(item.session.id)}
            >
              <MessageCircle size={14} />
              <span>
                <strong>{displayAssistantSessionTitle(item.session, language)}</strong>
                <small>{new Date(item.session.updated_at).toLocaleString()}</small>
              </span>
            </button>
          ))}
          {!roleSessions.length && (
            <p className="assistant-empty-copy">
              {zh ? '尚无会话。选择目标后开始。' : 'No sessions yet. Choose a target to begin.'}
            </p>
          )}
        </div>
      </aside>

      <SplitHandle
        orientation="vertical"
        label={zh ? '调整助手栏宽度' : 'Resize assistant rail'}
        onResize={(delta) =>
          setLeftWidth((current) =>
            clampPaneSize(current + delta, 220, Math.min(360, (shellRef.current?.clientWidth ?? 1200) - 760))
          )
        }
      />

      <main className="assistant-conversation">
        <header className="assistant-conversation-head">
          <div>
            <span className="badge ok">{activeRole?.value.title}</span>
            <h2>
              {session
                ? displayAssistantSessionTitle(session.session, language)
                : zh
                  ? '开始一段有边界的创作探索'
                  : 'Start a bounded exploration'}
            </h2>
            <p>
              {session
                ? zh
                  ? '助手、资料包和预设已冻结；每一轮会重新读取当前项目资料。'
                  : 'Role, bundle, and preset are frozen; each turn re-reads current project files.'
                : activeRole?.value.description}
            </p>
          </div>
          {session && (
            <button onClick={() => void fork()} disabled={busy}>
              <GitFork size={15} /> {zh ? '从此分支' : 'Fork'}
            </button>
          )}
        </header>

        {!session ? (
          <div className="assistant-start-card">
            <BookKey size={28} />
            <h3>{zh ? '选择本次工作的目标' : 'Choose this session’s target'}</h3>
            <p>
              {zh
                ? '目标只决定资料选择范围，不授予助手写入项目事实的权限。'
                : 'The target scopes context; it does not grant write authority.'}
            </p>
            <label>
              <span>{zh ? '目标资料' : 'Target material'}</span>
              <PlanningCardSelector
                docs={targetSelectorDocs}
                value={parseTargetKey(targetKey, projectId).document_id}
                onChange={(id) => {
                  const target = targetSelectorDocs.find((document) => document.data.id === id)
                  if (target) {
                    setTargetKey(`${target.data.type}:${target.data.id}`)
                    if (roleId === 'continuity-review' && target.data.type !== 'project') {
                      setContinuityRangeIds([target.data.id])
                    }
                  }
                }}
                language={language}
                clearable={false}
                ariaLabel={zh ? '选择助手工作目标' : 'Choose assistant target'}
              />
            </label>
            {roleId === 'character-rehearsal' && (
              <div className="assistant-workflow-steps character-rehearsal-steps">
                <strong>{zh ? '任务流程' : 'Task workflow'}</strong>
                <p>1. {zh ? '人物已由上方选择' : 'Character selected above'}</p>
                <label>
                  <span>2. {zh ? '选择时间事件' : 'Choose timeline event'}</span>
                  <PlanningCardSelector
                    docs={rehearsalEvents}
                    value={rehearsalEventId}
                    onChange={(id) => {
                      setRehearsalEventId(id)
                      setRehearsalTimelineId('')
                    }}
                    language={language}
                    ariaLabel={zh ? '选择试戏时间事件' : 'Choose rehearsal timeline event'}
                  />
                </label>
                {rehearsalTimelineOptions.length > 1 && (
                  <label>
                    <span>{zh ? '2b. 选择事件所在时间线' : '2b. Choose event timeline'}</span>
                    <select
                      value={rehearsalTimelineId}
                      onChange={(event) => setRehearsalTimelineId(event.target.value)}
                    >
                      <option value="">{zh ? '请选择时间线' : 'Choose a timeline'}</option>
                      {rehearsalTimelineOptions.map((timelineId) => (
                        <option key={timelineId} value={timelineId}>
                          {timelineId}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>3. {zh ? '选择地点 / 场景' : 'Choose location / scene'}</span>
                  <PlanningCardSelector
                    docs={rehearsalLocations}
                    value={rehearsalLocationId}
                    onChange={setRehearsalLocationId}
                    language={language}
                    ariaLabel={zh ? '选择试戏地点' : 'Choose rehearsal location'}
                  />
                </label>
                <div className="assistant-workflow-preview">
                  <strong>4. {zh ? '状态与正设预览' : 'State and Canon preview'}</strong>
                  <p>
                    {assistantWorkflowPreview(
                      docs,
                      parseTargetKey(targetKey, projectId).document_id,
                      rehearsalEventId,
                      rehearsalTimelineId,
                      rehearsalLocationId,
                      language
                    )}
                  </p>
                </div>
                <small>
                  5–7.{' '}
                  {zh
                    ? '生成非正文试戏 → 分析缺失/矛盾/不可信行为 → 输出探索记录和人物设定提案。'
                    : 'Generate non-prose rehearsal → diagnose gaps/conflicts/implausible behavior → return exploration and character-setting proposals.'}
                </small>
              </div>
            )}
            {roleId === 'continuity-review' && (
              <div className="assistant-workflow-steps continuity-range-picker">
                <strong>{zh ? '选择同章连续正文范围' : 'Choose a contiguous same-chapter range'}</strong>
                {continuityCandidates.map((candidate) => {
                  const doc = docs.find((document) => document.data.id === candidate.id)
                  if (!doc) return null
                  return (
                    <label key={candidate.id}>
                      <input
                        type="checkbox"
                        checked={continuityRangeIds.includes(candidate.id)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? [...continuityRangeIds, candidate.id]
                            : continuityRangeIds.filter((id) => id !== candidate.id)
                          setContinuityRangeIds(
                            continuityCandidates
                              .filter((item) => next.includes(item.id))
                              .map((item) => item.id)
                          )
                        }}
                      />
                      <span>
                        {doc.data.title} · {candidate.id}
                      </span>
                    </label>
                  )
                })}
                {!continuityValidation.valid && (
                  <small className="proposal-validation-error">
                    {continuityRangeError(continuityValidation.error, language)}
                  </small>
                )}
                <small>
                  {zh
                    ? '装配前后已接受正文、时间线、人物状态、地点和相关正设；只输出带证据的问题提案。'
                    : 'Assembles accepted prose before/after, timeline, character state, location, and relevant Canon; outputs evidence-backed issue proposals only.'}
                </small>
              </div>
            )}
            {activePromptBindingIssue && (
              <div className="proposal-validation-error" role="alert">
                <strong>{zh ? '助手提示词绑定已悬空' : 'Assistant prompt binding is missing'}</strong>
                <p>
                  {zh
                    ? `缺少版本 ${activePromptBindingIssue.missing_prompt_id}。恢复或改绑后才能开始新会话。`
                    : `Version ${activePromptBindingIssue.missing_prompt_id} is missing. Recover or rebind it before starting a session.`}
                </p>
                <div className="assistant-inline-actions">
                  {activePromptBindingIssue.recovery_snapshots.map((snapshot) => (
                    <button
                      key={`${snapshot.session_id}:${snapshot.prompt_sha256}`}
                      type="button"
                      onClick={() =>
                        void recoverPromptBinding({
                          kind: 'session_snapshot',
                          session_id: snapshot.session_id,
                          prompt_sha256: snapshot.prompt_sha256
                        })
                      }
                      disabled={busy}
                    >
                      {zh
                        ? `从会话恢复 ${snapshot.prompt.name}`
                        : `Recover ${snapshot.prompt.name} from session`}
                    </button>
                  ))}
                  {activePromptBindingIssue.available_prompt_ids.map((promptId) => (
                    <button
                      key={promptId}
                      type="button"
                      onClick={() => void recoverPromptBinding({ kind: 'existing', prompt_id: promptId })}
                      disabled={busy}
                    >
                      {zh ? `改绑 ${promptId}` : `Rebind ${promptId}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              className="primary"
              onClick={() => void start()}
              disabled={
                busy ||
                !roleId ||
                Boolean(activePromptBindingIssue) ||
                (roleId === 'character-rehearsal' && (!rehearsalEventId || !rehearsalLocationId)) ||
                (roleId === 'character-rehearsal' &&
                  Boolean(rehearsalEventId) &&
                  rehearsalTimelineOptions.length === 0) ||
                (roleId === 'character-rehearsal' &&
                  rehearsalTimelineOptions.length > 1 &&
                  !rehearsalTimelineId) ||
                (roleId === 'continuity-review' && !continuityValidation.valid)
              }
            >
              <Plus size={16} /> {zh ? '开始新会话' : 'Start session'}
            </button>
          </div>
        ) : (
          <>
            <div className="assistant-transcript">
              {!session.turns.length && (
                <div className="assistant-empty-copy">
                  <FileStack size={22} />
                  <p>
                    {zh
                      ? '输入问题后先预览资料和权限，再决定是否发送。'
                      : 'Preview context and permissions before sending.'}
                  </p>
                </div>
              )}
              {session.turns.map((turn) => (
                <article key={turn.id} className="assistant-turn">
                  <div className="assistant-message author">
                    <span>{zh ? '作者' : 'Author'}</span>
                    <p>{turn.author_input}</p>
                  </div>
                  <div className="assistant-message assistant">
                    <span>{activeRole?.value.title}</span>
                    <p>{turn.assistant_reply}</p>
                    {turn.candidate && (
                      <section className="assistant-candidate">
                        <strong>{turn.candidate.title}</strong>
                        <p>{turn.candidate.content}</p>
                        <small>
                          {zh
                            ? '探索候选；不会自动写入正文或正设。'
                            : 'Exploration candidate; it is not written to prose or Canon.'}
                        </small>
                      </section>
                    )}
                    <details>
                      <summary>{zh ? '阶段结论与未决问题' : 'Exploration note'}</summary>
                      <p>{turn.exploration_summary}</p>
                      {turn.open_questions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </details>
                    {turn.proposals.map((proposal) => (
                      <div key={proposal.id} className={`assistant-proposal ${proposal.status}`}>
                        <div>
                          <strong>{proposal.title}</strong>
                          <small>
                            {documentTypeLabel(proposal.document_type, language)} ·{' '}
                            {proposalStatusLabel(proposal.status, language)}
                          </small>
                          <p>{proposal.rationale}</p>
                        </div>
                        {proposal.status === 'pending' && (
                          <div>
                            <button
                              className="primary"
                              onClick={() => void actOnProposal(turn.id, proposal.id, 'apply')}
                              disabled={busy}
                            >
                              <Check size={14} /> {zh ? '确认写入' : 'Apply'}
                            </button>
                            <button
                              onClick={() => void actOnProposal(turn.id, proposal.id, 'reject')}
                              disabled={busy}
                            >
                              <X size={14} /> {zh ? '拒绝' : 'Reject'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {turn.configuration_proposals.map((proposal) => (
                      <div
                        key={proposal.id}
                        className={`assistant-proposal configuration ${proposal.status}`}
                      >
                        <div>
                          <strong>
                            {zh ? '助手配置提案' : 'Assistant configuration proposal'} ·{' '}
                            {proposal.plan.target_id}
                          </strong>
                          <small>
                            {configurationTargetLabel(proposal.plan.target_kind, language)} ·{' '}
                            {proposalStatusLabel(proposal.status, language)}
                          </small>
                          <p>{proposal.rationale}</p>
                          <div className="assistant-config-diff">
                            {proposal.plan.diff.map((change) => (
                              <article key={change.path} data-risk={change.risk}>
                                <span>
                                  {change.risk === 'approval-required'
                                    ? zh
                                      ? '重点确认'
                                      : 'HIGH IMPACT'
                                    : zh
                                      ? '一般变更'
                                      : 'CHANGE'}
                                </span>
                                <code>{change.path}</code>
                                <small>{change.reason}</small>
                                <pre>
                                  {JSON.stringify(change.before, null, 2)} →{' '}
                                  {JSON.stringify(change.after, null, 2)}
                                </pre>
                              </article>
                            ))}
                          </div>
                        </div>
                        {proposal.status === 'pending' && (
                          <div>
                            <button
                              className="primary"
                              onClick={() => void actOnConfigurationProposal(turn.id, proposal.id, 'apply')}
                              disabled={busy}
                            >
                              <Check size={14} /> {zh ? '批准变更' : 'Approve'}
                            </button>
                            <button
                              onClick={() => void actOnConfigurationProposal(turn.id, proposal.id, 'reject')}
                              disabled={busy}
                            >
                              <X size={14} /> {zh ? '拒绝' : 'Reject'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <div className="assistant-compose">
              {error && <div className="error-box">{error}</div>}
              <label>
                <span>{zh ? '本轮作者输入' : 'Author input'}</span>
                <textarea
                  value={authorInput}
                  onChange={(event) => {
                    setAuthorInput(event.target.value)
                    setPreview(null)
                    setSentPrompt('')
                    setPreviewStaleReason('author-input-changed')
                  }}
                  placeholder={
                    zh
                      ? '提出试戏、整理或连续性问题；助手不会把探索当成正史。'
                      : 'Ask for rehearsal, organization, or continuity review.'
                  }
                />
              </label>
              {preview && (
                <label className="assistant-sent-prompt">
                  <span>
                    {zh ? '实际发送稿（可调整）' : 'Exact message to send (editable)'}
                    <small>
                      {preview.prompt_envelope.manually_edited
                        ? zh
                          ? '已记录与编译稿的差异哈希'
                          : 'Difference hash will be recorded'
                        : zh
                          ? '当前与编译稿一致'
                          : 'Matches compiled prompt'}
                    </small>
                  </span>
                  <textarea
                    value={sentPrompt}
                    onChange={(event) => {
                      setSentPrompt(event.target.value)
                      setPreviewStaleReason('sent-prompt-changed')
                    }}
                  />
                </label>
              )}
              <p className="assistant-preview-status" data-state={previewStaleReason || 'ready'}>
                {previewing
                  ? zh
                    ? '正在准备资料与权限预览；此阶段不会调用 AI。'
                    : 'Preparing the context and permission preview; no AI provider call is made.'
                  : previewStaleReason === 'author-input-changed'
                    ? zh
                      ? '作者输入已修改，请重新预览后再发送。'
                      : 'Author input changed. Preview it again before sending.'
                    : previewStaleReason === 'sent-prompt-changed'
                      ? zh
                        ? '实际发送稿已修改，请重新预览以确认当前内容。'
                        : 'The exact sent prompt changed. Preview again to confirm the current content.'
                      : !preview
                        ? zh
                          ? '尚未预览：先准备并预览资料与权限。'
                          : 'Not previewed yet: prepare and preview context and permissions first.'
                        : zh
                          ? '预览有效；确认后才会调用 AI。'
                          : 'Preview is current; the provider is called only after confirmation.'}
              </p>
              <div className="assistant-compose-actions">
                <button
                  type="button"
                  onClick={() => void previewTurn()}
                  disabled={busy || !authorInput.trim()}
                >
                  <Eye size={15} />{' '}
                  {busy && previewing
                    ? zh
                      ? '预览中…'
                      : 'Previewing…'
                    : zh
                      ? '1. 准备并预览'
                      : '1. Prepare & preview'}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void sendTurn()}
                  disabled={busy || !preview || Boolean(previewStaleReason) || !sentPrompt.trim()}
                >
                  <Send size={15} />{' '}
                  {busy && !previewing
                    ? zh
                      ? '发送中…'
                      : 'Sending…'
                    : zh
                      ? '2. 确认并发送'
                      : '2. Confirm & send'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      <SplitHandle
        orientation="vertical"
        label={zh ? '调整资料审计栏宽度' : 'Resize context audit pane'}
        onResize={(delta) =>
          setRightWidth((current) =>
            clampPaneSize(current - delta, 290, Math.min(480, (shellRef.current?.clientWidth ?? 1200) - 700))
          )
        }
      />

      <aside className="assistant-audit">
        <header>
          <ShieldCheck size={20} />
          <div>
            <span className="assistant-kicker">{zh ? '运行前审计' : 'PRE-RUN AUDIT'}</span>
            <h3>{zh ? '资料、权限与去向' : 'Context, authority & destination'}</h3>
          </div>
        </header>
        <AuditSection title={zh ? '助手配置' : 'Assistant configuration'}>
          <div className="assistant-config-binding">
            <Settings2 size={16} />
            <label>
              <span>{zh ? '绑定资料包' : 'Bound ContextBundle'}</span>
              <select
                value={activeRole?.value.context_bundle_id ?? ''}
                onChange={(event) => void bindContextBundle(event.target.value)}
                disabled={busy || !activeRole}
              >
                {state.bundles.map((bundle) => (
                  <option key={bundle.value.id} value={bundle.value.id}>
                    {bundle.value.title} · v{bundle.value.version}
                  </option>
                ))}
              </select>
            </label>
            <small>
              {zh
                ? '资料包只决定助手知道什么；已有会话继续使用冻结版本。'
                : 'ContextBundle controls only what the assistant knows; existing sessions keep frozen versions.'}
            </small>
            <label>
              <span>{zh ? '助手提示词' : 'Assistant prompt'}</span>
              <select
                value={selectedPrompt?.value.id ?? ''}
                onChange={(event) => void bindAssistantPrompt(event.target.value)}
                disabled={busy || !activeRole}
              >
                {rolePrompts.map((prompt) => (
                  <option key={prompt.value.id} value={prompt.value.id}>
                    {prompt.value.name} · v{prompt.value.version}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={openPromptEditor} disabled={busy || !selectedPrompt}>
              {zh ? '查看 / 编辑助手提示词' : 'View / edit assistant prompt'}
            </button>
            <small>
              {zh
                ? '助手提示词决定如何工作；WritingPreset 决定模型与通用提示结构。每个助手仅显示最近五版。'
                : 'Assistant prompt controls how it works; WritingPreset controls model and generic prompt structure. Only the latest five versions for this assistant are shown.'}
            </small>
          </div>
        </AuditSection>
        <AuditSection title={zh ? '知道什么' : 'What it knows'}>
          {detailPreview ? (
            <div className="assistant-source-folios">
              {detailPreview.temporal_context?.status === 'resolved' && (
                <article data-outcome="included">
                  <span>{zh ? '试戏时间点' : 'REHEARSAL TIME POINT'}</span>
                  <strong>
                    {titleForDocument(docs, detailPreview.temporal_context.timeline_node_id ?? '')} ·{' '}
                    {detailPreview.temporal_context.timeline_id}
                  </strong>
                  <small>
                    {zh ? '人物状态来源' : 'Character state source'} ·{' '}
                    {characterStateSourceLabel(detailPreview.temporal_context.state_source, language)}
                  </small>
                  <p>
                    {zh ? '有效关系' : 'Active relationships'}:{' '}
                    {detailPreview.temporal_context.active_relation_ids.length
                      ? detailPreview.temporal_context.active_relation_ids
                          .map((id) => titleForDocument(docs, id))
                          .join(' · ')
                      : zh
                        ? '无'
                        : 'None'}
                  </p>
                </article>
              )}
              {detailPreview.knows.map((source) => (
                <article key={`${source.source_type}:${source.source_id}`} data-outcome={source.outcome}>
                  <span>{source.required ? (zh ? '必需' : 'REQUIRED') : zh ? '优选' : 'PREFERRED'}</span>
                  <strong>{auditSourceTitle(source, language)}</strong>
                  <small>
                    {auditSourceTypeLabel(source, language)} · {authorityLabel(source.authority, language)} ·{' '}
                    {source.token_count} {zh ? '令牌' : 'tokens'}
                  </small>
                  <p>{source.purpose || selectionReasonLabel(source.reason, language)}</p>
                </article>
              ))}
              {detailPreview.resolved_context.warnings.map((warning, index) => (
                <article
                  key={`${warning.code}:${warning.source?.document_type ?? warning.selector ?? index}:${warning.source?.document_id ?? ''}`}
                  data-outcome="missing"
                >
                  <span>{warningStatusLabel(warning.code, language)}</span>
                  <strong>
                    {warning.source
                      ? `${documentTypeDisplayLabel(warning.source.document_type, language)} · ${warning.source.document_id}`
                      : selectorLabel(warning.selector ?? '', language)}
                  </strong>
                  <small>{zh ? '优选资料 · 0 令牌' : 'Preferred source · 0 tokens'}</small>
                  <p>
                    {contextWarningLabel(warning.code, language)}
                    {warning.code === 'CHARACTER_TIME_CONTEXT_WARNING' ? ` ${warning.message}` : ''}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <>
              {(activeBundle?.value.sources ?? []).map((source) => (
                <p key={`${source.document_type}:${source.document_id}`}>
                  <b>{source.mode === 'required' ? (zh ? '必需' : 'Required') : zh ? '优选' : 'Preferred'}</b>{' '}
                  {documentTypeDisplayLabel(source.document_type, language)}:{source.document_id} ·{' '}
                  {usageLabel(source.usage, language)}
                </p>
              ))}
              {(activeBundle?.value.dynamic_selectors ?? []).map((selector) => (
                <p key={selector.kind}>
                  <b>
                    {selector.mode === 'required' ? (zh ? '必需' : 'Required') : zh ? '优选' : 'Preferred'}
                  </b>{' '}
                  {selectorLabel(selector.kind, language)} · {usageLabel(selector.usage, language)}
                </p>
              ))}
            </>
          )}
        </AuditSection>
        <AuditSection title={zh ? '为什么入选' : 'Why selected'}>
          <p>
            {zh
              ? '固定 ID、当前目标、纲目祖先、显式关系、当前时间线和相关已接受正文按确定性规则选择。'
              : 'Stable IDs and bounded deterministic selectors choose the current target, ancestry, relations, timeline, and accepted prose.'}
          </p>
          {detailPreview?.resolved_context.warnings.map((warning) => (
            <p key={warning.message} className="warning-text">
              {contextWarningLabel(warning.code, language)}
            </p>
          ))}
        </AuditSection>
        <AuditSection title={zh ? '能做什么' : 'What it can do'}>
          {(detailPreview?.can_do ?? activeRole?.value.enabled_operations ?? []).map((operation) => (
            <span key={operation} className="permission-chip">
              {operationLabel(operation, language)}
            </span>
          ))}
          <p className="boundary-note">
            {zh
              ? '不能直接修改正设、已接受正文、定稿连续性或已发布正文。'
              : 'Cannot directly modify Canon, accepted prose, finalized continuity, or published prose.'}
          </p>
        </AuditSection>
        <AuditSection title={zh ? '结果去哪里' : 'Where results go'}>
          <p>
            {outputLabel(
              detailPreview?.result_destination ?? activeRole?.value.output_disposition ?? 'exploration',
              language
            )}
          </p>
          <small>
            {zh
              ? '完整对话保存在 Run；阶段结论追加到探索文档。提案必须由作者确认。'
              : 'Full chat stays in the Run; conclusions append to an exploration document. Proposals require author approval.'}
          </small>
        </AuditSection>
      </aside>
      {promptEditorOpen && selectedPrompt && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => event.target === event.currentTarget && setPromptEditorOpen(false)}
        >
          <section className="modal assistant-prompt-editor" role="dialog" aria-modal="true">
            <header>
              <div>
                <span className="assistant-kicker">{activeRole?.value.title}</span>
                <h2>{zh ? '助手提示词版本' : 'Assistant prompt version'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setPromptEditorOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <p>
              {zh
                ? '这段文字只控制工作方法；资料来源、写入权限和输出类型仍由产品代码固定。'
                : 'This text controls working method only; sources, write authority, and output types remain code-owned.'}
            </p>
            <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} />
            <div className="assistant-prompt-version-fields">
              <label>
                <span>{zh ? '新版本' : 'New version'}</span>
                <input value={promptVersion} onChange={(event) => setPromptVersion(event.target.value)} />
              </label>
              <label>
                <span>{zh ? '另存名称（可选）' : 'Save-as name (optional)'}</span>
                <input value={promptName} onChange={(event) => setPromptName(event.target.value)} />
              </label>
            </div>
            <footer className="modal-actions">
              <button type="button" className="secondary" onClick={() => setPromptEditorOpen(false)}>
                {zh ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void savePrompt()}
                disabled={busy || !promptText.trim() || !/^\d+\.\d+\.\d+/u.test(promptVersion)}
              >
                {zh ? '保存新版本并选用' : 'Save version and select'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  )
}

function AuditSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="assistant-audit-section">
      <h4>{title}</h4>
      <div>{children}</div>
    </section>
  )
}

function chooseRoleId(
  preferred: string | undefined,
  target: TargetSelection | null,
  state: AssistantState
): string {
  const inferred =
    preferred ??
    (target?.type === 'character'
      ? 'character-rehearsal'
      : ['outline', 'scene', 'chapter_prose'].includes(target?.type ?? '')
        ? 'continuity-review'
        : 'setting-organizer')
  return state.roles.some((role) => role.value.id === inferred) ? inferred : (state.roles[0]?.value.id ?? '')
}

function continuityRangeError(
  error: ReturnType<typeof validateContinuityReviewRange>['error'],
  language: LanguageName
): string {
  const messages = {
    EMPTY_RANGE: { zh: '至少选择一个节或正文片段。', en: 'Select at least one section or prose segment.' },
    UNKNOWN_DOCUMENT: { zh: '范围包含不存在的文档。', en: 'The range contains an unknown document.' },
    CROSS_CHAPTER_RANGE: { zh: '多段内容必须来自同一章。', en: 'Every segment must belong to one chapter.' },
    OUT_OF_STORY_ORDER: {
      zh: '所选内容必须保持故事顺序。',
      en: 'Selected segments must stay in story order.'
    },
    NON_CONTIGUOUS_RANGE: { zh: '多段内容必须构成连续范围。', en: 'Selected segments must be contiguous.' }
  }
  return error ? messages[error][language] : ''
}

function rehearsalWorkflowMessage(
  characterId: string,
  eventId: string,
  locationId: string,
  language: LanguageName
): string {
  return language === 'zh'
    ? `按人物试戏任务流程工作。人物：${characterId}；时间事件：${eventId}；地点：${locationId}。先复述状态、时段关系与相关正设，再生成非正文试戏，随后分析缺失、矛盾或行为不可信处，最后输出探索记录与人物设定修改提案。`
    : `Follow the character-rehearsal workflow. Character: ${characterId}; timeline event: ${eventId}; location: ${locationId}. Preview state, time relationships, and relevant Canon; generate a non-prose rehearsal; diagnose gaps, contradictions, or implausible behavior; then return exploration and character-setting proposals.`
}

function continuityWorkflowMessage(ids: string[], language: LanguageName): string {
  return language === 'zh'
    ? `按故事顺序审阅这个已验证的同章连续范围：${ids.join(' → ')}。检查衔接、视角、时间、位置、人物状态、语气及信息重复或断裂，只输出带证据的问题提案。`
    : `Review this validated contiguous same-chapter range in story order: ${ids.join(' → ')}. Check transitions, viewpoint, time, place, character state, tone, repetition, and information gaps; return evidence-backed issue proposals only.`
}

function assistantWorkflowPreview(
  docs: DocEntry[],
  characterId: string,
  eventId: string,
  timelineId: string,
  locationId: string,
  language: LanguageName
): string {
  const title = (id: string) => titleForDocument(docs, id)
  if (!characterId || !eventId) {
    return language === 'zh'
      ? `人物：${title(characterId)}；请选择时间事件和地点。`
      : `Character: ${title(characterId)}; choose a timeline event and location.`
  }
  try {
    const context = selectCharacterTimePointContext(docs, {
      character_id: characterId,
      timeline_event_id: eventId,
      ...(timelineId ? { timeline_id: timelineId } : {})
    })
    if (context.status === 'ambiguous') {
      return language === 'zh'
        ? `人物：${title(characterId)}；事件：${title(eventId)}。该事件同时位于 ${context.timeline_options.join(' / ')}，请显式选择时间线。`
        : `Character: ${title(characterId)}; event: ${title(eventId)}. This event is placed on ${context.timeline_options.join(' / ')}; choose a timeline explicitly.`
    }
    const relations =
      context.active_relation_ids.map(title).join(' · ') || (language === 'zh' ? '无' : 'none')
    const untimed = context.untimed_relation_ids.map(title).join(' · ')
    const base =
      language === 'zh'
        ? `人物：${title(characterId)}；事件：${title(eventId)}；时间线：${context.timeline_id}；时间节点：${title(context.timeline_node_id ?? '')}；人物状态：${title(context.selected_state_id ?? '')}（${characterStateSourceLabel(context.state_source, language)}）；有效关系：${relations}；地点：${title(locationId)}。`
        : `Character: ${title(characterId)}; event: ${title(eventId)}; timeline: ${context.timeline_id}; node: ${title(context.timeline_node_id ?? '')}; character state: ${title(context.selected_state_id ?? '')} (${characterStateSourceLabel(context.state_source, language)}); active relationships: ${relations}; location: ${title(locationId)}.`
    if (!untimed) return base
    return language === 'zh'
      ? `${base} 待确认的无时间关系：${untimed}。`
      : `${base} Untimed relationships requiring confirmation: ${untimed}.`
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.split(':', 1)[0] : 'CHARACTER_TIME_CONTEXT_INVALID'
    return language === 'zh'
      ? `无法解析试戏时间点（${code}），请检查事件的时间线定位。`
      : `The rehearsal time point cannot be resolved (${code}); check the event timeline placement.`
  }
}

function titleForDocument(docs: DocEntry[], id: string): string {
  return docs.find((document) => document.data.id === id)?.data.title ?? (id || '—')
}

function characterStateSourceLabel(
  value: ReturnType<typeof selectCharacterTimePointContext>['state_source'],
  language: LanguageName
): string {
  const labels = {
    'event-exact': { zh: '事件精确状态', en: 'exact event state' },
    'node-exact': { zh: '同节点状态', en: 'same-node state' },
    'nearest-prior': { zh: '最近历史状态', en: 'nearest prior state' },
    none: { zh: '未找到历史状态', en: 'no historical state found' }
  } as const
  return labels[value][language]
}

function targetFromSelection(
  target: TargetSelection | null,
  projectId: string
): { document_type: string; document_id: string } {
  if (!target) return { document_type: 'project', document_id: projectId }
  return { document_type: target.type, document_id: target.id }
}

function displayAssistantSessionTitle(
  session: LoadedAgentSession['session'],
  language: LanguageName
): string {
  const roleTitle = session.configuration.creator_role.title
  const title = session.title.trim()
  if (title === `${roleTitle} · ${session.target.document_id}` || /·\s*project-[a-z0-9-]+$/iu.test(title)) {
    return `${roleTitle} · ${formatSessionDate(session.created_at)}`
  }
  if (language === 'zh' && /·\s*branch$/iu.test(title)) return title.replace(/·\s*branch$/iu, '· 分支')
  return title
}

function formatSessionDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function assistantTargetDocuments(docs: DocEntry[]): DocEntry[] {
  const seen = new Set<string>()
  return docs.filter((doc) => {
    const type = typeof doc.data.type === 'string' ? doc.data.type.trim() : ''
    const id = typeof doc.data.id === 'string' ? doc.data.id.trim() : ''
    const title = typeof doc.data.title === 'string' ? doc.data.title.trim() : ''
    const value = type && id ? `${type}:${id}` : ''
    if (!type || !id || !title || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

export function assistantTargetDocumentsForRole(docs: DocEntry[], roleId: string): DocEntry[] {
  const targets = assistantTargetDocuments(docs)
  if (roleId === 'character-rehearsal') {
    return targets.filter((doc) => doc.data.type === 'character')
  }
  if (roleId === 'continuity-review') {
    return targets.filter((doc) => ['outline', 'scene', 'chapter_prose'].includes(doc.data.type))
  }
  if (roleId === 'setting-organizer') {
    return targets.filter(
      (doc) => !['issue', 'chapter_prose', 'run', 'prompt', 'writing_preset'].includes(String(doc.data.type))
    )
  }
  return targets.filter((doc) => doc.data.type !== 'issue')
}

export function documentTypeDisplayLabel(type: string, language: LanguageName): string {
  const label = documentTypeLabel(type, language)
  if (/其它|其他|other|unknown/iu.test(label)) return type
  return label
}

export function auditSourceTypeLabel(
  source: { source_type: string; source_id: string; display_title?: string },
  language: LanguageName
): string {
  const labels: Record<string, { zh: string; en: string }> = {
    system: { zh: '系统权限边界', en: 'System authority boundary' },
    project: { zh: '当前项目身份', en: 'Current project identity' },
    resource: { zh: '当前工作目标', en: 'Current work target' }
  }
  return labels[source.source_type]?.[language] ?? documentTypeDisplayLabel(source.source_type, language)
}

function auditSourceTitle(
  source: { source_type: string; source_id: string; display_title?: string },
  language: LanguageName
): string {
  if (source.source_type === 'system') return language === 'zh' ? '系统权限边界' : 'System authority boundary'
  if (source.source_type === 'project') return language === 'zh' ? '当前项目身份' : 'Current project identity'
  if (source.source_type === 'resource') return language === 'zh' ? '当前工作目标' : 'Current work target'
  return source.display_title?.trim() || source.source_id
}

function parseTargetKey(value: string, projectId: string): { document_type: string; document_id: string } {
  const separator = value.indexOf(':')
  if (separator < 1) return { document_type: 'project', document_id: projectId }
  return { document_type: value.slice(0, separator), document_id: value.slice(separator + 1) }
}

function selectorLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    current_target: { zh: '当前目标', en: 'Current target' },
    outline_ancestors: { zh: '纲目祖先', en: 'Outline ancestors' },
    explicit_relations: { zh: '显式关系', en: 'Explicit relations' },
    active_timeline_context: { zh: '当前时间线范围', en: 'Active timeline range' },
    accepted_prose_context: { zh: '相关已接受正文', en: 'Related accepted prose' }
  }
  return labels[value]?.[language] ?? value
}

function operationLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    converse: { zh: '对话探索', en: 'Converse' },
    append_exploration: { zh: '追加探索结论', en: 'Append exploration' },
    generate_candidate: { zh: '生成非权威候选', en: 'Generate candidate' },
    propose_planning_record: { zh: '提出规划卡提案', en: 'Propose planning card' },
    propose_issue: { zh: '提出问题卡提案', en: 'Propose issue' },
    propose_configuration_change: { zh: '提出助手配置变更', en: 'Propose configuration change' }
  }
  return labels[value]?.[language] ?? value
}

function outputLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    exploration: { zh: '只进入探索文档', en: 'Exploration document only' },
    candidate: { zh: '进入探索候选', en: 'Exploration candidate' },
    planning_proposal: { zh: '探索文档＋待确认规划提案', en: 'Exploration + pending planning proposal' },
    issue_proposal: { zh: '探索文档＋待确认问题提案', en: 'Exploration + pending issue proposal' }
  }
  return labels[value]?.[language] ?? value
}

function usageLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    subject: { zh: '工作对象', en: 'Subject' },
    constraint: { zh: '约束', en: 'Constraint' },
    evidence: { zh: '证据', en: 'Evidence' },
    style: { zh: '文风参考', en: 'Style reference' }
  }
  return labels[value]?.[language] ?? value
}

function authorityLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    system: { zh: '产品边界', en: 'System boundary' },
    accepted_prose: { zh: '已接受正文', en: 'Accepted prose' },
    hard_canon: { zh: '硬性正设', en: 'Hard Canon' },
    project: { zh: '项目资料', en: 'Project material' },
    advisory: { zh: '建议性资料', en: 'Advisory' }
  }
  return labels[value]?.[language] ?? value
}

function proposalStatusLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    pending: { zh: '待作者决定', en: 'Pending author decision' },
    applied: { zh: '已应用', en: 'Applied' },
    rejected: { zh: '已拒绝', en: 'Rejected' }
  }
  return labels[value]?.[language] ?? value
}

function configurationTargetLabel(value: string, language: LanguageName): string {
  if (value === 'creator_role') return language === 'zh' ? '创作助手' : 'Creator role'
  if (value === 'context_bundle') return language === 'zh' ? '资料包' : 'ContextBundle'
  return value
}

function contextWarningLabel(value: string, language: LanguageName): string {
  const labels: Record<string, { zh: string; en: string }> = {
    CONTEXT_PREFERRED_SOURCE_MISSING: {
      zh: '一项优选资料缺失或不可读；本轮可以继续，缺失情况会进入审计。',
      en: 'A preferred source is missing or unreadable; the run may continue and the omission is audited.'
    },
    CONTEXT_PREFERRED_SOURCE_DUPLICATE: {
      zh: '一项优选资料 ID 存在重复，已从本轮资料中排除。',
      en: 'A preferred source ID is duplicated and was omitted from this turn.'
    },
    CONTEXT_SELECTOR_EMPTY: {
      zh: '一项优选动态范围没有找到资料；本轮可以继续。',
      en: 'A preferred dynamic selector found no sources; the run may continue.'
    },
    CONTEXT_SOURCE_EXCLUDED: {
      zh: '一项资料被资料包的显式排除规则移除。',
      en: 'A source was removed by an explicit ContextBundle exclusion.'
    },
    CHARACTER_TIME_CONTEXT_WARNING: {
      zh: '试戏时间点存在需要作者确认的状态或关系歧义；具体原因已保存在本轮审计中。',
      en: 'The rehearsal time point has a state or relationship ambiguity that requires author confirmation; the exact reason is retained in this turn audit.'
    }
  }
  return labels[value]?.[language] ?? value
}

function warningStatusLabel(value: string, language: LanguageName): string {
  if (value === 'CHARACTER_TIME_CONTEXT_WARNING') {
    return language === 'zh' ? '待确认' : 'CONFIRM'
  }
  if (value === 'CONTEXT_SOURCE_EXCLUDED') return language === 'zh' ? '已排除' : 'EXCLUDED'
  if (value === 'CONTEXT_PREFERRED_SOURCE_DUPLICATE') {
    return language === 'zh' ? '重复，未采用' : 'DUPLICATE'
  }
  if (value === 'CONTEXT_SELECTOR_EMPTY') return language === 'zh' ? '范围为空' : 'NO MATCH'
  return language === 'zh' ? '缺失，未采用' : 'MISSING'
}

function selectionReasonLabel(value: string, language: LanguageName): string {
  if (language === 'en') return value
  if (value.includes('fixed')) return '由资料包中的固定资料 ID 入选。'
  if (value.includes('current_target')) return '由“当前目标”动态范围入选。'
  if (value.includes('outline_ancestors')) return '由“纲目祖先”动态范围入选。'
  if (value.includes('explicit_relations')) return '由显式卡片关系入选。'
  if (value.includes('active_timeline_context')) return '由当前时间线范围入选。'
  if (value.includes('accepted_prose_context')) return '由相关已接受正文范围入选。'
  if (value.includes('boundary')) return '产品要求的权限边界。'
  if (value.includes('project identity')) return '本轮必需的项目身份。'
  return '按资料包与当前目标的确定性规则入选。'
}

function nextPatchVersion(value: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value)
  if (!match) return '1.0.1'
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}
