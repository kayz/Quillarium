import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '@quillarium/ai'
import {
  createForeshadowing,
  createProjectAt,
  listDocs,
  readText,
  writeText,
  type IssueDoc
} from '@quillarium/core'
import { applyAuthorDecision, createAuthorApplyDecision } from './approvals.js'
import { openAgentArtifactStore } from './artifacts.js'
import { executeAgentTask } from './executor.js'
import type { PlanningIntegrityReviewResult } from './tasks/planning-integrity-review.js'

const roots: string[] = []
const config: AIConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test',
  model: 'gpt-4',
  temperature: 0,
  maxTokens: 1_000,
  contextWindowTokens: 32_000
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('author-confirmed planning issue apply', () => {
  it('writes no issue before approval, applies selected proposals once, and records one-shot consumption', async () => {
    const { root, executionId, result } = await completedExecution('approval-success')
    const selected = result.semantic_proposals.map((proposal) => proposal.id)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)
    const decision = await createAuthorApplyDecision(root, {
      executionId,
      selectedResultIds: selected,
      decision: 'approved',
      createdBy: 'desktop-author'
    })
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(0)
    const applied = await applyAuthorDecision(root, executionId, decision.id)
    expect(applied.created_issue_ids).toHaveLength(1)
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(1)
    await expect(applyAuthorDecision(root, executionId, decision.id)).rejects.toMatchObject({
      value: { code: 'AGENT_APPROVAL_ALREADY_CONSUMED' }
    })
    expect(await listDocs<IssueDoc>(root, 'issue')).toHaveLength(1)
  })

  it('fails closed for rejected, expired, and stale decisions', async () => {
    const rejectedExecution = await completedExecution('approval-rejected')
    const rejected = await createAuthorApplyDecision(rejectedExecution.root, {
      executionId: rejectedExecution.executionId,
      selectedResultIds: [],
      decision: 'rejected',
      createdBy: 'cli-author'
    })
    await expect(
      applyAuthorDecision(rejectedExecution.root, rejectedExecution.executionId, rejected.id)
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPROVAL_REJECTED' } })
    expect(await listDocs<IssueDoc>(rejectedExecution.root, 'issue')).toHaveLength(0)

    const expiredExecution = await completedExecution('approval-expired')
    const expired = await createAuthorApplyDecision(
      expiredExecution.root,
      {
        executionId: expiredExecution.executionId,
        selectedResultIds: [expiredExecution.result.semantic_proposals[0]!.id],
        decision: 'approved',
        createdBy: 'desktop-author',
        expiresInMs: 1
      },
      () => new Date('2026-08-17T00:00:00.000Z')
    )
    await expect(
      applyAuthorDecision(
        expiredExecution.root,
        expiredExecution.executionId,
        expired.id,
        () => new Date('2026-08-17T00:00:01.000Z')
      )
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPROVAL_EXPIRED' } })
    expect(await listDocs<IssueDoc>(expiredExecution.root, 'issue')).toHaveLength(0)

    const staleExecution = await completedExecution('approval-stale')
    const stale = await createAuthorApplyDecision(staleExecution.root, {
      executionId: staleExecution.executionId,
      selectedResultIds: [staleExecution.result.semantic_proposals[0]!.id],
      decision: 'approved',
      createdBy: 'desktop-author'
    })
    const source = (await listDocs(staleExecution.root, 'foreshadowing'))[0]!
    await writeText(source.path, `${await readText(source.path)}\nexternal change\n`)
    await expect(
      applyAuthorDecision(staleExecution.root, staleExecution.executionId, stale.id)
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPLY_HASH_CONFLICT' } })
    expect(await listDocs<IssueDoc>(staleExecution.root, 'issue')).toHaveLength(0)
  })

  it('requires a durable decision and performs zero domain writes when application audit cannot start', async () => {
    const execution = await completedExecution('approval-audit-start')
    await expect(
      applyAuthorDecision(execution.root, execution.executionId, 'approval-does-not-exist')
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPROVAL_REQUIRED' } })

    const decision = await createAuthorApplyDecision(execution.root, {
      executionId: execution.executionId,
      selectedResultIds: [execution.result.semantic_proposals[0]!.id],
      decision: 'approved',
      createdBy: 'desktop-author'
    })
    await expect(
      applyAuthorDecision(
        execution.root,
        execution.executionId,
        decision.id,
        () => new Date('2026-08-17T00:00:01.000Z'),
        {
          auditFault: (operation) => {
            if (operation === 'append') throw new Error('application audit unavailable')
          }
        }
      )
    ).rejects.toMatchObject({ value: { code: 'AGENT_AUDIT_WRITE_FAILED' } })
    expect(await listDocs<IssueDoc>(execution.root, 'issue')).toHaveLength(0)
  })

  it('rejects a changed execution disposition before any domain write', async () => {
    const execution = await completedExecution('approval-disposition')
    const decision = await createAuthorApplyDecision(execution.root, {
      executionId: execution.executionId,
      selectedResultIds: [execution.result.semantic_proposals[0]!.id],
      decision: 'approved',
      createdBy: 'desktop-author'
    })
    const snapshotPath = path.join(
      execution.root,
      'runs',
      'agents',
      execution.executionId,
      'agent-execution.json'
    )
    const snapshot = JSON.parse(await readText(snapshotPath)) as Record<string, unknown>
    await writeText(
      snapshotPath,
      `${JSON.stringify({ ...snapshot, result_disposition: 'proposal' }, null, 2)}\n`
    )

    await expect(
      applyAuthorDecision(execution.root, execution.executionId, decision.id)
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPROVAL_INVALID' } })
    expect(await listDocs<IssueDoc>(execution.root, 'issue')).toHaveLength(0)
  })

  it('rolls back verified project writes when a later selected proposal fails', async () => {
    const execution = await completedExecution('approval-domain-rollback', 2)
    const decision = await createAuthorApplyDecision(execution.root, {
      executionId: execution.executionId,
      selectedResultIds: execution.result.semantic_proposals.map((proposal) => proposal.id),
      decision: 'approved',
      createdBy: 'desktop-author'
    })

    await expect(
      applyAuthorDecision(
        execution.root,
        execution.executionId,
        decision.id,
        () => new Date('2026-08-17T00:00:01.000Z'),
        {
          beforePersistProposal: (_proposal, index) => {
            if (index === 1) throw new Error('simulated second issue write failure')
          }
        }
      )
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPLY_FAILED' } })
    expect(await listDocs<IssueDoc>(execution.root, 'issue')).toHaveLength(0)
    const store = await openAgentArtifactStore({
      projectRoot: execution.root,
      executionId: execution.executionId
    })
    expect((await store.events()).map((event) => event.type)).toEqual(
      expect.arrayContaining(['application.started', 'application.failed'])
    )
    await expect(
      applyAuthorDecision(execution.root, execution.executionId, decision.id)
    ).rejects.toMatchObject({ value: { code: 'AGENT_APPROVAL_ALREADY_CONSUMED' } })
  })

  it('rolls back domain writes when the completion audit event cannot be flushed', async () => {
    const execution = await completedExecution('approval-audit-rollback')
    const decision = await createAuthorApplyDecision(execution.root, {
      executionId: execution.executionId,
      selectedResultIds: [execution.result.semantic_proposals[0]!.id],
      decision: 'approved',
      createdBy: 'desktop-author'
    })
    let appendCount = 0

    await expect(
      applyAuthorDecision(
        execution.root,
        execution.executionId,
        decision.id,
        () => new Date('2026-08-17T00:00:01.000Z'),
        {
          auditFault: (operation) => {
            if (operation === 'append' && ++appendCount === 2) {
              throw new Error('completion fsync failed')
            }
          }
        }
      )
    ).rejects.toMatchObject({ value: { code: 'AGENT_AUDIT_WRITE_FAILED' } })
    expect(await listDocs<IssueDoc>(execution.root, 'issue')).toHaveLength(0)
  })
})

async function completedExecution(
  id: string,
  proposalCount = 1
): Promise<{
  root: string
  executionId: string
  result: PlanningIntegrityReviewResult
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-agent-approval-'))
  roots.push(root)
  await createProjectAt(root, { id, title: 'Approval sample' })
  await createForeshadowing(
    root,
    'Permit',
    {
      id: 'foreshadow-permit',
      enabled: true,
      trigger_conditions: [{ kind: 'keyword', target_id: '', keyword: 'permit' }]
    },
    'Day only.'
  )
  const provider = vi.fn(async () =>
    JSON.stringify({
      issues: Array.from({ length: proposalCount }, (_value, index) => ({
        category: 'foreshadowing',
        severity: 'warning',
        title: `Permit exception ${index + 1} unclear`,
        message: `Specify exception ${index + 1}.`,
        evidence: `The card says day only; exception ${index + 1} is not defined.`,
        related_ids: ['foreshadow-permit']
      }))
    })
  )
  const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
    {
      projectRoot: root,
      schema_version: 1,
      task_id: 'planning-integrity-review',
      target: { type: 'project', id: 'project' },
      input: { semantic: true },
      language: 'en',
      requested_by: 'author'
    },
    {
      loadAIProfile: async () => config,
      invokeProvider: provider,
      executionId: () => `agent-${id}`,
      now: () => new Date('2026-08-17T00:00:00.000Z')
    }
  )
  if (outcome.status !== 'completed') throw new Error(outcome.error.technical_detail)
  return { root, executionId: outcome.execution_id, result: outcome.result }
}
