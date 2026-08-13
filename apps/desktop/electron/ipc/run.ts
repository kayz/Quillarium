import {
  acceptSceneIntoChapter,
  assertPlainProse,
  listRuns,
  readRunFile,
  requireNonEmptyRunOutput,
  writeRunFile,
  writeRunMetadata
} from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerRunHandlers(): void {
  typedHandle('run:readFile', async (_event, root, runId, file) => readRunFile(root, runId, file))
  typedHandle('run:accept', async (_event, root, runId, candidate) => {
    const runs = await listRuns(root)
    const run = runs.find((item) => item.id === runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    const raw = assertPlainProse(
      requireNonEmptyRunOutput(candidate ?? (await readRunFile(root, runId, 'output-raw.md')), runId)
    )
    const next = { ...run, status: 'accepted' as const }
    await writeRunFile(root, next, 'output-raw.md', raw)
    await writeRunFile(root, next, 'output-accepted.md', raw)
    await writeRunMetadata(root, next)
    try {
      await acceptSceneIntoChapter(root, run.scene_id, raw)
    } catch (error) {
      await writeRunFile(root, run, 'output-accepted.md', '')
      await writeRunMetadata(root, run)
      throw error
    }
    return next
  })
}
