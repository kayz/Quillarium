import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Command } from 'commander'
import {
  listRuns,
  readRunFile,
  requireDoc,
  requireNonEmptyRunOutput,
  writeMarkdown,
  writeRunFile,
  writeRunMetadata,
  type SceneDoc
} from '@quillarium/core'

export function registerRunCommands(program: Command, projectOption: (command: Command) => Command): void {
  const run = program.command('run').description('Manage generation runs')
  projectOption(run.command('list').description('List run directories')).action(async (options) => {
    const runs = await listRuns(path.resolve(options.project))
    for (const item of runs) {
      console.log(`${item.id}\t${item.scene_id}\t${item.status}\t${item.model}\t${item.created_at}`)
    }
  })
  projectOption(
    run
      .command('show')
      .argument('<run-id>', 'Run id')
      .option('--file <file>', 'Run file', 'metadata.yaml')
      .description('Show a run file')
  ).action(async (runId, options) => {
    console.log(await readRunFile(path.resolve(options.project), runId, options.file))
  })
  projectOption(
    run
      .command('set-output')
      .argument('<run-id>', 'Run id')
      .requiredOption('--file <path>', 'UTF-8 candidate prose file')
      .description('Load candidate prose into output-raw.md for review')
  ).action(async (runId, options) => {
    const root = path.resolve(options.project)
    const current = await requireRun(root, runId)
    const content = requireNonEmptyRunOutput(await readFile(path.resolve(options.file), 'utf8'), runId)
    const generated = { ...current, status: 'generated' as const }
    await writeRunFile(root, generated, 'output-raw.md', content)
    await writeRunMetadata(root, generated)
    console.log(`Updated ${runId} output-raw.md (${content.length} characters).`)
  })
  projectOption(
    run
      .command('accept')
      .argument('<run-id>', 'Run id')
      .option('--scene <scene-id>', 'Scene id; defaults to metadata scene_id')
      .description('Accept output-raw.md into output-accepted.md and scene file')
  ).action(async (runId, options) => {
    const root = path.resolve(options.project)
    const current = await requireRun(root, runId)
    const raw = requireNonEmptyRunOutput(await readRunFile(root, runId, 'output-raw.md'), runId)
    const sceneId = options.scene ?? current.scene_id
    const sceneDoc = await requireDoc<SceneDoc>(root, sceneId)
    const accepted = { ...current, scene_id: sceneId, status: 'accepted' as const }
    await writeRunFile(root, accepted, 'output-accepted.md', raw)
    await writeRunMetadata(root, accepted)
    await writeMarkdown(sceneDoc.path, sceneDoc.data as unknown as Record<string, unknown>, raw)
    console.log(`Accepted ${runId} into ${sceneDoc.path}`)
  })
}

async function requireRun(root: string, runId: string) {
  const run = (await listRuns(root)).find((item) => item.id === runId)
  if (!run) throw new Error(`Run not found: ${runId}`)
  return run
}
