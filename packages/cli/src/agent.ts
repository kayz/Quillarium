import path from 'node:path'
import type { Command } from 'commander'
import { loadAIProfile } from '@quillarium/ai'
import {
  applyAuthorDecision,
  createAuthorApplyDecision,
  executeAgentTask,
  type AgentExecutionOutcome,
  type AgentRuntimeErrorV1,
  type PlanningIntegrityReviewResult
} from '@quillarium/agent-runtime'

export function registerAgentCommands(program: Command, projectOption: (command: Command) => Command): void {
  const agent = program
    .command('agent')
    .description('Run auditable product Agent tasks and explicit author-approval handoffs')

  projectOption(
    agent
      .command('check-planning')
      .option('--language <language>', 'Result language: zh | en', 'en')
      .option('--no-semantic', 'Run deterministic planning checks without calling a model')
      .option('--retry-of <execution-id>', 'Retry only failed batches from a prior execution')
      .description('Run the unified project planning-integrity review without writing issue cards')
  ).action(async (options) => {
    const outcome = await executeAgentTask<PlanningIntegrityReviewResult>(
      {
        schema_version: 1,
        task_id: 'planning-integrity-review',
        projectRoot: path.resolve(options.project),
        target: { type: 'project', id: 'current-project' },
        input: { semantic: options.semantic },
        language: parseAgentLanguage(options.language),
        requested_by: 'author',
        ...(options.retryOf ? { retry_of: options.retryOf } : {})
      },
      { loadAIProfile: (profile) => loadAIProfile(profile) }
    )
    printAgentOutcome(outcome)
  })

  projectOption(
    agent
      .command('decide-planning')
      .argument('<execution-id>', 'Completed planning-check execution id')
      .option('--select <ids>', 'Comma-separated proposal ids to approve')
      .option('--reject', 'Record an explicit rejection instead of approving results')
      .option('--expires-in-minutes <minutes>', 'Approval lifetime in minutes', '60')
      .description('Persist an explicit author decision; this command does not modify project facts')
  ).action(async (executionId, options) => {
    const selected = csv(options.select)
    if (!options.reject && selected.length === 0) {
      throw new Error('Approval requires at least one proposal id in --select.')
    }
    if (options.reject && selected.length > 0) {
      throw new Error('A rejected decision cannot include --select results.')
    }
    const expiresInMinutes = Number(options.expiresInMinutes)
    if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
      throw new Error('--expires-in-minutes must be a positive number.')
    }
    const decision = await createAuthorApplyDecision(path.resolve(options.project), {
      executionId,
      selectedResultIds: selected,
      decision: options.reject ? 'rejected' : 'approved',
      createdBy: 'cli-author',
      expiresInMs: Math.round(expiresInMinutes * 60_000)
    })
    console.log(JSON.stringify(decision, null, 2))
  })

  projectOption(
    agent
      .command('apply-planning')
      .argument('<execution-id>', 'Completed planning-check execution id')
      .requiredOption('--decision <decision-id>', 'Previously persisted author decision id')
      .description('Apply an approved decision through the fail-closed project write service')
  ).action(async (executionId, options) => {
    console.log(
      JSON.stringify(
        await applyAuthorDecision(path.resolve(options.project), executionId, options.decision),
        null,
        2
      )
    )
  })
}

function csv(value?: string): string[] {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []
}

function parseAgentLanguage(value: unknown): 'zh' | 'en' {
  if (value === 'zh' || value === 'en') return value
  throw new Error(`Unsupported Agent language: ${String(value)}. Expected zh or en.`)
}

function printAgentOutcome(
  outcome: AgentExecutionOutcome<PlanningIntegrityReviewResult, AgentRuntimeErrorV1>
): void {
  console.log(JSON.stringify(outcome, null, 2))
  if (outcome.status === 'failed') {
    throw new Error(`${outcome.error.code} (${outcome.execution_id})`)
  }
}
