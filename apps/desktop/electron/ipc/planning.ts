import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { generateText, isAIConfigured, type AIConfig } from '@quillarium/ai'
import {
  DOCUMENT_ORIGIN_FIELD,
  applyIssueBatchAction,
  assertCardReferencesExist,
  assertProjectPath,
  buildLocalDocumentLinkIndex,
  canonicalJson,
  characterSchema,
  characterRelationSchema,
  ensureDir,
  fileForDoc,
  foreshadowingSchema,
  factionMembershipSchema,
  factionRelationSchema,
  factionSchema,
  issueSchema,
  listDocs,
  loadProject,
  locationSchema,
  narrativeSchema,
  patternSchema,
  pathExists,
  readMarkdown,
  readText,
  referenceSchema,
  sha256Text,
  strategySchema,
  timelineEventSchema,
  timelineNodeSchema,
  worldEntrySchema,
  withProjectWriteLock,
  writeMarkdown,
  writeText,
  type BaseDoc,
  type DocumentIdentity,
  type ProjectConfig
} from '@quillarium/core'
import { z } from 'zod/v3'
import { loadDesktopAIProfile } from './credentials.js'
import {
  PLANNING_DOCUMENT_KINDS,
  typedHandle,
  type PlanningChatRequest,
  type PlanningChatResponse,
  type PlanningConfirmRequest,
  type PlanningDocumentKind,
  type PlanningDraft,
  type PlanningProposal,
  type PlanningProposalRevision,
  type PlanningSession,
  type PlanningSessionUpdate
} from './contract.js'
import { createProjectDocument } from './project.js'
import {
  applyPlanningCheckForIPC,
  decidePlanningCheckForIPC,
  openPlanningCheckRun,
  retryPlanningCheck,
  runPlanningCheck
} from './agent-check.js'
import { withDesktopAIStream } from './ai-stream.js'

export {
  applyPlanningCheckDecision,
  createPlanningCheckDecision,
  retryPlanningCheck,
  runPlanningCheck
} from './agent-check.js'

const planningKindSchema = z.enum(PLANNING_DOCUMENT_KINDS)
const CREATABLE_PLANNING_KINDS = PLANNING_DOCUMENT_KINDS.filter(
  (kind) => kind !== 'strategy' && kind !== 'pattern'
)
const REFERENCE_DERIVED_PLANNING_KINDS: readonly PlanningDocumentKind[] = [
  'character',
  'character_relation',
  'faction',
  'faction_relation',
  'faction_membership',
  'world_entry',
  'timeline_node',
  'timeline_event',
  'location',
  'foreshadowing',
  'narrative'
]
const MODULE_PLANNING_KINDS: Partial<Record<string, readonly PlanningDocumentKind[]>> = {
  planning: CREATABLE_PLANNING_KINDS,
  world: ['world_entry'],
  characters: ['character', 'character_relation'],
  factions: ['faction', 'faction_relation', 'faction_membership'],
  timeline: ['timeline_node', 'timeline_event'],
  locations: ['location'],
  foreshadowing: ['foreshadowing'],
  narrative: ['narrative'],
  'reference-extraction': REFERENCE_DERIVED_PLANNING_KINDS,
  issues: CREATABLE_PLANNING_KINDS
}
const rawDraftSchema = z
  .object({
    kind: planningKindSchema,
    title: z.string().trim().min(1),
    fields: z.record(z.unknown()).default({}),
    content: z.string().default('')
  })
  .strict()
const rawAIProposalSchema = rawDraftSchema.extend({
  id: z.string().trim().min(1).optional(),
  operation: z.enum(['create', 'update']).optional(),
  target_id: z.string().trim().min(1).optional()
})
const responseSchema = z
  .object({
    message: z.string().trim().min(1),
    proposal: rawDraftSchema.nullable().optional(),
    proposals: z.array(rawAIProposalSchema).max(24).optional()
  })
  .strict()

interface PlanningDependencies {
  loadAIProfile: () => Promise<AIConfig>
  generate: typeof generateText
}

interface PlanningPersistenceDependencies {
  writeSession: (root: string, session: PlanningSession) => Promise<void>
  removeFile: (file: string) => Promise<void>
}

const defaultDependencies: PlanningDependencies = {
  loadAIProfile: () => loadDesktopAIProfile('background'),
  generate: generateText
}

const defaultPersistenceDependencies: PlanningPersistenceDependencies = {
  writeSession: writePlanningSession,
  removeFile: async (file) => rm(file, { force: false })
}

export function registerPlanningHandlers(): void {
  typedHandle('planning:start', async (_event, root, module, documentId) =>
    startPlanningSession(root, module, documentId)
  )
  typedHandle('planning:session', async (_event, root, sessionId) => loadPlanningSession(root, sessionId))
  typedHandle('planning:save', async (_event, root, sessionId, update) =>
    savePlanningSession(root, sessionId, update)
  )
  typedHandle('planning:discuss', async (_event, root, input) => discussPlanningRecord(root, input))
  typedHandle('planning:confirm', async (_event, root, input) => confirmPlanningRecord(root, input))
  typedHandle('planning:issueBatch', async (_event, root, issueIds, action) =>
    applyIssueBatchAction(root, issueIds, action)
  )
  typedHandle('planning:check', async (event, root, language, clientRequestId, scope) =>
    withDesktopAIStream(event, 'planning-check', clientRequestId, (stream) =>
      runPlanningCheck(
        root,
        language,
        {
          signal: stream.signal,
          onStreamEvent: (runtimeEvent) =>
            stream.onStreamEvent({
              ...runtimeEvent.event,
              child_execution_id: runtimeEvent.execution_id,
              batch_key: runtimeEvent.batch_key
            })
        },
        scope
      )
    )
  )
  typedHandle('planning:checkRetry', async (event, root, executionId, language, clientRequestId) =>
    withDesktopAIStream(event, 'planning-check', clientRequestId, (stream) =>
      retryPlanningCheck(root, executionId, language, {
        signal: stream.signal,
        onStreamEvent: (runtimeEvent) =>
          stream.onStreamEvent({
            ...runtimeEvent.event,
            child_execution_id: runtimeEvent.execution_id,
            batch_key: runtimeEvent.batch_key
          })
      })
    )
  )
  typedHandle('planning:checkDecision', async (_event, root, input) => decidePlanningCheckForIPC(root, input))
  typedHandle('planning:checkApply', async (_event, root, executionId, decisionId) =>
    applyPlanningCheckForIPC(root, executionId, decisionId)
  )
  typedHandle('planning:checkOpenRun', async (_event, root, executionId) =>
    openPlanningCheckRun(root, executionId)
  )
}

export async function startPlanningSession(
  root: string,
  module: string,
  documentId?: string
): Promise<PlanningSession> {
  const now = new Date().toISOString()
  const session: PlanningSession = {
    schema_version: 2,
    id: uniquePlanningSessionId(),
    module: module.trim() || 'planning',
    created_at: now,
    updated_at: now,
    messages: [],
    proposal: null,
    proposals: [],
    selected_proposal_id: null
  }
  if (documentId) {
    const document = (await listDocs<BaseDoc>(root)).find((item) => item.data.id === documentId)
    if (!document) throw new Error(`Planning card not found: ${documentId}`)
    if (document.data.type === 'reference') {
      if (session.module !== 'reference-extraction') {
        throw new Error('参考文档只能作为“AI 讨论生卡”的只读来源，不能作为 AI 可编辑提案。')
      }
      session.source_document = {
        path: document.path,
        id: document.data.id,
        type: 'reference',
        title: document.data.title,
        expected_sha256: sha256Text(await readText(document.path))
      }
      await writePlanningSession(root, session)
      return session
    }
    if (session.module === 'reference-extraction') {
      throw new Error('“AI 讨论生卡”必须从一张已上传的参考文档开始。')
    }
    if (!PLANNING_DOCUMENT_KINDS.includes(document.data.type as PlanningDocumentKind)) {
      throw new Error(
        `This document type cannot be edited in the planning conversation: ${document.data.type}`
      )
    }
    const kind = document.data.type as PlanningDocumentKind
    const draft = normalizePlanningDraft({
      kind,
      title: document.data.title,
      fields: Object.fromEntries(
        Object.entries(document.data).filter(
          ([key]) => !['id', 'type', 'schema_version', 'title', DOCUMENT_ORIGIN_FIELD].includes(key)
        )
      ),
      content: document.content
    })
    const proposalId = `anchor-${document.data.id}`
    const target = {
      path: document.path,
      id: document.data.id,
      type: kind,
      expected_sha256: sha256Text(await readText(document.path))
    }
    const anchor: PlanningProposal = {
      id: proposalId,
      operation: 'update',
      source: 'anchor',
      status: 'draft',
      draft,
      target,
      revisions: [planningRevision(draft, 'anchor', now)]
    }
    session.proposal = draft
    session.proposals = [anchor]
    session.selected_proposal_id = proposalId
    session.anchor_proposal_id = proposalId
    session.document = { path: document.path, id: document.data.id, type: kind }
  } else if (session.module === 'reference-extraction') {
    throw new Error('请先上传并选中一份参考文档，再开始 AI 讨论生卡。')
  }
  await writePlanningSession(root, session)
  return session
}

export async function loadPlanningSession(root: string, sessionId: string): Promise<PlanningSession> {
  const parsed = JSON.parse(await readText(planningSessionPath(root, sessionId))) as unknown
  return migratePlanningSession(root, parsed)
}

export async function savePlanningSession(
  root: string,
  sessionId: string,
  update: PlanningSessionUpdate
): Promise<PlanningSession> {
  const session = mergePlanningSessionUpdate(await loadPlanningSession(root, sessionId), update)
  await writePlanningSession(root, session)
  return session
}

export async function confirmPlanningRecord(
  root: string,
  input: PlanningConfirmRequest,
  persistence: PlanningPersistenceDependencies = defaultPersistenceDependencies
) {
  const loaded = await loadPlanningSession(root, input.sessionId)
  const session = mergePlanningSessionUpdate(loaded, input)
  if (input.proposal && !input.proposals) {
    const selected = session.proposals.find((proposal) => proposal.id === session.selected_proposal_id)
    if (selected) selected.status = 'confirmed'
  }
  const confirmed = session.proposals.filter((proposal) => proposal.status === 'confirmed')
  if (!confirmed.length) {
    throw new Error('Confirm at least one proposal before applying it to the project.')
  }
  assertPlanningProposalsInModuleScope(confirmed, session.module, session.document?.type)
  return withProjectWriteLock(root, async () => {
    await assertPlanningSourceDocumentUnchanged(root, session.source_document)
    return applyPlanningProposalTransaction(root, session, confirmed, persistence)
  })
}

interface PreparedPlanningUpdate {
  proposal: PlanningProposal
  draft: PlanningDraft
  source: string
  target: string
  source_raw: string
  current_data: Record<string, unknown>
  changing_type: boolean
}

interface PreparedPlanningCreate {
  proposal: PlanningProposal
  draft: PlanningDraft
}

async function applyPlanningProposalTransaction(
  root: string,
  session: PlanningSession,
  confirmed: PlanningProposal[],
  persistence: PlanningPersistenceDependencies
) {
  const documents = await listDocs<DocumentIdentity>(root)
  assertConfirmedPlanningDependencies(session.proposals, confirmed)
  const creates = orderPlanningCreatesByDependency(confirmed).map<PreparedPlanningCreate>((proposal) => ({
    proposal,
    draft: normalizePlanningDraft(proposal.draft)
  }))
  const existingIds = new Set(documents.map((document) => document.data.id))
  for (const { proposal } of creates) {
    if (existingIds.has(proposal.id)) {
      throw new Error(
        `会话临时 ID “${proposal.id}” 与现有项目卡片冲突，无法可靠解析多卡引用。请让 AI 重新生成这张卡片。`
      )
    }
  }
  const virtualCreates = creates.map(({ proposal, draft }) => ({
    path: path.join(root, '.quillarium', 'planning-preview', `${sha256Text(proposal.id).slice(0, 16)}.md`),
    data: parseDocumentFields(draft.kind, {
      id: proposal.id,
      type: draft.kind,
      schema_version: 1,
      title: draft.title,
      status: defaultStatus(draft.kind),
      tags: [],
      enabled: defaultEnabled(draft.kind),
      ...draft.fields
    }) as unknown as DocumentIdentity,
    content: draft.content
  }))
  const validationDocuments = [...documents, ...virtualCreates]
  const updates: PreparedPlanningUpdate[] = []
  for (const proposal of confirmed) {
    const normalized = normalizePlanningDraft(proposal.draft)
    if (proposal.operation === 'create') {
      const validationCandidate = virtualCreates.find((item) => item.data.id === proposal.id)!.data
      await assertCardReferencesExist(validationCandidate, validationDocuments, root)
      continue
    }
    if (!proposal.target) throw new Error(`Update proposal ${proposal.id} has no target document.`)
    const source = assertProjectPath(root, proposal.target.path)
    const sourceRaw = await readText(source)
    const currentHash = sha256Text(sourceRaw)
    if (currentHash !== proposal.target.expected_sha256) {
      throw planningHashConflict(proposal, currentHash, sourceRaw)
    }
    const current = await readMarkdown<Record<string, unknown>>(source)
    if (current.data['id'] !== proposal.target.id || current.data['type'] !== proposal.target.type) {
      throw new Error(`Planning card identity changed outside this conversation: ${proposal.target.id}`)
    }
    const changingType = proposal.target.type !== normalized.kind
    const parsed = parseDocumentFields(normalized.kind, {
      ...(changingType
        ? sharedMigrationFields(current.data, normalized.fields, normalized.kind)
        : { ...current.data, ...normalized.fields }),
      id: current.data['id'],
      type: normalized.kind,
      schema_version: 1,
      title: normalized.title
    })
    await assertCardReferencesExist(parsed as unknown as DocumentIdentity, validationDocuments, root)
    const target = changingType
      ? assertProjectPath(root, fileForDoc(root, normalized.kind, proposal.target.id, normalized.title))
      : source
    if (changingType && (await pathExists(target))) {
      throw new Error(`Planning card type migration target already exists: ${path.basename(target)}`)
    }
    updates.push({
      proposal,
      draft: normalized,
      source,
      target,
      source_raw: sourceRaw,
      current_data: current.data,
      changing_type: changingType
    })
  }

  const createdPaths: string[] = []
  const writtenTargets: string[] = []
  const results: Array<{
    proposal_id: string
    operation: 'create' | 'update'
    path: string
    document: { data: Record<string, unknown>; content: string }
    source_sha256: string
  }> = []
  const beforeApply = structuredClone(session)
  const resolvedProposalIds = new Map<string, string>()
  for (const proposal of session.proposals) {
    if (proposal.target) resolvedProposalIds.set(proposal.id, proposal.target.id)
  }
  const appliedDrafts = new Map<string, PlanningDraft>()
  try {
    for (const { proposal, draft } of creates) {
      const resolvedDraft = resolvePlanningProposalReferences(draft, resolvedProposalIds)
      const file = await createProjectDocument(root, resolvedDraft.kind, {
        ...resolvedDraft.fields,
        title: resolvedDraft.title,
        content: resolvedDraft.content
      })
      createdPaths.push(file)
      const current = await readMarkdown<Record<string, unknown>>(file)
      const stableId = String(current.data['id'])
      resolvedProposalIds.set(proposal.id, stableId)
      appliedDrafts.set(proposal.id, resolvedDraft)
      await writeMarkdown(
        file,
        { ...current.data, [DOCUMENT_ORIGIN_FIELD]: planningOrigin(session, proposal.id) },
        current.content
      )
      const document = await readMarkdown<Record<string, unknown>>(file)
      results.push({
        proposal_id: proposal.id,
        operation: 'create',
        path: file,
        document,
        source_sha256: sha256Text(await readText(file))
      })
    }
    const documentsAfterCreates = await listDocs<DocumentIdentity>(root)
    for (const update of updates) {
      const resolvedDraft = resolvePlanningProposalReferences(update.draft, resolvedProposalIds)
      const parsed = parseDocumentFields(resolvedDraft.kind, {
        ...(update.changing_type
          ? sharedMigrationFields(update.current_data, resolvedDraft.fields, resolvedDraft.kind)
          : { ...update.current_data, ...resolvedDraft.fields }),
        id: update.current_data['id'],
        type: resolvedDraft.kind,
        schema_version: 1,
        title: resolvedDraft.title
      })
      await assertCardReferencesExist(parsed as unknown as DocumentIdentity, documentsAfterCreates, root)
      await writeMarkdown(
        update.target,
        { ...parsed, [DOCUMENT_ORIGIN_FIELD]: planningOrigin(session, update.proposal.id) },
        resolvedDraft.content
      )
      writtenTargets.push(update.target)
      const document = await readMarkdown<Record<string, unknown>>(update.target)
      const verified = parseDocumentFields(resolvedDraft.kind, document.data)
      if (verified.id !== update.proposal.target?.id || verified.type !== resolvedDraft.kind) {
        throw new Error(`Planning card write verification failed: ${update.proposal.id}`)
      }
      appliedDrafts.set(update.proposal.id, resolvedDraft)
      results.push({
        proposal_id: update.proposal.id,
        operation: 'update',
        path: update.target,
        document,
        source_sha256: sha256Text(await readText(update.target))
      })
    }

    const resultByProposal = new Map(results.map((result) => [result.proposal_id, result]))
    session = {
      ...session,
      proposals: session.proposals.map((proposal) => {
        const result = resultByProposal.get(proposal.id)
        if (!result) return proposal
        const appliedDraft = appliedDrafts.get(proposal.id) ?? proposal.draft
        return {
          ...proposal,
          operation: 'update',
          status: 'applied',
          draft: appliedDraft,
          revisions: appendRevision(
            proposal.revisions,
            planningRevision(appliedDraft, proposal.source === 'ai' ? 'ai' : 'author')
          ),
          target: {
            path: result.path,
            id: String(result.document.data['id']),
            type: proposal.draft.kind,
            expected_sha256: result.source_sha256
          }
        }
      }),
      updated_at: new Date().toISOString()
    }
    session.proposal =
      session.proposals.find((proposal) => proposal.id === session.selected_proposal_id)?.draft ?? null
    const anchor = session.anchor_proposal_id ? resultByProposal.get(session.anchor_proposal_id) : results[0]
    if (anchor) {
      session.document = {
        path: anchor.path,
        id: String(anchor.document.data['id']),
        type: String(anchor.document.data['type']) as PlanningDocumentKind
      }
    }
    await persistence.writeSession(root, session)
    for (const update of updates.filter((item) => item.changing_type)) {
      await persistence.removeFile(update.source)
    }
    const selected =
      results.find((result) => result.proposal_id === session.selected_proposal_id) ?? results[0]!
    return { ...selected, results, session }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const update of [...updates].reverse()) {
      await writeText(update.source, update.source_raw).catch((cause) => rollbackErrors.push(cause))
      if (update.changing_type && (await pathExists(update.target))) {
        await rm(update.target, { force: true }).catch((cause) => rollbackErrors.push(cause))
      }
    }
    for (const file of [
      ...createdPaths,
      ...writtenTargets.filter((file) => !updates.some((u) => u.source === file))
    ]) {
      if (await pathExists(file)) await rm(file, { force: true }).catch((cause) => rollbackErrors.push(cause))
    }
    await writePlanningSession(root, beforeApply).catch((cause) => rollbackErrors.push(cause))
    if (rollbackErrors.length) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Multi-card planning apply failed and rollback was incomplete.',
        { cause: error }
      )
    }
    throw error
  }
}

function assertConfirmedPlanningDependencies(
  proposals: PlanningProposal[],
  confirmed: PlanningProposal[]
): void {
  const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]))
  const proposalIds = new Set(proposalsById.keys())
  const confirmedIds = new Set(confirmed.map((proposal) => proposal.id))
  for (const proposal of confirmed) {
    for (const dependencyId of collectSessionProposalReferences(proposal.draft.fields, proposalIds)) {
      const dependency = proposalsById.get(dependencyId)
      if (
        !dependency ||
        dependency.operation !== 'create' ||
        dependency.status === 'applied' ||
        confirmedIds.has(dependency.id)
      ) {
        continue
      }
      throw new Error(
        `已确认卡片“${proposal.draft.title}”依赖会话中的新卡“${dependency.draft.title}”，但依赖卡尚未确认。请先确认依赖卡，或使用“确认全部”。本次未写入任何卡片。`
      )
    }
  }
}

function orderPlanningCreatesByDependency(confirmed: PlanningProposal[]): PlanningProposal[] {
  const creates = confirmed.filter((proposal) => proposal.operation === 'create')
  const createIds = new Set(creates.map((proposal) => proposal.id))
  const dependencies = new Map(
    creates.map((proposal) => [
      proposal.id,
      collectSessionProposalReferences(proposal.draft.fields, createIds)
    ])
  )
  const remaining = new Map(creates.map((proposal) => [proposal.id, proposal]))
  const ordered: PlanningProposal[] = []
  while (remaining.size) {
    const next = creates.find(
      (proposal) =>
        remaining.has(proposal.id) &&
        [...(dependencies.get(proposal.id) ?? [])].every((dependencyId) => !remaining.has(dependencyId))
    )
    if (!next) {
      const cycle = [...remaining.values()].map((proposal) => `“${proposal.draft.title}”`).join('、')
      throw new Error(`会话多卡存在循环依赖：${cycle}。请调整卡片引用后再应用；本次未写入任何卡片。`)
    }
    ordered.push(next)
    remaining.delete(next.id)
  }
  return ordered
}

function collectSessionProposalReferences(value: unknown, proposalIds: Set<string>): Set<string> {
  const result = new Set<string>()
  const visit = (item: unknown): void => {
    if (typeof item === 'string') {
      if (proposalIds.has(item)) result.add(item)
      return
    }
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry)
      return
    }
    if (!item || typeof item !== 'object') return
    for (const entry of Object.values(item as Record<string, unknown>)) visit(entry)
  }
  visit(value)
  return result
}

function resolvePlanningProposalReferences(
  draft: PlanningDraft,
  resolvedIds: ReadonlyMap<string, string>
): PlanningDraft {
  const resolve = (value: unknown): unknown => {
    if (typeof value === 'string') return resolvedIds.get(value) ?? value
    if (Array.isArray(value)) return value.map(resolve)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, resolve(entry)])
    )
  }
  return {
    ...draft,
    fields: resolve(draft.fields) as Record<string, unknown>
  }
}

function sharedMigrationFields(
  current: Record<string, unknown>,
  proposalFields: Record<string, unknown>,
  targetKind: PlanningDocumentKind
): Record<string, unknown> {
  return {
    ...proposalFields,
    status: current['status'] ?? defaultStatus(targetKind),
    tags: preferNonEmptyArray(proposalFields['tags'], current['tags']),
    enabled: current['enabled'] ?? defaultEnabled(targetKind),
    source_refs: preferNonEmptyArray(proposalFields['source_refs'], current['source_refs']),
    relations: preferNonEmptyArray(proposalFields['relations'], current['relations'])
  }
}

function preferNonEmptyArray(proposed: unknown, current: unknown): unknown[] {
  if (Array.isArray(proposed) && proposed.length) return proposed
  return Array.isArray(current) ? current : []
}

function planningOrigin(session: PlanningSession, proposalId?: string) {
  return {
    schema_version: 1 as const,
    kind: 'ai-conversation' as const,
    session_id: session.id,
    ...(proposalId ? { proposal_id: proposalId } : {}),
    created_at: session.created_at,
    updated_at: new Date().toISOString()
  }
}

export async function discussPlanningRecord(
  root: string,
  input: PlanningChatRequest,
  dependencies: PlanningDependencies = defaultDependencies
): Promise<PlanningChatResponse> {
  const sessionMessages = normalizeSessionMessages(input.messages)
  const messages = normalizeMessages(sessionMessages)
  if (!messages.some((message) => message.role === 'author')) {
    throw new Error('请先描述要建立的资料、用途或尚未确定的问题。')
  }
  const [project, docs, config, session] = await Promise.all([
    loadProject(root),
    listDocs<BaseDoc>(root),
    dependencies.loadAIProfile(),
    input.sessionId ? loadPlanningSession(root, input.sessionId) : Promise.resolve(null)
  ])
  if (!isAIConfigured(config)) {
    throw new Error('背景 AI 尚未配置。请返回“设置 → AI 配置 → 背景”，保存可用的模型和密钥后重试。')
  }

  await assertPlanningSourceDocumentUnchanged(root, session?.source_document)

  const sessionModule = session?.module ?? input.module
  const currentProposals = session?.proposals ?? input.proposals ?? []
  const promptInput: PlanningChatRequest = {
    ...input,
    module: sessionModule,
    messages,
    proposals: input.proposals ?? currentProposals
  }
  const allowedKinds = planningKindsForModule(sessionModule, session?.document?.type)
  if (!allowedKinds.length) {
    throw new Error(`Unsupported planning module scope: ${sessionModule}`)
  }

  const raw = await dependencies.generate(
    buildPlanningPrompt(
      project,
      docs,
      promptInput,
      Boolean(session?.document),
      root,
      session?.source_document
    ),
    config,
    planningSystemPrompt(
      Boolean(session?.document),
      sessionModule,
      allowedKinds,
      Boolean(session?.source_document)
    ),
    { responseFormat: 'json_object' }
  )
  const parsedResponse = parsePlanningAIResponse(raw)
  assertPlanningProposalsInModuleScope(parsedResponse.proposals, sessionModule, session?.document?.type)
  const generatedProposals = session?.source_document
    ? parsedResponse.proposals.map((proposal) =>
        attachPlanningSourceReference(proposal, session.source_document!.id)
      )
    : parsedResponse.proposals
  const proposals = mergeAIPlanningProposals(currentProposals, generatedProposals, session ?? undefined)
  const selectedProposalId = selectExistingProposalId(
    parsedResponse.selectedProposalId ?? input.selectedProposalId ?? session?.selected_proposal_id ?? null,
    proposals
  )
  const response: PlanningChatResponse = {
    ...parsedResponse,
    proposals,
    selectedProposalId,
    proposal: proposals.find((proposal) => proposal.id === selectedProposalId)?.draft ?? null
  }
  if (input.sessionId) {
    await savePlanningSession(root, input.sessionId, {
      messages: [...sessionMessages, { role: 'assistant', content: response.message }],
      proposals,
      selectedProposalId
    })
  }
  return response
}

export function parsePlanningAIResponse(raw: string): PlanningChatResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(raw))
  } catch (error) {
    throw invalidResponseError(error)
  }
  const result = responseSchema.safeParse(parsed)
  if (!result.success) throw invalidResponseError(result.error)
  try {
    const rawProposals = result.data.proposals ?? (result.data.proposal ? [result.data.proposal] : [])
    const proposals = rawProposals.map((proposal, index) => normalizeAIPlanningProposal(proposal, index))
    return {
      message: result.data.message,
      proposal: proposals[0]?.draft ?? null,
      proposals,
      selectedProposalId: proposals.at(-1)?.id ?? null
    }
  } catch (error) {
    throw invalidResponseError(error)
  }
}

export function normalizePlanningDraft(proposal: PlanningDraft): PlanningDraft {
  const raw = rawDraftSchema.parse(proposal)
  const repairedFields = repairStableProductFields(raw.kind, raw.fields).fields
  const base = {
    id: 'planning-preview',
    type: raw.kind,
    schema_version: 1,
    title: raw.title,
    status: defaultStatus(raw.kind),
    tags: [],
    enabled: defaultEnabled(raw.kind),
    ...withoutReservedFields(repairedFields)
  }
  const parsed = parseDocumentFields(raw.kind, base)
  const fields = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !['id', 'type', 'schema_version', 'title'].includes(key))
  )
  return { kind: raw.kind, title: raw.title, fields, content: raw.content }
}

export function normalizeIssueStateFromAI(value: unknown): {
  state: 'open' | 'resolved' | 'ignored'
  repaired: boolean
  error?: string
} {
  const normalized = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  if (['', 'open', 'pending', 'received', 'new', 'todo', 'deferred'].includes(normalized)) {
    return { state: 'open', repaired: normalized !== '' && normalized !== 'open' }
  }
  if (['resolved', 'closed', 'fixed', 'done', 'completed'].includes(normalized)) {
    return { state: 'resolved', repaired: normalized !== 'resolved' }
  }
  if (['ignored', 'ignore', 'suppressed', 'wontfix', "won't-fix"].includes(normalized)) {
    return { state: 'ignored', repaired: normalized !== 'ignored' }
  }
  return {
    state: 'open',
    repaired: true,
    error: `Unsupported issue state “${String(value)}”; kept this proposal locally as open.`
  }
}

function repairStableProductFields(
  kind: PlanningDocumentKind,
  fields: Record<string, unknown>
): { fields: Record<string, unknown>; warning?: string } {
  if (kind !== 'issue' || !Object.hasOwn(fields, 'state')) return { fields }
  const normalized = normalizeIssueStateFromAI(fields['state'])
  return { fields: { ...fields, state: normalized.state }, warning: normalized.error }
}

function normalizeAIPlanningProposal(
  proposal: z.infer<typeof rawAIProposalSchema>,
  index: number
): PlanningProposal {
  const repaired = repairStableProductFields(proposal.kind, proposal.fields)
  const draft = normalizePlanningDraft({
    kind: proposal.kind,
    title: proposal.title,
    fields: repaired.fields,
    content: proposal.content
  })
  const now = new Date().toISOString()
  const id = validProposalId(proposal.id)
    ? proposal.id!
    : `proposal-${sha256Text(canonicalJson({ index, draft })).slice(0, 16)}`
  return {
    id,
    operation: proposal.operation ?? 'create',
    source: 'ai',
    status: 'draft',
    draft,
    revisions: [planningRevision(draft, 'ai', now)],
    ...(repaired.warning ? { validation_error: repaired.warning } : {})
  }
}

function mergeAIPlanningProposals(
  current: PlanningProposal[],
  generated: PlanningProposal[],
  session?: PlanningSession
): PlanningProposal[] {
  const next = current.map((proposal) => structuredClone(proposal))
  for (const incoming of generated) {
    const existingIndex = next.findIndex((proposal) => proposal.id === incoming.id)
    if (existingIndex >= 0) {
      const existing = next[existingIndex]!
      const revision = planningRevision(incoming.draft, 'ai')
      next[existingIndex] = {
        ...existing,
        status: 'draft',
        draft: incoming.draft,
        revisions: appendRevision(existing.revisions, revision),
        ...(incoming.validation_error ? { validation_error: incoming.validation_error } : {})
      }
      continue
    }
    next.push({
      ...incoming,
      operation: 'create',
      ...(incoming.operation === 'update'
        ? {
            validation_error:
              incoming.validation_error ??
              'An update must reuse an existing proposal id so its stable target and expected hash are preserved.'
          }
        : {})
    })
  }
  return anchorFirst(next, session?.anchor_proposal_id)
}

function mergePlanningSessionUpdate(source: PlanningSession, update: PlanningSessionUpdate): PlanningSession {
  const session = structuredClone(source)
  session.messages = normalizeSessionMessages(update.messages)
  const incoming = update.proposals
    ? normalizePlanningProposals(update.proposals, session)
    : update.proposal
      ? updateLegacyProposal(session, update.proposal)
      : session.proposals
  session.proposals = anchorFirst(incoming, session.anchor_proposal_id)
  session.selected_proposal_id = selectExistingProposalId(
    update.selectedProposalId ?? session.selected_proposal_id,
    session.proposals
  )
  session.proposal =
    session.proposals.find((proposal) => proposal.id === session.selected_proposal_id)?.draft ?? null
  session.updated_at = new Date().toISOString()
  return session
}

function normalizePlanningProposals(
  proposals: PlanningProposal[],
  session: PlanningSession
): PlanningProposal[] {
  const existing = new Map(session.proposals.map((proposal) => [proposal.id, proposal]))
  const normalized: PlanningProposal[] = proposals
    .filter((proposal) => validProposalId(proposal.id))
    .map<PlanningProposal>((proposal) => {
      const previous = existing.get(proposal.id)
      const normalizedDraft = normalizePlanningDraft(proposal.draft)
      const draft = session.source_document
        ? withPlanningSourceReference(normalizedDraft, session.source_document.id)
        : normalizedDraft
      const revision = planningRevision(draft, proposal.source === 'ai' ? 'ai' : 'author')
      const changed = previous ? planningDraftHash(previous.draft) !== revision.content_sha256 : false
      const status = changed && proposal.status !== 'draft' ? 'draft' : proposal.status
      const target = previous?.target ?? proposal.target
      return {
        ...proposal,
        operation: previous?.operation ?? proposal.operation,
        source: previous?.source ?? proposal.source,
        status,
        draft,
        ...(target ? { target } : {}),
        revisions: appendRevision(previous?.revisions ?? proposal.revisions ?? [], revision)
      }
    })
  const anchor = session.anchor_proposal_id
    ? session.proposals.find((proposal) => proposal.id === session.anchor_proposal_id)
    : undefined
  if (anchor && !normalized.some((proposal) => proposal.id === anchor.id)) normalized.unshift(anchor)
  return normalized
}

function attachPlanningSourceReference(
  proposal: PlanningProposal,
  sourceDocumentId: string
): PlanningProposal {
  const draft = withPlanningSourceReference(proposal.draft, sourceDocumentId)
  return {
    ...proposal,
    draft,
    revisions: appendRevision(proposal.revisions, planningRevision(draft, proposal.source))
  }
}

function withPlanningSourceReference(draft: PlanningDraft, sourceDocumentId: string): PlanningDraft {
  const existing = Array.isArray(draft.fields['source_refs'])
    ? draft.fields['source_refs'].filter(
        (value): value is string => typeof value === 'string' && Boolean(value)
      )
    : []
  return normalizePlanningDraft({
    ...draft,
    fields: {
      ...draft.fields,
      source_refs: [...new Set([...existing, sourceDocumentId])]
    }
  })
}

function updateLegacyProposal(session: PlanningSession, draftValue: PlanningDraft): PlanningProposal[] {
  const draft = normalizePlanningDraft(draftValue)
  const selectedId = session.selected_proposal_id ?? session.proposals[0]?.id
  const existing = session.proposals.find((proposal) => proposal.id === selectedId)
  if (!existing) {
    const id = `proposal-${sha256Text(canonicalJson(draft)).slice(0, 16)}`
    return [
      ...session.proposals,
      {
        id,
        operation: 'create',
        source: 'author',
        status: 'draft',
        draft,
        revisions: [planningRevision(draft, 'author')]
      }
    ]
  }
  return session.proposals.map((proposal) =>
    proposal.id === existing.id
      ? {
          ...proposal,
          status: planningDraftHash(proposal.draft) === planningDraftHash(draft) ? proposal.status : 'draft',
          draft,
          revisions: appendRevision(proposal.revisions, planningRevision(draft, 'author'))
        }
      : proposal
  )
}

function planningRevision(
  draft: PlanningDraft,
  source: PlanningProposalRevision['source'],
  createdAt = new Date().toISOString()
): PlanningProposalRevision {
  const contentSha256 = planningDraftHash(draft)
  return {
    id: `revision-${contentSha256.slice(0, 16)}`,
    created_at: createdAt,
    source,
    content_sha256: contentSha256
  }
}

function planningDraftHash(draft: PlanningDraft): string {
  return sha256Text(canonicalJson(draft))
}

function appendRevision(
  revisions: PlanningProposalRevision[],
  revision: PlanningProposalRevision
): PlanningProposalRevision[] {
  return revisions.at(-1)?.content_sha256 === revision.content_sha256 ? revisions : [...revisions, revision]
}

function anchorFirst(proposals: PlanningProposal[], anchorId?: string): PlanningProposal[] {
  const unique = new Map<string, PlanningProposal>()
  for (const proposal of proposals) if (!unique.has(proposal.id)) unique.set(proposal.id, proposal)
  if (!anchorId) return [...unique.values()]
  const anchor = unique.get(anchorId)
  if (!anchor) return [...unique.values()]
  return [anchor, ...[...unique.values()].filter((proposal) => proposal.id !== anchorId)]
}

function selectExistingProposalId(
  value: string | null | undefined,
  proposals: PlanningProposal[]
): string | null {
  if (value && proposals.some((proposal) => proposal.id === value)) return value
  return proposals[0]?.id ?? null
}

function validProposalId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,127}$/iu.test(value)
}

export function buildPlanningPrompt(
  project: ProjectConfig,
  docs: Array<{ path?: string; data: BaseDoc; content: string }>,
  input: PlanningChatRequest,
  editingExisting = false,
  projectRoot?: string,
  sourceDocument?: PlanningSession['source_document']
): string {
  const recentMessages = normalizeMessages(input.messages)
  const anchorKind = (input.proposals ?? []).find((proposal) => proposal.source === 'anchor')?.target?.type
  const allowedKinds = planningKindsForModule(input.module, anchorKind)
  const allowedKindSet = new Set(allowedKinds)
  const scopedProposals = (input.proposals ?? []).filter((proposal) =>
    allowedKindSet.has(proposal.draft.kind)
  )
  const catalog = docs
    .filter((doc) => allowedKindSet.has(doc.data.type as PlanningDocumentKind))
    .slice(0, 80)
    .map((doc) => ({
      id: doc.data.id,
      type: doc.data.type,
      title: doc.data.title,
      status: doc.data.status
    }))
  const issueContext = buildIssuePlanningContext(docs, input, projectRoot)
  const referenceSource = sourceDocument
    ? docs.find(
        (document) => document.data.id === sourceDocument.id && document.data.type === sourceDocument.type
      )
    : undefined
  return [
    `Current project: ${project.title}`,
    `Genre: ${project.genre}`,
    `Planning module opened by the author: ${limitText(input.module, 80)}`,
    `Allowed proposal kinds for this module: ${allowedKinds.join(', ')}`,
    'The module boundary is code-owned. Do not inspect, discuss, or propose unrelated card kinds.',
    '',
    editingExisting
      ? 'Existing project document catalog (metadata only; edit only the card linked to this conversation):'
      : 'Existing project document catalog (metadata only; do not overwrite it):',
    JSON.stringify(catalog, null, 2),
    ...(issueContext
      ? [
          '',
          'Issue-specific context. The anchored issue is first, followed by same-kind issues, explicit targets, and locally resolved references:',
          JSON.stringify(issueContext, null, 2)
        ]
      : []),
    ...(referenceSource
      ? [
          '',
          '参考生卡的只读来源 (read-only source for card extraction; never edit or return it as a proposal):',
          JSON.stringify(
            {
              ...planningContextDocument(referenceSource, 24_000),
              source_sha256: sourceDocument?.expected_sha256
            },
            null,
            2
          )
        ]
      : []),
    '',
    'Current proposal collection (stable proposal ids; never discard or replace earlier cards):',
    JSON.stringify(
      scopedProposals.map((proposal) => ({
        id: proposal.id,
        operation: proposal.operation,
        status: proposal.status,
        target_id: proposal.target?.id,
        draft: proposal.draft
      })),
      null,
      2
    ),
    '',
    'Conversation:',
    recentMessages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n'),
    '',
    'Respond with one JSON object only:',
    '{"message":"your next helpful reply","proposals":[]}',
    'or, once enough information is available:',
    `{"message":"summary and remaining caveats","proposals":[{"id":"reuse-an-existing-proposal-id-when-revising-it","operation":"create | update","target_id":"stable-project-card-id-for-update","kind":"${allowedKinds.join(' | ')}","title":"...","fields":{},"content":"Markdown body"}]}`,
    '',
    'The proposal must use only fields valid for the selected kind. Markdown belongs in content, not fields.',
    'For source_refs, relations, timeline_node, character endpoints, locations, and other links, use only exact IDs from the project catalog. Never invent a related card ID.',
    "Exception for cards created together in this response: use the referenced card's stable proposal id in the structured reference field. Quillarium resolves that temporary id to the new project card's stable id inside one atomic apply transaction. Never use a title or array position as a reference.",
    'Reference documents are source material, not fact cards: do not copy their full body into another card and never assign them a lifecycle status.',
    ...(referenceSource
      ? [
          `Every proposal is derived from reference ${sourceDocument!.id}. Quillarium attaches this stable id to source_refs in code. Never propose an update to the reference itself.`
        ]
      : []),
    'Style, pacing, structure, and former strategy/pattern concepts must be proposed as one narrative card. Never create a new strategy or pattern card.'
  ].join('\n')
}

function buildIssuePlanningContext(
  docs: Array<{ path?: string; data: BaseDoc; content: string }>,
  input: PlanningChatRequest,
  projectRoot?: string
): Record<string, unknown> | null {
  const anchor = (input.proposals ?? []).find(
    (proposal) => proposal.source === 'anchor' && proposal.draft.kind === 'issue'
  )
  const issue = anchor?.target
    ? docs.find((document) => document.data.id === anchor.target?.id && document.data.type === 'issue')
    : undefined
  if (!issue) return null
  const issueData = issue.data as BaseDoc & Record<string, unknown>
  const relatedIds = new Set<string>([
    ...(Array.isArray(issueData['related_docs'])
      ? issueData['related_docs'].filter((value): value is string => typeof value === 'string')
      : []),
    ...(Array.isArray(issueData['relations'])
      ? issueData['relations']
          .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
          .map((value) => String(value['target_id'] ?? ''))
          .filter(Boolean)
      : [])
  ])
  let locallyResolved: unknown[] = []
  if (projectRoot && docs.every((document) => typeof document.path === 'string')) {
    const index = buildLocalDocumentLinkIndex(
      docs as Array<{ path: string; data: BaseDoc; content: string }>,
      projectRoot
    )
    locallyResolved = (index.forward[issue.data.id] ?? []).map((reference) => ({
      raw_reference: reference.raw_reference,
      status: reference.status,
      target_id: reference.target_id ?? null,
      candidates: reference.candidates.map((candidate) => candidate.id)
    }))
    for (const reference of index.forward[issue.data.id] ?? []) {
      if (reference.target_id) relatedIds.add(reference.target_id)
    }
  }
  const sameKind = docs
    .filter(
      (document) =>
        document.data.type === 'issue' &&
        document.data.id !== issue.data.id &&
        String((document.data as BaseDoc & Record<string, unknown>)['rule_id'] ?? '') ===
          String(issueData['rule_id'] ?? '')
    )
    .slice(0, 24)
    .map(planningContextDocument)
  return {
    anchored_issue: planningContextDocument(issue),
    same_kind_issues: sameKind,
    explicitly_related_cards: docs
      .filter((document) => relatedIds.has(document.data.id) && document.data.id !== issue.data.id)
      .slice(0, 32)
      .map(planningContextDocument),
    local_reference_resolutions: locallyResolved,
    authority_boundary:
      'Return editable proposals only. Never change the issue or related project files without explicit author confirmation.'
  }
}

function planningContextDocument(
  document: { data: BaseDoc; content: string },
  contentLimit = 4_000
): Record<string, unknown> {
  return {
    id: document.data.id,
    type: document.data.type,
    title: document.data.title,
    fields: Object.fromEntries(
      Object.entries(document.data).filter(
        ([key]) => !['id', 'type', 'schema_version', 'title', DOCUMENT_ORIGIN_FIELD].includes(key)
      )
    ),
    content: limitText(document.content, contentLimit)
  }
}

function planningSystemPrompt(
  editingExisting = false,
  module = 'planning',
  allowedKinds: readonly PlanningDocumentKind[] = CREATABLE_PLANNING_KINDS,
  extractingReference = false
): string {
  return [
    'You are Quillarium Planning Curator for structured serialized fiction.',
    `The author is working in the ${module} module. You may return only these proposal kinds: ${allowedKinds.join(', ')}.`,
    'Use the restored conversation and proposal collection to discuss, create, or revise multiple planning records in one session.',
    'Ask focused questions across multiple turns when facts are incomplete. Never pretend a file was written.',
    editingExisting
      ? 'The first proposal is the immutable session anchor: reuse its proposal id when suggesting an edit, never duplicate it, and never reorder it. New cards follow it. Keep stable project identities and never write files directly.'
      : 'Choose suitable record kinds and return every distinct card in proposals. Reuse a proposal id to revise that card; never let a later card overwrite an earlier one. Never propose canon, outline, scene, or accepted prose.',
    extractingReference
      ? 'The uploaded reference is immutable evidence, not a proposal. Extract one or more reviewable setting cards from it, keep uncertain claims tentative, and never suggest editing, replacing, or deleting the reference.'
      : '',
    'Keep claims tentative when the author has not confirmed them. Return valid JSON only and follow the requested response shape.'
  ].join('\n')
}

export function planningKindsForModule(
  module: string,
  anchorKind?: PlanningDocumentKind
): PlanningDocumentKind[] {
  const scoped = MODULE_PLANNING_KINDS[module] ?? CREATABLE_PLANNING_KINDS
  if (!MODULE_PLANNING_KINDS[module]) return anchorKind ? [anchorKind] : []
  return anchorKind && !scoped.includes(anchorKind) ? [anchorKind, ...scoped] : [...scoped]
}

function assertPlanningProposalsInModuleScope(
  proposals: PlanningProposal[],
  module: string,
  anchorKind?: PlanningDocumentKind
): void {
  const allowed = planningKindsForModule(module, anchorKind)
  const allowedSet = new Set(allowed)
  const rejected = [
    ...new Set(proposals.map((proposal) => proposal.draft.kind).filter((kind) => !allowedSet.has(kind)))
  ]
  if (!rejected.length) return
  throw new Error(
    `AI 提案超出当前“${module}”页面范围：${rejected.join('、')}。此会话只允许 ${allowed.join('、')}；越界提案未写入项目。`
  )
}

async function migratePlanningSession(root: string, value: unknown): Promise<PlanningSession> {
  if (!value || typeof value !== 'object') throw new Error('Invalid planning session snapshot.')
  const raw = value as Record<string, unknown>
  const id = String(raw['id'] ?? '')
  const module = String(raw['module'] ?? 'planning')
  const createdAt = String(raw['created_at'] ?? new Date().toISOString())
  const updatedAt = String(raw['updated_at'] ?? createdAt)
  const messages = normalizeSessionMessages(
    Array.isArray(raw['messages']) ? (raw['messages'] as PlanningChatRequest['messages']) : []
  )
  if (raw['schema_version'] === 2 && Array.isArray(raw['proposals'])) {
    const provisional: PlanningSession = {
      schema_version: 2,
      id,
      module,
      created_at: createdAt,
      updated_at: updatedAt,
      messages,
      proposal: null,
      proposals: [],
      selected_proposal_id:
        typeof raw['selected_proposal_id'] === 'string' ? raw['selected_proposal_id'] : null,
      ...(typeof raw['anchor_proposal_id'] === 'string'
        ? { anchor_proposal_id: raw['anchor_proposal_id'] }
        : {}),
      ...(isPlanningDocumentRef(raw['document']) ? { document: raw['document'] } : {}),
      ...(isPlanningSourceDocumentRef(raw['source_document'])
        ? { source_document: raw['source_document'] }
        : {})
    }
    provisional.proposals = normalizePlanningProposals(
      (raw['proposals'] as PlanningProposal[]).map((proposal) => ({
        ...proposal,
        revisions: Array.isArray(proposal.revisions) ? proposal.revisions : []
      })),
      provisional
    )
    provisional.proposals = anchorFirst(provisional.proposals, provisional.anchor_proposal_id)
    provisional.selected_proposal_id = selectExistingProposalId(
      provisional.selected_proposal_id,
      provisional.proposals
    )
    provisional.proposal =
      provisional.proposals.find((proposal) => proposal.id === provisional.selected_proposal_id)?.draft ??
      null
    return provisional
  }

  const legacyDraft = raw['proposal'] ? normalizePlanningDraft(raw['proposal'] as PlanningDraft) : null
  const document = isPlanningDocumentRef(raw['document']) ? raw['document'] : undefined
  const proposalId = document ? `anchor-${document.id}` : legacyDraft ? `proposal-${id || 'legacy'}` : null
  let target: PlanningProposal['target'] | undefined
  if (document) {
    const source = assertProjectPath(root, document.path)
    target = {
      ...document,
      expected_sha256: (await pathExists(source)) ? sha256Text(await readText(source)) : sha256Text('')
    }
  }
  const proposals: PlanningProposal[] =
    legacyDraft && proposalId
      ? [
          {
            id: proposalId,
            operation: document ? 'update' : 'create',
            source: document ? 'anchor' : 'author',
            status: 'draft',
            draft: legacyDraft,
            ...(target ? { target } : {}),
            revisions: [planningRevision(legacyDraft, document ? 'anchor' : 'author', updatedAt)]
          }
        ]
      : []
  return {
    schema_version: 2,
    id,
    module,
    created_at: createdAt,
    updated_at: updatedAt,
    messages,
    proposal: legacyDraft,
    proposals,
    selected_proposal_id: proposalId,
    ...(document ? { document, anchor_proposal_id: proposalId! } : {})
  }
}

function isPlanningDocumentRef(value: unknown): value is NonNullable<PlanningSession['document']> {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item['path'] === 'string' &&
    typeof item['id'] === 'string' &&
    PLANNING_DOCUMENT_KINDS.includes(item['type'] as PlanningDocumentKind)
  )
}

function isPlanningSourceDocumentRef(
  value: unknown
): value is NonNullable<PlanningSession['source_document']> {
  if (!isPlanningDocumentRef(value)) return false
  const item = value as unknown as Record<string, unknown>
  return (
    item['type'] === 'reference' &&
    typeof item['title'] === 'string' &&
    typeof item['expected_sha256'] === 'string' &&
    /^[a-f0-9]{64}$/u.test(item['expected_sha256'])
  )
}

async function assertPlanningSourceDocumentUnchanged(
  root: string,
  sourceDocument?: PlanningSession['source_document']
): Promise<void> {
  if (!sourceDocument) return
  const source = assertProjectPath(root, sourceDocument.path)
  if (!(await pathExists(source))) {
    throw new Error(
      `参考文档“${sourceDocument.title}”已不存在。未调用 AI，也未写入任何卡片；请重新上传后开始新会话。`
    )
  }
  const raw = await readText(source)
  const currentSha256 = sha256Text(raw)
  if (currentSha256 !== sourceDocument.expected_sha256) {
    throw new Error(
      [
        `参考文档“${sourceDocument.title}”已在会话外变化。`,
        `Expected SHA-256: ${sourceDocument.expected_sha256}`,
        `Current SHA-256: ${currentSha256}`,
        '未调用 AI，也未写入任何卡片。请核对文档后重新开始“AI 讨论生卡”。'
      ].join('\n')
    )
  }
  const parsed = await readMarkdown<Record<string, unknown>>(source)
  if (parsed.data['id'] !== sourceDocument.id || parsed.data['type'] !== 'reference') {
    throw new Error(`参考文档“${sourceDocument.title}”的稳定身份已改变。未写入任何卡片。`)
  }
}

function planningHashConflict(
  proposal: PlanningProposal,
  currentSha256: string,
  currentSource: string
): Error {
  const target = proposal.target!
  const proposedSource = [
    `title: ${proposal.draft.title}`,
    `type: ${proposal.draft.kind}`,
    JSON.stringify(proposal.draft.fields, null, 2),
    '',
    proposal.draft.content
  ].join('\n')
  const error = new Error(
    [
      `Planning card changed outside this conversation: ${target.id}.`,
      `Expected SHA-256: ${target.expected_sha256}`,
      `Current SHA-256: ${currentSha256}`,
      'No project document was written.',
      '',
      '--- current external file',
      boundedPlanningConflictPreview(currentSource),
      '+++ proposed card',
      boundedPlanningConflictPreview(proposedSource),
      '',
      'Reopen the card after reviewing this difference preview.'
    ].join('\n')
  ) as Error & {
    code: string
    expected_sha256: string
    current_sha256: string
    path: string
  }
  error.name = 'PlanningHashConflictError'
  error.code = 'PLANNING_HASH_CONFLICT'
  error.expected_sha256 = target.expected_sha256
  error.current_sha256 = currentSha256
  error.path = target.path
  return error
}

function boundedPlanningConflictPreview(value: string): string {
  const normalized = value.trim() || '(empty)'
  return normalized.length > 1_500 ? `${normalized.slice(0, 1_500)}\n… [preview truncated]` : normalized
}

function planningSessionPath(root: string, sessionId: string): string {
  if (!/^planning-[a-z0-9-]+$/i.test(sessionId)) throw new Error('Invalid planning session id.')
  return path.join(root, 'runs', 'planning', sessionId, 'session.json')
}

async function writePlanningSession(root: string, session: PlanningSession): Promise<void> {
  const file = planningSessionPath(root, session.id)
  await ensureDir(path.dirname(file))
  await writeText(file, `${JSON.stringify(session, null, 2)}\n`)
}

function uniquePlanningSessionId(): string {
  return `planning-${randomUUID()}`
}

function parseDocumentFields(kind: PlanningDocumentKind, value: Record<string, unknown>) {
  switch (kind) {
    case 'character':
      return characterSchema.parse(value)
    case 'character_relation':
      return characterRelationSchema.parse(value)
    case 'faction':
      return factionSchema.parse(value)
    case 'faction_relation':
      return factionRelationSchema.parse(value)
    case 'faction_membership':
      return factionMembershipSchema.parse(value)
    case 'world_entry':
      return worldEntrySchema.parse(value)
    case 'timeline_event':
      return timelineEventSchema.parse(value)
    case 'timeline_node':
      return timelineNodeSchema.parse(value)
    case 'location':
      return locationSchema.parse(value)
    case 'foreshadowing':
      return foreshadowingSchema.parse(value)
    case 'strategy':
      return strategySchema.parse(value)
    case 'pattern':
      return patternSchema.parse(value)
    case 'narrative':
      return narrativeSchema.parse(value)
    case 'issue':
      return issueSchema.parse(value)
    case 'reference':
      return referenceSchema.parse(value)
  }
}

function defaultStatus(kind: PlanningDocumentKind): string {
  if (kind === 'world_entry') return 'candidate'
  if (kind === 'foreshadowing') return 'planned'
  if (kind === 'issue') return 'open'
  if (kind === 'reference') return 'draft'
  return 'active'
}

function defaultEnabled(kind: PlanningDocumentKind): boolean {
  return kind !== 'world_entry' && kind !== 'narrative'
}

function withoutReservedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) => !['id', 'type', 'schema_version', 'title', 'content'].includes(key)
    )
  )
}

function normalizeMessages(messages: PlanningChatRequest['messages']) {
  return normalizeSessionMessages(messages)
    .slice(-16)
    .map((message) => ({ role: message.role, content: limitText(message.content, 6_000) }))
}

function normalizeSessionMessages(messages: PlanningChatRequest['messages']) {
  return messages
    .filter(
      (message): message is PlanningChatRequest['messages'][number] =>
        (message.role === 'author' || message.role === 'assistant') && Boolean(message.content.trim())
    )
    .map((message) => ({ role: message.role, content: message.content }))
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1] ?? trimmed
}

function limitText(value: string, max: number): string {
  return value.length <= max ? value : value.slice(value.length - max)
}

function invalidResponseError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`背景 AI 返回的建档提案无效：${detail}。请重试，或继续补充要求后再次生成。`)
}
