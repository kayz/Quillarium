import { randomUUID } from 'node:crypto'
import {
  contextCompileOptions,
  generateMessages,
  isAIConfigured,
  loadAIProfile,
  parseStructuredResponse,
  StructuredOutputError,
  type AIChatMessage,
  type AIConfig,
  type AIRequestOptions
} from '@quillarium/ai'
import {
  canonicalJson,
  compileContextBlocks,
  createAgentPromptEnvelope,
  createWritingPresetSnapshot,
  defaultWritingPreset,
  loadSelectedWritingPreset,
  sha256Text,
  type LoadedWritingPreset,
  type WritingPresetSnapshot
} from '@quillarium/core'
import { z } from 'zod'
import { AgentArtifactStore, openAgentArtifactStore } from './artifacts.js'
import {
  agentExecutionRequestV1Schema,
  type AgentArtifactReferenceV1,
  type AgentExecutionFailure,
  type AgentExecutionOutcome,
  type AgentExecutionRequestV1,
  type AgentRuntimeDependencies,
  type AgentRuntimeExecutionRequest,
  type AgentTaskHandler,
  type PreparedAgentModelCall
} from './contracts.js'
import {
  AgentRuntimeError,
  createAgentRuntimeError,
  normalizeAgentRuntimeError,
  sanitizedProviderError,
  type AgentRuntimeErrorV1
} from './errors.js'
import { AgentTaskRegistry } from './registry.js'
import {
  createPlanningIntegrityReviewHandler,
  PLANNING_INTEGRITY_REVIEW_DEFINITION
} from './tasks/planning-integrity-review.js'

const runtimeRegistry = new AgentTaskRegistry(
  [PLANNING_INTEGRITY_REVIEW_DEFINITION],
  [createPlanningIntegrityReviewHandler()]
)

const defaultDependencies: AgentRuntimeDependencies = {
  loadAIProfile: (profile) => loadAIProfile(profile),
  invokeProvider: (request) =>
    generateMessages(request.messages, request.config, {
      ...request.options,
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onStreamEvent ? { onStreamEvent: request.onStreamEvent } : {})
    })
}

export function getAgentTaskRegistry(): AgentTaskRegistry {
  return runtimeRegistry
}

export async function executeAgentTask<Result = unknown>(
  rawRequest: AgentRuntimeExecutionRequest,
  dependencies: AgentRuntimeDependencies = defaultDependencies
): Promise<AgentExecutionOutcome<Result, AgentRuntimeErrorV1>> {
  const now = dependencies.now ?? (() => new Date())
  const executionId = dependencies.executionId?.() ?? createExecutionId(now())
  let parsedRequest: AgentExecutionRequestV1
  let handler: AgentTaskHandler
  try {
    const {
      projectRoot: _projectRoot,
      signal: _signal,
      onStreamEvent: _onStreamEvent,
      ...portableRequest
    } = rawRequest
    void _projectRoot
    void _signal
    void _onStreamEvent
    parsedRequest = agentExecutionRequestV1Schema.parse(portableRequest)
    handler = runtimeRegistry.get(parsedRequest.task_id)
    assertTarget(handler, parsedRequest, executionId)
    handler.inputSchema.parse(parsedRequest.input)
  } catch (cause) {
    const error = requestError(cause, rawRequest.task_id, executionId)
    return failureOutcome(executionId, rawRequest.task_id, rawRequest.retry_of, error)
  }

  let parentStore: AgentArtifactStore
  try {
    parentStore = await AgentArtifactStore.create({
      projectRoot: rawRequest.projectRoot,
      executionId,
      taskId: parsedRequest.task_id,
      now,
      ...(dependencies.auditFault ? { fault: dependencies.auditFault } : {})
    })
  } catch (cause) {
    const error = createAgentRuntimeError(
      'AGENT_AUDIT_WRITE_FAILED',
      { taskId: parsedRequest.task_id, executionId, phase: 'audit' },
      errorMessage(cause)
    )
    return failureOutcome(executionId, parsedRequest.task_id, parsedRequest.retry_of, error)
  }

  const sanitizedRequest = sanitizePortableValue(parsedRequest)
  try {
    const requestRef = await parentStore.writeJson('request.json', sanitizedRequest)
    await parentStore.appendEvent(
      'execution.created',
      { request: requestRef },
      {
        requested_by: parsedRequest.requested_by,
        ...(parsedRequest.retry_of ? { retry_of: parsedRequest.retry_of } : {})
      }
    )
  } catch (cause) {
    return parentAuditFailure(parentStore, parsedRequest, cause)
  }

  try {
    const retryOutput = parsedRequest.retry_of
      ? await loadRetryOutput(rawRequest.projectRoot, parsedRequest.retry_of, parsedRequest.task_id)
      : undefined
    const configResolution = await resolveCheckConfig(handler, dependencies)
    const writingPreset = configResolution.config
      ? await resolveTaskWritingPreset(rawRequest.projectRoot, configResolution.config)
      : null
    const input = handler.inputSchema.parse(parsedRequest.input)
    const preparation = await handler.prepare(input, {
      projectRoot: rawRequest.projectRoot,
      request: parsedRequest,
      executionId,
      definition: handler.definition,
      config: configResolution.config,
      writingPreset,
      retryOutput,
      now
    })
    if (configResolution.warning) preparation.warnings.push(configResolution.warning)

    const plan = {
      schema_version: 1,
      execution_id: executionId,
      task: handler.definition,
      target: parsedRequest.target,
      retry_of: parsedRequest.retry_of ?? null,
      batch_count: preparation.modelCalls.length,
      plan_data: preparation.planData,
      model: configResolution.config ? sanitizedModel(configResolution.config) : null,
      writing_preset_sha256: writingPreset?.snapshot_sha256 ?? null,
      created_at: now().toISOString()
    }
    const [planRef, executionRef, presetRef] = await Promise.all([
      parentStore.writeJson('plan.json', plan),
      parentStore.writeJson('agent-execution.json', {
        schema_version: 1,
        execution_id: executionId,
        task_id: handler.definition.id,
        operations: handler.operations,
        result_disposition: handler.resultDisposition,
        domain_apply_allowed: false,
        created_at: now().toISOString()
      }),
      writingPreset
        ? parentStore.writeJson('writing-preset.json', writingPreset)
        : Promise.resolve<AgentArtifactReferenceV1 | null>(null)
    ])
    await parentStore.appendEvent(
      'execution.planned',
      {
        plan: planRef,
        execution: executionRef,
        ...(presetRef ? { writing_preset: presetRef } : {})
      },
      { batch_count: preparation.modelCalls.length }
    )

    const validDocumentIds = new Set<string>(
      Array.isArray(preparation.planData['valid_document_ids'])
        ? (preparation.planData['valid_document_ids'] as unknown[]).filter(
            (value): value is string => typeof value === 'string'
          )
        : []
    )
    const successful: Array<{ childExecutionId: string; call: PreparedAgentModelCall; output: unknown }> = []
    const failed: Array<{
      childExecutionId: string
      call: PreparedAgentModelCall
      error: AgentRuntimeErrorV1
    }> = []
    if (configResolution.config && writingPreset) {
      for (const call of preparation.modelCalls) {
        const childExecutionId = childId(executionId, call.key)
        const outcome = await executePreparedCall({
          projectRoot: rawRequest.projectRoot,
          parentExecutionId: executionId,
          childExecutionId,
          request: parsedRequest,
          handler,
          call,
          config: configResolution.config,
          writingPreset,
          validDocumentIds,
          signal: rawRequest.signal,
          onStreamEvent: rawRequest.onStreamEvent,
          dependencies,
          now
        })
        if (outcome.status === 'completed') {
          successful.push({ childExecutionId, call, output: outcome.result })
        } else {
          failed.push({ childExecutionId, call, error: outcome.error })
        }
      }
    }

    const result = await handler.aggregate({
      request: parsedRequest,
      executionId,
      preparation,
      successful,
      failed,
      now
    })
    const outputRef = await parentStore.writeJson('output.json', result)
    const metadataRef = await parentStore.writeJson('metadata.json', {
      schema_version: 1,
      execution_id: executionId,
      task_id: parsedRequest.task_id,
      status: failed.length ? 'partial' : 'completed',
      children: [
        ...successful.map((item) => ({ id: item.childExecutionId, status: 'completed' })),
        ...failed.map((item) => ({ id: item.childExecutionId, status: 'failed', code: item.error.code }))
      ],
      completed_at: now().toISOString()
    })
    await parentStore.appendEvent(
      'output.validated',
      { output: outputRef },
      {
        failed_batches: failed.length,
        successful_batches: successful.length
      }
    )
    await parentStore.appendEvent(
      'execution.completed',
      { output: outputRef, metadata: metadataRef },
      { status: failed.length ? 'partial' : 'completed' }
    )
    return {
      status: 'completed',
      execution_id: executionId,
      task_id: parsedRequest.task_id,
      ...(parsedRequest.retry_of ? { retry_of: parsedRequest.retry_of } : {}),
      result: result as Result,
      run_path: parentStore.relativeDirectory
    }
  } catch (cause) {
    const error = normalizeAgentRuntimeError(cause, {
      taskId: parsedRequest.task_id,
      executionId,
      phase: cause instanceof AgentRuntimeError ? cause.value.phase : 'preflight'
    })
    await persistExecutionFailure(parentStore, error, cause, now)
    return failureOutcome(executionId, parsedRequest.task_id, parsedRequest.retry_of, error, parentStore)
  }
}

interface PreparedCallInput {
  projectRoot: string
  parentExecutionId: string
  childExecutionId: string
  request: AgentExecutionRequestV1
  handler: AgentTaskHandler
  call: PreparedAgentModelCall
  config: AIConfig
  writingPreset: WritingPresetSnapshot
  validDocumentIds: ReadonlySet<string>
  signal?: AbortSignal
  onStreamEvent?: AgentRuntimeExecutionRequest['onStreamEvent']
  dependencies: AgentRuntimeDependencies
  now: () => Date
}

async function executePreparedCall(
  input: PreparedCallInput
): Promise<AgentExecutionOutcome<unknown, AgentRuntimeErrorV1>> {
  let store: AgentArtifactStore
  try {
    store = await AgentArtifactStore.create({
      projectRoot: input.projectRoot,
      executionId: input.childExecutionId,
      taskId: input.request.task_id,
      now: input.now,
      ...(input.dependencies.auditFault ? { fault: input.dependencies.auditFault } : {})
    })
  } catch (cause) {
    const error = createAgentRuntimeError(
      'AGENT_AUDIT_WRITE_FAILED',
      {
        taskId: input.request.task_id,
        executionId: input.childExecutionId,
        failedChildExecutionId: input.childExecutionId,
        phase: 'audit'
      },
      errorMessage(cause)
    )
    return failureOutcome(input.childExecutionId, input.request.task_id, undefined, error)
  }

  let phase: 'audit' | 'context' | 'provider' | 'response' | 'repair' = 'audit'
  try {
    const requestRef = await store.writeJson('request.json', {
      schema_version: 1,
      task_id: input.request.task_id,
      target: input.request.target,
      parent_execution_id: input.parentExecutionId,
      batch_key: input.call.key,
      language: input.request.language,
      requested_by: input.request.requested_by
    })
    await store.appendEvent(
      'execution.created',
      { request: requestRef },
      {
        parent_execution_id: input.parentExecutionId,
        batch_key: input.call.key
      }
    )

    phase = 'context'
    const options = compileOptions(input.config, input.writingPreset, input.call)
    const compiled = await compileContextBlocks(input.call.target, input.call.candidates, options)
    const envelope = createAgentPromptEnvelope({
      systemMessage:
        input.config.provider === 'openai'
          ? input.call.systemMessage
          : `${input.call.systemMessage}\n\n${structuredOutputContract(input.call)}`,
      userInstructions: input.call.userInstructions,
      contextMarkdown: compiled.markdown,
      conversation: [],
      currentInput: input.call.currentInput,
      createdAt: input.now().toISOString()
    })
    const responseFormat = structuredResponseFormat(input.config, input.call)
    const plan = {
      schema_version: 1,
      execution_id: input.childExecutionId,
      parent_execution_id: input.parentExecutionId,
      task_id: input.request.task_id,
      batch_key: input.call.key,
      model: sanitizedModel(input.config),
      response_format: responseFormat,
      schema_name: input.call.schemaName,
      schema_sha256: sha256Text(canonicalJson(input.call.jsonSchema)),
      timeout_ms: input.handler.definition.timeout_ms,
      metadata: sanitizePortableValue(input.call.metadata),
      created_at: input.now().toISOString()
    }
    const executionSnapshot = {
      schema_version: 1,
      execution_id: input.childExecutionId,
      parent_execution_id: input.parentExecutionId,
      task: input.handler.definition,
      operations: input.handler.operations,
      result_disposition: input.handler.resultDisposition,
      domain_apply_allowed: false,
      writing_preset_sha256: input.writingPreset.snapshot_sha256,
      context_bundle_sha256: sha256Text(canonicalJson(input.call.contextBundle)),
      prompt_sha256: envelope.sent_prompt_sha256,
      context_trace_sha256: sha256Text(canonicalJson(compiled.trace)),
      created_at: input.now().toISOString()
    }

    phase = 'audit'
    const [planRef, executionRef, envelopeRef, blocksRef, traceRef, presetRef, bundleRef] = await Promise.all(
      [
        store.writeJson('plan.json', plan),
        store.writeJson('agent-execution.json', executionSnapshot),
        store.writeJson('prompt-envelope.json', envelope),
        store.writeJson('prompt-blocks.json', compiled.blocks),
        store.writeJson('context-trace.json', compiled.trace),
        store.writeJson('writing-preset.json', input.writingPreset),
        store.writeJson('context-bundle.json', input.call.contextBundle)
      ]
    )
    await store.appendEvent(
      'execution.planned',
      { plan: planRef, execution: executionRef },
      {
        parent_execution_id: input.parentExecutionId
      }
    )
    await store.appendEvent(
      'context.compiled',
      { blocks: blocksRef, trace: traceRef, context_bundle: bundleRef },
      {
        selected_tokens: compiled.trace.budget.selected_tokens,
        available_input_tokens: compiled.trace.budget.available_input_tokens
      }
    )
    await store.appendEvent(
      'request.prepared',
      {
        plan: planRef,
        execution: executionRef,
        prompt_envelope: envelopeRef,
        prompt_blocks: blocksRef,
        context_trace: traceRef,
        writing_preset: presetRef,
        context_bundle: bundleRef
      },
      { attempt: 'initial', prompt_sha256: envelope.sent_prompt_sha256 }
    )
    await store.appendEvent('request.dispatched', { prompt_envelope: envelopeRef }, { attempt: 'initial' })
    phase = 'provider'
    const provider = input.dependencies.invokeProvider ?? defaultDependencies.invokeProvider
    if (!provider) throw new Error('Agent provider transport is unavailable')
    const raw = await provider({
      executionId: input.childExecutionId,
      taskId: input.request.task_id,
      messages: envelope.messages,
      config: input.config,
      options: {
        timeoutMs: input.handler.definition.timeout_ms,
        responseFormat
      },
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.onStreamEvent
        ? {
            onStreamEvent: (event) =>
              input.onStreamEvent?.({
                execution_id: input.childExecutionId,
                task_id: input.request.task_id,
                batch_key: input.call.key,
                event
              })
          }
        : {})
    })
    phase = 'audit'
    const rawRef = await store.write('output-raw.txt', raw)
    await store.appendEvent('response.received', { raw_response: rawRef }, { attempt: 'initial' })
    phase = 'response'
    if (!raw.trim()) {
      throw createAgentRuntimeError(
        'AGENT_EMPTY_RESPONSE',
        {
          taskId: input.request.task_id,
          executionId: input.childExecutionId,
          failedChildExecutionId: input.childExecutionId,
          phase: 'response'
        },
        'The provider returned an empty response.'
      )
    }

    let parsed = parseStructuredResponse(raw, input.handler.outputSchema)
    let value: unknown
    if (parsed.success) {
      value = parsed.value
    } else {
      phase = 'audit'
      const parseErrorRef = await store.writeJson('parse-error.json', {
        schema_version: 1,
        code: parsed.error.code,
        message: parsed.error.message,
        validation_paths: parsed.error.validation_issues,
        recorded_at: input.now().toISOString()
      })
      const repairEnvelope = createRepairEnvelope(envelope.messages, raw, parsed.error, input.call, input.now)
      const repairEnvelopeRef = await store.writeJson('prompt-envelope-repair.json', repairEnvelope)
      await store.appendEvent(
        'request.prepared',
        { prompt_envelope: repairEnvelopeRef, raw_response: rawRef, parse_error: parseErrorRef },
        { attempt: 'repair', prompt_sha256: repairEnvelope.sent_prompt_sha256 }
      )
      await store.appendEvent(
        'request.dispatched',
        { prompt_envelope: repairEnvelopeRef },
        { attempt: 'repair' }
      )
      let repairRaw: string
      try {
        phase = 'repair'
        repairRaw = await provider({
          executionId: input.childExecutionId,
          taskId: input.request.task_id,
          messages: repairEnvelope.messages,
          config: input.config,
          options: {
            timeoutMs: input.handler.definition.timeout_ms,
            maxRetries: 0,
            responseFormat
          },
          ...(input.signal ? { signal: input.signal } : {}),
          ...(input.onStreamEvent
            ? {
                onStreamEvent: (event) =>
                  input.onStreamEvent?.({
                    execution_id: input.childExecutionId,
                    task_id: input.request.task_id,
                    batch_key: input.call.key,
                    event
                  })
              }
            : {})
        })
      } catch (cause) {
        throw new StructuredOutputError(
          'STRUCTURED_OUTPUT_REPAIR_FAILED',
          'The bounded repair request failed before it returned a valid response.',
          { rawResponse: raw, validationIssues: parsed.error.validation_issues, cause }
        )
      }
      phase = 'audit'
      const repairRef = await store.write('output-repair.txt', repairRaw)
      await store.appendEvent('response.repair-received', { repair_response: repairRef }, {})
      phase = 'repair'
      parsed = parseStructuredResponse(repairRaw, input.handler.outputSchema)
      if (!parsed.success) {
        phase = 'audit'
        await store.writeJson('repair-parse-error.json', {
          schema_version: 1,
          code: parsed.error.code,
          message: parsed.error.message,
          validation_paths: parsed.error.validation_issues,
          recorded_at: input.now().toISOString()
        })
        phase = 'repair'
        throw new StructuredOutputError(
          'STRUCTURED_OUTPUT_REPAIR_FAILED',
          'Structured AI response still failed validation after one repair attempt.',
          {
            rawResponse: raw,
            repairResponse: repairRaw,
            validationIssues: parsed.error.validation_issues,
            cause: parsed.error
          }
        )
      }
      value = parsed.value
    }

    const decoded = await input.handler.decode(value, {
      request: input.request,
      call: input.call,
      validDocumentIds: input.validDocumentIds
    })
    phase = 'audit'
    const outputRef = await store.writeJson('output.json', decoded)
    await store.appendEvent('output.validated', { output: outputRef }, {})
    await store.appendEvent('execution.completed', { output: outputRef }, { status: 'completed' })
    return {
      status: 'completed',
      execution_id: input.childExecutionId,
      task_id: input.request.task_id,
      result: decoded,
      run_path: store.relativeDirectory
    }
  } catch (cause) {
    const error =
      phase === 'audit'
        ? createAgentRuntimeError(
            'AGENT_AUDIT_WRITE_FAILED',
            {
              taskId: input.request.task_id,
              executionId: input.childExecutionId,
              failedChildExecutionId: input.childExecutionId,
              phase: 'audit'
            },
            errorMessage(cause)
          )
        : phase === 'context'
          ? createAgentRuntimeError(
              'AGENT_CONTEXT_LIMIT_EXCEEDED',
              {
                taskId: input.request.task_id,
                executionId: input.childExecutionId,
                failedChildExecutionId: input.childExecutionId,
                phase: 'context'
              },
              errorMessage(cause)
            )
          : normalizeAgentRuntimeError(cause, {
              taskId: input.request.task_id,
              executionId: input.childExecutionId,
              failedChildExecutionId: input.childExecutionId,
              phase
            })
    await persistExecutionFailure(store, error, cause, input.now)
    return failureOutcome(input.childExecutionId, input.request.task_id, undefined, error, store)
  }
}

async function persistExecutionFailure(
  store: AgentArtifactStore,
  error: AgentRuntimeError,
  cause: unknown,
  now: () => Date
): Promise<void> {
  try {
    const providerRef = await store.writeJson(
      'provider-error.json',
      sanitizedProviderError(cause, now().toISOString())
    )
    const withArtifact = new AgentRuntimeError({
      ...error.value,
      artifacts: { ...error.value.artifacts, provider_error: providerRef }
    })
    const errorRef = await store.writeJson('error.json', withArtifact.value)
    await store.appendEvent(
      'execution.failed',
      { error: errorRef, provider_error: providerRef },
      { code: withArtifact.value.code, phase: withArtifact.value.phase }
    )
  } catch {
    // The original typed failure is still returned. Audit failure is separately visible by missing artifacts.
  }
}

async function parentAuditFailure(
  store: AgentArtifactStore,
  request: AgentExecutionRequestV1,
  cause: unknown
): Promise<AgentExecutionFailure<AgentRuntimeErrorV1>> {
  const error = createAgentRuntimeError(
    'AGENT_AUDIT_WRITE_FAILED',
    { taskId: request.task_id, executionId: store.executionId, phase: 'audit' },
    errorMessage(cause)
  )
  await persistExecutionFailure(store, error, cause, () => new Date())
  return failureOutcome(store.executionId, request.task_id, request.retry_of, error, store)
}

async function resolveCheckConfig(
  handler: AgentTaskHandler,
  dependencies: AgentRuntimeDependencies
): Promise<{ config: AIConfig | null; warning?: string }> {
  try {
    const config = await dependencies.loadAIProfile(handler.definition.connection_profile)
    if (!isAIConfigured(config)) {
      return {
        config: null,
        warning: 'The check model is not configured; semantic batches were not dispatched.'
      }
    }
    return { config }
  } catch (cause) {
    return {
      config: null,
      warning: `The check model could not be loaded: ${errorMessage(cause)}`
    }
  }
}

async function resolveTaskWritingPreset(
  projectRoot: string,
  config: AIConfig
): Promise<WritingPresetSnapshot> {
  let loaded: LoadedWritingPreset
  try {
    loaded = await loadSelectedWritingPreset(projectRoot)
  } catch {
    const preset = defaultWritingPreset('agent-check-default', 'Agent check defaults')
    loaded = {
      preset: { ...preset, model: { ...preset.model, profile: 'check' } },
      source_path: 'application/presets/agent-check-default.yaml',
      source_sha256: sha256Text(canonicalJson(preset)),
      source_schema_version: 2
    }
  }
  return createWritingPresetSnapshot(loaded, {
    profile: 'check',
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    max_output_tokens: config.maxTokens,
    ...(loaded.preset.model.tokenizer_id ? { tokenizer_id: loaded.preset.model.tokenizer_id } : {})
  })
}

function compileOptions(config: AIConfig, preset: WritingPresetSnapshot, call: PreparedAgentModelCall) {
  const tokenizerId = preset.model.tokenizer_id ?? defaultTokenizer(config)
  return {
    ...contextCompileOptions(config, {
      ...preset,
      model: { ...preset.model, tokenizer_id: tokenizerId }
    }),
    model: { provider: config.provider, model: config.model, tokenizer_id: tokenizerId },
    framing_text: [
      call.systemMessage,
      ...call.userInstructions,
      call.currentInput,
      canonicalJson(call.jsonSchema)
    ].join('\n'),
    reached_recursion_depth: 0
  }
}

function structuredResponseFormat(
  config: AIConfig,
  call: PreparedAgentModelCall
): NonNullable<AIRequestOptions['responseFormat']> {
  return config.provider === 'openai'
    ? { type: 'json_schema', name: call.schemaName, schema: call.jsonSchema, strict: true }
    : 'json_object'
}

function createRepairEnvelope(
  initialMessages: AIChatMessage[],
  raw: string,
  error: StructuredOutputError,
  call: PreparedAgentModelCall,
  now: () => Date
) {
  const system = initialMessages[0]?.content ?? 'Return valid JSON.'
  const initialUser = initialMessages.at(-1)?.content ?? ''
  return createAgentPromptEnvelope({
    systemMessage: system,
    userInstructions: [],
    contextMarkdown: '',
    conversation: [
      { role: 'author', content: initialUser },
      { role: 'assistant', content: raw }
    ],
    currentInput: [
      'Return one corrected JSON object only.',
      'Do not add Markdown fences or commentary.',
      `Validation failure: ${error.code}`,
      'Specific validation errors:',
      ...(error.validation_issues.length
        ? error.validation_issues.slice(0, 24)
        : ['root: response is not valid JSON']),
      structuredOutputContract(call)
    ].join('\n'),
    createdAt: now().toISOString()
  })
}

function structuredOutputContract(call: PreparedAgentModelCall): string {
  return [
    'CODE-OWNED STRUCTURED OUTPUT CONTRACT (authoritative):',
    `schema_name: ${call.schemaName}`,
    'Return exactly one JSON object. Do not invent category values or omit required fields.',
    'Full JSON Schema:',
    JSON.stringify(call.jsonSchema, null, 2),
    'Minimum valid example:',
    minimumStructuredExample(call.jsonSchema)
  ].join('\n')
}

function minimumStructuredExample(schema: Record<string, unknown>): string {
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : []
  if (required.includes('issues')) return '{"issues":[]}'
  const result: Record<string, unknown> = {}
  const properties = isRecord(schema.properties) ? schema.properties : {}
  for (const key of required) {
    const property = isRecord(properties[key]) ? properties[key] : {}
    if (property.type === 'array') result[key] = []
    else if (property.type === 'object') result[key] = {}
    else if (property.type === 'string') result[key] = 'example'
    else result[key] = null
  }
  return JSON.stringify(result)
}

async function loadRetryOutput(projectRoot: string, executionId: string, taskId: string): Promise<unknown> {
  const store = await openAgentArtifactStore({ projectRoot, executionId })
  if (store.taskId !== taskId) throw new Error('Retry execution belongs to another Agent task')
  return store.readJson('output.json')
}

function assertTarget(
  handler: AgentTaskHandler,
  request: AgentExecutionRequestV1,
  executionId: string
): void {
  const targetType = request.target?.type ?? 'project'
  if (!handler.definition.target_types.includes(targetType)) {
    throw createAgentRuntimeError(
      'AGENT_INVALID_TARGET',
      { taskId: request.task_id, executionId, phase: 'request' },
      `Task ${request.task_id} does not allow target type ${targetType}`,
      { retry_safe: false }
    )
  }
}

function requestError(cause: unknown, taskId: string, executionId: string): AgentRuntimeError {
  if (cause instanceof AgentRuntimeError) return cause
  const code = /NOT_REGISTERED/iu.test(errorMessage(cause))
    ? 'AGENT_TASK_NOT_REGISTERED'
    : 'AGENT_INVALID_REQUEST'
  const validation = cause instanceof z.ZodError ? cause.issues.map((issue) => issue.path.join('.')) : []
  return createAgentRuntimeError(
    code,
    { taskId: safeRuntimeId(taskId), executionId, phase: 'request' },
    errorMessage(cause),
    { retry_safe: false, validation_paths: validation }
  )
}

function failureOutcome(
  executionId: string,
  taskId: string,
  retryOf: string | undefined,
  error: AgentRuntimeError,
  store?: AgentArtifactStore
): AgentExecutionFailure<AgentRuntimeErrorV1> {
  return {
    status: 'failed',
    execution_id: executionId,
    task_id: safeRuntimeId(taskId),
    ...(retryOf ? { retry_of: retryOf } : {}),
    error: error.value,
    run_path: store?.relativeDirectory ?? `runs/agents/${executionId}`
  }
}

function sanitizedModel(config: AIConfig): Record<string, unknown> {
  return {
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    max_output_tokens: config.maxTokens,
    context_window_tokens: config.contextWindowTokens ?? null
  }
}

function sanitizePortableValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizePortableValue(item, key))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        /(?:api.?key|authorization|secret|password|access.?token)/iu.test(childKey)
          ? '[REDACTED]'
          : sanitizePortableValue(childValue, childKey)
      ])
    )
  }
  if (typeof value === 'string') {
    if (/(?:path|root|directory)$/iu.test(key) && /^(?:[a-z]:[\\/]|[/\\])/iu.test(value)) {
      return '[LOCAL_PATH]'
    }
    return value.replace(/\b[A-Za-z]:[\\/][^\r\n]*/gu, '[LOCAL_PATH]')
  }
  return value
}

function childId(parent: string, key: string): string {
  const value = `${parent}-${key}`.toLowerCase().replace(/[^a-z0-9._-]+/gu, '-')
  return value.slice(0, 160).replace(/[-_.]+$/u, '')
}

function createExecutionId(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)
  return `agent-${stamp}-${randomUUID().toLowerCase()}`
}

function defaultTokenizer(config: AIConfig): 'deepseek-v4' | 'o200k' | 'cl100k' {
  if (config.provider === 'deepseek' || config.model.toLowerCase().includes('deepseek-v4')) {
    return 'deepseek-v4'
  }
  return /(?:gpt-5|gpt-4o|\bo[1-9])/iu.test(config.model) ? 'o200k' : 'cl100k'
}

function safeRuntimeId(value: string): string {
  const normalized = String(value || 'unknown-task')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^[-_.]+|[-_.]+$/gu, '')
  return normalized || 'unknown-task'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
}
