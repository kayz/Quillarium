import { z } from 'zod'
import {
  agentTaskDefinitionV2Schema,
  type AgentRuntimeOperation,
  type AgentTaskDefinitionV2,
  type AgentTaskHandler
} from './contracts.js'

export class AgentTaskRegistry {
  readonly #handlers = new Map<string, AgentTaskHandler>()

  constructor(definitions: readonly AgentTaskDefinitionV2[], handlers: readonly AgentTaskHandler[]) {
    const parsedDefinitions = definitions.map((definition) => agentTaskDefinitionV2Schema.parse(definition))
    const definitionIds = new Set<string>()
    for (const definition of parsedDefinitions) {
      if (definitionIds.has(definition.id)) throw new Error(`AGENT_REGISTRY_DUPLICATE_TASK: ${definition.id}`)
      definitionIds.add(definition.id)
    }

    const handlerIds = new Set<string>()
    for (const handler of handlers) {
      const definition = agentTaskDefinitionV2Schema.parse(handler.definition)
      if (handlerIds.has(definition.id)) throw new Error(`AGENT_REGISTRY_DUPLICATE_HANDLER: ${definition.id}`)
      handlerIds.add(definition.id)
      const registered = parsedDefinitions.find((item) => item.id === definition.id)
      if (!registered) throw new Error(`AGENT_REGISTRY_UNDECLARED_HANDLER: ${definition.id}`)
      assertHandlerMatchesDefinition(registered, handler)
      const immutableDefinition = deepFreeze(registered)
      const immutableHandler = Object.freeze({
        ...handler,
        definition: immutableDefinition,
        operations: Object.freeze([...handler.operations])
      })
      this.#handlers.set(definition.id, immutableHandler)
    }

    for (const definition of parsedDefinitions) {
      if (!this.#handlers.has(definition.id))
        throw new Error(`AGENT_REGISTRY_MISSING_HANDLER: ${definition.id}`)
    }
  }

  get(taskId: string): AgentTaskHandler {
    const handler = this.#handlers.get(taskId)
    if (!handler) throw new Error(`AGENT_TASK_NOT_REGISTERED: ${taskId}`)
    return handler
  }

  list(): AgentTaskDefinitionV2[] {
    return [...this.#handlers.values()].map((handler) => handler.definition)
  }
}

function assertHandlerMatchesDefinition(definition: AgentTaskDefinitionV2, handler: AgentTaskHandler): void {
  if (handler.inputSchemaId !== definition.input_schema_id) {
    throw new Error(`AGENT_REGISTRY_INPUT_SCHEMA_MISMATCH: ${definition.id}`)
  }
  if (handler.outputSchemaId !== definition.output_schema_id) {
    throw new Error(`AGENT_REGISTRY_OUTPUT_SCHEMA_MISMATCH: ${definition.id}`)
  }
  assertSchemaUsable(handler.inputSchema, `${definition.id} input`)
  assertSchemaUsable(handler.outputSchema, `${definition.id} output`)
  const ceiling = new Set<AgentRuntimeOperation>(definition.capability_ceiling)
  for (const operation of handler.operations) {
    if (!ceiling.has(operation)) {
      throw new Error(`AGENT_REGISTRY_OPERATION_ESCALATION: ${definition.id}:${operation}`)
    }
  }
  if (handler.resultDisposition !== definition.result_disposition) {
    throw new Error(`AGENT_REGISTRY_DISPOSITION_MISMATCH: ${definition.id}`)
  }
  if (!definition.allowed_result_types.includes(handler.resultDisposition)) {
    throw new Error(`AGENT_REGISTRY_ILLEGAL_DISPOSITION: ${definition.id}`)
  }
}

function assertSchemaUsable(schema: z.ZodTypeAny, label: string): void {
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error(`AGENT_REGISTRY_INVALID_SCHEMA: ${label}`)
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}
