import {
  listDocs,
  listRuns,
  readRunFile,
  requireNonEmptyRunOutput,
  writeMarkdown,
  writeRunFile,
  writeRunMetadata,
  type BaseDoc
} from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerRunHandlers(): void {
  typedHandle('run:readFile', async (_event, root, runId, file) => readRunFile(root, runId, file))
  typedHandle('run:accept', async (_event, root, runId) => {
    const runs = await listRuns(root)
    const run = runs.find((item) => item.id === runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    const raw = requireNonEmptyRunOutput(await readRunFile(root, runId, 'output-raw.md'), runId)
    const scene = await listDocs<BaseDoc>(root, 'scene').then((docs) =>
      docs.find((doc) => doc.data.id === run.scene_id)
    )
    if (!scene) throw new Error(`Scene not found: ${run.scene_id}`)
    const next = { ...run, status: 'accepted' as const }
    await writeRunFile(root, next, 'output-accepted.md', raw)
    await writeRunMetadata(root, next)
    await writeMarkdown(scene.path, scene.data as unknown as Record<string, unknown>, raw)
    return next
  })
}
