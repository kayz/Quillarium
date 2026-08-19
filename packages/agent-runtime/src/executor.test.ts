import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIRequestError, type AIConfig } from '@quillarium/ai'
import { createForeshadowing, createProjectAt, listDocs, pathExists, type IssueDoc } from '@quillarium/core'
import { executeAgentTask } from './executor.js'
import { openAgentArtifactStore } from './artifacts.js'
import type { AgentProvider, AgentRuntimeDependencies } from './contracts.js'
import type { PlanningIntegrityReviewResult } from './tasks/planning-integrity-review.js'

const roots: string[] = []
const config: AIConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-only-secret',
  model: 'gpt-4',
  temperature: 0,
  maxTokens: 1_000,
  contextWindowTokens: 32_000
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('executeAgentTask', () => {
  it('durably prepares every model-visible artifact before provider dispatch and writes no issue', async () => {
    const root = await projectWithCheckCard('agent-write-ahead')
    const provider = vi.fn(async (request: Parameters<AgentProvider>[0]) => {
      const store = await openAgentArtifactStore({
        projectRoot: root,
        executionId: request.executionId,
        taskId: request.taskId
      })
      const events = await store.events()
      const prepared = events.find((event) => event.type === 'request.prepared')
      expect(prepared).toBeDefined()
      for (const reference of Object.values(prepared!.artifacts)) await store.verifyReference(reference)
      expect(await store.read('prompt-envelope.json')).not.toContain('test-only-secret')
      expect(await store.read('context-bundle.json')).toContain('foreshadow-permit')
      return JSON.stringify({
        issues: [
          {
            category: 'foreshadowing',
            severity: 'warning',
            title: '通行规则缺少边界',
            message: '卡片没有说明夜间例外。',
            evidence: '规则仅描述白天。',
            evidence_refs: [{ document_id: 'foreshadow-permit', kind: 'body', quote: 'Day use only.' }],
            related_ids: ['foreshadow-permit']
          }
        ]
      })
    })
    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, ['agent-write-ahead-parent'])
    )
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect(outcome.result.semantic_proposals).toHaveLength(1)
    expect(outcome.result.deterministic_findings.length).toBeGreaterThan(0)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('blocks sensitive prompt content before creating Agent Run artifacts or invoking the provider', async () => {
    const root = await projectWithCheckCard('agent-sensitive-preflight')
    await createForeshadowing(
      root,
      'Sensitive fixture',
      { id: 'foreshadow-sensitive', enabled: true, trigger_conditions: [] },
      'Synthetic source path C:\\Users\\writer\\private-notes.md'
    )
    const provider = vi.fn(async () => JSON.stringify({ issues: [] }))
    const executionId = 'agent-sensitive-preflight-parent'

    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, [executionId])
    )

    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') {
      expect(outcome.error.code).toBe('SENSITIVE_PROMPT_CONTENT')
      expect(outcome.error.technical_detail).not.toContain('private-notes')
    }
    expect(provider).not.toHaveBeenCalled()
    expect(await pathExists(path.join(root, 'runs', 'agents', executionId))).toBe(false)
  })

  it('keeps AI identity stable when explanation changes but the verified evidence reference does not', async () => {
    const root = await projectWithCheckCard('agent-evidence-identity')
    const response = (title: string, message: string, evidence: string) =>
      JSON.stringify({
        issues: [
          {
            category: 'foreshadowing',
            severity: 'warning',
            title,
            message,
            evidence,
            evidence_refs: [{ document_id: 'foreshadow-permit', kind: 'body', quote: 'Day use only.' }],
            related_ids: ['foreshadow-permit']
          }
        ]
      })
    const first = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(
        vi.fn(async () => response('First wording', 'First explanation.', 'First display evidence.')),
        ['agent-evidence-first']
      )
    )
    const second = await executeAgentTask<PlanningIntegrityReviewResult>(
      { ...request(root), language: 'en' },
      dependencies(
        vi.fn(async () =>
          response('Rewritten title', 'Rewritten explanation.', 'Rewritten display evidence.')
        ),
        ['agent-evidence-second']
      )
    )

    expect(first.status).toBe('completed')
    expect(second.status).toBe('completed')
    if (first.status !== 'completed' || second.status !== 'completed') return
    expect(first.result.semantic_proposals[0]?.fingerprint).toBe(
      second.result.semantic_proposals[0]?.fingerprint
    )
  })

  it('contains an unverifiable evidence reference as one failed structured batch', async () => {
    const root = await projectWithCheckCard('agent-invalid-evidence')
    const provider = vi.fn(async () =>
      JSON.stringify({
        issues: [
          {
            category: 'foreshadowing',
            severity: 'warning',
            title: 'Unverified title evidence',
            message: 'Do not trust display titles as evidence.',
            evidence: 'Permit rule',
            evidence_refs: [{ document_id: 'foreshadow-permit', kind: 'field', field_path: 'title' }],
            related_ids: ['foreshadow-permit']
          }
        ]
      })
    )

    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, ['agent-invalid-evidence-parent'])
    )

    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect(outcome.result.semantic_proposals).toEqual([])
    expect(outcome.result.batches).toEqual([
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({ code: 'AGENT_SCHEMA_MISMATCH' })
      })
    ])
  })

  it('returns AGENT_AUDIT_WRITE_FAILED and performs zero provider calls when write-ahead flush fails', async () => {
    const root = await projectWithCheckCard('agent-audit-failure')
    const provider = vi.fn(async () => JSON.stringify({ issues: [] }))
    const outcome = await executeAgentTask(request(root), {
      ...dependencies(provider, ['agent-audit-parent']),
      auditFault: (operation) => {
        if (operation === 'append') throw new Error('simulated fsync failure')
      }
    })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.error.code).toBe('AGENT_AUDIT_WRITE_FAILED')
    expect(provider).not.toHaveBeenCalled()
  })

  it('performs zero provider calls when a child artifact or request.prepared flush fails', async () => {
    for (const failure of ['prompt-blocks', 'prompt-envelope-flush', 'prepared-event'] as const) {
      const root = await projectWithCheckCard(`agent-child-audit-${failure}`)
      const parentId = `agent-child-audit-${failure}-parent`
      const provider = vi.fn(async () => JSON.stringify({ issues: [] }))
      let childAppendCount = 0
      const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(request(root), {
        ...dependencies(provider, [parentId]),
        auditFault: (operation, relativePath) => {
          const childArtifact = relativePath.includes(`${parentId}-batch-`)
          if (
            failure === 'prompt-blocks' &&
            childArtifact &&
            operation === 'write' &&
            relativePath.endsWith('/prompt-blocks.json')
          ) {
            throw new Error('simulated model-visible artifact failure')
          }
          if (
            failure === 'prompt-envelope-flush' &&
            childArtifact &&
            operation === 'flush' &&
            relativePath.endsWith('/prompt-envelope.json')
          ) {
            throw new Error('simulated model-visible artifact fsync failure')
          }
          if (failure === 'prepared-event' && childArtifact && operation === 'append') {
            childAppendCount += 1
            if (childAppendCount === 4) throw new Error('simulated request.prepared fsync failure')
          }
        }
      })
      expect(outcome.status).toBe('completed')
      if (outcome.status !== 'completed') continue
      expect(outcome.result.batches).toHaveLength(1)
      expect(outcome.result.batches[0]!.status).toBe('failed')
      expect((outcome.result.batches[0]!.error as { code: string }).code).toBe('AGENT_AUDIT_WRITE_FAILED')
      expect(provider).not.toHaveBeenCalled()
    }
  })

  it('keeps successful batches, exposes a failed batch, and retries only the failed documents', async () => {
    const root = await projectWithCheckCard('agent-partial')
    for (let index = 0; index < 7; index += 1) {
      await createForeshadowing(
        root,
        `Large entry ${index}`,
        {
          id: `foreshadow-large-${index}`,
          enabled: true,
          trigger_conditions: [{ kind: 'keyword', target_id: '', keyword: `trigger-${index}` }]
        },
        `Rule ${index}. `.repeat(9_000)
      )
    }
    let calls = 0
    const firstProvider = vi.fn(async () => {
      calls += 1
      if (calls === 2) {
        throw new AIRequestError('AI request failed 429: rate limited', {
          provider: 'openai-compatible',
          status: 429
        })
      }
      return JSON.stringify({ issues: [] })
    })
    const first = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(firstProvider, ['agent-partial-parent'])
    )
    expect(first.status).toBe('completed')
    if (first.status !== 'completed') return
    expect(first.result.semantic_status).toBe('partial')
    const failed = first.result.batches.filter((batch) => batch.status === 'failed')
    const succeeded = first.result.batches.filter((batch) => batch.status === 'completed')
    expect(failed).toHaveLength(1)
    expect(succeeded.length).toBeGreaterThan(0)
    expect(firstProvider.mock.calls.length).toBeGreaterThan(1)

    const retryProvider = vi.fn(async () => JSON.stringify({ issues: [] }))
    const retry = await executeAgentTask<PlanningIntegrityReviewResult>(
      { ...request(root), retry_of: first.execution_id },
      dependencies(retryProvider, ['agent-partial-retry'])
    )
    expect(retry.status).toBe('completed')
    if (retry.status !== 'completed') return
    expect(retryProvider).toHaveBeenCalledTimes(1)
    expect(retry.result.batches.every((batch) => batch.status === 'completed')).toBe(true)
    expect(retry.result.batches.map((batch) => batch.child_execution_id)).toEqual(
      expect.arrayContaining(succeeded.map((batch) => batch.child_execution_id))
    )
    expect(retry.result.retry_of).toBe(first.execution_id)
    const retryStore = await openAgentArtifactStore({
      projectRoot: root,
      executionId: retry.execution_id
    })
    expect((await retryStore.events())[0]?.data['retry_of']).toBe(first.execution_id)
  })

  it('archives invalid JSON and one bounded successful repair', async () => {
    const root = await projectWithCheckCard('agent-repair')
    const provider = vi
      .fn<AgentProvider>()
      .mockResolvedValueOnce('```json\n{"issues": [\n```')
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }))
    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, ['agent-repair-parent'])
    )
    expect(outcome.status).toBe('completed')
    expect(provider).toHaveBeenCalledTimes(2)
    const childId = provider.mock.calls[0]![0].executionId
    const store = await openAgentArtifactStore({ projectRoot: root, executionId: childId })
    expect(await store.read('output-raw.txt')).toContain('```json')
    expect(await store.read('parse-error.json')).toContain('STRUCTURED_OUTPUT_INVALID_JSON')
    expect(await store.read('output-repair.txt')).toContain('"issues"')
    expect((await store.events()).map((event) => event.seq)).toEqual(
      Array.from({ length: (await store.events()).length }, (_value, index) => index + 1)
    )
  })

  it('places the complete code-owned schema in non-native initial and repair prompts', async () => {
    const root = await projectWithCheckCard('agent-schema-contract')
    const provider = vi
      .fn<AgentProvider>()
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              category: 'timeline_order',
              severity: 'warning',
              message: 'Out of order',
              evidence: '',
              related_ids: ['foreshadow-permit']
            }
          ]
        })
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }))

    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, ['agent-schema-contract-parent'])
    )

    expect(outcome.status).toBe('completed')
    expect(provider).toHaveBeenCalledTimes(2)
    const initialPrompt = provider.mock.calls[0]![0].messages.map((message) => message.content).join('\n')
    const repairPrompt = provider.mock.calls[1]![0].messages.map((message) => message.content).join('\n')
    for (const prompt of [initialPrompt, repairPrompt]) {
      expect(prompt).toContain('CODE-OWNED STRUCTURED OUTPUT CONTRACT')
      expect(prompt).toContain('"contradiction"')
      expect(prompt).toContain('"timeline"')
      expect(prompt).toContain('"title"')
      expect(prompt).toContain('{"issues":[]}')
    }
    expect(repairPrompt).toContain('issues.0.category')
    expect(repairPrompt).toContain('issues.0.title')
    expect(repairPrompt).toContain('Invalid enum value')
  })

  it('retains both parse failures when the single bounded repair also fails', async () => {
    const root = await projectWithCheckCard('agent-repair-failed')
    const provider = vi
      .fn<AgentProvider>()
      .mockResolvedValueOnce('{"issues": [')
      .mockResolvedValueOnce('{"still": "wrong"}')
    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, ['agent-repair-failed-parent'])
    )
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect((outcome.result.batches[0]!.error as { code: string }).code).toBe('AGENT_REPAIR_FAILED')
    expect(provider).toHaveBeenCalledTimes(2)
    const store = await openAgentArtifactStore({
      projectRoot: root,
      executionId: provider.mock.calls[0]![0].executionId
    })
    expect(await store.read('parse-error.json')).toContain('STRUCTURED_OUTPUT_INVALID_JSON')
    expect(await store.read('repair-parse-error.json')).toContain('STRUCTURED_OUTPUT_SCHEMA_MISMATCH')
  })

  it('maps authentication, timeout, truncation, empty and schema failures to stable codes', async () => {
    const cases: Array<[string, () => Promise<string>, string]> = [
      [
        'auth',
        async () => {
          throw new AIRequestError('unauthorized', { provider: 'openai-compatible', status: 401 })
        },
        'AGENT_PROVIDER_AUTH_FAILED'
      ],
      [
        'timeout',
        async () => {
          throw new AIRequestError('request timed out', { provider: 'openai-compatible' })
        },
        'AGENT_PROVIDER_TIMEOUT'
      ],
      [
        'truncated',
        async () => {
          throw new AIRequestError('AI_OUTPUT_TRUNCATED: finish_reason=length', {
            provider: 'openai-compatible',
            finishReason: 'length'
          })
        },
        'AGENT_OUTPUT_TRUNCATED'
      ],
      [
        'quota',
        async () => {
          throw new AIRequestError('insufficient balance', {
            provider: 'openai-compatible',
            status: 402
          })
        },
        'AGENT_PROVIDER_QUOTA_EXCEEDED'
      ],
      [
        'rate-limit',
        async () => {
          throw new AIRequestError('rate limited', {
            provider: 'openai-compatible',
            status: 429
          })
        },
        'AGENT_PROVIDER_RATE_LIMITED'
      ],
      [
        'context',
        async () => {
          throw new AIRequestError('maximum context length exceeded', {
            provider: 'openai-compatible',
            status: 400
          })
        },
        'AGENT_PROVIDER_CONTEXT_EXCEEDED'
      ],
      [
        'transport',
        async () => {
          throw new TypeError('socket closed')
        },
        'AGENT_PROVIDER_TRANSPORT_FAILED'
      ],
      ['empty', async () => '', 'AGENT_EMPTY_RESPONSE'],
      ['schema', async () => JSON.stringify({ issues: [{ nope: true }] }), 'AGENT_REPAIR_FAILED']
    ]
    for (const [label, implementation, code] of cases) {
      const root = await projectWithCheckCard(`agent-error-${label}`)
      const provider = vi.fn(implementation)
      const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
        request(root),
        dependencies(provider, [`agent-error-${label}-parent`])
      )
      expect(outcome.status).toBe('completed')
      if (outcome.status !== 'completed') continue
      expect(outcome.result.batches).toHaveLength(1)
      expect(outcome.result.batches[0]!.status).toBe('failed')
      expect((outcome.result.batches[0]!.error as { code: string }).code).toBe(code)
    }
  })

  it('persists request identity and a credential-scrubbed bounded provider body', async () => {
    const root = await projectWithCheckCard('agent-provider-detail')
    const provider = vi.fn<AgentProvider>(async () => {
      throw new AIRequestError('AI request failed 400: invalid request', {
        provider: 'openai-compatible',
        status: 400,
        requestId: 'provider-request-456',
        responseBody:
          '{"error":"invalid","api_key":"sk-sensitive-value","authorization":"Bearer hidden-token"}'
      })
    })
    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      request(root),
      dependencies(provider, ['agent-provider-detail-parent'])
    )
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    const failed = outcome.result.batches[0]!
    expect(failed.status).toBe('failed')
    expect((failed.error as { provider_request_id?: string }).provider_request_id).toBe(
      'provider-request-456'
    )
    const store = await openAgentArtifactStore({
      projectRoot: root,
      executionId: provider.mock.calls[0]![0].executionId
    })
    const persisted = await store.read('provider-error.json')
    expect(persisted).toContain('provider-request-456')
    expect(persisted).not.toContain('sk-sensitive-value')
    expect(persisted).not.toContain('hidden-token')
    expect(persisted).toContain('[REDACTED]')
  })

  it('returns deterministic findings when no check model is configured', async () => {
    const root = await projectWithCheckCard('agent-no-ai')
    const provider = vi.fn(async () => JSON.stringify({ issues: [] }))
    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(request(root), {
      ...dependencies(provider, ['agent-no-ai-parent']),
      loadAIProfile: async () => ({ ...config, apiKey: '' })
    })
    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') return
    expect(outcome.result.semantic_status).toBe('not-configured')
    expect(outcome.result.deterministic_findings.length).toBeGreaterThan(0)
    expect(provider).not.toHaveBeenCalled()
  })
})

function request(root: string) {
  return {
    projectRoot: root,
    schema_version: 1 as const,
    task_id: 'planning-integrity-review',
    target: { type: 'project', id: 'project' },
    input: { semantic: true },
    language: 'zh' as const,
    requested_by: 'author' as const
  }
}

function dependencies(provider: AgentProvider, ids: string[]): AgentRuntimeDependencies {
  let index = 0
  return {
    loadAIProfile: async () => config,
    invokeProvider: provider,
    now: () => new Date('2026-08-17T12:00:00.000Z'),
    executionId: () => ids[index++] ?? `agent-fallback-${index}`
  }
}

async function projectWithCheckCard(id: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-agent-runtime-'))
  roots.push(root)
  await createProjectAt(root, { id, title: 'Neutral audit sample' })
  await createForeshadowing(
    root,
    'Permit rule',
    { id: 'foreshadow-permit', enabled: true, trigger_conditions: [] },
    'Day use only.'
  )
  return root
}
