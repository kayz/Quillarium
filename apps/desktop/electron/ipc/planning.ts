import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { generateText, isAIConfigured, type AIConfig } from '@quillarium/ai'
import { checkPlanningCards as runPlanningRules, type CheckIssue } from '@quillarium/checks'
import {
  DOCUMENT_ORIGIN_FIELD,
  assertCardReferencesExist,
  assertProjectPath,
  characterSchema,
  characterRelationSchema,
  createIssue,
  ensureDir,
  foreshadowingSchema,
  issueSchema,
  isEnabledPlanningCard,
  isPlanningCard,
  listDocs,
  loadProject,
  locationSchema,
  narrativeSchema,
  patternSchema,
  readMarkdown,
  readText,
  referenceSchema,
  normalizeCardRelations,
  strategySchema,
  timelineEventSchema,
  timelineNodeSchema,
  worldEntrySchema,
  writeMarkdown,
  writeText,
  type BaseDoc,
  type DocumentIdentity,
  type IssueDoc,
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
  type PlanningSession,
  type PlanningCheckSummary,
  type PlanningSessionUpdate
} from './contract.js'
import { createProjectDocument } from './project.js'

const planningKindSchema = z.enum(PLANNING_DOCUMENT_KINDS)
const rawDraftSchema = z
  .object({
    kind: planningKindSchema,
    title: z.string().trim().min(1),
    fields: z.record(z.unknown()).default({}),
    content: z.string().default('')
  })
  .strict()
const responseSchema = z
  .object({
    message: z.string().trim().min(1),
    proposal: rawDraftSchema.nullable().optional()
  })
  .strict()

const aiPlanningFindingSchema = z
  .object({
    category: z.enum([
      'contradiction',
      'timeline',
      'spatial',
      'character',
      'world',
      'foreshadowing',
      'narrative',
      'outline',
      'other'
    ]),
    severity: z.enum(['error', 'warning', 'info']).default('warning'),
    title: z.string().trim().min(1).max(160),
    message: z.string().trim().min(1).max(1_000),
    evidence: z.string().trim().max(1_500).default(''),
    related_ids: z.array(z.string().min(1)).min(1).max(12)
  })
  .strict()

const aiPlanningResponseSchema = z
  .object({ issues: z.array(aiPlanningFindingSchema).max(16).default([]) })
  .strict()

interface PlanningDependencies {
  loadAIProfile: () => Promise<AIConfig>
  generate: typeof generateText
}

const defaultDependencies: PlanningDependencies = {
  loadAIProfile: () => loadDesktopAIProfile('background'),
  generate: generateText
}

export interface PlanningCheckDependencies {
  runRules: typeof runPlanningRules
  loadAIProfile: () => Promise<AIConfig>
  isAIConfigured: typeof isAIConfigured
  generate: typeof generateText
  now: () => Date
}

const defaultCheckDependencies: PlanningCheckDependencies = {
  runRules: runPlanningRules,
  loadAIProfile: () => loadDesktopAIProfile('check'),
  isAIConfigured,
  generate: generateText,
  now: () => new Date()
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
  typedHandle('planning:check', async (_event, root, language) => runPlanningCheck(root, language))
}

interface PersistablePlanningFinding {
  code: string
  severity: 'error' | 'warning' | 'info'
  title: string
  message: string
  evidence: string
  related_ids: string[]
  source: 'rule' | 'ai'
}

export async function runPlanningCheck(
  root: string,
  language: 'zh' | 'en',
  dependencies: PlanningCheckDependencies = defaultCheckDependencies
): Promise<PlanningCheckSummary> {
  const [ruleReport, documents, config] = await Promise.all([
    dependencies.runRules(root),
    listDocs<DocumentIdentity>(root),
    dependencies.loadAIProfile()
  ])
  const candidates = documents.filter(
    (document) =>
      document.data.type === 'outline' ||
      (isPlanningCard(document.data) &&
        document.data.type !== 'issue' &&
        isEnabledPlanningCard(document.data))
  )
  if (candidates.length > 0 && !dependencies.isAIConfigured(config)) {
    throw new Error(
      language === 'zh'
        ? '检查 AI 尚未配置。请先在“设置 → AI 配置 → 检查”中保存可用模型和密钥。'
        : 'The check AI is not configured. Configure a model and key under Settings → AI → Check.'
    )
  }

  const validIds = new Set(documents.map((document) => document.data.id))
  const aiFindings: PersistablePlanningFinding[] = []
  for (const prompt of buildPlanningCheckPrompts(candidates, language)) {
    const raw = await dependencies.generate(
      prompt,
      config,
      'You are Quillarium Planning Integrity Checker. Return strict JSON only and never invent a document ID.',
      { responseFormat: 'json_object', timeoutMs: 90_000 }
    )
    for (const finding of parsePlanningCheckAIResponse(raw)) {
      const relatedIds = [...new Set(finding.related_ids)].filter((id) => validIds.has(id))
      if (!relatedIds.length) continue
      aiFindings.push({
        code: `ai-planning-${finding.category}`,
        severity: finding.severity,
        title: finding.title,
        message: finding.message,
        evidence: finding.evidence,
        related_ids: relatedIds,
        source: 'ai'
      })
    }
  }

  const ruleFindings = ruleReport.issues.map((issue) => localizeRuleFinding(issue, documents, language))
  const checkedAt = dependencies.now().toISOString()
  const persisted = await persistPlanningIssues(root, [...ruleFindings, ...aiFindings], checkedAt)
  return {
    generated_at: checkedAt,
    checked_cards: candidates.length,
    skipped_disabled: ruleReport.skipped_disabled_ids.length,
    rule_findings: ruleFindings.length,
    ai_findings: aiFindings.length,
    created_issue_ids: persisted.created,
    updated_issue_ids: persisted.updated
  }
}

export function buildPlanningCheckPrompts(
  documents: Array<{ data: DocumentIdentity; content: string }>,
  language: 'zh' | 'en',
  batchSize = 48
): string[] {
  if (!documents.length) return []
  const index = documents.map((document) => ({
    id: document.data.id,
    type: document.data.type,
    title: document.data.title
  }))
  const prompts: string[] = []
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    const batch = documents.slice(offset, offset + batchSize).map((document) => ({
      id: document.data.id,
      type: document.data.type,
      title: document.data.title,
      fields: compactPlanningValue(
        Object.fromEntries(
          Object.entries(document.data).filter(
            ([key]) => !['id', 'type', 'schema_version', 'title', 'quillarium_origin'].includes(key)
          )
        )
      ),
      body_excerpt: limitText(document.content.trim(), 1_600)
    }))
    prompts.push(
      [
        `Output language: ${language === 'zh' ? 'Simplified Chinese' : 'English'}.`,
        `Batch ${Math.floor(offset / batchSize) + 1} of ${Math.ceil(documents.length / batchSize)}.`,
        'Review only real inconsistencies or missing planning decisions involving at least one card in this batch.',
        'Check causal contradictions, timeline order, spatial hierarchy/layout, character lifespan and relationship timing, world-knowledge triggers, foreshadowing reminders, narrative-rule conflicts, and outline/card alignment.',
        'Reference-material bodies, disabled cards, and existing issue cards are intentionally absent. Do not report their absence.',
        'Use only exact IDs from the project index. Do not create or guess an ID. Omit reassurance and stylistic preferences that are not conflicts.',
        'Return: {"issues":[{"category":"contradiction|timeline|spatial|character|world|foreshadowing|narrative|outline|other","severity":"error|warning|info","title":"short title","message":"actionable finding","evidence":"specific conflicting facts","related_ids":["existing-id"]}]}',
        '',
        'Project card index:',
        JSON.stringify(index),
        '',
        'Cards under review:',
        JSON.stringify(batch, null, 2)
      ].join('\n')
    )
  }
  return prompts
}

export function parsePlanningCheckAIResponse(raw: string): z.infer<typeof aiPlanningFindingSchema>[] {
  let value: unknown
  try {
    value = JSON.parse(stripCodeFence(raw))
  } catch (error) {
    throw new Error(
      `Planning AI check returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  const parsed = aiPlanningResponseSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      `Planning AI check returned invalid fields: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`)
        .join('; ')}`
    )
  }
  return parsed.data.issues
}

async function persistPlanningIssues(
  root: string,
  findings: PersistablePlanningFinding[],
  checkedAt: string
): Promise<{ created: string[]; updated: string[] }> {
  const [existingIssues, documents] = await Promise.all([
    listDocs<IssueDoc>(root, 'issue'),
    listDocs<DocumentIdentity>(root)
  ])
  const validIds = new Set(documents.map((document) => document.data.id))
  const unique = new Map<string, PersistablePlanningFinding>()
  for (const finding of findings) {
    const fingerprint = planningFindingFingerprint(finding)
    if (!unique.has(fingerprint)) unique.set(fingerprint, finding)
  }
  const created: string[] = []
  const updated: string[] = []

  for (const [fingerprint, finding] of unique) {
    const relatedIds = [...new Set(finding.related_ids)].filter((id) => validIds.has(id))
    const generatedRelations = relatedIds.map((target_id) => ({
      kind: 'involves' as const,
      target_id,
      note: finding.source === 'ai' ? 'AI planning check' : 'Planning rule check'
    }))
    const existing = existingIssues.find((issue) => issue.data.check_fingerprint === fingerprint)
    const priority = finding.severity === 'error' ? 'high' : finding.severity === 'warning' ? 'medium' : 'low'
    if (existing) {
      const next = issueSchema.parse({
        ...existing.data,
        status: 'open',
        state: 'open',
        enabled: true,
        tags: [...new Set([...(existing.data.tags ?? []), 'ai-check', finding.code])],
        relations: normalizeCardRelations([...(existing.data.relations ?? []), ...generatedRelations]),
        priority,
        decision_needed: finding.message,
        related_docs: relatedIds,
        rule_id: finding.code,
        evidence: finding.evidence,
        check_fingerprint: fingerprint,
        checked_at: checkedAt
      })
      await writeMarkdown(existing.path, next as unknown as Record<string, unknown>, existing.content)
      updated.push(existing.data.id)
      continue
    }

    const file = await createIssue(
      root,
      finding.title,
      {
        status: 'open',
        state: 'open',
        enabled: true,
        tags: ['ai-check', finding.code],
        relations: generatedRelations,
        priority,
        decision_needed: finding.message,
        related_docs: relatedIds,
        rule_id: finding.code,
        evidence: finding.evidence,
        check_fingerprint: fingerprint,
        checked_at: checkedAt
      },
      [`## ${finding.title}`, '', finding.message, finding.evidence ? `\n> ${finding.evidence}` : '']
        .filter(Boolean)
        .join('\n')
    )
    const createdIssue = await readMarkdown<Record<string, unknown>>(file)
    const createdId = createdIssue.data['id']
    if (typeof createdId !== 'string') throw new Error(`Created issue has no id: ${file}`)
    created.push(createdId)
  }

  return { created, updated }
}

function localizeRuleFinding(
  issue: CheckIssue,
  documents: Array<{ data: DocumentIdentity }>,
  language: 'zh' | 'en'
): PersistablePlanningFinding {
  const relatedIds = [...new Set(issue.related_ids ?? [])]
  const names = relatedIds
    .map((id) => documents.find((document) => document.data.id === id)?.data.title ?? id)
    .filter(Boolean)
  const primary = names[0] ?? relatedIds[0] ?? (language === 'zh' ? '当前项目' : 'Current project')
  if (language === 'en') {
    return {
      code: issue.code,
      severity: issue.severity,
      title: `${humanizeRuleCode(issue.code)}: ${primary}`,
      message: issue.message,
      evidence: issue.evidence ?? '',
      related_ids: relatedIds,
      source: 'rule'
    }
  }

  const localized = chineseRuleCopy(issue.code, primary, names[1])
  return {
    code: issue.code,
    severity: issue.severity,
    title: localized.title,
    message: localized.message,
    evidence: localizeRuleEvidence(issue.evidence),
    related_ids: relatedIds,
    source: 'rule'
  }
}

function chineseRuleCopy(
  code: string,
  primary: string,
  secondary?: string
): { title: string; message: string } {
  const target = secondary ? `“${secondary}”` : '目标内容'
  switch (code) {
    case 'planning-missing-source-reference':
      return {
        title: `来源材料失效：${primary}`,
        message: `“${primary}”引用的来源材料不存在或不是参考材料，请重新选择现有参考材料。`
      }
    case 'planning-missing-relation-target':
      return {
        title: `卡片关系失效：${primary}`,
        message: `“${primary}”指向的${target}不存在，请删除该关系或改选现有卡片。`
      }
    case 'planning-self-relation':
      return {
        title: `卡片指向自身：${primary}`,
        message: `“${primary}”建立了指向自身的关系，请确认是否误选。`
      }
    case 'planning-isolated-card':
      return {
        title: `孤立卡片：${primary}`,
        message: `“${primary}”没有来源材料、卡片关系或类型关系，请补充关联或确认它确实应当独立。`
      }
    case 'planning-event-without-time-node':
      return {
        title: `事件尚未挂接时间：${primary}`,
        message: `“${primary}”没有所属时间节点，请选择至少精确到月的现有时间节点。`
      }
    case 'planning-character-time-order':
      return {
        title: `人物时间顺序冲突：${primary}`,
        message: `“${primary}”的出生、出场、退场或死亡顺序互相冲突，请核对对应时间节点。`
      }
    case 'planning-character-relation-time-order':
      return {
        title: `人物关系时间冲突：${primary}`,
        message: `“${primary}”的结束时间早于开始时间，请调整关系持续区间。`
      }
    case 'planning-layout-without-position':
      return {
        title: `布局缺少定位：${primary}`,
        message: `布局卡“${primary}”没有解释任何定位卡，请选择它对应的地点定位。`
      }
    case 'planning-position-has-layout-target':
      return {
        title: `定位卡类型不一致：${primary}`,
        message: `定位卡“${primary}”不应填写“解释的定位”，请改为布局卡或移除该关系。`
      }
    case 'planning-layout-target-not-position':
      return {
        title: `布局目标类型错误：${primary}`,
        message: `布局卡“${primary}”指向了另一张布局卡，请改选定位卡。`
      }
    case 'planning-location-scale-order':
      return {
        title: `地点层级倒置：${primary}`,
        message: `“${primary}”的上级地点尺度反而更小，请调整全球、地区、城市、街区、宅院、室内层级。`
      }
    case 'planning-world-entry-without-trigger':
      return {
        title: `世界书缺少触发词：${primary}`,
        message: `已启用的世界书“${primary}”没有关键词，生成时无法按正文内容自动激活。`
      }
    case 'planning-foreshadowing-without-trigger':
      return {
        title: `伏笔缺少提醒条件：${primary}`,
        message: `伏笔“${primary}”没有时间、故事节点、关键词或卡片启用条件，系统无法适时提醒作者。`
      }
    case 'planning-empty-narrative-card':
      return {
        title: `叙事卡内容为空：${primary}`,
        message: `已启用的叙事卡“${primary}”没有原则、样例或正文，请补充内容后再启用。`
      }
    default:
      if (code.includes('timeline')) {
        return {
          title: `时间主链需要修复：${primary}`,
          message: `时间主链在“${primary}”附近存在重复、断链、环路或先后倒置，请使用时间线编辑工具修复。`
        }
      }
      return {
        title: `规划完整性待确认：${primary}`,
        message: `“${primary}”触发了规则“${code}”，请检查相关卡片和结构。`
      }
  }
}

function localizeRuleEvidence(evidence?: string): string {
  if (!evidence) return ''
  const field = evidence.match(/^Field:\s*(.+)$/i)?.[1]
  if (!field) return evidence
  const labels: Record<string, string> = {
    source_refs: '来源材料',
    relations: '卡片关系',
    links: '关联卡片',
    timeline_node: '所属时间节点',
    parent_location: '上级地点',
    layout_of: '解释的定位',
    related_docs: '关联资料'
  }
  return `涉及属性：${labels[field] ?? '类型化关联'}`
}

function planningFindingFingerprint(finding: PersistablePlanningFinding): string {
  const related = [...finding.related_ids].sort().join(',')
  const semanticKey = finding.source === 'ai' ? finding.title.toLowerCase().replace(/\s+/g, ' ').trim() : ''
  return createHash('sha256').update(`${finding.code}\0${related}\0${semanticKey}`).digest('hex')
}

function humanizeRuleCode(code: string): string {
  return code
    .replace(/^planning-/, '')
    .replaceAll('-', ' ')
    .replace(/^./, (character) => character.toUpperCase())
}

function compactPlanningValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return limitText(value, 700)
  if (typeof value !== 'object' || value === null) return value
  if (depth >= 4) return '[nested value omitted]'
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => compactPlanningValue(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 48)
      .map(([key, item]) => [key, compactPlanningValue(item, depth + 1)])
  )
}

export async function startPlanningSession(
  root: string,
  module: string,
  documentId?: string
): Promise<PlanningSession> {
  const now = new Date().toISOString()
  const session: PlanningSession = {
    schema_version: 1,
    id: uniquePlanningSessionId(),
    module: module.trim() || 'planning',
    created_at: now,
    updated_at: now,
    messages: [],
    proposal: null
  }
  if (documentId) {
    const document = (await listDocs<BaseDoc>(root)).find((item) => item.data.id === documentId)
    if (!document) throw new Error(`Planning card not found: ${documentId}`)
    if (!PLANNING_DOCUMENT_KINDS.includes(document.data.type as PlanningDocumentKind)) {
      throw new Error(
        `This document type cannot be edited in the planning conversation: ${document.data.type}`
      )
    }
    const kind = document.data.type as PlanningDocumentKind
    session.proposal = normalizePlanningDraft({
      kind,
      title: document.data.title,
      fields: Object.fromEntries(
        Object.entries(document.data).filter(
          ([key]) => !['id', 'type', 'schema_version', 'title', DOCUMENT_ORIGIN_FIELD].includes(key)
        )
      ),
      content: document.content
    })
    session.document = { path: document.path, id: document.data.id, type: kind }
  }
  await writePlanningSession(root, session)
  return session
}

export async function loadPlanningSession(root: string, sessionId: string): Promise<PlanningSession> {
  return JSON.parse(await readText(planningSessionPath(root, sessionId))) as PlanningSession
}

export async function savePlanningSession(
  root: string,
  sessionId: string,
  update: PlanningSessionUpdate
): Promise<PlanningSession> {
  const session = await loadPlanningSession(root, sessionId)
  session.messages = normalizeSessionMessages(update.messages)
  session.proposal = update.proposal ? normalizePlanningDraft(update.proposal) : null
  session.updated_at = new Date().toISOString()
  await writePlanningSession(root, session)
  return session
}

export async function confirmPlanningRecord(root: string, input: PlanningConfirmRequest) {
  let session = await savePlanningSession(root, input.sessionId, input)
  const normalized = normalizePlanningDraft(input.proposal)
  const validationCandidate = parseDocumentFields(normalized.kind, {
    id: session.document?.id ?? 'planning-preview',
    type: normalized.kind,
    schema_version: 1,
    title: normalized.title,
    status: defaultStatus(normalized.kind),
    tags: [],
    enabled: defaultEnabled(normalized.kind),
    ...normalized.fields
  })
  await assertCardReferencesExist(
    validationCandidate as unknown as DocumentIdentity,
    await listDocs<DocumentIdentity>(root)
  )
  let file: string
  if (session.document) {
    file = assertProjectPath(root, session.document.path)
    if (session.document.type !== normalized.kind) {
      throw new Error('An existing AI-created card cannot change document type during editing.')
    }
    const current = await readMarkdown<Record<string, unknown>>(file)
    const parsed = parseDocumentFields(normalized.kind, {
      ...current.data,
      ...normalized.fields,
      id: current.data.id,
      type: current.data.type,
      schema_version: current.data.schema_version,
      title: normalized.title,
      [DOCUMENT_ORIGIN_FIELD]: {
        schema_version: 1,
        kind: 'ai-conversation',
        session_id: session.id,
        created_at: session.created_at,
        updated_at: new Date().toISOString()
      }
    })
    await writeMarkdown(
      file,
      {
        ...parsed,
        [DOCUMENT_ORIGIN_FIELD]: {
          schema_version: 1,
          kind: 'ai-conversation',
          session_id: session.id,
          created_at: session.created_at,
          updated_at: new Date().toISOString()
        }
      },
      normalized.content
    )
  } else {
    file = await createProjectDocument(root, normalized.kind, {
      ...normalized.fields,
      title: normalized.title,
      content: normalized.content
    })
    const current = await readMarkdown<Record<string, unknown>>(file)
    await writeMarkdown(
      file,
      {
        ...current.data,
        [DOCUMENT_ORIGIN_FIELD]: {
          schema_version: 1,
          kind: 'ai-conversation',
          session_id: session.id,
          created_at: session.created_at,
          updated_at: new Date().toISOString()
        }
      },
      current.content
    )
  }
  const document = await readMarkdown<Record<string, unknown>>(file)
  session = {
    ...session,
    proposal: normalized,
    document: { path: file, id: String(document.data.id), type: normalized.kind },
    updated_at: new Date().toISOString()
  }
  await writePlanningSession(root, session)
  return { path: file, document }
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

  const raw = await dependencies.generate(
    buildPlanningPrompt(project, docs, { ...input, messages }, Boolean(session?.document)),
    config,
    planningSystemPrompt(Boolean(session?.document)),
    { responseFormat: 'json_object' }
  )
  const response = parsePlanningAIResponse(raw)
  if (input.sessionId) {
    await savePlanningSession(root, input.sessionId, {
      messages: [...sessionMessages, { role: 'assistant', content: response.message }],
      proposal: response.proposal ?? input.proposal ?? null
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
    return {
      message: result.data.message,
      proposal: result.data.proposal ? normalizePlanningDraft(result.data.proposal) : null
    }
  } catch (error) {
    throw invalidResponseError(error)
  }
}

export function normalizePlanningDraft(proposal: PlanningDraft): PlanningDraft {
  const raw = rawDraftSchema.parse(proposal)
  const base = {
    id: 'planning-preview',
    type: raw.kind,
    schema_version: 1,
    title: raw.title,
    status: defaultStatus(raw.kind),
    tags: [],
    enabled: defaultEnabled(raw.kind),
    ...withoutReservedFields(raw.fields)
  }
  const parsed = parseDocumentFields(raw.kind, base)
  const fields = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => !['id', 'type', 'schema_version', 'title'].includes(key))
  )
  return { kind: raw.kind, title: raw.title, fields, content: raw.content }
}

export function buildPlanningPrompt(
  project: ProjectConfig,
  docs: Array<{ data: BaseDoc; content: string }>,
  input: PlanningChatRequest,
  editingExisting = false
): string {
  const recentMessages = normalizeMessages(input.messages)
  const catalog = docs.slice(0, 80).map((doc) => ({
    id: doc.data.id,
    type: doc.data.type,
    title: doc.data.title,
    status: doc.data.status
  }))
  return [
    `Current project: ${project.title}`,
    `Genre: ${project.genre}`,
    `Planning module opened by the author: ${limitText(input.module, 80)}`,
    '',
    editingExisting
      ? 'Existing project document catalog (metadata only; edit only the card linked to this conversation):'
      : 'Existing project document catalog (metadata only; do not overwrite it):',
    JSON.stringify(catalog, null, 2),
    '',
    'Current editable proposal, if any:',
    input.proposal ? JSON.stringify(normalizePlanningDraft(input.proposal), null, 2) : 'null',
    '',
    'Conversation:',
    recentMessages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n'),
    '',
    'Respond with one JSON object only:',
    '{"message":"your next helpful reply","proposal":null}',
    'or, once enough information is available:',
    '{"message":"summary and remaining caveats","proposal":{"kind":"character | character_relation | world_entry | timeline_node | timeline_event | location | foreshadowing | narrative | issue | reference","title":"...","fields":{},"content":"Markdown body"}}',
    '',
    'The proposal must use only fields valid for the selected kind. Markdown belongs in content, not fields.',
    'For source_refs, relations, timeline_node, character endpoints, locations, and other links, use only exact IDs from the project catalog. Never invent a related card ID.',
    'Reference documents are source material, not fact cards: do not copy their full body into another card and never assign them a lifecycle status.',
    'Style, pacing, structure, and former strategy/pattern concepts must be proposed as one narrative card. Never create a new strategy or pattern card.'
  ].join('\n')
}

function planningSystemPrompt(editingExisting = false): string {
  return [
    'You are Quillarium Planning Curator for structured serialized fiction.',
    editingExisting
      ? 'Use the restored conversation and current proposal to revise exactly one existing planning record.'
      : 'Use the author conversation and current project catalog to help create exactly one new planning record.',
    'Ask focused questions across multiple turns when facts are incomplete. Never pretend a file was written.',
    editingExisting
      ? 'Keep the existing record kind. Never propose canon, outline, scene, accepted prose, or edits to any other record.'
      : 'Choose the best record kind yourself from the allowed list. Never propose canon, outline, scene, accepted prose, or edits to existing records.',
    'Keep claims tentative when the author has not confirmed them. Return valid JSON only and follow the requested response shape.'
  ].join('\n')
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
