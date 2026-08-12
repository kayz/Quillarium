import { generateText, isAIConfigured, type AIConfig } from '@quillarium/ai'
import {
  characterSchema,
  foreshadowingSchema,
  issueSchema,
  listDocs,
  loadProject,
  locationSchema,
  patternSchema,
  readMarkdown,
  referenceSchema,
  strategySchema,
  timelineEventSchema,
  worldEntrySchema,
  type BaseDoc,
  type ProjectConfig
} from '@quillarium/core'
import { z } from 'zod/v3'
import { loadDesktopAIProfile } from './credentials.js'
import {
  PLANNING_DOCUMENT_KINDS,
  typedHandle,
  type PlanningChatRequest,
  type PlanningChatResponse,
  type PlanningDocumentKind,
  type PlanningDraft
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

interface PlanningDependencies {
  loadAIProfile: () => Promise<AIConfig>
  generate: typeof generateText
}

const defaultDependencies: PlanningDependencies = {
  loadAIProfile: () => loadDesktopAIProfile('background'),
  generate: generateText
}

export function registerPlanningHandlers(): void {
  typedHandle('planning:discuss', async (_event, root, input) => discussPlanningRecord(root, input))
  typedHandle('planning:confirm', async (_event, root, proposal) => confirmPlanningRecord(root, proposal))
}

export async function confirmPlanningRecord(root: string, proposal: PlanningDraft) {
  const normalized = normalizePlanningDraft(proposal)
  const file = await createProjectDocument(root, normalized.kind, {
    ...normalized.fields,
    title: normalized.title,
    content: normalized.content
  })
  return { path: file, document: await readMarkdown(file) }
}

export async function discussPlanningRecord(
  root: string,
  input: PlanningChatRequest,
  dependencies: PlanningDependencies = defaultDependencies
): Promise<PlanningChatResponse> {
  const messages = normalizeMessages(input.messages)
  if (!messages.some((message) => message.role === 'author')) {
    throw new Error('请先描述要建立的资料、用途或尚未确定的问题。')
  }
  const [project, docs, config] = await Promise.all([
    loadProject(root),
    listDocs<BaseDoc>(root),
    dependencies.loadAIProfile()
  ])
  if (!isAIConfigured(config)) {
    throw new Error('背景 AI 尚未配置。请返回“设置 → AI 配置 → 背景”，保存可用的模型和密钥后重试。')
  }

  const raw = await dependencies.generate(
    buildPlanningPrompt(project, docs, { ...input, messages }),
    config,
    planningSystemPrompt(),
    { responseFormat: 'json_object' }
  )
  return parsePlanningAIResponse(raw)
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
  input: PlanningChatRequest
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
    'Existing project document catalog (metadata only; do not overwrite it):',
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
    '{"message":"summary and remaining caveats","proposal":{"kind":"character | world_entry | timeline_event | location | foreshadowing | strategy | pattern | issue | reference","title":"...","fields":{},"content":"Markdown body"}}',
    '',
    'The proposal must use only fields valid for the selected kind. Markdown belongs in content, not fields.'
  ].join('\n')
}

function planningSystemPrompt(): string {
  return [
    'You are Quillarium Planning Curator for structured serialized fiction.',
    'Use the author conversation and current project catalog to help create exactly one new planning record.',
    'Ask focused questions across multiple turns when facts are incomplete. Never pretend a file was written.',
    'Choose the best record kind yourself from the allowed list. Never propose canon, outline, scene, accepted prose, or edits to existing records.',
    'Keep claims tentative when the author has not confirmed them. Return valid JSON only and follow the requested response shape.'
  ].join('\n')
}

function parseDocumentFields(kind: PlanningDocumentKind, value: Record<string, unknown>) {
  switch (kind) {
    case 'character':
      return characterSchema.parse(value)
    case 'world_entry':
      return worldEntrySchema.parse(value)
    case 'timeline_event':
      return timelineEventSchema.parse(value)
    case 'location':
      return locationSchema.parse(value)
    case 'foreshadowing':
      return foreshadowingSchema.parse(value)
    case 'strategy':
      return strategySchema.parse(value)
    case 'pattern':
      return patternSchema.parse(value)
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

function withoutReservedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) => !['id', 'type', 'schema_version', 'title', 'content'].includes(key)
    )
  )
}

function normalizeMessages(messages: PlanningChatRequest['messages']) {
  return messages
    .filter(
      (message): message is PlanningChatRequest['messages'][number] =>
        (message.role === 'author' || message.role === 'assistant') && Boolean(message.content.trim())
    )
    .slice(-16)
    .map((message) => ({ role: message.role, content: limitText(message.content, 6_000) }))
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
