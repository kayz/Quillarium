import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AgentTaskRegistry } from './registry.js'
import type { AgentTaskDefinitionV2, AgentTaskHandler } from './contracts.js'

const definition: AgentTaskDefinitionV2 = {
  schema_version: 2,
  id: 'test-task',
  title: 'Test task',
  input_schema_id: 'test-input-v1',
  output_schema_id: 'test-output-v1',
  target_types: ['project'],
  context_scopes: ['project'],
  capability_ceiling: ['read_project', 'invoke_model', 'produce_report'],
  allowed_result_types: ['report'],
  result_disposition: 'report',
  execution_mode: 'single',
  connection_profile: 'check',
  output_mode: 'structured',
  timeout_ms: 1_000,
  approval_policy: 'none'
}

function handler(overrides: Partial<AgentTaskHandler> = {}): AgentTaskHandler {
  return {
    definition,
    inputSchemaId: 'test-input-v1',
    outputSchemaId: 'test-output-v1',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ ok: z.boolean() }).strict(),
    operations: ['read_project', 'invoke_model', 'produce_report'],
    resultDisposition: 'report',
    prepare: async () => ({ planData: {}, deterministicResult: {}, modelCalls: [], warnings: [] }),
    decode: (value) => value,
    aggregate: () => ({ ok: true }),
    ...overrides
  }
}

describe('AgentTaskRegistry', () => {
  it('registers one immutable definition/handler pair', () => {
    const registry = new AgentTaskRegistry([definition], [handler()])
    expect(registry.get('test-task').definition).toEqual(definition)
    expect(Object.isFrozen(registry.get('test-task'))).toBe(true)
    expect(Object.isFrozen(registry.get('test-task').definition)).toBe(true)
    expect(Object.isFrozen(registry.get('test-task').definition.capability_ceiling)).toBe(true)
    expect(() => {
      registry.get('test-task').definition.title = 'mutated by caller'
    }).toThrow()
  })

  it('rejects duplicate definitions and handlers', () => {
    expect(() => new AgentTaskRegistry([definition, definition], [handler()])).toThrow(
      'AGENT_REGISTRY_DUPLICATE_TASK'
    )
    expect(() => new AgentTaskRegistry([definition], [handler(), handler()])).toThrow(
      'AGENT_REGISTRY_DUPLICATE_HANDLER'
    )
  })

  it('rejects a missing handler, schema mismatch, operation escalation, and disposition mismatch', () => {
    expect(() => new AgentTaskRegistry([definition], [])).toThrow('AGENT_REGISTRY_MISSING_HANDLER')
    expect(() => new AgentTaskRegistry([definition], [handler({ inputSchemaId: 'wrong-schema' })])).toThrow(
      'AGENT_REGISTRY_INPUT_SCHEMA_MISMATCH'
    )
    expect(
      () =>
        new AgentTaskRegistry([definition], [handler({ operations: ['read_project', 'compile_context'] })])
    ).toThrow('AGENT_REGISTRY_OPERATION_ESCALATION')
    expect(() => new AgentTaskRegistry([definition], [handler({ resultDisposition: 'candidate' })])).toThrow(
      'AGENT_REGISTRY_DISPOSITION_MISMATCH'
    )
  })
})
