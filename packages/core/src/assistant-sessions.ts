import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { z } from 'zod'
import {
  agentOperationSchema,
  agentResultTypeSchema,
  agentTaskDefinitionV1Schema,
  getAgentTaskDefinition,
  type AgentTaskId,
  type AgentTaskDefinitionV1
} from './agent-tasks.js'
import type { AssistantContextTarget, ResolvedContextBundle } from './assistant-context.js'
import {
  bundleDocumentTypeSchema,
  contextBundleV1Schema,
  loadContextBundle,
  updateContextBundle,
  type ContextBundleV1
} from './context-bundles.js'
import {
  creatorRoleV1Schema,
  loadCreatorRole,
  updateCreatorRole,
  type CreatorRoleV1
} from './creator-roles.js'
import { ensureDir, pathExists, readText, writeMarkdown, writeText } from './fs.js'
import { explorationDocV1Schema } from './explorations.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { projectIdSchema } from './schema.js'
import type { ContextTrace, PromptBlock, WritingPresetSnapshot } from './types.js'
import { canonicalJson, sha256Text, StaleProjectWriteError } from './versioned-yaml-store.js'
import {
  applyConfigurationChangePlan,
  configurationChangePlanV1Schema,
  planContextBundleChange,
  planCreatorRoleChange,
  type ConfigurationChangePlanV1
} from './assistant-config-proposals.js'
import {
  assertWritingPresetSnapshot,
  loadWritingPreset,
  PROMPT_BLOCK_KINDS,
  writingPresetV2Schema
} from './writing-presets.js'
import {
  assistantPromptVersionV1Schema,
  creatorAssistantIdForTask,
  ensureBuiltinAssistantPrompts,
  listAssistantPromptVersions,
  loadAssistantPromptVersion
} from './assistant-prompts.js'
import {
  creatorAssistantWorkflowInputV1Schema,
  type CreatorAssistantWorkflowInputV1
} from './assistant-workflows.js'

const portableShaSchema = z.string().regex(/^[a-f0-9]{64}$/u)
const isoDateSchema = z.string().datetime()
const agentTargetSchema = z
  .object({
    document_type: z.union([bundleDocumentTypeSchema, z.literal('project')]),
    document_id: z.string().min(1)
  })
  .strict()

export const promptBlockSnapshotSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(PROMPT_BLOCK_KINDS),
    role: z.enum(['system', 'user']),
    title: z.string(),
    content: z.string(),
    content_sha256: portableShaSchema,
    source: z
      .object({
        type: z.string().min(1),
        id: z.string().min(1),
        path: z
          .string()
          .min(1)
          .refine(
            (value) => !path.isAbsolute(value) && !value.replace(/\\/gu, '/').split('/').includes('..'),
            'PromptBlock source path must be project-relative and contained'
          )
          .optional()
      })
      .strict(),
    scope: z.string().min(1),
    purpose: z.string().min(1),
    authority: z.enum(['system', 'accepted_prose', 'hard_canon', 'project', 'advisory']),
    authority_rank: z.number().finite(),
    priority: z.number().finite(),
    order: z.number().finite(),
    token_count: z.number().int().nonnegative(),
    original_token_count: z.number().int().nonnegative(),
    tokenizer_id: z.string().min(1),
    retained_token_range: z
      .object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
      .strict(),
    truncated: z.boolean(),
    truncation: z.enum(['none', 'head', 'tail']),
    selection_reason: z.string().min(1),
    trigger_chain: z.array(z.string())
  })
  .strict()

const contextPolicySnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    token_budget: z.number().int().positive(),
    max_block_tokens: z.number().int().positive(),
    min_truncated_block_tokens: z.number().int().positive(),
    max_candidates: z.number().int().positive(),
    max_recursion_depth: z.number().int().nonnegative()
  })
  .strict()

const contextTraceEntrySnapshotSchema = z
  .object({
    block_id: z.string().min(1),
    source_type: z.string().min(1),
    source_id: z.string().min(1),
    source_path: z
      .string()
      .min(1)
      .refine(
        (value) => !path.isAbsolute(value) && !value.replace(/\\/gu, '/').split('/').includes('..'),
        'ContextTrace source path must be project-relative and contained'
      )
      .optional(),
    authority: z.enum(['system', 'accepted_prose', 'hard_canon', 'project', 'advisory']),
    authority_rank: z.number().finite(),
    priority: z.number().finite(),
    required: z.boolean().optional(),
    outcome: z.enum(['included', 'excluded', 'truncated']),
    reason: z.string().min(1),
    trigger_chain: z.array(z.string()),
    token_count: z.number().int().nonnegative(),
    original_token_count: z.number().int().nonnegative(),
    content_sha256: portableShaSchema,
    tokenizer_id: z.string().min(1),
    retained_token_range: z
      .object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
      .strict()
  })
  .strict()

export const contextTraceSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    compiler_version: z.string().min(1),
    target: z.object({ type: z.enum(['outline', 'scene', 'assistant']), id: z.string().min(1) }).strict(),
    preset: z
      .object({
        id: projectIdSchema,
        version: z.string().min(1),
        snapshot_sha256: portableShaSchema
      })
      .strict()
      .optional(),
    policy: contextPolicySnapshotSchema,
    tokenizer: z
      .object({
        id: z.string().min(1),
        provider: z.string().min(1),
        model: z.string().min(1),
        exact: z.literal(true),
        source_revision: z.string().min(1),
        source_sha256: z.string().min(1),
        vocabulary_sha256: z.string().min(1)
      })
      .strict(),
    budget: z
      .object({
        total_token_budget: z.number().int().positive(),
        reserved_output_tokens: z.number().int().nonnegative(),
        framing_tokens: z.number().int().nonnegative(),
        available_input_tokens: z.number().int().positive(),
        selected_tokens: z.number().int().nonnegative(),
        unused_input_tokens: z.number().int().nonnegative(),
        token_budget: z.number().int().positive(),
        used_tokens: z.number().int().nonnegative(),
        remaining_tokens: z.number().int().nonnegative()
      })
      .strict(),
    candidates: z
      .object({
        discovered: z.number().int().nonnegative(),
        eligible: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        max_recursion_depth: z.number().int().nonnegative(),
        reached_recursion_depth: z.number().int().nonnegative()
      })
      .strict(),
    entries: z.array(contextTraceEntrySnapshotSchema),
    final_block_ids: z.array(z.string().min(1))
  })
  .strict()

export const agentConversationMessageV1Schema = z
  .object({
    role: z.enum(['author', 'assistant']),
    content: z.string()
  })
  .strict()

export const agentWireMessageV1Schema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string()
  })
  .strict()

export const agentPromptEnvelopeV1Schema = z
  .object({
    schema_version: z.literal(1),
    system_message: z.string().min(1),
    user_instructions: z.array(z.string().min(1)),
    context_markdown: z.string(),
    conversation: z.array(agentConversationMessageV1Schema),
    current_input: z.string().min(1),
    compiled_user_content: z.string().min(1),
    sent_user_content: z.string().min(1),
    messages: z.array(agentWireMessageV1Schema).min(2),
    compiled_prompt_sha256: portableShaSchema,
    sent_prompt_sha256: portableShaSchema,
    manually_edited: z.boolean(),
    created_at: isoDateSchema
  })
  .strict()
  .superRefine((envelope, context) => {
    if (sha256Text(envelope.compiled_user_content) !== envelope.compiled_prompt_sha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['compiled_prompt_sha256'],
        message: 'Compiled prompt hash does not match compiled_user_content'
      })
    }
    if (sha256Text(envelope.sent_user_content) !== envelope.sent_prompt_sha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sent_prompt_sha256'],
        message: 'Sent prompt hash does not match sent_user_content'
      })
    }
    if (envelope.manually_edited !== (envelope.compiled_user_content !== envelope.sent_user_content)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['manually_edited'],
        message: 'manually_edited does not match the compiled and sent content'
      })
    }
    const expectedMessages = [
      { role: 'system', content: envelope.system_message },
      ...envelope.conversation.map((message) => ({
        role: message.role === 'author' ? 'user' : 'assistant',
        content: message.content
      })),
      { role: 'user', content: envelope.sent_user_content }
    ]
    if (canonicalJson(envelope.messages) !== canonicalJson(expectedMessages)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messages'],
        message: 'Wire messages do not match the exact system, conversation, and sent content'
      })
    }
  })

export type AgentPromptEnvelopeV1 = z.infer<typeof agentPromptEnvelopeV1Schema>

export const assistantProposalV1Schema = z
  .object({
    id: projectIdSchema,
    kind: z.enum(['planning_record', 'issue']),
    title: z.string().min(1),
    document_type: z.enum([
      'character',
      'character_relation',
      'character_state',
      'world_entry',
      'timeline_node',
      'timeline_event',
      'location',
      'foreshadowing',
      'narrative',
      'issue',
      'reference'
    ]),
    fields: z.record(z.unknown()).default({}),
    content: z.string().default(''),
    rationale: z.string().min(1),
    status: z.enum(['pending', 'applied', 'rejected']).default('pending'),
    applied_document_id: z.string().min(1).optional()
  })
  .strict()

export const assistantTurnOutputV1Schema = z
  .object({
    reply: z.string().min(1),
    candidate: z
      .object({
        title: z.string().min(1),
        content: z.string().min(1)
      })
      .strict()
      .nullable()
      .default(null),
    exploration: z
      .object({
        summary: z.string().min(1),
        open_questions: z.array(z.string().min(1)).default([])
      })
      .strict(),
    proposals: z
      .array(
        assistantProposalV1Schema
          .omit({ status: true, applied_document_id: true })
          .extend({ id: projectIdSchema.optional() })
      )
      .default([]),
    configuration_proposals: z
      .array(
        z
          .object({
            id: projectIdSchema.optional(),
            target_kind: z.enum(['creator_role', 'context_bundle']),
            target_id: projectIdSchema,
            proposed: z.union([creatorRoleV1Schema, contextBundleV1Schema]),
            rationale: z.string().min(1)
          })
          .strict()
      )
      .default([])
  })
  .strict()

export type AssistantProposalV1 = z.infer<typeof assistantProposalV1Schema>
export const assistantProposalDocumentTypes = assistantProposalV1Schema.shape.document_type.options
export type AssistantTurnOutputV1 = z.infer<typeof assistantTurnOutputV1Schema>
export type AssistantTurnOutputInputV1 = z.input<typeof assistantTurnOutputV1Schema>

export const assistantConfigurationProposalV1Schema = z
  .object({
    id: projectIdSchema,
    rationale: z.string().min(1),
    plan: configurationChangePlanV1Schema,
    status: z.enum(['pending', 'applied', 'rejected']),
    applied_at: isoDateSchema.optional()
  })
  .strict()

export type AssistantConfigurationProposalV1 = z.infer<typeof assistantConfigurationProposalV1Schema>

export const agentConfigurationSnapshotV1Schema = z
  .object({
    schema_version: z.literal(1),
    task: agentTaskDefinitionV1Schema,
    creator_role: creatorRoleV1Schema,
    creator_role_sha256: portableShaSchema,
    context_bundle: contextBundleV1Schema,
    context_bundle_sha256: portableShaSchema,
    writing_preset: writingPresetV2Schema,
    writing_preset_sha256: portableShaSchema,
    assistant_prompt: assistantPromptVersionV1Schema.optional(),
    assistant_prompt_sha256: portableShaSchema.optional(),
    effective_operations: z.array(agentOperationSchema),
    output_disposition: agentResultTypeSchema,
    snapshot_sha256: portableShaSchema
  })
  .strict()
  .superRefine((configuration, context) => {
    if (configuration.creator_role.task_id !== configuration.task.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['creator_role', 'task_id'],
        message: 'Creator role and Agent task do not match'
      })
    }
    if (configuration.creator_role.context_bundle_id !== configuration.context_bundle.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['context_bundle', 'id'],
        message: 'Creator role and ContextBundle do not match'
      })
    }
    if (configuration.creator_role.writing_preset_id !== configuration.writing_preset.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['writing_preset', 'id'],
        message: 'Creator role and WritingPreset do not match'
      })
    }
    if (
      canonicalJson(configuration.creator_role.enabled_operations) !==
      canonicalJson(configuration.effective_operations)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effective_operations'],
        message: 'Effective operations must equal the frozen creator-role operations'
      })
    }
    if (configuration.creator_role.output_disposition !== configuration.output_disposition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output_disposition'],
        message: 'Output disposition must equal the frozen creator-role output disposition'
      })
    }
    if (Boolean(configuration.assistant_prompt) !== Boolean(configuration.assistant_prompt_sha256)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistant_prompt'],
        message: 'Assistant prompt snapshot and hash must be present together'
      })
    }
    if (
      configuration.assistant_prompt &&
      configuration.assistant_prompt.assistant_id !== creatorAssistantIdForTask(configuration.task.id)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assistant_prompt', 'assistant_id'],
        message: 'Assistant prompt belongs to a different assistant task'
      })
    }
  })

export type AgentConfigurationSnapshotV1 = z.infer<typeof agentConfigurationSnapshotV1Schema>

export const agentSessionV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    title: z.string().min(1),
    status: z.enum(['active', 'archived']),
    target: agentTargetSchema,
    workflow_input: creatorAssistantWorkflowInputV1Schema.optional(),
    configuration: agentConfigurationSnapshotV1Schema,
    parent_session_id: projectIdSchema.optional(),
    branch_point_turn_id: projectIdSchema.optional(),
    turn_ids: z.array(projectIdSchema),
    failed_turn_ids: z.array(projectIdSchema),
    exploration_id: projectIdSchema,
    created_at: isoDateSchema,
    updated_at: isoDateSchema
  })
  .strict()
  .superRefine((session, context) => {
    if (session.workflow_input && session.workflow_input.task_id !== session.configuration.task.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workflow_input', 'task_id'],
        message: 'Workflow input and frozen Agent task do not match'
      })
    }
    if (
      session.workflow_input?.task_id === 'character-rehearsal' &&
      (session.target.document_type !== 'character' ||
        session.target.document_id !== session.workflow_input.character_id)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workflow_input', 'character_id'],
        message: 'Character rehearsal target must match its stable workflow character'
      })
    }
    if (
      session.workflow_input?.task_id === 'continuity-review' &&
      !session.workflow_input.document_ids.includes(session.target.document_id)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workflow_input', 'document_ids'],
        message: 'Continuity target must be one of the validated workflow documents'
      })
    }
    const successful = new Set(session.turn_ids)
    if (successful.size !== session.turn_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['turn_ids'],
        message: 'Successful turn IDs must be unique'
      })
    }
    if (new Set(session.failed_turn_ids).size !== session.failed_turn_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['failed_turn_ids'],
        message: 'Failed turn IDs must be unique'
      })
    }
    session.failed_turn_ids.forEach((turnId, index) => {
      if (successful.has(turnId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['failed_turn_ids', index],
          message: 'A turn cannot be both successful and failed'
        })
      }
    })
  })

export type AgentSessionV1 = z.infer<typeof agentSessionV1Schema>

const SESSION_TITLE_MAX_LENGTH = 72

/** Stable, human-readable fallback used before a session has a successful turn. */
export function formatAssistantSessionTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ')
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Renderer-facing compatibility title; old project-* titles are never persisted again. */
export function assistantSessionDisplayTitle(
  session: Pick<AgentSessionV1, 'title' | 'created_at' | 'target' | 'configuration'>,
  language: 'zh' | 'en'
): string {
  const roleTitle = session.configuration.creator_role.title
  const title = session.title.trim()
  if (isLegacyProjectSessionTitle(title, roleTitle, session.target.document_id)) {
    return `${roleTitle} · ${formatAssistantSessionTimestamp(session.created_at)}`
  }
  if (language === 'zh' && /·\s*branch$/iu.test(title)) return title.replace(/·\s*branch$/iu, '· 分支')
  return title
}

export const agentExecutionSnapshotV1Schema = z
  .object({
    schema_version: z.literal(1),
    execution_kind: z.literal('creator_assistant'),
    session_id: projectIdSchema,
    turn_id: projectIdSchema,
    task: agentTaskDefinitionV1Schema,
    creator_role: creatorRoleV1Schema,
    creator_role_sha256: portableShaSchema,
    context_bundle: contextBundleV1Schema,
    context_bundle_sha256: portableShaSchema,
    writing_preset: z.custom<WritingPresetSnapshot>(),
    assistant_prompt: assistantPromptVersionV1Schema.optional(),
    assistant_prompt_sha256: portableShaSchema.optional(),
    effective_operations: z.array(agentOperationSchema),
    target: agentTargetSchema,
    workflow_input: creatorAssistantWorkflowInputV1Schema.optional(),
    prompt_blocks: z.array(promptBlockSnapshotSchema),
    context_trace: contextTraceSnapshotSchema,
    token_usage: z
      .object({
        context_tokens: z.number().int().nonnegative(),
        available_input_tokens: z.number().int().positive(),
        reserved_output_tokens: z.number().int().nonnegative(),
        max_output_tokens: z.number().int().positive()
      })
      .strict(),
    prompt_envelope: agentPromptEnvelopeV1Schema,
    created_at: isoDateSchema,
    snapshot_sha256: portableShaSchema
  })
  .strict()

export type AgentExecutionSnapshotV1 = z.infer<typeof agentExecutionSnapshotV1Schema>

export const productAgentExecutionSnapshotV1Schema = z
  .object({
    schema_version: z.literal(1),
    execution_kind: z.literal('product_task'),
    run_id: z.string().min(1),
    task: agentTaskDefinitionV1Schema,
    effective_operations: z.array(agentOperationSchema),
    target: agentTargetSchema,
    writing_preset: z.custom<WritingPresetSnapshot>(),
    prompt_blocks: z.array(promptBlockSnapshotSchema),
    context_trace: contextTraceSnapshotSchema,
    token_usage: z
      .object({
        context_tokens: z.number().int().nonnegative(),
        available_input_tokens: z.number().int().positive(),
        reserved_output_tokens: z.number().int().nonnegative(),
        max_output_tokens: z.number().int().positive()
      })
      .strict(),
    prompt_envelope: agentPromptEnvelopeV1Schema,
    created_at: isoDateSchema,
    snapshot_sha256: portableShaSchema
  })
  .strict()

export type ProductAgentExecutionSnapshotV1 = z.infer<typeof productAgentExecutionSnapshotV1Schema>

export const agentExecutionSnapshotFamilyV1Schema = z.union([
  agentExecutionSnapshotV1Schema,
  productAgentExecutionSnapshotV1Schema
])

export type AnyAgentExecutionSnapshotV1 = z.infer<typeof agentExecutionSnapshotFamilyV1Schema>

export const agentTurnV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    session_id: projectIdSchema,
    author_input: z.string().min(1),
    assistant_reply: z.string().min(1),
    candidate: z
      .object({ title: z.string().min(1), content: z.string().min(1) })
      .strict()
      .optional(),
    exploration_summary: z.string().min(1),
    open_questions: z.array(z.string()),
    proposals: z.array(assistantProposalV1Schema),
    configuration_proposals: z.array(assistantConfigurationProposalV1Schema),
    execution_snapshot_path: z.string().min(1),
    execution_snapshot_sha256: portableShaSchema,
    raw_response_path: z.string().min(1),
    repair_response_path: z.string().min(1).optional(),
    created_at: isoDateSchema
  })
  .strict()

export type AgentTurnV1 = z.infer<typeof agentTurnV1Schema>

export interface LoadedAgentSession {
  session: AgentSessionV1
  source_sha256: string
}

export interface LoadedAgentSessionDetail extends LoadedAgentSession {
  turns: AgentTurnV1[]
  turn_source_sha256: Record<string, string>
  failures: AgentTurnFailureV1[]
}

export const agentTurnFailureV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    session_id: projectIdSchema,
    execution_snapshot_path: z.string().min(1),
    execution_snapshot_sha256: portableShaSchema,
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        validation_issues: z.array(z.string()).optional()
      })
      .strict(),
    raw_response_path: z.string().min(1).optional(),
    repair_response_path: z.string().min(1).optional(),
    created_at: isoDateSchema
  })
  .strict()

export type AgentTurnFailureV1 = z.infer<typeof agentTurnFailureV1Schema>

export interface RecordAssistantTurnInput {
  expected_session_sha256: string
  execution_snapshot: AgentExecutionSnapshotV1
  output: AssistantTurnOutputInputV1
  raw_response: string
  repair_response?: string
}

export async function startAgentSession(
  projectRoot: string,
  roleId: string,
  target: AssistantContextTarget,
  title?: string,
  workflowInput?: CreatorAssistantWorkflowInputV1
): Promise<LoadedAgentSession> {
  return withProjectWriteLock(projectRoot, async () => {
    const configuration = await createAgentConfigurationSnapshot(projectRoot, roleId)
    const id = newPortableId('assistant')
    const now = new Date().toISOString()
    const session: AgentSessionV1 = agentSessionV1Schema.parse({
      schema_version: 1,
      id,
      title: title?.trim() || `${configuration.creator_role.title} · ${formatAssistantSessionTimestamp(now)}`,
      status: 'active',
      target,
      ...(workflowInput ? { workflow_input: workflowInput } : {}),
      configuration,
      turn_ids: [],
      failed_turn_ids: [],
      exploration_id: id,
      created_at: now,
      updated_at: now
    })
    const directory = await ensureSessionDirectory(projectRoot, id, true)
    await writeText(path.join(directory, 'configuration-snapshot.json'), prettyJson(configuration))
    await writeText(path.join(directory, 'session.json'), prettyJson(session))
    await createExplorationDocument(projectRoot, session)
    return loadAgentSession(projectRoot, id)
  })
}

export async function listAgentSessions(projectRoot: string): Promise<LoadedAgentSession[]> {
  const root = path.join(projectRoot, 'runs', 'assistants')
  if (!(await pathExists(root))) return []
  await assertContainedDirectory(projectRoot, root, 'Assistant run root')
  const entries = await readdir(root, { withFileTypes: true })
  const sessions: LoadedAgentSession[] = []
  for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name, 'en'))) {
    if (entry.isSymbolicLink()) throw new Error(`Assistant run root cannot contain symlinks: ${entry.name}`)
    if (!entry.isDirectory()) continue
    sessions.push(await loadAgentSession(projectRoot, entry.name))
  }
  return sessions
}

export async function loadAgentSession(projectRoot: string, sessionId: string): Promise<LoadedAgentSession> {
  const safeSessionId = projectIdSchema.parse(sessionId)
  const directory = await ensureSessionDirectory(projectRoot, safeSessionId, false)
  const raw = await readContainedRegularText(
    projectRoot,
    path.join(directory, 'session.json'),
    `Assistant session ${safeSessionId}`
  )
  const session = agentSessionV1Schema.parse(JSON.parse(raw)) as AgentSessionV1
  if (session.id !== safeSessionId) {
    throw new Error(`AGENT_SESSION_ID_MISMATCH: ${safeSessionId}`)
  }
  const configurationRaw = await readContainedRegularText(
    projectRoot,
    path.join(directory, 'configuration-snapshot.json'),
    `Assistant configuration ${safeSessionId}`
  )
  const configuration = assertAgentConfigurationSnapshot(JSON.parse(configurationRaw))
  if (canonicalJson(configuration) !== canonicalJson(session.configuration)) {
    throw new Error(`AGENT_CONFIGURATION_SNAPSHOT_MISMATCH: ${safeSessionId}`)
  }
  return {
    session,
    source_sha256: sha256Text(raw)
  }
}

export async function loadAgentSessionDetail(
  projectRoot: string,
  sessionId: string
): Promise<LoadedAgentSessionDetail> {
  const loaded = await loadAgentSession(projectRoot, sessionId)
  const turns: AgentTurnV1[] = []
  const turnSourceSha256: Record<string, string> = {}
  for (const turnId of loaded.session.turn_ids) {
    const loadedTurn = await loadVerifiedAgentTurn(projectRoot, loaded.session, turnId)
    turns.push(loadedTurn.turn)
    turnSourceSha256[turnId] = loadedTurn.source_sha256
  }
  const failures: AgentTurnFailureV1[] = []
  for (const turnId of loaded.session.failed_turn_ids) {
    failures.push(await loadVerifiedAgentTurnFailure(projectRoot, loaded.session, turnId))
  }
  return { ...loaded, turns, turn_source_sha256: turnSourceSha256, failures }
}

export async function forkAgentSession(
  projectRoot: string,
  sourceSessionId: string,
  throughTurnId?: string
): Promise<LoadedAgentSession> {
  return withProjectWriteLock(projectRoot, async () => {
    const source = await loadAgentSessionDetail(projectRoot, sourceSessionId)
    const branchIndex = throughTurnId
      ? source.session.turn_ids.indexOf(throughTurnId)
      : source.session.turn_ids.length - 1
    if (throughTurnId && branchIndex < 0) throw new Error(`Turn not found in session: ${throughTurnId}`)
    const retainedTurnIds = source.session.turn_ids.slice(0, branchIndex + 1)
    const id = newPortableId('assistant-branch')
    const now = new Date().toISOString()
    const session = agentSessionV1Schema.parse({
      ...source.session,
      id,
      title: `${source.session.title} · branch`,
      parent_session_id: source.session.id,
      ...(throughTurnId ? { branch_point_turn_id: throughTurnId } : {}),
      turn_ids: retainedTurnIds,
      failed_turn_ids: [],
      exploration_id: id,
      created_at: now,
      updated_at: now
    }) as AgentSessionV1
    const directory = await ensureSessionDirectory(projectRoot, id, true)
    await writeText(path.join(directory, 'configuration-snapshot.json'), prettyJson(session.configuration))
    await ensureDir(path.join(directory, 'turns'))
    for (const turnId of retainedTurnIds) {
      const turnDirectory = await ensureTurnDirectory(projectRoot, id, turnId, true)
      const sourceTurnDirectory = await ensureTurnDirectory(projectRoot, source.session.id, turnId, false)
      for (const entry of await readdir(sourceTurnDirectory, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || !entry.isFile()) {
          throw new Error(`Assistant turn artifacts must be regular files: ${turnId}/${entry.name}`)
        }
        await writeText(
          path.join(turnDirectory, entry.name),
          await readContainedRegularText(
            projectRoot,
            path.join(sourceTurnDirectory, entry.name),
            `Assistant turn artifact ${turnId}/${entry.name}`
          )
        )
      }
      const sourceTurn = source.turns.find((item) => item.id === turnId)
      if (!sourceTurn) throw new Error(`AGENT_TURN_NOT_FOUND: ${turnId}`)
      const sourceSnapshotRaw = await readContainedRegularText(
        projectRoot,
        path.join(sourceTurnDirectory, 'execution-snapshot.json'),
        `Assistant execution snapshot ${turnId}`
      )
      const sourceSnapshot = assertAgentExecutionSnapshot(JSON.parse(sourceSnapshotRaw))
      const { snapshot_sha256: sourceSnapshotHash, ...snapshotWithoutHash } = sourceSnapshot
      void sourceSnapshotHash
      const branchedSnapshot = assertAgentExecutionSnapshot({
        ...snapshotWithoutHash,
        session_id: id,
        snapshot_sha256: sha256Text(canonicalJson({ ...snapshotWithoutHash, session_id: id }))
      })
      const branchedSnapshotRaw = prettyJson(branchedSnapshot)
      await writeText(path.join(turnDirectory, 'execution-snapshot.json'), branchedSnapshotRaw)
      const branchedTurn = agentTurnV1Schema.parse({
        ...sourceTurn,
        session_id: id,
        execution_snapshot_path: relativePortablePath(
          projectRoot,
          path.join(turnDirectory, 'execution-snapshot.json')
        ),
        execution_snapshot_sha256: sha256Text(branchedSnapshotRaw),
        raw_response_path: relativePortablePath(projectRoot, path.join(turnDirectory, 'raw-response.txt')),
        ...(sourceTurn.repair_response_path
          ? {
              repair_response_path: relativePortablePath(
                projectRoot,
                path.join(turnDirectory, 'repair-response.txt')
              )
            }
          : {})
      }) as AgentTurnV1
      await writeText(path.join(turnDirectory, 'turn.json'), prettyJson(branchedTurn))
    }
    await writeText(path.join(directory, 'session.json'), prettyJson(session))
    await createExplorationDocument(projectRoot, session)
    for (const turn of source.turns.filter((item) => retainedTurnIds.includes(item.id))) {
      await appendExplorationDocument(projectRoot, session.exploration_id, turn)
    }
    return loadAgentSession(projectRoot, id)
  })
}

export async function recordAssistantTurn(
  projectRoot: string,
  sessionId: string,
  input: RecordAssistantTurnInput
): Promise<LoadedAgentSessionDetail> {
  return withProjectWriteLock(projectRoot, async () => {
    const loaded = await loadAgentSession(projectRoot, sessionId)
    if (loaded.source_sha256 !== input.expected_session_sha256) {
      throw new StaleProjectWriteError(`runs/assistants/${sessionId}/session.json`)
    }
    const snapshot = assertAgentExecutionSnapshot(input.execution_snapshot)
    if (snapshot.session_id !== sessionId) throw new Error('Execution snapshot belongs to another session')
    assertSnapshotMatchesSession(loaded.session, snapshot)
    if (loaded.session.turn_ids.includes(snapshot.turn_id)) {
      throw new Error(`Assistant turn already exists: ${snapshot.turn_id}`)
    }
    const parsedOutput = assistantTurnOutputV1Schema.parse(input.output) as AssistantTurnOutputV1
    validateTurnOutputPermissions(loaded.session.configuration, parsedOutput)
    const proposals = parsedOutput.proposals.map((proposal) =>
      assistantProposalV1Schema.parse({
        ...proposal,
        id: proposal.id ?? newPortableId('proposal'),
        status: 'pending'
      })
    ) as AssistantProposalV1[]
    assertUniqueIds(proposals, 'AGENT_OUTPUT_DUPLICATE_PROPOSAL_ID')
    const configurationProposals: AssistantConfigurationProposalV1[] = []
    for (const proposal of parsedOutput.configuration_proposals) {
      if (proposal.target_id !== proposal.proposed.id) {
        throw new Error('AGENT_CONFIGURATION_PROPOSAL_TARGET_MISMATCH')
      }
      if (
        (proposal.target_kind === 'creator_role' && !('task_id' in proposal.proposed)) ||
        (proposal.target_kind === 'context_bundle' && !('sources' in proposal.proposed))
      ) {
        throw new Error('AGENT_CONFIGURATION_PROPOSAL_KIND_MISMATCH')
      }
      let plan: ConfigurationChangePlanV1
      try {
        plan =
          proposal.target_kind === 'creator_role'
            ? await planCreatorRoleChange(projectRoot, creatorRoleV1Schema.parse(proposal.proposed))
            : await planContextBundleChange(projectRoot, contextBundleV1Schema.parse(proposal.proposed))
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`AGENT_CONFIGURATION_PROPOSAL_INVALID: ${message}`, { cause })
      }
      configurationProposals.push(
        assistantConfigurationProposalV1Schema.parse({
          id: proposal.id ?? newPortableId('config-proposal'),
          rationale: proposal.rationale,
          plan,
          status: 'pending'
        })
      )
    }
    assertUniqueIds(configurationProposals, 'AGENT_OUTPUT_DUPLICATE_CONFIGURATION_PROPOSAL_ID')
    const directory = await ensureSessionDirectory(projectRoot, sessionId, false)
    const turnDirectory = await ensureTurnDirectory(projectRoot, sessionId, snapshot.turn_id, true)
    const snapshotRaw = prettyJson(snapshot)
    await Promise.all([
      writeText(path.join(turnDirectory, 'execution-snapshot.json'), snapshotRaw),
      writeText(path.join(turnDirectory, 'prompt-envelope.json'), prettyJson(snapshot.prompt_envelope)),
      writeText(path.join(turnDirectory, 'context-trace.json'), prettyJson(snapshot.context_trace)),
      writeText(path.join(turnDirectory, 'prompt-blocks.json'), prettyJson(snapshot.prompt_blocks)),
      writeText(path.join(turnDirectory, 'context.md'), snapshot.prompt_envelope.context_markdown),
      writeText(path.join(turnDirectory, 'raw-response.txt'), input.raw_response),
      writeText(path.join(turnDirectory, 'parsed-response.json'), prettyJson(parsedOutput)),
      ...(input.repair_response !== undefined
        ? [writeText(path.join(turnDirectory, 'repair-response.txt'), input.repair_response)]
        : [])
    ])
    const turn = agentTurnV1Schema.parse({
      schema_version: 1,
      id: snapshot.turn_id,
      session_id: sessionId,
      author_input: snapshot.prompt_envelope.current_input,
      assistant_reply: parsedOutput.reply,
      ...(parsedOutput.candidate ? { candidate: parsedOutput.candidate } : {}),
      exploration_summary: parsedOutput.exploration.summary,
      open_questions: parsedOutput.exploration.open_questions,
      proposals,
      configuration_proposals: configurationProposals,
      execution_snapshot_path: relativePortablePath(
        projectRoot,
        path.join(turnDirectory, 'execution-snapshot.json')
      ),
      execution_snapshot_sha256: sha256Text(snapshotRaw),
      raw_response_path: relativePortablePath(projectRoot, path.join(turnDirectory, 'raw-response.txt')),
      ...(input.repair_response !== undefined
        ? {
            repair_response_path: relativePortablePath(
              projectRoot,
              path.join(turnDirectory, 'repair-response.txt')
            )
          }
        : {}),
      created_at: snapshot.created_at
    }) as AgentTurnV1
    await writeText(path.join(turnDirectory, 'turn.json'), prettyJson(turn))
    await appendExplorationDocument(projectRoot, loaded.session.exploration_id, turn)
    const updated = agentSessionV1Schema.parse({
      ...loaded.session,
      ...(shouldPromoteSessionTitle(loaded.session)
        ? {
            title: `${loaded.session.configuration.creator_role.title} · ${deriveSessionTopic(
              snapshot.prompt_envelope.current_input,
              parsedOutput.exploration.summary
            )}`
          }
        : {}),
      turn_ids: [...loaded.session.turn_ids, turn.id],
      updated_at: new Date().toISOString()
    }) as AgentSessionV1
    await writeText(path.join(directory, 'session.json'), prettyJson(updated))
    return loadAgentSessionDetail(projectRoot, sessionId)
  })
}

export async function recordAssistantTurnFailure(
  projectRoot: string,
  sessionId: string,
  input: {
    expected_session_sha256: string
    execution_snapshot: AgentExecutionSnapshotV1
    error: { code: string; message: string; validation_issues?: string[] }
    raw_response?: string
    repair_response?: string
  }
): Promise<LoadedAgentSession> {
  return withProjectWriteLock(projectRoot, async () => {
    const loaded = await loadAgentSession(projectRoot, sessionId)
    if (loaded.source_sha256 !== input.expected_session_sha256) {
      throw new StaleProjectWriteError(`runs/assistants/${sessionId}/session.json`)
    }
    const snapshot = assertAgentExecutionSnapshot(input.execution_snapshot)
    if (snapshot.session_id !== sessionId) throw new Error('Execution snapshot belongs to another session')
    assertSnapshotMatchesSession(loaded.session, snapshot)
    if (
      loaded.session.turn_ids.includes(snapshot.turn_id) ||
      loaded.session.failed_turn_ids.includes(snapshot.turn_id)
    ) {
      throw new Error(`Assistant turn already exists: ${snapshot.turn_id}`)
    }
    const directory = await ensureSessionDirectory(projectRoot, sessionId, false)
    const turnDirectory = await ensureTurnDirectory(projectRoot, sessionId, snapshot.turn_id, true)
    const snapshotRaw = prettyJson(snapshot)
    await Promise.all([
      writeText(path.join(turnDirectory, 'execution-snapshot.json'), snapshotRaw),
      writeText(path.join(turnDirectory, 'prompt-envelope.json'), prettyJson(snapshot.prompt_envelope)),
      writeText(path.join(turnDirectory, 'context-trace.json'), prettyJson(snapshot.context_trace)),
      writeText(path.join(turnDirectory, 'prompt-blocks.json'), prettyJson(snapshot.prompt_blocks)),
      writeText(path.join(turnDirectory, 'context.md'), snapshot.prompt_envelope.context_markdown),
      writeText(path.join(turnDirectory, 'error.json'), prettyJson(input.error)),
      ...(input.raw_response !== undefined
        ? [writeText(path.join(turnDirectory, 'raw-response.txt'), input.raw_response)]
        : []),
      ...(input.repair_response !== undefined
        ? [writeText(path.join(turnDirectory, 'repair-response.txt'), input.repair_response)]
        : [])
    ])
    const failure = agentTurnFailureV1Schema.parse({
      schema_version: 1,
      id: snapshot.turn_id,
      session_id: sessionId,
      execution_snapshot_path: relativePortablePath(
        projectRoot,
        path.join(turnDirectory, 'execution-snapshot.json')
      ),
      execution_snapshot_sha256: sha256Text(snapshotRaw),
      error: input.error,
      ...(input.raw_response !== undefined
        ? {
            raw_response_path: relativePortablePath(projectRoot, path.join(turnDirectory, 'raw-response.txt'))
          }
        : {}),
      ...(input.repair_response !== undefined
        ? {
            repair_response_path: relativePortablePath(
              projectRoot,
              path.join(turnDirectory, 'repair-response.txt')
            )
          }
        : {}),
      created_at: snapshot.created_at
    }) as AgentTurnFailureV1
    await writeText(path.join(turnDirectory, 'failure.json'), prettyJson(failure))
    const updated = agentSessionV1Schema.parse({
      ...loaded.session,
      failed_turn_ids: [...loaded.session.failed_turn_ids, snapshot.turn_id],
      updated_at: new Date().toISOString()
    }) as AgentSessionV1
    await writeText(path.join(directory, 'session.json'), prettyJson(updated))
    return loadAgentSession(projectRoot, sessionId)
  })
}

export async function updateAssistantProposalStatus(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  proposalId: string,
  status: 'applied' | 'rejected',
  appliedDocumentId?: string,
  expectedTurnSha256?: string
): Promise<AgentTurnV1> {
  return withProjectWriteLock(projectRoot, async () => {
    const session = await loadAgentSession(projectRoot, sessionId)
    if (!session.session.turn_ids.includes(turnId)) throw new Error(`Turn not found: ${turnId}`)
    const loadedTurn = await loadVerifiedAgentTurn(projectRoot, session.session, turnId)
    if (expectedTurnSha256 && expectedTurnSha256 !== loadedTurn.source_sha256) {
      throw new StaleProjectWriteError(`runs/assistants/${sessionId}/turns/${turnId}/turn.json`)
    }
    const turn = loadedTurn.turn
    const proposal = turn.proposals.find((item) => item.id === proposalId)
    if (!proposal) throw new Error(`Proposal not found: ${proposalId}`)
    if (proposal.status !== 'pending')
      throw new Error(`Proposal was already ${proposal.status}: ${proposalId}`)
    const updated = agentTurnV1Schema.parse({
      ...turn,
      proposals: turn.proposals.map((item) =>
        item.id === proposalId
          ? {
              ...item,
              status,
              ...(status === 'applied' && appliedDocumentId ? { applied_document_id: appliedDocumentId } : {})
            }
          : item
      )
    }) as AgentTurnV1
    const turnDirectory = await ensureTurnDirectory(projectRoot, sessionId, turnId, false)
    await writeText(path.join(turnDirectory, 'turn.json'), prettyJson(updated))
    return updated
  })
}

export async function applyAssistantConfigurationProposal(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  proposalId: string,
  expectedTurnSha256: string,
  authorApproved: boolean
): Promise<{ turn: AgentTurnV1; applied: CreatorRoleV1 | ContextBundleV1 }> {
  return withProjectWriteLock(projectRoot, async () => {
    if (!authorApproved) throw new Error('AUTHOR_APPROVAL_REQUIRED')
    const session = await loadAgentSession(projectRoot, sessionId)
    if (!session.session.turn_ids.includes(turnId)) throw new Error(`AGENT_TURN_NOT_FOUND: ${turnId}`)
    const loadedTurn = await loadVerifiedAgentTurn(projectRoot, session.session, turnId)
    if (loadedTurn.source_sha256 !== expectedTurnSha256) {
      throw new StaleProjectWriteError(`runs/assistants/${sessionId}/turns/${turnId}/turn.json`)
    }
    const proposal = loadedTurn.turn.configuration_proposals.find((item) => item.id === proposalId)
    if (!proposal) throw new Error(`AGENT_CONFIGURATION_PROPOSAL_NOT_FOUND: ${proposalId}`)
    if (proposal.status !== 'pending') {
      throw new Error(`AGENT_CONFIGURATION_PROPOSAL_ALREADY_${proposal.status.toUpperCase()}`)
    }
    const before =
      proposal.plan.target_kind === 'creator_role'
        ? await loadCreatorRole(projectRoot, proposal.plan.target_id)
        : await loadContextBundle(projectRoot, proposal.plan.target_id)
    const applied = await applyConfigurationChangePlan(projectRoot, proposal.plan, true)
    const updated = agentTurnV1Schema.parse({
      ...loadedTurn.turn,
      configuration_proposals: loadedTurn.turn.configuration_proposals.map((item) =>
        item.id === proposalId ? { ...item, status: 'applied', applied_at: new Date().toISOString() } : item
      )
    }) as AgentTurnV1
    const turnDirectory = await ensureTurnDirectory(projectRoot, sessionId, turnId, false)
    try {
      await writeText(path.join(turnDirectory, 'turn.json'), prettyJson(updated))
    } catch (cause) {
      await rollbackAppliedConfiguration(projectRoot, proposal.plan.target_kind, before, applied)
      throw cause
    }
    return { turn: updated, applied }
  })
}

export async function rejectAssistantConfigurationProposal(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  proposalId: string,
  expectedTurnSha256: string
): Promise<AgentTurnV1> {
  return withProjectWriteLock(projectRoot, async () => {
    const session = await loadAgentSession(projectRoot, sessionId)
    if (!session.session.turn_ids.includes(turnId)) throw new Error(`AGENT_TURN_NOT_FOUND: ${turnId}`)
    const loadedTurn = await loadVerifiedAgentTurn(projectRoot, session.session, turnId)
    if (loadedTurn.source_sha256 !== expectedTurnSha256) {
      throw new StaleProjectWriteError(`runs/assistants/${sessionId}/turns/${turnId}/turn.json`)
    }
    const proposal = loadedTurn.turn.configuration_proposals.find((item) => item.id === proposalId)
    if (!proposal) throw new Error(`AGENT_CONFIGURATION_PROPOSAL_NOT_FOUND: ${proposalId}`)
    if (proposal.status !== 'pending') {
      throw new Error(`AGENT_CONFIGURATION_PROPOSAL_ALREADY_${proposal.status.toUpperCase()}`)
    }
    const updated = agentTurnV1Schema.parse({
      ...loadedTurn.turn,
      configuration_proposals: loadedTurn.turn.configuration_proposals.map((item) =>
        item.id === proposalId ? { ...item, status: 'rejected' } : item
      )
    }) as AgentTurnV1
    const turnDirectory = await ensureTurnDirectory(projectRoot, sessionId, turnId, false)
    await writeText(path.join(turnDirectory, 'turn.json'), prettyJson(updated))
    return updated
  })
}

export function createAgentPromptEnvelope(input: {
  systemMessage: string
  userInstructions?: string[]
  contextMarkdown: string
  conversation: Array<{ role: 'author' | 'assistant'; content: string }>
  currentInput: string
  compiledUserContent?: string
  sentUserContent?: string
  createdAt?: string
}): AgentPromptEnvelopeV1 {
  const userInstructions = input.userInstructions ?? []
  const compiledUserContent =
    input.compiledUserContent ??
    [...userInstructions, '', input.contextMarkdown, '', '## Current author message', '', input.currentInput]
      .join('\n')
      .trim()
  const sentUserContent = input.sentUserContent ?? compiledUserContent
  const messages = [
    { role: 'system' as const, content: input.systemMessage },
    ...input.conversation.map((message) => ({
      role: message.role === 'author' ? ('user' as const) : ('assistant' as const),
      content: message.content
    })),
    { role: 'user' as const, content: sentUserContent }
  ]
  return agentPromptEnvelopeV1Schema.parse({
    schema_version: 1,
    system_message: input.systemMessage,
    user_instructions: userInstructions,
    context_markdown: input.contextMarkdown,
    conversation: input.conversation,
    current_input: input.currentInput,
    compiled_user_content: compiledUserContent,
    sent_user_content: sentUserContent,
    messages,
    compiled_prompt_sha256: sha256Text(compiledUserContent),
    sent_prompt_sha256: sha256Text(sentUserContent),
    manually_edited: sentUserContent !== compiledUserContent,
    created_at: input.createdAt ?? new Date().toISOString()
  }) as AgentPromptEnvelopeV1
}

export function createAgentExecutionSnapshot(input: {
  session: AgentSessionV1
  turnId?: string
  resolvedContext: ResolvedContextBundle
  writingPreset: WritingPresetSnapshot
  promptEnvelope: AgentPromptEnvelopeV1
  createdAt?: string
}): AgentExecutionSnapshotV1 {
  const turnId = input.turnId ?? newPortableId('turn')
  const withoutHash = {
    schema_version: 1 as const,
    execution_kind: 'creator_assistant' as const,
    session_id: input.session.id,
    turn_id: turnId,
    task: input.session.configuration.task,
    creator_role: input.session.configuration.creator_role,
    creator_role_sha256: input.session.configuration.creator_role_sha256,
    context_bundle: input.resolvedContext.bundle,
    context_bundle_sha256: input.resolvedContext.bundle_sha256,
    writing_preset: input.writingPreset,
    ...(input.session.configuration.assistant_prompt
      ? {
          assistant_prompt: input.session.configuration.assistant_prompt,
          assistant_prompt_sha256: input.session.configuration.assistant_prompt_sha256
        }
      : {}),
    effective_operations: input.session.configuration.effective_operations,
    target: input.session.target,
    ...(input.session.workflow_input ? { workflow_input: input.session.workflow_input } : {}),
    prompt_blocks: input.resolvedContext.context.blocks,
    context_trace: input.resolvedContext.context.trace,
    token_usage: {
      context_tokens: input.resolvedContext.context.trace.budget.used_tokens,
      available_input_tokens: input.resolvedContext.context.trace.budget.available_input_tokens,
      reserved_output_tokens: input.resolvedContext.context.trace.budget.reserved_output_tokens,
      max_output_tokens: input.writingPreset.model.max_output_tokens
    },
    prompt_envelope: input.promptEnvelope,
    created_at: input.createdAt ?? new Date().toISOString()
  }
  return assertAgentExecutionSnapshot({
    ...withoutHash,
    snapshot_sha256: sha256Text(canonicalJson(withoutHash))
  })
}

export function assertAgentExecutionSnapshot(value: unknown): AgentExecutionSnapshotV1 {
  const snapshot = agentExecutionSnapshotV1Schema.parse(value) as AgentExecutionSnapshotV1
  assertWritingPresetSnapshot(snapshot.writing_preset)
  assertExecutionArtifactConsistency(snapshot)
  const { snapshot_sha256: claimed, ...withoutHash } = snapshot
  const actual = sha256Text(canonicalJson(withoutHash))
  if (claimed !== actual) throw new Error('Agent execution snapshot hash does not match its content')
  return snapshot
}

export function createProductAgentExecutionSnapshot(input: {
  runId: string
  taskId: AgentTaskId
  target: AssistantContextTarget
  writingPreset: WritingPresetSnapshot
  promptBlocks: PromptBlock[]
  contextTrace: ContextTrace
  promptEnvelope: AgentPromptEnvelopeV1
  createdAt?: string
}): ProductAgentExecutionSnapshotV1 {
  const task = getAgentTaskDefinition(input.taskId)
  const withoutHash = {
    schema_version: 1 as const,
    execution_kind: 'product_task' as const,
    run_id: z.string().min(1).parse(input.runId),
    task,
    effective_operations: task.capability_ceiling,
    target: agentTargetSchema.parse(input.target),
    writing_preset: assertWritingPresetSnapshot(input.writingPreset),
    prompt_blocks: input.promptBlocks,
    context_trace: input.contextTrace,
    token_usage: {
      context_tokens: input.contextTrace.budget.used_tokens,
      available_input_tokens: input.contextTrace.budget.available_input_tokens,
      reserved_output_tokens: input.contextTrace.budget.reserved_output_tokens,
      max_output_tokens: input.writingPreset.model.max_output_tokens
    },
    prompt_envelope: agentPromptEnvelopeV1Schema.parse(input.promptEnvelope),
    created_at: input.createdAt ?? new Date().toISOString()
  }
  return assertProductAgentExecutionSnapshot({
    ...withoutHash,
    snapshot_sha256: sha256Text(canonicalJson(withoutHash))
  })
}

export function assertProductAgentExecutionSnapshot(value: unknown): ProductAgentExecutionSnapshotV1 {
  const snapshot = productAgentExecutionSnapshotV1Schema.parse(value) as ProductAgentExecutionSnapshotV1
  assertWritingPresetSnapshot(snapshot.writing_preset)
  assertExecutionArtifactConsistency(snapshot)
  const { snapshot_sha256: claimed, ...withoutHash } = snapshot
  const actual = sha256Text(canonicalJson(withoutHash))
  if (claimed !== actual) {
    throw new Error('AGENT_EXECUTION_SNAPSHOT_HASH_MISMATCH')
  }
  return snapshot
}

export async function createAgentConfigurationSnapshot(
  projectRoot: string,
  roleId: string
): Promise<AgentConfigurationSnapshotV1> {
  const role = await loadCreatorRole(projectRoot, roleId)
  await ensureBuiltinAssistantPrompts(projectRoot)
  const assistantId = creatorAssistantIdForTask(role.value.task_id)
  const promptVersions = await listAssistantPromptVersions(projectRoot, assistantId)
  const prompt = role.value.assistant_prompt_id
    ? await loadAssistantPromptVersion(projectRoot, assistantId, role.value.assistant_prompt_id)
    : promptVersions[0]
  const [bundle, preset] = await Promise.all([
    loadContextBundle(projectRoot, role.value.context_bundle_id),
    loadWritingPreset(projectRoot, role.value.writing_preset_id)
  ])
  const task = getAgentTaskDefinition(role.value.task_id)
  const withoutHash = {
    schema_version: 1 as const,
    task,
    creator_role: role.value,
    creator_role_sha256: role.source_sha256,
    context_bundle: bundle.value,
    context_bundle_sha256: bundle.source_sha256,
    writing_preset: preset.preset,
    writing_preset_sha256: preset.source_sha256,
    ...(prompt ? { assistant_prompt: prompt.value, assistant_prompt_sha256: prompt.source_sha256 } : {}),
    effective_operations: role.value.enabled_operations,
    output_disposition: role.value.output_disposition
  }
  return assertAgentConfigurationSnapshot({
    ...withoutHash,
    snapshot_sha256: sha256Text(canonicalJson(withoutHash))
  })
}

export function assertAgentConfigurationSnapshot(value: unknown): AgentConfigurationSnapshotV1 {
  const configuration = agentConfigurationSnapshotV1Schema.parse(value) as AgentConfigurationSnapshotV1
  const { snapshot_sha256: claimed, ...withoutHash } = configuration
  if (sha256Text(canonicalJson(withoutHash)) !== claimed) {
    throw new Error('AGENT_CONFIGURATION_SNAPSHOT_HASH_MISMATCH')
  }
  return configuration
}

export function validateTurnOutputPermissions(
  configuration: AgentConfigurationSnapshotV1,
  output: AssistantTurnOutputV1
): void {
  const operations = new Set(configuration.effective_operations)
  const rehearsalWithSettingProposal =
    configuration.task.id === 'character-rehearsal' &&
    configuration.output_disposition === 'planning_proposal'
  if (output.candidate && !operations.has('generate_candidate')) {
    throw new Error('AGENT_PERMISSION_DENIED: this creator role cannot generate candidates')
  }
  if (output.candidate && configuration.output_disposition !== 'candidate' && !rehearsalWithSettingProposal) {
    throw new Error('AGENT_OUTPUT_TYPE_INVALID: this role does not produce candidates')
  }
  if (!output.candidate && configuration.output_disposition === 'candidate') {
    throw new Error('AGENT_OUTPUT_TYPE_INVALID: candidate roles must return candidate content')
  }
  if (output.configuration_proposals.length > 0 && !operations.has('propose_configuration_change')) {
    throw new Error('AGENT_PERMISSION_DENIED: this creator role cannot propose configuration changes')
  }
  for (const proposal of output.proposals) {
    if (proposal.kind === 'issue' && !operations.has('propose_issue')) {
      throw new Error('AGENT_PERMISSION_DENIED: this creator role cannot propose issues')
    }
    if (proposal.kind === 'planning_record' && !operations.has('propose_planning_record')) {
      throw new Error('AGENT_PERMISSION_DENIED: this creator role cannot propose planning records')
    }
    if (proposal.kind === 'issue' && proposal.document_type !== 'issue') {
      throw new Error('AGENT_OUTPUT_TYPE_INVALID: issue proposals must target issue documents')
    }
    if (proposal.kind === 'planning_record' && proposal.document_type === 'issue') {
      throw new Error('AGENT_OUTPUT_TYPE_INVALID: planning proposals cannot target issue documents')
    }
    if (proposal.kind === 'issue' && configuration.output_disposition !== 'issue_proposal') {
      throw new Error('AGENT_OUTPUT_TYPE_INVALID: this role does not produce issue proposals')
    }
    if (proposal.kind === 'planning_record' && configuration.output_disposition !== 'planning_proposal') {
      throw new Error('AGENT_OUTPUT_TYPE_INVALID: this role does not produce planning proposals')
    }
    if (['canon', 'outline', 'scene', 'chapter_prose', 'prompt'].includes(proposal.document_type)) {
      throw new Error(`AGENT_PERMISSION_DENIED: proposals cannot target ${proposal.document_type}`)
    }
  }
  if (output.proposals.length > 0 && configuration.output_disposition === 'exploration') {
    throw new Error('AGENT_OUTPUT_TYPE_INVALID: exploration-only roles cannot return proposals')
  }
}

function assertSnapshotMatchesSession(session: AgentSessionV1, snapshot: AgentExecutionSnapshotV1): void {
  const configuration = session.configuration
  if (
    canonicalJson(snapshot.task) !== canonicalJson(configuration.task) ||
    canonicalJson(snapshot.creator_role) !== canonicalJson(configuration.creator_role) ||
    snapshot.creator_role_sha256 !== configuration.creator_role_sha256 ||
    canonicalJson(snapshot.context_bundle) !== canonicalJson(configuration.context_bundle) ||
    snapshot.context_bundle_sha256 !== configuration.context_bundle_sha256 ||
    canonicalJson(snapshot.effective_operations) !== canonicalJson(configuration.effective_operations) ||
    canonicalJson(snapshot.target) !== canonicalJson(session.target) ||
    canonicalJson(snapshot.workflow_input ?? null) !== canonicalJson(session.workflow_input ?? null) ||
    snapshot.writing_preset.preset_id !== configuration.writing_preset.id ||
    snapshot.writing_preset.preset_version !== configuration.writing_preset.version ||
    snapshot.writing_preset.source.sha256 !== configuration.writing_preset_sha256 ||
    canonicalJson(snapshot.assistant_prompt ?? null) !==
      canonicalJson(configuration.assistant_prompt ?? null) ||
    snapshot.assistant_prompt_sha256 !== configuration.assistant_prompt_sha256
  ) {
    throw new Error('AGENT_EXECUTION_SNAPSHOT_CONFIGURATION_MISMATCH')
  }
}

function assertExecutionArtifactConsistency(
  snapshot: AgentExecutionSnapshotV1 | ProductAgentExecutionSnapshotV1
): void {
  const blockIds = snapshot.prompt_blocks.map((block) => block.id)
  if (new Set(blockIds).size !== blockIds.length) {
    throw new Error('AGENT_EXECUTION_SNAPSHOT_DUPLICATE_BLOCK_ID')
  }
  if (canonicalJson(blockIds) !== canonicalJson(snapshot.context_trace.final_block_ids)) {
    throw new Error('AGENT_EXECUTION_SNAPSHOT_TRACE_MISMATCH')
  }
  const budget = snapshot.context_trace.budget
  if (
    snapshot.token_usage.context_tokens !== budget.used_tokens ||
    snapshot.token_usage.available_input_tokens !== budget.available_input_tokens ||
    snapshot.token_usage.reserved_output_tokens !== budget.reserved_output_tokens ||
    snapshot.token_usage.max_output_tokens !== snapshot.writing_preset.model.max_output_tokens
  ) {
    throw new Error('AGENT_EXECUTION_SNAPSHOT_TOKEN_MISMATCH')
  }
  const renderedContext = snapshot.prompt_blocks
    .map((block) => block.content.trim())
    .filter(Boolean)
    .join('\n\n')
  if (snapshot.prompt_envelope.context_markdown !== renderedContext) {
    throw new Error('AGENT_EXECUTION_SNAPSHOT_CONTEXT_MISMATCH')
  }
}

function assertUniqueIds(values: Array<{ id: string }>, code: string): void {
  if (new Set(values.map((value) => value.id)).size !== values.length) throw new Error(code)
}

async function rollbackAppliedConfiguration(
  projectRoot: string,
  targetKind: 'creator_role' | 'context_bundle',
  before: { value: CreatorRoleV1 | ContextBundleV1 },
  applied: CreatorRoleV1 | ContextBundleV1
): Promise<void> {
  if (targetKind === 'creator_role') {
    const live = await loadCreatorRole(projectRoot, applied.id)
    if (canonicalJson(live.value) !== canonicalJson(applied)) {
      throw new StaleProjectWriteError(live.source_path)
    }
    await updateCreatorRole(projectRoot, creatorRoleV1Schema.parse(before.value), live.source_sha256)
    return
  }
  const live = await loadContextBundle(projectRoot, applied.id)
  if (canonicalJson(live.value) !== canonicalJson(applied)) {
    throw new StaleProjectWriteError(live.source_path)
  }
  await updateContextBundle(projectRoot, contextBundleV1Schema.parse(before.value), live.source_sha256)
}

async function createExplorationDocument(projectRoot: string, session: AgentSessionV1): Promise<void> {
  const directory = await ensureExplorationDirectory(projectRoot, true)
  const filePath = path.join(directory, `${projectIdSchema.parse(session.exploration_id)}.md`)
  if (await pathExists(filePath))
    throw new Error(`Exploration document already exists: ${session.exploration_id}`)
  await writeMarkdown(
    filePath,
    explorationDocV1Schema.parse({
      schema_version: 1,
      id: session.exploration_id,
      type: 'exploration',
      title: session.title,
      tags: [],
      session_id: session.id,
      authority: 'advisory',
      context_inclusion: 'explicit-only'
    }),
    '## 作者目标\n\n\n## 阶段结论\n\n'
  )
}

function shouldPromoteSessionTitle(session: AgentSessionV1): boolean {
  if (session.turn_ids.length > 0 || session.parent_session_id) return false
  return (
    session.title ===
    `${session.configuration.creator_role.title} · ${formatAssistantSessionTimestamp(session.created_at)}`
  )
}

function deriveSessionTopic(authorInput: string, explorationSummary: string): string {
  const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*$/mu.exec(authorInput)?.[1]
  const firstLine = authorInput
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)
  const raw = heading ?? firstLine ?? explorationSummary
  const cleaned = cleanSessionTitle(raw)
  return cleaned || '创作探索'
}

function cleanSessionTitle(value: string): string {
  return value
    .replace(/^#{1,6}\s*/u, '')
    .replace(/^[-*+]\s+/u, '')
    .replace(/^\d+[.)]\s+/u, '')
    .replace(/!?\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, SESSION_TITLE_MAX_LENGTH)
    .trim()
}

function isLegacyProjectSessionTitle(title: string, roleTitle: string, targetId: string): boolean {
  if (title === `${roleTitle} · ${targetId}`) return true
  return /·\s*project-[a-z0-9-]+$/iu.test(title)
}

async function appendExplorationDocument(
  projectRoot: string,
  explorationId: string,
  turn: AgentTurnV1
): Promise<void> {
  const directory = await ensureExplorationDirectory(projectRoot, false)
  const filePath = path.join(directory, `${projectIdSchema.parse(explorationId)}.md`)
  const raw = await readContainedRegularText(projectRoot, filePath, `Exploration document ${explorationId}`)
  const proposalLinks = turn.proposals.length
    ? `\n\n提案：${turn.proposals.map((proposal) => proposal.id).join('、')}`
    : ''
  const configurationLinks = turn.configuration_proposals.length
    ? `\n\n助手配置提案：${turn.configuration_proposals.map((proposal) => proposal.id).join('、')}`
    : ''
  const questions = turn.open_questions.length
    ? `\n\n未决问题：\n${turn.open_questions.map((question) => `- ${question}`).join('\n')}`
    : ''
  await writeText(
    filePath,
    `${raw.trimEnd()}\n\n### ${turn.created_at} · ${turn.id}\n\n#### 本轮作者目标\n\n${turn.author_input}\n\n#### 阶段结论\n\n${turn.exploration_summary}${questions}${proposalLinks}${configurationLinks}\n`
  )
}

async function ensureExplorationDirectory(projectRoot: string, create: boolean): Promise<string> {
  const directory = path.join(projectRoot, 'explorations')
  if (create) await ensureDir(directory)
  if (!(await pathExists(directory))) throw new Error('Exploration directory does not exist')
  return assertContainedDirectory(projectRoot, directory, 'Exploration directory')
}

async function ensureSessionDirectory(
  projectRoot: string,
  sessionId: string,
  create: boolean
): Promise<string> {
  const safeId = projectIdSchema.parse(sessionId)
  const root = path.join(projectRoot, 'runs', 'assistants')
  if (create) await ensureDir(root)
  if (!(await pathExists(root))) throw new Error('Assistant run directory does not exist')
  await assertContainedDirectory(projectRoot, root, 'Assistant run root')
  const directory = path.join(root, safeId)
  if (create) {
    if (await pathExists(directory)) throw new Error(`Assistant session already exists: ${safeId}`)
    await ensureDir(directory)
  }
  if (!(await pathExists(directory))) throw new Error(`Assistant session not found: ${safeId}`)
  return assertContainedDirectory(projectRoot, directory, `Assistant session ${safeId}`)
}

async function ensureTurnDirectory(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  create: boolean
): Promise<string> {
  const safeTurnId = projectIdSchema.parse(turnId)
  const sessionDirectory = await ensureSessionDirectory(projectRoot, sessionId, false)
  const turnsDirectory = path.join(sessionDirectory, 'turns')
  if (create) await ensureDir(turnsDirectory)
  if (!(await pathExists(turnsDirectory))) throw new Error('Assistant turns directory does not exist')
  const turnsReal = await assertContainedDirectory(
    projectRoot,
    turnsDirectory,
    `Assistant turns ${sessionId}`
  )
  const directory = path.join(turnsReal, safeTurnId)
  if (create) {
    if (await pathExists(directory)) throw new Error(`Assistant turn already exists: ${safeTurnId}`)
    await ensureDir(directory)
  }
  if (!(await pathExists(directory))) throw new Error(`Assistant turn not found: ${safeTurnId}`)
  const directoryReal = await assertContainedDirectory(projectRoot, directory, `Assistant turn ${safeTurnId}`)
  const relative = path.relative(turnsReal, directoryReal)
  if (relative !== safeTurnId || path.isAbsolute(relative)) {
    throw new Error(`Assistant turn resolves outside its session: ${safeTurnId}`)
  }
  return directoryReal
}

async function readContainedRegularText(
  projectRoot: string,
  filePath: string,
  label: string
): Promise<string> {
  const stats = await lstat(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${label} must be a regular file`)
  const [projectReal, fileReal] = await Promise.all([realpath(projectRoot), realpath(filePath)])
  const relative = path.relative(projectReal, fileReal)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the project`)
  }
  return readText(fileReal)
}

async function loadVerifiedAgentTurn(
  projectRoot: string,
  session: AgentSessionV1,
  turnId: string
): Promise<{ turn: AgentTurnV1; source_sha256: string }> {
  const directory = await ensureTurnDirectory(projectRoot, session.id, turnId, false)
  const raw = await readContainedRegularText(
    projectRoot,
    path.join(directory, 'turn.json'),
    `Assistant turn metadata ${turnId}`
  )
  const turn = agentTurnV1Schema.parse(JSON.parse(raw)) as AgentTurnV1
  if (turn.id !== turnId || turn.session_id !== session.id) {
    throw new Error(`AGENT_TURN_ID_MISMATCH: ${turnId}`)
  }
  const snapshotPath = path.join(directory, 'execution-snapshot.json')
  const expectedSnapshotPath = relativePortablePath(projectRoot, snapshotPath)
  if (turn.execution_snapshot_path !== expectedSnapshotPath) {
    throw new Error(`AGENT_TURN_ARTIFACT_PATH_MISMATCH: ${turnId}`)
  }
  const snapshotRaw = await readContainedRegularText(
    projectRoot,
    snapshotPath,
    `Assistant execution snapshot ${turnId}`
  )
  if (sha256Text(snapshotRaw) !== turn.execution_snapshot_sha256) {
    throw new Error(`AGENT_TURN_SNAPSHOT_FILE_HASH_MISMATCH: ${turnId}`)
  }
  const snapshot = assertAgentExecutionSnapshot(JSON.parse(snapshotRaw))
  if (snapshot.session_id !== session.id || snapshot.turn_id !== turnId) {
    throw new Error(`AGENT_TURN_SNAPSHOT_ID_MISMATCH: ${turnId}`)
  }
  await assertTurnArtifactPath(projectRoot, directory, turn.raw_response_path, 'raw-response.txt')
  if (turn.repair_response_path) {
    await assertTurnArtifactPath(projectRoot, directory, turn.repair_response_path, 'repair-response.txt')
  }
  return { turn, source_sha256: sha256Text(raw) }
}

async function loadVerifiedAgentTurnFailure(
  projectRoot: string,
  session: AgentSessionV1,
  turnId: string
): Promise<AgentTurnFailureV1> {
  const directory = await ensureTurnDirectory(projectRoot, session.id, turnId, false)
  const raw = await readContainedRegularText(
    projectRoot,
    path.join(directory, 'failure.json'),
    `Assistant failure metadata ${turnId}`
  )
  const failure = agentTurnFailureV1Schema.parse(JSON.parse(raw)) as AgentTurnFailureV1
  if (failure.id !== turnId || failure.session_id !== session.id) {
    throw new Error(`AGENT_TURN_ID_MISMATCH: ${turnId}`)
  }
  const snapshotPath = path.join(directory, 'execution-snapshot.json')
  const expectedSnapshotPath = relativePortablePath(projectRoot, snapshotPath)
  if (failure.execution_snapshot_path !== expectedSnapshotPath) {
    throw new Error(`AGENT_TURN_ARTIFACT_PATH_MISMATCH: ${turnId}`)
  }
  const snapshotRaw = await readContainedRegularText(
    projectRoot,
    snapshotPath,
    `Assistant execution snapshot ${turnId}`
  )
  if (sha256Text(snapshotRaw) !== failure.execution_snapshot_sha256) {
    throw new Error(`AGENT_TURN_SNAPSHOT_FILE_HASH_MISMATCH: ${turnId}`)
  }
  const snapshot = assertAgentExecutionSnapshot(JSON.parse(snapshotRaw))
  if (snapshot.session_id !== session.id || snapshot.turn_id !== turnId) {
    throw new Error(`AGENT_TURN_SNAPSHOT_ID_MISMATCH: ${turnId}`)
  }
  if (failure.raw_response_path) {
    await assertTurnArtifactPath(projectRoot, directory, failure.raw_response_path, 'raw-response.txt')
  }
  if (failure.repair_response_path) {
    await assertTurnArtifactPath(projectRoot, directory, failure.repair_response_path, 'repair-response.txt')
  }
  return failure
}

async function assertTurnArtifactPath(
  projectRoot: string,
  turnDirectory: string,
  claimedPath: string,
  fileName: string
): Promise<void> {
  const expectedPath = path.join(turnDirectory, fileName)
  if (claimedPath !== relativePortablePath(projectRoot, expectedPath)) {
    throw new Error(`AGENT_TURN_ARTIFACT_PATH_MISMATCH: ${fileName}`)
  }
  await readContainedRegularText(projectRoot, expectedPath, `Assistant turn artifact ${fileName}`)
}

async function assertContainedDirectory(
  projectRoot: string,
  directory: string,
  label: string
): Promise<string> {
  const stats = await lstat(directory)
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`${label} cannot be a symlink`)
  const [projectReal, directoryReal] = await Promise.all([realpath(projectRoot), realpath(directory)])
  const relative = path.relative(projectReal, directoryReal)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the project`)
  }
  return directoryReal
}

function relativePortablePath(projectRoot: string, filePath: string): string {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(filePath))
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Assistant run file is outside the project: ${filePath}`)
  }
  return relative.replace(/\\/gu, '/')
}

function newPortableId(prefix: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/gu, '')
    .slice(0, 17)
  return projectIdSchema.parse(`${prefix}-${timestamp}-${randomUUID().replace(/-/gu, '').slice(0, 12)}`)
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export type { AgentTaskDefinitionV1, ContextBundleV1, CreatorRoleV1 }
