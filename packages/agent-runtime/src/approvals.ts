import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import {
  createIssue,
  issueSchema,
  listDocs,
  loadIssueSuppressionLedger,
  normalizeCardRelations,
  pathExists,
  readMarkdown,
  readText,
  sha256Text,
  withProjectWriteLock,
  writeMarkdown,
  writeText,
  type DocumentIdentity,
  type IssueDoc
} from '@quillarium/core'
import { z } from 'zod'
import { openAgentArtifactStore, type AgentArtifactStore, type AuditFaultInjector } from './artifacts.js'
import { agentRuntimeIdSchema, agentRuntimeOperationSchema, agentTaskResultTypeSchema } from './contracts.js'
import { AgentRuntimeError, createAgentRuntimeError } from './errors.js'
import {
  planningIntegrityReviewResultSchema,
  planningIssueProposalV1Schema,
  PLANNING_INTEGRITY_REVIEW_DEFINITION,
  type PlanningIntegrityReviewResult,
  type PlanningIssueProposalV1
} from './tasks/planning-integrity-review.js'

const portableHashSchema = z.string().regex(/^[a-f0-9]{64}$/u)
const applySourceExecutionV1Schema = z
  .object({
    schema_version: z.literal(1),
    execution_id: agentRuntimeIdSchema,
    task_id: agentRuntimeIdSchema,
    operations: z.array(agentRuntimeOperationSchema),
    result_disposition: agentTaskResultTypeSchema,
    domain_apply_allowed: z.literal(false),
    created_at: z.string().datetime()
  })
  .strict()
const authorApplyTargetV1Schema = z
  .object({
    kind: z.enum(['source', 'issue']),
    document_id: z.string().min(1),
    path: z
      .string()
      .min(1)
      .refine((value) => !/^(?:[a-z]:[\\/]|[/\\])/iu.test(value), 'Target path must be project-relative')
      .refine(
        (value) => !value.replace(/\\/gu, '/').split('/').includes('..'),
        'Target path must be contained'
      ),
    expected_sha256: portableHashSchema.nullable(),
    proposal_id: z.string().min(1).optional()
  })
  .strict()

export const authorApplyDecisionV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: agentRuntimeIdSchema,
    execution_id: agentRuntimeIdSchema,
    task_id: z.literal('planning-integrity-review'),
    action: z.literal('apply-selected-planning-issues'),
    decision: z.enum(['approved', 'rejected']),
    selected_result_ids: z.array(z.string().min(1)),
    targets: z.array(authorApplyTargetV1Schema),
    expected_output_sha256: portableHashSchema,
    created_at: z.string().datetime(),
    expires_at: z.string().datetime(),
    created_by: z.enum(['desktop-author', 'cli-author'])
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.decision === 'approved' && !decision.selected_result_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selected_result_ids'],
        message: 'An approved apply decision must select at least one result'
      })
    }
    if (decision.decision === 'rejected' && decision.selected_result_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selected_result_ids'],
        message: 'A rejected decision cannot select results'
      })
    }
  })

export type AuthorApplyDecisionV1 = z.infer<typeof authorApplyDecisionV1Schema>

export interface CreateAuthorApplyDecisionInput {
  executionId: string
  selectedResultIds: string[]
  decision: 'approved' | 'rejected'
  createdBy: 'desktop-author' | 'cli-author'
  expiresInMs?: number
}

export interface AuthorApplyTestHooks {
  /** Test-only fault injection. Product callers must not provide this hook. */
  auditFault?: AuditFaultInjector
  /** Test-only fault injection used to prove rollback after a partial domain write. */
  beforePersistProposal?: (proposal: PlanningIssueProposalV1, index: number) => void | Promise<void>
}

export const planningIssueApplicationResultV1Schema = z
  .object({
    schema_version: z.literal(1),
    decision_id: agentRuntimeIdSchema,
    execution_id: agentRuntimeIdSchema,
    created_issue_ids: z.array(z.string().min(1)),
    updated_issue_ids: z.array(z.string().min(1)),
    applied_at: z.string().datetime()
  })
  .strict()

export type PlanningIssueApplicationResultV1 = z.infer<typeof planningIssueApplicationResultV1Schema>

export async function createAuthorApplyDecision(
  projectRoot: string,
  input: CreateAuthorApplyDecisionInput,
  now: () => Date = () => new Date(),
  hooks: Pick<AuthorApplyTestHooks, 'auditFault'> = {}
): Promise<AuthorApplyDecisionV1> {
  const store = await openAgentArtifactStore({
    projectRoot,
    executionId: input.executionId,
    now,
    ...(hooks.auditFault ? { fault: hooks.auditFault } : {})
  })
  if (store.taskId !== 'planning-integrity-review') {
    throw approvalError('AGENT_APPROVAL_INVALID', input.executionId, 'Execution is not a planning review')
  }
  await assertPlanningApplyDisposition(store, input.executionId)
  const outputRaw = await store.read('output.json')
  const output = planningIntegrityReviewResultSchema.parse(JSON.parse(outputRaw))
  const proposals = allProposals(output)
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]))
  const selectedIds = [...new Set(input.selectedResultIds)]
  if (input.decision === 'approved') {
    const missing = selectedIds.filter((id) => !byId.has(id))
    if (missing.length) {
      throw approvalError(
        'AGENT_APPROVAL_INVALID',
        input.executionId,
        `Selected results do not belong to the execution: ${missing.join(', ')}`
      )
    }
  }
  const selected = selectedIds.map((id) => byId.get(id)!).filter(Boolean)
  const suppressed = new Set(
    (await loadIssueSuppressionLedger(projectRoot)).entries.map((entry) => entry.fingerprint)
  )
  const suppressedSelected = selected.filter((proposal) => suppressed.has(proposal.fingerprint))
  if (suppressedSelected.length) {
    throw approvalError(
      'AGENT_APPROVAL_INVALID',
      input.executionId,
      `Selected results are suppressed: ${suppressedSelected.map((proposal) => proposal.id).join(', ')}`
    )
  }
  const targets = await buildDecisionTargets(projectRoot, selected)
  const createdAt = now()
  const decision = authorApplyDecisionV1Schema.parse({
    schema_version: 1,
    id: `approval-${randomUUID().toLowerCase()}`,
    execution_id: input.executionId,
    task_id: 'planning-integrity-review',
    action: 'apply-selected-planning-issues',
    decision: input.decision,
    selected_result_ids: input.decision === 'approved' ? selectedIds : [],
    targets: input.decision === 'approved' ? targets : [],
    expected_output_sha256: sha256Text(outputRaw),
    created_at: createdAt.toISOString(),
    expires_at: new Date(createdAt.getTime() + (input.expiresInMs ?? 86_400_000)).toISOString(),
    created_by: input.createdBy
  })
  try {
    await store.appendEvent('approval.requested', {}, { decision_id: decision.id })
    const decisionRef = await store.writeJson(`approvals/${decision.id}.json`, decision)
    await store.appendEvent(
      'approval.decided',
      { decision: decisionRef },
      {
        decision_id: decision.id,
        decision: decision.decision,
        selected_result_count: decision.selected_result_ids.length
      }
    )
  } catch (cause) {
    throw createAgentRuntimeError(
      'AGENT_AUDIT_WRITE_FAILED',
      { taskId: store.taskId, executionId: input.executionId, phase: 'audit' },
      errorMessage(cause)
    )
  }
  return decision
}

export async function applyAuthorDecision(
  projectRoot: string,
  executionId: string,
  decisionId: string,
  now: () => Date = () => new Date(),
  hooks: AuthorApplyTestHooks = {}
): Promise<PlanningIssueApplicationResultV1> {
  return withProjectWriteLock(projectRoot, async () => {
    let store
    try {
      store = await openAgentArtifactStore({
        projectRoot,
        executionId,
        now,
        ...(hooks.auditFault ? { fault: hooks.auditFault } : {})
      })
    } catch (cause) {
      throw approvalError(
        'AGENT_APPROVAL_INVALID',
        executionId,
        `Cannot open the referenced execution: ${errorMessage(cause)}`
      )
    }
    await assertPlanningApplyDisposition(store, executionId)
    let decision: AuthorApplyDecisionV1
    try {
      decision = authorApplyDecisionV1Schema.parse(
        await store.readJson(`approvals/${agentRuntimeIdSchema.parse(decisionId)}.json`)
      )
    } catch (cause) {
      const code = /ENOENT|cannot find|no such file/iu.test(errorMessage(cause))
        ? 'AGENT_APPROVAL_REQUIRED'
        : 'AGENT_APPROVAL_INVALID'
      throw approvalError(code, executionId, `Cannot load a valid author decision: ${errorMessage(cause)}`)
    }
    assertDecisionIdentity(decision, executionId)
    if (decision.decision !== 'approved') {
      throw approvalError('AGENT_APPROVAL_REJECTED', executionId, 'The author rejected this result')
    }
    if (Date.parse(decision.expires_at) <= now().getTime()) {
      throw approvalError('AGENT_APPROVAL_EXPIRED', executionId, 'The author decision has expired')
    }
    const events = await store.events()
    const decisionRef = await store.reference(`approvals/${decision.id}.json`)
    const decided = events.some(
      (event) =>
        event.type === 'approval.decided' &&
        event.data['decision_id'] === decision.id &&
        event.artifacts['decision']?.sha256 === decisionRef.sha256
    )
    if (!decided) {
      throw approvalError('AGENT_APPROVAL_INVALID', executionId, 'The decision has no durable approval event')
    }
    if (
      events.some(
        (event) =>
          (event.type === 'application.started' || event.type === 'application.completed') &&
          event.data['decision_id'] === decision.id
      )
    ) {
      throw approvalError(
        'AGENT_APPROVAL_ALREADY_CONSUMED',
        executionId,
        'The author decision was already consumed'
      )
    }
    const outputRaw = await store.read('output.json')
    if (sha256Text(outputRaw) !== decision.expected_output_sha256) {
      throw approvalError('AGENT_APPLY_HASH_CONFLICT', executionId, 'Execution output changed after approval')
    }
    const output = planningIntegrityReviewResultSchema.parse(JSON.parse(outputRaw))
    const proposals = new Map(allProposals(output).map((proposal) => [proposal.id, proposal]))
    const selected = decision.selected_result_ids.map((id) => {
      const proposal = proposals.get(id)
      if (!proposal) throw approvalError('AGENT_APPROVAL_INVALID', executionId, `Result is missing: ${id}`)
      return proposal
    })
    const suppressed = new Set(
      (await loadIssueSuppressionLedger(projectRoot)).entries.map((entry) => entry.fingerprint)
    )
    if (selected.some((proposal) => suppressed.has(proposal.fingerprint))) {
      throw approvalError(
        'AGENT_APPLY_HASH_CONFLICT',
        executionId,
        'One or more selected findings were ignored after this approval was created'
      )
    }
    await verifyDecisionTargets(projectRoot, decision)
    let applicationPlanRef
    try {
      applicationPlanRef = await store.writeJson(`applications/${decision.id}-plan.json`, {
        schema_version: 1,
        decision_id: decision.id,
        selected_result_ids: decision.selected_result_ids,
        expected_targets: decision.targets,
        prepared_at: now().toISOString()
      })
      await store.appendEvent(
        'application.started',
        { decision: decisionRef, application_plan: applicationPlanRef },
        { decision_id: decision.id }
      )
    } catch (cause) {
      throw createAgentRuntimeError(
        'AGENT_AUDIT_WRITE_FAILED',
        { taskId: store.taskId, executionId, phase: 'audit' },
        errorMessage(cause)
      )
    }

    const rollback: RollbackEntry[] = []
    let applicationStage: 'domain' | 'verify' | 'audit' = 'domain'
    try {
      await verifyDecisionTargets(projectRoot, decision)
      const applied = await persistSelectedIssues(
        projectRoot,
        selected,
        now().toISOString(),
        rollback,
        hooks.beforePersistProposal
      )
      const result = planningIssueApplicationResultV1Schema.parse({
        schema_version: 1,
        decision_id: decision.id,
        execution_id: executionId,
        created_issue_ids: applied.created,
        updated_issue_ids: applied.updated,
        applied_at: now().toISOString()
      })
      applicationStage = 'audit'
      const resultRef = await store.writeJson(`applications/${decision.id}-result.json`, result)
      applicationStage = 'verify'
      await verifyAppliedIssues(projectRoot, selected)
      applicationStage = 'audit'
      await store.appendEvent(
        'application.completed',
        { result: resultRef, decision: decisionRef },
        { decision_id: decision.id, created: applied.created.length, updated: applied.updated.length }
      )
      return result
    } catch (cause) {
      const rollbackErrors = await rollbackWrites(rollback)
      const error =
        cause instanceof AgentRuntimeError
          ? cause
          : createAgentRuntimeError(
              applicationStage === 'audit' ? 'AGENT_AUDIT_WRITE_FAILED' : 'AGENT_APPLY_FAILED',
              {
                taskId: store.taskId,
                executionId,
                phase: applicationStage === 'audit' ? 'audit' : 'application'
              },
              errorMessage(cause),
              { retry_safe: false }
            )
      try {
        const failureRef = await store.writeJson(`applications/${decision.id}-error.json`, {
          ...error.value,
          rollback_errors: rollbackErrors
        })
        await store.appendEvent(
          'application.failed',
          { error: failureRef },
          {
            decision_id: decision.id,
            code: error.value.code,
            rollback_verified: rollbackErrors.length === 0
          }
        )
      } catch {
        // The preceding application.started event keeps the one-shot decision fail closed.
      }
      throw error
    }
  })
}

interface RollbackEntry {
  path: string
  before: string | null
}

async function persistSelectedIssues(
  projectRoot: string,
  proposals: PlanningIssueProposalV1[],
  checkedAt: string,
  rollback: RollbackEntry[],
  beforePersistProposal?: (proposal: PlanningIssueProposalV1, index: number) => void | Promise<void>
): Promise<{ created: string[]; updated: string[] }> {
  const existingIssues = await listDocs<IssueDoc>(projectRoot, 'issue')
  const validIds = new Set(
    (await listDocs<DocumentIdentity>(projectRoot)).map((document) => document.data.id)
  )
  const created: string[] = []
  const updated: string[] = []
  for (const [index, proposal] of proposals.entries()) {
    await beforePersistProposal?.(proposal, index)
    const relatedIds = proposal.related_ids.filter((id) => validIds.has(id))
    const relations = relatedIds.map((target_id) => ({
      kind: 'involves' as const,
      target_id,
      note: proposal.source === 'ai' ? 'AI planning check' : 'Planning rule check'
    }))
    const priority =
      proposal.severity === 'error' ? 'high' : proposal.severity === 'warning' ? 'medium' : 'low'
    const existing = existingIssues.find(
      (issue) => proposalMatchesIssue(proposal, issue.data) && issue.data.state !== 'resolved'
    )
    if (existing) {
      rollback.push({ path: existing.path, before: await readText(existing.path) })
      const data = issueSchema.parse({
        ...existing.data,
        status: 'open',
        state: 'open',
        enabled: true,
        tags: [...new Set([...(existing.data.tags ?? []), 'ai-check', proposal.code])],
        relations: normalizeCardRelations([...(existing.data.relations ?? []), ...relations]),
        priority,
        decision_needed: proposal.message,
        related_docs: relatedIds,
        rule_id: proposal.code,
        evidence: proposal.evidence,
        check_fingerprint: proposal.fingerprint,
        ...(proposal.identity_v2 ? { issue_identity_v2: proposal.identity_v2 } : {}),
        legacy_check_fingerprints: proposal.legacy_fingerprints ?? [],
        checked_at: checkedAt
      })
      await writeMarkdown(existing.path, data as unknown as Record<string, unknown>, existing.content)
      updated.push(existing.data.id)
      continue
    }
    const issueId = issueIdForOccurrence(proposal, existingIssues)
    const expectedPath = path.join(projectRoot, 'issues', `${issueId}.md`)
    rollback.push({ path: expectedPath, before: null })
    const file = await createIssue(
      projectRoot,
      proposal.title,
      {
        id: issueId,
        status: 'open',
        state: 'open',
        enabled: true,
        tags: ['ai-check', proposal.code],
        relations,
        priority,
        decision_needed: proposal.message,
        related_docs: relatedIds,
        rule_id: proposal.code,
        evidence: proposal.evidence,
        check_fingerprint: proposal.fingerprint,
        ...(proposal.identity_v2 ? { issue_identity_v2: proposal.identity_v2 } : {}),
        legacy_check_fingerprints: proposal.legacy_fingerprints ?? [],
        checked_at: checkedAt
      },
      [`## ${proposal.title}`, '', proposal.message, proposal.evidence ? `\n> ${proposal.evidence}` : '']
        .filter(Boolean)
        .join('\n')
    )
    const createdDoc = await readMarkdown<Record<string, unknown>>(file)
    if (createdDoc.data['id'] !== issueId) throw new Error(`Created issue verification failed: ${issueId}`)
    created.push(issueId)
  }
  return { created, updated }
}

async function buildDecisionTargets(
  projectRoot: string,
  proposals: PlanningIssueProposalV1[]
): Promise<AuthorApplyDecisionV1['targets']> {
  const documents = await listDocs<DocumentIdentity>(projectRoot)
  const issues = documents.filter((document) => document.data.type === 'issue') as Array<{
    path: string
    data: IssueDoc
    content: string
  }>
  const byId = new Map(documents.map((document) => [document.data.id, document]))
  const targets = new Map<string, AuthorApplyDecisionV1['targets'][number]>()
  for (const proposal of proposals) {
    for (const id of proposal.related_ids) {
      const document = byId.get(id)
      if (!document) continue
      const relative = portableProjectPath(projectRoot, document.path)
      targets.set(`source:${id}`, {
        kind: 'source',
        document_id: id,
        path: relative,
        expected_sha256: sha256Text(await readText(document.path)),
        proposal_id: proposal.id
      })
    }
    const existing = issues.find(
      (issue) => proposalMatchesIssue(proposal, issue.data) && issue.data.state !== 'resolved'
    )
    const issueId = existing?.data.id ?? issueIdForOccurrence(proposal, issues)
    const issuePath = existing?.path ?? path.join(projectRoot, 'issues', `${issueId}.md`)
    targets.set(`issue:${proposal.id}`, {
      kind: 'issue',
      document_id: issueId,
      path: portableProjectPath(projectRoot, issuePath),
      expected_sha256: existing ? sha256Text(await readText(existing.path)) : null,
      proposal_id: proposal.id
    })
  }
  return [...targets.values()].sort((left, right) =>
    `${left.kind}:${left.document_id}`.localeCompare(`${right.kind}:${right.document_id}`, 'en')
  )
}

async function verifyDecisionTargets(projectRoot: string, decision: AuthorApplyDecisionV1): Promise<void> {
  for (const target of decision.targets) {
    const absolute = resolveTarget(projectRoot, target.path)
    const exists = await pathExists(absolute)
    if (target.expected_sha256 === null) {
      if (exists)
        throw approvalError(
          'AGENT_APPLY_HASH_CONFLICT',
          decision.execution_id,
          `Target now exists: ${target.path}`
        )
      continue
    }
    if (!exists || sha256Text(await readText(absolute)) !== target.expected_sha256) {
      throw approvalError(
        'AGENT_APPLY_HASH_CONFLICT',
        decision.execution_id,
        `Target changed: ${target.path}`
      )
    }
  }
}

async function verifyAppliedIssues(projectRoot: string, proposals: PlanningIssueProposalV1[]): Promise<void> {
  const issues = await listDocs<IssueDoc>(projectRoot, 'issue')
  for (const proposal of proposals) {
    if (!issues.some((issue) => issue.data.check_fingerprint === proposal.fingerprint)) {
      throw new Error(`Applied issue is missing: ${proposal.id}`)
    }
  }
}

async function rollbackWrites(entries: RollbackEntry[]): Promise<string[]> {
  const failures: string[] = []
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.before === null) {
        await rm(entry.path, { force: true })
      } else {
        await writeText(entry.path, entry.before)
      }
    } catch (cause) {
      failures.push(`${entry.path}: ${errorMessage(cause)}`)
    }
  }
  return failures
}

function allProposals(output: PlanningIntegrityReviewResult): PlanningIssueProposalV1[] {
  return [...output.deterministic_findings, ...output.semantic_proposals].map((proposal) =>
    planningIssueProposalV1Schema.parse(proposal)
  )
}

function assertDecisionIdentity(decision: AuthorApplyDecisionV1, executionId: string): void {
  if (decision.execution_id !== executionId || decision.task_id !== 'planning-integrity-review') {
    throw approvalError('AGENT_APPROVAL_INVALID', executionId, 'Author decision identity does not match')
  }
}

async function assertPlanningApplyDisposition(store: AgentArtifactStore, executionId: string): Promise<void> {
  try {
    const snapshot = applySourceExecutionV1Schema.parse(await store.readJson('agent-execution.json'))
    const snapshotRef = await store.reference('agent-execution.json')
    const planned = (await store.events()).some(
      (event) =>
        event.type === 'execution.planned' && event.artifacts['execution']?.sha256 === snapshotRef.sha256
    )
    const expectedOperations = [...PLANNING_INTEGRITY_REVIEW_DEFINITION.capability_ceiling].sort()
    const actualOperations = [...snapshot.operations].sort()
    if (
      !planned ||
      snapshot.execution_id !== executionId ||
      snapshot.task_id !== PLANNING_INTEGRITY_REVIEW_DEFINITION.id ||
      snapshot.result_disposition !== PLANNING_INTEGRITY_REVIEW_DEFINITION.result_disposition ||
      JSON.stringify(actualOperations) !== JSON.stringify(expectedOperations) ||
      PLANNING_INTEGRITY_REVIEW_DEFINITION.approval_policy !== 'author-required' ||
      !PLANNING_INTEGRITY_REVIEW_DEFINITION.allowed_result_types.includes('proposal')
    ) {
      throw new Error('Execution disposition or audited task capability no longer matches code')
    }
  } catch (cause) {
    throw approvalError(
      'AGENT_APPROVAL_INVALID',
      executionId,
      `Cannot verify the audited result disposition: ${errorMessage(cause)}`
    )
  }
}

function approvalError(
  code:
    | 'AGENT_APPROVAL_REQUIRED'
    | 'AGENT_APPROVAL_INVALID'
    | 'AGENT_APPROVAL_REJECTED'
    | 'AGENT_APPROVAL_EXPIRED'
    | 'AGENT_APPROVAL_ALREADY_CONSUMED'
    | 'AGENT_APPLY_HASH_CONFLICT',
  executionId: string,
  detail: string
): AgentRuntimeError {
  return createAgentRuntimeError(
    code,
    {
      taskId: 'planning-integrity-review',
      executionId,
      phase: code.includes('APPLY') ? 'application' : 'approval'
    },
    detail,
    { retry_safe: false }
  )
}

function issueIdFor(proposal: PlanningIssueProposalV1): string {
  return `issue-agent-${proposal.fingerprint.slice(0, 20)}`
}

function issueIdForOccurrence(proposal: PlanningIssueProposalV1, issues: Array<{ data: IssueDoc }>): string {
  const priorCount = issues.filter((issue) => proposalMatchesIssue(proposal, issue.data)).length
  const base = issueIdFor(proposal)
  return priorCount ? `${base}-${priorCount + 1}` : base
}

function proposalMatchesIssue(proposal: PlanningIssueProposalV1, issue: IssueDoc): boolean {
  const proposalFingerprints = new Set([proposal.fingerprint, ...(proposal.legacy_fingerprints ?? [])])
  return [issue.check_fingerprint, ...(issue.legacy_check_fingerprints ?? [])].some((fingerprint) =>
    proposalFingerprints.has(fingerprint)
  )
}

function resolveTarget(projectRoot: string, relativePath: string): string {
  const absolute = path.resolve(projectRoot, relativePath)
  const relative = path.relative(path.resolve(projectRoot), absolute)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Apply target is outside the project: ${relativePath}`)
  }
  return absolute
}

function portableProjectPath(projectRoot: string, file: string): string {
  const relative = path.relative(projectRoot, file)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Apply target is outside the project: ${file}`)
  }
  return relative.replace(/\\/gu, '/')
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
}
