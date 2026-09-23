import path from 'node:path'
import type { Command } from 'commander'
import type {
  ChapterEvalProposalSet,
  OutlineOrganizeProposalSet,
  WorldOrganizeProposalSet
} from '@quillarium/core'
import * as agentRuntime from '@quillarium/agent-runtime'

function throwFailedExpert(outcome: {
  error: { code: string; technical_detail?: string }
}, fallback: string): never {
  const detail = outcome.error.technical_detail?.trim()
  throw new Error(detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `${fallback}${outcome.error.code}`)
}

export function registerExpertCommands(program: Command, projectOption: (command: Command) => Command): void {
  const expert = program.command('expert').description('Run expert-lane Agent tasks without generating prose')

  projectOption(
    expert
      .command('evaluate-chapter')
      .requiredOption('--chapter-id <id>', 'Chapter outline id whose prose to evaluate')
      .description('Evaluate existing chapter prose and print proposal counts without writing')
  ).action(async (options) => {
    const outcome = await agentRuntime.executeExpertTask({
      projectRoot: path.resolve(options.project),
      task_id: 'continuity-check',
      input: { chapter_id: options.chapterId }
    })

    if (outcome.status !== 'completed') {
      throwFailedExpert(outcome, '章评估失败：')
    }

    const result = outcome.result as ChapterEvalProposalSet
    console.log(`chapter-eval: issues=${result.issues.length} settings=${result.settings.length}`)
  })

  projectOption(
    expert
      .command('organize-outline')
      .requiredOption('--outline-id <id>', 'Outline node id whose children to organize')
      .description('Propose outline child nodes and print create counts without writing')
  ).action(async (options) => {
    const outcome = await agentRuntime.executeExpertTask({
      projectRoot: path.resolve(options.project),
      task_id: 'organize-outline',
      input: { outline_id: options.outlineId }
    })

    if (outcome.status !== 'completed') {
      throwFailedExpert(outcome, '大纲整理失败：')
    }

    const result = outcome.result as OutlineOrganizeProposalSet
    console.log(`outline-organize: creates=${result.creates.length}`)
  })

  projectOption(
    expert
      .command('organize-worldbook')
      .description('Propose world-book creates and updates and print counts without writing')
  ).action(async (options) => {
    const outcome = await agentRuntime.executeExpertTask({
      projectRoot: path.resolve(options.project),
      task_id: 'organize-worldbook',
      input: {}
    })

    if (outcome.status !== 'completed') {
      throwFailedExpert(outcome, '世界书整理失败：')
    }

    const result = outcome.result as WorldOrganizeProposalSet
    console.log(`world-organize: creates=${result.creates.length} updates=${result.updates.length}`)
  })
}
