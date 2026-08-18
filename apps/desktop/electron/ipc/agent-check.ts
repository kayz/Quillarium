import path from 'node:path'
import { shell } from 'electron'
import {
  applyAuthorDecision,
  AgentRuntimeError,
  agentRuntimeIdSchema,
  createAgentRuntimeError,
  createAuthorApplyDecision,
  executeAgentTask,
  type AgentExecutionOutcome,
  type AgentRuntimeDependencies,
  type AgentRuntimeExecutionRequest,
  type AgentRuntimeErrorV1,
  type AuthorApplyDecisionV1,
  type PlanningCheckScope,
  type PlanningIntegrityReviewResult
} from '@quillarium/agent-runtime'
import { assertProjectPath } from '@quillarium/core'
import { loadDesktopAIProfile } from './credentials.js'

export type PlanningCheckDependencies = Omit<AgentRuntimeDependencies, 'loadAIProfile'> & {
  loadAIProfile?: AgentRuntimeDependencies['loadAIProfile']
  signal?: AbortSignal
  onStreamEvent?: AgentRuntimeExecutionRequest['onStreamEvent']
}

export type PlanningCheckOutcome = AgentExecutionOutcome<PlanningIntegrityReviewResult, AgentRuntimeErrorV1>

export type PlanningCheckDecisionOutcome =
  { status: 'decided'; decision: AuthorApplyDecisionV1 } | { status: 'failed'; error: AgentRuntimeErrorV1 }

export type PlanningCheckApplyOutcome =
  | {
      status: 'applied'
      result: Awaited<ReturnType<typeof applyAuthorDecision>>
    }
  | { status: 'failed'; error: AgentRuntimeErrorV1 }

export async function runPlanningCheck(
  root: string,
  language: 'zh' | 'en',
  dependencies: PlanningCheckDependencies = {},
  scope: PlanningCheckScope = 'project'
): Promise<PlanningCheckOutcome> {
  const { signal, onStreamEvent, ...runtimeDependencies } = dependencies
  return executeAgentTask<PlanningIntegrityReviewResult>(
    {
      ...planningReviewRequest(root, language, scope),
      ...(signal ? { signal } : {}),
      ...(onStreamEvent ? { onStreamEvent } : {})
    },
    desktopRuntimeDependencies(runtimeDependencies)
  )
}

export async function retryPlanningCheck(
  root: string,
  executionId: string,
  language: 'zh' | 'en',
  dependencies: PlanningCheckDependencies = {}
): Promise<PlanningCheckOutcome> {
  const { signal, onStreamEvent, ...runtimeDependencies } = dependencies
  return executeAgentTask<PlanningIntegrityReviewResult>(
    {
      ...planningReviewRequest(root, language),
      retry_of: executionId,
      ...(signal ? { signal } : {}),
      ...(onStreamEvent ? { onStreamEvent } : {})
    },
    desktopRuntimeDependencies(runtimeDependencies)
  )
}

export async function createPlanningCheckDecision(
  root: string,
  input: {
    executionId: string
    selectedResultIds: string[]
    decision: 'approved' | 'rejected'
    createdBy?: 'desktop-author' | 'cli-author'
  }
): Promise<AuthorApplyDecisionV1> {
  return createAuthorApplyDecision(root, {
    executionId: input.executionId,
    selectedResultIds: input.selectedResultIds,
    decision: input.decision,
    createdBy: input.createdBy ?? 'desktop-author'
  })
}

export async function applyPlanningCheckDecision(root: string, executionId: string, decisionId: string) {
  return applyAuthorDecision(root, executionId, decisionId)
}

export async function decidePlanningCheckForIPC(
  root: string,
  input: Parameters<typeof createPlanningCheckDecision>[1]
): Promise<PlanningCheckDecisionOutcome> {
  try {
    return { status: 'decided', decision: await createPlanningCheckDecision(root, input) }
  } catch (cause) {
    return {
      status: 'failed',
      error: localAgentError(cause, input.executionId, 'approval')
    }
  }
}

export async function applyPlanningCheckForIPC(
  root: string,
  executionId: string,
  decisionId: string
): Promise<PlanningCheckApplyOutcome> {
  try {
    return {
      status: 'applied',
      result: await applyPlanningCheckDecision(root, executionId, decisionId)
    }
  } catch (cause) {
    return { status: 'failed', error: localAgentError(cause, executionId, 'application') }
  }
}

export async function openPlanningCheckRun(root: string, executionId: string): Promise<boolean> {
  const runPath = assertProjectPath(
    root,
    path.join(root, 'runs', 'agents', agentRuntimeIdSchema.parse(executionId))
  )
  return (await shell.openPath(runPath)) === ''
}

function planningReviewRequest(root: string, language: 'zh' | 'en', scope?: PlanningCheckScope) {
  return {
    projectRoot: root,
    schema_version: 1 as const,
    task_id: 'planning-integrity-review',
    target: { type: 'project', id: 'project' },
    input: { semantic: true, ...(scope ? { scope } : {}) },
    language,
    requested_by: 'author' as const
  }
}

function desktopRuntimeDependencies(dependencies: PlanningCheckDependencies): AgentRuntimeDependencies {
  return {
    ...dependencies,
    loadAIProfile: dependencies.loadAIProfile ?? ((profile) => loadDesktopAIProfile(profile))
  }
}

function localAgentError(
  cause: unknown,
  executionId: string,
  phase: 'approval' | 'application'
): AgentRuntimeErrorV1 {
  if (cause instanceof AgentRuntimeError) return cause.value
  return createAgentRuntimeError(
    phase === 'approval' ? 'AGENT_APPROVAL_INVALID' : 'AGENT_APPLY_FAILED',
    { taskId: 'planning-integrity-review', executionId, phase },
    cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
    { retry_safe: false }
  ).value
}
