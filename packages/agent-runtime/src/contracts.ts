import type { AIChatMessage, AIConfig, AIRequestOptions, AIStreamEvent } from '@quillarium/ai'
import type {
  AgentPromptEnvelopeV1,
  ContextCompileOptions,
  ContextBundleV1,
  ContextTrace,
  PromptBlock,
  PromptBlockCandidate,
  WritingPresetSnapshot
} from '@quillarium/core'
import { z, type ZodType } from 'zod'

export const agentRuntimeIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[a-z0-9._-]*[a-z0-9])?$/u)

export const agentTaskResultTypeSchema = z.enum(['candidate', 'proposal', 'exploration', 'report'])
export type AgentTaskResultType = z.infer<typeof agentTaskResultTypeSchema>

export const agentRuntimeOperationSchema = z.enum([
  'read_project',
  'compile_context',
  'invoke_model',
  'produce_report',
  'propose_issue'
])
export type AgentRuntimeOperation = z.infer<typeof agentRuntimeOperationSchema>

export const agentTaskTargetSchema = z
  .object({ type: z.string().min(1), id: z.string().min(1) })
  .strict()
  .nullable()

export const agentTaskDefinitionV2Schema = z
  .object({
    schema_version: z.literal(2),
    id: agentRuntimeIdSchema,
    title: z.string().min(1),
    input_schema_id: agentRuntimeIdSchema,
    output_schema_id: agentRuntimeIdSchema,
    target_types: z.array(z.string().min(1)),
    context_scopes: z.array(z.string().min(1)),
    capability_ceiling: z.array(agentRuntimeOperationSchema),
    allowed_result_types: z.array(agentTaskResultTypeSchema).min(1),
    result_disposition: agentTaskResultTypeSchema,
    execution_mode: z.enum(['single', 'batch']),
    connection_profile: z.enum(['prose', 'background', 'check']),
    output_mode: z.enum(['text', 'structured']),
    timeout_ms: z.number().int().positive(),
    approval_policy: z.enum(['none', 'author-required'])
  })
  .strict()
  .superRefine((definition, context) => {
    if (new Set(definition.capability_ceiling).size !== definition.capability_ceiling.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capability_ceiling'],
        message: 'Capability ceiling cannot contain duplicates'
      })
    }
    if (new Set(definition.allowed_result_types).size !== definition.allowed_result_types.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowed_result_types'],
        message: 'Allowed result types cannot contain duplicates'
      })
    }
    if (!definition.allowed_result_types.includes(definition.result_disposition)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result_disposition'],
        message: 'Result disposition must be included in allowed result types'
      })
    }
    if (!definition.capability_ceiling.includes('read_project')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capability_ceiling'],
        message: 'Product Agent tasks must explicitly declare read_project'
      })
    }
  })

export type AgentTaskDefinitionV2 = z.infer<typeof agentTaskDefinitionV2Schema>

export const agentExecutionRequestV1Schema = z
  .object({
    schema_version: z.literal(1),
    task_id: agentRuntimeIdSchema,
    target: agentTaskTargetSchema,
    input: z.unknown(),
    language: z.enum(['zh', 'en']),
    requested_by: z.enum(['author', 'recipe']),
    retry_of: agentRuntimeIdSchema.optional()
  })
  .strict()

export type AgentExecutionRequestV1 = z.infer<typeof agentExecutionRequestV1Schema>

export interface AgentRuntimeExecutionRequest extends AgentExecutionRequestV1 {
  /** Machine-local and deliberately removed from persisted request artifacts. */
  projectRoot: string
  /** Reserved for a later provider-acknowledged cancellation protocol. */
  signal?: AbortSignal
  /** Machine-local sanitized progress; deliberately excluded from persisted request artifacts. */
  onStreamEvent?: (event: AgentRuntimeStreamEvent) => void
}

export interface AgentRuntimeStreamEvent {
  execution_id: string
  task_id: string
  batch_key: string
  event: AIStreamEvent
}

export interface PreparedAgentModelCall {
  key: string
  target: { type: 'outline' | 'scene' | 'assistant'; id: string }
  candidates: PromptBlockCandidate[]
  contextBundle: ContextBundleV1
  systemMessage: string
  userInstructions: string[]
  currentInput: string
  schemaName: string
  jsonSchema: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface PreparedAgentTask {
  planData: Record<string, unknown>
  deterministicResult: unknown
  modelCalls: PreparedAgentModelCall[]
  warnings: string[]
  priorSuccessfulResults?: unknown[]
  priorBatchResults?: unknown[]
}

export interface AgentPrepareContext {
  projectRoot: string
  request: AgentExecutionRequestV1
  executionId: string
  definition: AgentTaskDefinitionV2
  config: AIConfig | null
  writingPreset: WritingPresetSnapshot | null
  retryOutput?: unknown
  now: () => Date
}

export interface AgentDecodeContext {
  request: AgentExecutionRequestV1
  call: PreparedAgentModelCall
  validDocumentIds: ReadonlySet<string>
}

export interface AgentAggregateContext {
  request: AgentExecutionRequestV1
  executionId: string
  preparation: PreparedAgentTask
  successful: Array<{ childExecutionId: string; call: PreparedAgentModelCall; output: unknown }>
  failed: Array<{ childExecutionId: string; call: PreparedAgentModelCall; error: unknown }>
  now: () => Date
}

export interface AgentTaskHandler<Input = unknown, ModelOutput = unknown, Result = unknown> {
  definition: AgentTaskDefinitionV2
  inputSchemaId: string
  outputSchemaId: string
  inputSchema: ZodType<Input, z.ZodTypeDef, unknown>
  outputSchema: ZodType<ModelOutput, z.ZodTypeDef, unknown>
  operations: readonly AgentRuntimeOperation[]
  resultDisposition: AgentTaskResultType
  prepare(input: Input, context: AgentPrepareContext): Promise<PreparedAgentTask>
  decode(value: ModelOutput, context: AgentDecodeContext): Promise<unknown> | unknown
  aggregate(context: AgentAggregateContext): Promise<Result> | Result
}

export interface AgentProviderRequest {
  executionId: string
  taskId: string
  messages: AIChatMessage[]
  config: AIConfig
  options: AIRequestOptions
  signal?: AbortSignal
  onStreamEvent?: AIRequestOptions['onStreamEvent']
}

export type AgentProvider = (request: AgentProviderRequest) => Promise<string>

export interface AgentRuntimeDependencies {
  loadAIProfile(profile: 'prose' | 'background' | 'check'): Promise<AIConfig>
  /** Runtime-owned transport by default; injectable only for tests and alternate local adapters. */
  invokeProvider?: AgentProvider
  now?: () => Date
  executionId?: () => string
  /** Test-only fault-injection point; production callers omit it. */
  auditFault?: (operation: string, relativePath: string) => void | Promise<void>
}

export interface AgentArtifactReferenceV1 {
  path: string
  sha256: string
  bytes: number
}

export const agentArtifactReferenceV1Schema = z
  .object({
    path: z
      .string()
      .min(1)
      .refine((value) => !/^(?:[a-z]:[\\/]|[/\\])/iu.test(value), 'Artifact path must be relative')
      .refine(
        (value) => !value.replace(/\\/gu, '/').split('/').includes('..'),
        'Artifact path must be contained'
      ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    bytes: z.number().int().nonnegative()
  })
  .strict()

export const agentExecutionEventTypeSchema = z.enum([
  'execution.created',
  'execution.planned',
  'context.compiled',
  'request.prepared',
  'request.dispatched',
  'response.received',
  'response.repair-received',
  'output.validated',
  'approval.requested',
  'approval.decided',
  'application.started',
  'application.completed',
  'application.failed',
  'execution.completed',
  'execution.failed',
  'execution.cancelled'
])

export type AgentExecutionEventType = z.infer<typeof agentExecutionEventTypeSchema>

export const agentExecutionEventV1Schema = z
  .object({
    schema_version: z.literal(1),
    seq: z.number().int().positive(),
    recorded_at: z.string().datetime(),
    execution_id: agentRuntimeIdSchema,
    task_id: agentRuntimeIdSchema,
    type: agentExecutionEventTypeSchema,
    artifacts: z.record(agentArtifactReferenceV1Schema),
    data: z.record(z.unknown())
  })
  .strict()

export type AgentExecutionEventV1 = z.infer<typeof agentExecutionEventV1Schema>

export interface PreparedWireExecution {
  promptEnvelope: AgentPromptEnvelopeV1
  promptBlocks: PromptBlock[]
  contextTrace: ContextTrace
  contextOptions: ContextCompileOptions
}

export interface AgentExecutionSuccess<Result = unknown> {
  status: 'completed'
  execution_id: string
  task_id: string
  retry_of?: string
  result: Result
  run_path: string
}

export interface AgentExecutionFailure<ErrorValue = unknown> {
  status: 'failed'
  execution_id: string
  task_id: string
  retry_of?: string
  error: ErrorValue
  run_path: string
}

export type AgentExecutionOutcome<Result = unknown, ErrorValue = unknown> =
  AgentExecutionSuccess<Result> | AgentExecutionFailure<ErrorValue>
