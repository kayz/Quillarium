import path from 'node:path'
import type { Command } from 'commander'
import type { ChapterEvalProposalSet } from '@quillarium/core'
import * as agentRuntime from '@quillarium/agent-runtime'

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
      const detail = outcome.error.technical_detail?.trim()
      throw new Error(
        detail && /[\u4e00-\u9fff]/u.test(detail) ? detail : `章评估失败：${outcome.error.code}`
      )
    }

    const result = outcome.result as ChapterEvalProposalSet
    console.log(`chapter-eval: issues=${result.issues.length} settings=${result.settings.length}`)
  })
}
