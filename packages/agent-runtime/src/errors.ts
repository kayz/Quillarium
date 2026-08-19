import { AIRequestError, StructuredOutputError } from '@quillarium/ai'
import { SensitiveContentError, sanitizeSensitiveText } from '@quillarium/core/sensitive-data'
import { z } from 'zod'
import { agentArtifactReferenceV1Schema, agentRuntimeIdSchema } from './contracts.js'

export const agentRuntimeErrorCodeSchema = z.enum([
  'AGENT_TASK_NOT_REGISTERED',
  'AGENT_INVALID_REQUEST',
  'AGENT_INVALID_TARGET',
  'AGENT_PREFLIGHT_FAILED',
  'SENSITIVE_PROMPT_CONTENT',
  'AGENT_CONTEXT_LIMIT_EXCEEDED',
  'AGENT_AI_NOT_CONFIGURED',
  'AGENT_PROVIDER_AUTH_FAILED',
  'AGENT_PROVIDER_QUOTA_EXCEEDED',
  'AGENT_PROVIDER_RATE_LIMITED',
  'AGENT_PROVIDER_TIMEOUT',
  'AGENT_PROVIDER_TRANSPORT_FAILED',
  'AGENT_PROVIDER_CONTEXT_EXCEEDED',
  'AGENT_OUTPUT_TRUNCATED',
  'AGENT_EMPTY_RESPONSE',
  'AGENT_INVALID_JSON',
  'AGENT_SCHEMA_MISMATCH',
  'AGENT_REPAIR_FAILED',
  'AGENT_AUDIT_WRITE_FAILED',
  'AGENT_BATCH_PARTIAL_FAILURE',
  'AGENT_APPROVAL_REQUIRED',
  'AGENT_APPROVAL_REJECTED',
  'AGENT_APPROVAL_INVALID',
  'AGENT_APPROVAL_EXPIRED',
  'AGENT_APPROVAL_ALREADY_CONSUMED',
  'AGENT_APPLY_HASH_CONFLICT',
  'AGENT_APPLY_FAILED'
])
export type AgentRuntimeErrorCode = z.infer<typeof agentRuntimeErrorCodeSchema>

export const agentRuntimeErrorPhaseSchema = z.enum([
  'registry',
  'request',
  'preflight',
  'context',
  'audit',
  'provider',
  'response',
  'repair',
  'aggregation',
  'approval',
  'application'
])

export const agentRuntimeErrorV1Schema = z
  .object({
    schema_version: z.literal(1),
    code: agentRuntimeErrorCodeSchema,
    phase: agentRuntimeErrorPhaseSchema,
    task_id: agentRuntimeIdSchema,
    execution_id: agentRuntimeIdSchema,
    retry_safe: z.boolean(),
    message_key: z.string().min(1),
    technical_detail: z.string().max(32_000),
    provider_http_status: z.number().int().optional(),
    provider_request_id: z.string().max(512).optional(),
    finish_reason: z.string().max(256).optional(),
    validation_paths: z.array(z.string().max(1_000)).max(64),
    failed_child_execution_id: agentRuntimeIdSchema.optional(),
    artifacts: z.record(agentArtifactReferenceV1Schema)
  })
  .strict()

export type AgentRuntimeErrorV1 = z.infer<typeof agentRuntimeErrorV1Schema>

export class AgentRuntimeError extends Error {
  readonly value: AgentRuntimeErrorV1

  constructor(value: AgentRuntimeErrorV1, options: { cause?: unknown } = {}) {
    super(value.technical_detail || value.code, { cause: options.cause })
    this.name = 'AgentRuntimeError'
    this.value = agentRuntimeErrorV1Schema.parse(value)
  }
}

export interface RuntimeErrorContext {
  taskId: string
  executionId: string
  phase?: AgentRuntimeErrorV1['phase']
  failedChildExecutionId?: string
  artifacts?: AgentRuntimeErrorV1['artifacts']
}

export function normalizeAgentRuntimeError(cause: unknown, context: RuntimeErrorContext): AgentRuntimeError {
  if (cause instanceof AgentRuntimeError) return cause
  const detail = scrubSensitiveText(errorDetail(cause))
  const status = cause instanceof AIRequestError ? cause.status : undefined
  const code = mapErrorCode(cause, detail, status)
  const phase = context.phase ?? phaseForCode(code)
  const validationPaths =
    cause instanceof StructuredOutputError
      ? cause.validation_issues.slice(0, 64).map((item) => item.slice(0, 1_000))
      : []
  return new AgentRuntimeError(
    {
      schema_version: 1,
      code,
      phase,
      task_id: context.taskId,
      execution_id: context.executionId,
      retry_safe: retrySafe(code),
      message_key: `agent.error.${code.toLowerCase()}`,
      technical_detail: detail.slice(0, 32_000),
      ...(status !== undefined ? { provider_http_status: status } : {}),
      ...(providerRequestId(cause, detail) ? { provider_request_id: providerRequestId(cause, detail) } : {}),
      ...(providerFinishReason(cause, detail) ? { finish_reason: providerFinishReason(cause, detail) } : {}),
      validation_paths: validationPaths,
      ...(context.failedChildExecutionId
        ? { failed_child_execution_id: context.failedChildExecutionId }
        : {}),
      artifacts: context.artifacts ?? {}
    },
    { cause }
  )
}

export function createAgentRuntimeError(
  code: AgentRuntimeErrorCode,
  context: RuntimeErrorContext,
  technicalDetail: string,
  options: Partial<Pick<AgentRuntimeErrorV1, 'retry_safe' | 'validation_paths'>> = {}
): AgentRuntimeError {
  return new AgentRuntimeError({
    schema_version: 1,
    code,
    phase: context.phase ?? phaseForCode(code),
    task_id: context.taskId,
    execution_id: context.executionId,
    retry_safe: options.retry_safe ?? retrySafe(code),
    message_key: `agent.error.${code.toLowerCase()}`,
    technical_detail: scrubSensitiveText(technicalDetail).slice(0, 32_000),
    validation_paths: options.validation_paths ?? [],
    ...(context.failedChildExecutionId ? { failed_child_execution_id: context.failedChildExecutionId } : {}),
    artifacts: context.artifacts ?? {}
  })
}

export interface SanitizedProviderErrorV1 {
  schema_version: 1
  recorded_at: string
  error_name: string
  message: string
  provider_http_status?: number
  provider_request_id?: string
  finish_reason?: string
  response_body?: string
  cause_chain: Array<{ name: string; message: string }>
}

export function sanitizedProviderError(cause: unknown, recordedAt: string): SanitizedProviderErrorV1 {
  const message = scrubSensitiveText(errorDetail(cause)).slice(0, 32_000)
  const chain: Array<{ name: string; message: string }> = []
  let current: unknown = cause
  for (let depth = 0; depth < 6 && current !== undefined && current !== null; depth += 1) {
    const name = current instanceof Error ? current.name : typeof current
    const detail = scrubSensitiveText(errorDetail(current)).slice(0, 8_000)
    chain.push({ name, message: detail })
    current = current instanceof Error ? current.cause : undefined
  }
  const status = cause instanceof AIRequestError ? cause.status : undefined
  return {
    schema_version: 1,
    recorded_at: recordedAt,
    error_name: cause instanceof Error ? cause.name : typeof cause,
    message,
    ...(status !== undefined ? { provider_http_status: status } : {}),
    ...(providerRequestId(cause, message) ? { provider_request_id: providerRequestId(cause, message) } : {}),
    ...(providerFinishReason(cause, message) ? { finish_reason: providerFinishReason(cause, message) } : {}),
    ...(cause instanceof AIRequestError && cause.responseBody
      ? { response_body: scrubSensitiveText(cause.responseBody).slice(0, 16_000) }
      : {}),
    cause_chain: chain
  }
}

export function scrubSensitiveText(value: string): string {
  return sanitizeSensitiveText(value)
}

function mapErrorCode(cause: unknown, detail: string, status: number | undefined): AgentRuntimeErrorCode {
  if (cause instanceof SensitiveContentError || /SENSITIVE_PROMPT_CONTENT/u.test(detail)) {
    return 'SENSITIVE_PROMPT_CONTENT'
  }
  if (/Missing QUILL_AI_API_KEY|not configured|AI_NOT_CONFIGURED/iu.test(detail)) {
    return 'AGENT_AI_NOT_CONFIGURED'
  }
  if (status === 401 || status === 403) return 'AGENT_PROVIDER_AUTH_FAILED'
  if (status === 402 || /quota|credit|insufficient[_\s-]?balance|billing/iu.test(detail)) {
    return 'AGENT_PROVIDER_QUOTA_EXCEEDED'
  }
  if (status === 429) return 'AGENT_PROVIDER_RATE_LIMITED'
  if (/timed out|timeout|AbortError/iu.test(detail)) return 'AGENT_PROVIDER_TIMEOUT'
  if (/AI_OUTPUT_TRUNCATED|finish_reason\s*[=:]\s*length/iu.test(detail)) {
    return 'AGENT_OUTPUT_TRUNCATED'
  }
  if (/context.{0,32}(?:limit|window|length|tokens)|maximum context|too many tokens/iu.test(detail)) {
    return 'AGENT_PROVIDER_CONTEXT_EXCEEDED'
  }
  if (/empty .*response|returned empty|without choices\[0\]/iu.test(detail)) return 'AGENT_EMPTY_RESPONSE'
  if (cause instanceof StructuredOutputError) {
    if (cause.code === 'STRUCTURED_OUTPUT_INVALID_JSON') return 'AGENT_INVALID_JSON'
    if (cause.code === 'STRUCTURED_OUTPUT_SCHEMA_MISMATCH') return 'AGENT_SCHEMA_MISMATCH'
    return 'AGENT_REPAIR_FAILED'
  }
  if (/invalid json|not valid JSON/iu.test(detail)) return 'AGENT_INVALID_JSON'
  if (/schema|invalid fields|validation/iu.test(detail)) return 'AGENT_SCHEMA_MISMATCH'
  return 'AGENT_PROVIDER_TRANSPORT_FAILED'
}

function phaseForCode(code: AgentRuntimeErrorCode): AgentRuntimeErrorV1['phase'] {
  if (code === 'SENSITIVE_PROMPT_CONTENT') return 'preflight'
  if (code.includes('AUDIT')) return 'audit'
  if (code.includes('CONTEXT')) return 'context'
  if (code.includes('REQUEST') || code.includes('TARGET') || code.includes('TASK')) return 'request'
  if (code.includes('INVALID_JSON') || code.includes('SCHEMA') || code.includes('EMPTY_RESPONSE')) {
    return 'response'
  }
  if (code.includes('REPAIR')) return 'repair'
  if (code.includes('APPROVAL')) return 'approval'
  if (code.includes('APPLY')) return 'application'
  if (code.includes('BATCH')) return 'aggregation'
  return 'provider'
}

function retrySafe(code: AgentRuntimeErrorCode): boolean {
  return ![
    'AGENT_INVALID_REQUEST',
    'AGENT_INVALID_TARGET',
    'AGENT_TASK_NOT_REGISTERED',
    'SENSITIVE_PROMPT_CONTENT',
    'AGENT_PROVIDER_AUTH_FAILED',
    'AGENT_APPROVAL_REJECTED',
    'AGENT_APPROVAL_INVALID',
    'AGENT_APPROVAL_ALREADY_CONSUMED'
  ].includes(code)
}

function errorDetail(cause: unknown): string {
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  if (typeof cause === 'string') return cause
  try {
    return JSON.stringify(cause)
  } catch {
    return String(cause)
  }
}

function extractProviderRequestId(detail: string): string | undefined {
  return /(?:request[_ -]?id|x-request-id)\s*[:=]\s*([A-Za-z0-9._-]+)/iu.exec(detail)?.[1]
}

function extractFinishReason(detail: string): string | undefined {
  return /finish_reason\s*[:=]\s*([A-Za-z0-9._-]+)/iu.exec(detail)?.[1]
}

function providerRequestId(cause: unknown, detail: string): string | undefined {
  return cause instanceof AIRequestError && cause.requestId
    ? scrubSensitiveText(cause.requestId).slice(0, 512)
    : extractProviderRequestId(detail)
}

function providerFinishReason(cause: unknown, detail: string): string | undefined {
  return cause instanceof AIRequestError && cause.finishReason
    ? scrubSensitiveText(cause.finishReason).slice(0, 256)
    : extractFinishReason(detail)
}
