import {
  acceptSceneIntoChapter,
  assertPlainProse,
  listRuns,
  readRunFile,
  requireNonEmptyRunOutput,
  requireSelectedCandidateForAcceptance,
  selectRunCandidate,
  writeRunFile,
  writeRunMetadata
} from '@quillarium/core'
import { formatCheckReport, scoreCheckReport } from '@quillarium/checks'
import { typedHandle } from './contract.js'
import { createSemanticCheckReport } from './scene.js'

export function registerRunHandlers(): void {
  typedHandle('run:readFile', async (_event, root, runId, file) => readRunFile(root, runId, file))
  typedHandle('run:select', async (_event, root, runId) => selectRunCandidate(root, runId))
  typedHandle('run:check', async (_event, root, runId) => {
    const run = (await listRuns(root)).find((item) => item.id === runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    const content = requireNonEmptyRunOutput(await readRunFile(root, runId, 'output-raw.md'), runId)
    const report = await createSemanticCheckReport(root, run.scene_id, undefined, content)
    const markdown = formatCheckReport(report)
    const evaluation = scoreCheckReport(report)
    const checked = { ...run, status: 'checked' as const }
    await writeRunFile(root, checked, 'check-report.md', markdown)
    await writeRunFile(root, checked, 'evaluation.json', `${JSON.stringify(evaluation, null, 2)}\n`)
    await writeRunMetadata(root, checked)
    return { run: checked, report, markdown, evaluation }
  })
  typedHandle('run:accept', async (_event, root, runId, candidate) => {
    const runs = await listRuns(root)
    const run = runs.find((item) => item.id === runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    const raw = assertPlainProse(
      requireNonEmptyRunOutput(candidate ?? (await readRunFile(root, runId, 'output-raw.md')), runId)
    )
    await requireSelectedCandidateForAcceptance(root, run)
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
