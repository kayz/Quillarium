import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import {
  UNCONFIRMED_EVAL,
  applyAssistantTurn,
  loadAgentSessionDetail,
  type AssistantTurnDecisions
} from '@quillarium/core'

async function currentTurnSha(projectRoot: string, sessionId: string, turnId: string): Promise<string> {
  const detail = await loadAgentSessionDetail(projectRoot, sessionId)
  return detail.turn_source_sha256[turnId]!
}

export function registerAssistantCommands(
  program: Command,
  projectOption: (command: Command) => Command
): void {
  const assistant = program.command('assistant').description('Confirm existing creator-assistant turns')
  projectOption(
    assistant
      .command('apply-turn')
      .requiredOption('--session <id>', 'Assistant session id')
      .requiredOption('--turn <id>', 'Turn id')
      .requiredOption('--decisions <file>', 'JSON decisions for applyAssistantTurn')
      .description('Apply a stored assistant turn after author decisions; does not chat')
  ).action(async (options) => {
    const raw = JSON.parse(await readFile(path.resolve(options.decisions), 'utf8')) as {
      confirmed?: boolean
      creates?: unknown
      updates?: unknown
      issues?: unknown
      configs?: unknown
    }
    if (raw.confirmed !== true) throw new Error(UNCONFIRMED_EVAL)
    const projectRoot = path.resolve(options.project)
    const result = await applyAssistantTurn(
      projectRoot,
      options.session,
      options.turn,
      {
        confirmed: true,
        creates: (raw.creates ?? []) as AssistantTurnDecisions['creates'],
        updates: (raw.updates ?? []) as AssistantTurnDecisions['updates'],
        issues: (raw.issues ?? []) as string[],
        configs: (raw.configs ?? []) as string[]
      },
      await currentTurnSha(projectRoot, options.session, options.turn)
    )
    console.log(
      `assistant-turn: creates=${result.created_ids.length} updates=${result.updated_ids.length} issues=${result.issue_ids.length} configs=${result.config_ids.length} rejected=${result.rejected_ids.length}`
    )
  })
}
