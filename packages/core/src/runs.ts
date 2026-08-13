import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readdir, rename, rm, writeFile } from 'node:fs/promises'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { timestampId } from './ids.js'
import { objectToYaml, parseMarkdown } from './yaml.js'
import type {
  CandidateGroupSummary,
  ContextTrace,
  PromptBlock,
  RunMetadata,
  SharedGuidanceContent
} from './types.js'
import { assertWritingPresetSnapshot } from './writing-presets.js'
import type { WritingPresetSnapshot } from './types.js'

export function requireNonEmptyRunOutput(content: string, runId: string): string {
  if (!content.trim()) throw new Error(`Run output is empty; refusing to overwrite a scene: ${runId}`)
  return content
}

export async function createRun(
  projectRoot: string,
  sceneId: string,
  metadata: Partial<RunMetadata> = {}
): Promise<RunMetadata> {
  const targetId = metadata.target_id ?? sceneId
  const targetType = metadata.target_type ?? 'scene'
  const id = metadata.id ?? `${timestampId('run')}-${targetId}-${randomUUID().slice(0, 8)}`
  const runDir = path.join(projectRoot, 'runs', id)
  assertRunDirectory(projectRoot, runDir)
  if (await pathExists(runDir)) throw new Error(`Run already exists: ${id}`)
  await ensureDir(runDir)
  const full: RunMetadata = {
    id,
    scene_id: sceneId,
    target_type: targetType,
    target_id: targetId,
    source_outline: metadata.source_outline,
    candidate_group_id: metadata.candidate_group_id,
    candidate_index: metadata.candidate_index,
    parent_run_id: metadata.parent_run_id,
    branch_id: metadata.branch_id,
    selected_at: metadata.selected_at,
    created_at: metadata.created_at ?? new Date().toISOString(),
    provider: metadata.provider ?? 'none',
    model: metadata.model ?? 'none',
    preset_id: metadata.preset_id,
    preset_version: metadata.preset_version,
    preset_sha256: metadata.preset_sha256,
    status: metadata.status ?? 'created',
    run_dir: path.relative(projectRoot, runDir).replace(/\\/g, '/')
  }
  await writeRunMetadata(projectRoot, full)
  await writeText(path.join(runDir, 'context.md'), '')
  await writeText(path.join(runDir, 'prompt.md'), '')
  await writeText(path.join(runDir, 'output-raw.md'), '')
  await writeText(path.join(runDir, 'output-accepted.md'), '')
  await writeText(path.join(runDir, 'check-report.md'), '')
  await writeText(path.join(runDir, 'evaluation.json'), '')
  return full
}

export async function writeRunMetadata(projectRoot: string, metadata: RunMetadata): Promise<void> {
  const runDir = path.resolve(projectRoot, metadata.run_dir)
  assertRunDirectory(projectRoot, runDir)
  await writeText(
    path.join(runDir, 'metadata.yaml'),
    `${objectToYaml(metadata as unknown as Record<string, unknown>)}\n`
  )
}

export async function writeRunFile(
  projectRoot: string,
  metadata: RunMetadata,
  fileName: string,
  content: string
): Promise<void> {
  const runDir = path.resolve(projectRoot, metadata.run_dir)
  assertRunDirectory(projectRoot, runDir)
  await writeText(resolveRunFile(runDir, fileName), content)
}

export async function readRunFile(projectRoot: string, runId: string, fileName: string): Promise<string> {
  const runDir = path.resolve(projectRoot, 'runs', runId)
  assertRunDirectory(projectRoot, runDir)
  return readText(resolveRunFile(runDir, fileName))
}

export async function snapshotSharedGuidance(
  projectRoot: string,
  metadata: RunMetadata,
  guidance: SharedGuidanceContent[]
): Promise<{ markdown_path: string; metadata_path: string }> {
  const runDir = path.resolve(projectRoot, metadata.run_dir)
  assertRunDirectory(projectRoot, runDir)
  const markdownPath = path.join(runDir, 'shared-guidance.md')
  const metadataPath = path.join(runDir, 'shared-guidance.json')
  if ((await pathExists(markdownPath)) || (await pathExists(metadataPath))) {
    throw new Error(`Shared guidance snapshot already exists and is immutable: ${metadata.id}`)
  }

  const markdown = renderSharedGuidanceSnapshot(guidance)
  const snapshotMetadata = {
    schema_version: 1,
    items: guidance.map(({ id, path: sourcePath, scope, sha256, read_at }) => ({
      id,
      path: sourcePath,
      scope,
      sha256,
      read_at
    }))
  }
  const nonce = randomUUID()
  const markdownTemporary = `${markdownPath}.${nonce}.tmp`
  const metadataTemporary = `${metadataPath}.${nonce}.tmp`
  await writeFile(markdownTemporary, markdown, { encoding: 'utf8', flag: 'wx' })
  try {
    await writeFile(metadataTemporary, `${JSON.stringify(snapshotMetadata, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    })
    await rename(markdownTemporary, markdownPath)
    try {
      await rename(metadataTemporary, metadataPath)
    } catch (error) {
      await rm(markdownPath, { force: true })
      throw error
    }
  } catch (error) {
    await Promise.all([rm(markdownTemporary, { force: true }), rm(metadataTemporary, { force: true })])
    throw error
  }
  return { markdown_path: markdownPath, metadata_path: metadataPath }
}

export async function snapshotContextCompilation(
  projectRoot: string,
  metadata: RunMetadata,
  blocks: PromptBlock[],
  trace: ContextTrace
): Promise<{ blocks_path: string; trace_path: string }> {
  const runDir = path.resolve(projectRoot, metadata.run_dir)
  assertRunDirectory(projectRoot, runDir)
  const blocksPath = path.join(runDir, 'prompt-blocks.json')
  const tracePath = path.join(runDir, 'context-trace.json')
  if ((await pathExists(blocksPath)) || (await pathExists(tracePath))) {
    throw new Error(`Context compilation snapshot already exists and is immutable: ${metadata.id}`)
  }
  assertPortableCompilationSnapshot(blocks, trace)
  await writeImmutablePair(
    blocksPath,
    `${JSON.stringify({ schema_version: 1, blocks }, null, 2)}\n`,
    tracePath,
    `${JSON.stringify(trace, null, 2)}\n`
  )
  return { blocks_path: blocksPath, trace_path: tracePath }
}

export async function snapshotWritingPreset(
  projectRoot: string,
  metadata: RunMetadata,
  snapshot: WritingPresetSnapshot
): Promise<{ snapshot_path: string }> {
  const runDir = path.resolve(projectRoot, metadata.run_dir)
  assertRunDirectory(projectRoot, runDir)
  const snapshotPath = path.join(runDir, 'writing-preset.json')
  if (await pathExists(snapshotPath)) {
    throw new Error(`Writing preset snapshot already exists and is immutable: ${metadata.id}`)
  }
  const verified = assertWritingPresetSnapshot(snapshot)
  await writeImmutableFile(snapshotPath, `${JSON.stringify(verified, null, 2)}\n`)
  return { snapshot_path: snapshotPath }
}

export async function listRuns(projectRoot: string): Promise<RunMetadata[]> {
  await recoverCandidateSelection(projectRoot)
  return readRuns(projectRoot)
}

async function readRuns(projectRoot: string): Promise<RunMetadata[]> {
  const runsRoot = path.join(projectRoot, 'runs')
  if (!(await pathExists(runsRoot))) return []
  const entries = await readdir(runsRoot, { withFileTypes: true })
  const runs: RunMetadata[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metadataPath = path.join(runsRoot, entry.name, 'metadata.yaml')
    if (!(await pathExists(metadataPath))) continue
    const raw = await readText(metadataPath)
    const data = parseMarkdown<Record<string, unknown>>(`---\n${raw.trimEnd()}\n---\n`).data
    const get = (key: string): string => {
      const value = data[key]
      if (value instanceof Date) return value.toISOString()
      return typeof value === 'string' ? value : value == null ? '' : String(value)
    }
    const candidateIndex = Number(data.candidate_index)
    const status = get('status')
    const targetType = get('target_type')
    runs.push({
      id: get('id') || entry.name,
      scene_id: get('scene_id'),
      target_type: targetType === 'outline' ? 'outline' : 'scene',
      target_id: get('target_id') || get('scene_id'),
      source_outline: get('source_outline') || undefined,
      candidate_group_id: get('candidate_group_id') || undefined,
      candidate_index: Number.isInteger(candidateIndex) && candidateIndex >= 0 ? candidateIndex : undefined,
      parent_run_id: get('parent_run_id') || undefined,
      branch_id: get('branch_id') || undefined,
      selected_at: get('selected_at') || undefined,
      created_at: get('created_at'),
      provider: get('provider'),
      model: get('model'),
      preset_id: get('preset_id') || undefined,
      preset_version: get('preset_version') || undefined,
      preset_sha256: get('preset_sha256') || undefined,
      status: isRunStatus(status) ? status : 'created',
      // The directory being enumerated is authoritative; metadata must not redirect later reads or writes.
      run_dir: `runs/${entry.name}`
    })
  }
  return runs.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function listCandidateGroups(projectRoot: string): Promise<CandidateGroupSummary[]> {
  const grouped = new Map<string, RunMetadata[]>()
  for (const run of await listRuns(projectRoot)) {
    if (!run.candidate_group_id) continue
    const members = grouped.get(run.candidate_group_id) ?? []
    members.push(run)
    grouped.set(run.candidate_group_id, members)
  }
  return [...grouped.entries()]
    .map(([id, members]) => {
      const runs = members.sort(compareCandidateRuns)
      const selected = runs.find((run) => Boolean(run.selected_at))
      return {
        id,
        branch_id: runs[0]?.branch_id ?? 'main',
        parent_run_id: runs[0]?.parent_run_id,
        selected_run_id: selected?.id,
        runs
      }
    })
    .sort((left, right) => (right.runs[0]?.created_at ?? '').localeCompare(left.runs[0]?.created_at ?? ''))
}

export async function selectRunCandidate(
  projectRoot: string,
  runId: string,
  selectedAt = new Date().toISOString()
): Promise<CandidateGroupSummary> {
  if (Number.isNaN(Date.parse(selectedAt))) throw new Error(`Invalid candidate selection time: ${selectedAt}`)
  const runs = await listRuns(projectRoot)
  const selected = runs.find((run) => run.id === runId)
  if (!selected) throw new Error(`Run not found: ${runId}`)
  if (!selected.candidate_group_id) throw new Error(`Run is not part of a candidate group: ${runId}`)
  if (selected.status === 'created') throw new Error(`Candidate has no generated output: ${runId}`)
  const members = runs.filter((run) => run.candidate_group_id === selected.candidate_group_id)
  if (members.some((run) => run.status === 'accepted')) {
    throw new Error(
      `Candidate selection is locked after a group member is accepted: ${selected.candidate_group_id}`
    )
  }
  const journalPath = candidateSelectionJournalPath(projectRoot)
  await ensureDir(path.dirname(journalPath))
  await writeFile(
    journalPath,
    `${JSON.stringify(
      {
        schema_version: 1,
        candidate_group_id: selected.candidate_group_id,
        selected_run_id: runId,
        selected_at: selectedAt
      },
      null,
      2
    )}\n`,
    { encoding: 'utf8', flag: 'wx' }
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') {
      throw new Error('Another candidate selection transaction is pending; retry after recovery.')
    }
    throw error
  })
  await recoverCandidateSelection(projectRoot)
  const group = (await listCandidateGroups(projectRoot)).find(
    (item) => item.id === selected.candidate_group_id
  )
  if (!group || group.selected_run_id !== runId) {
    throw new Error(`Candidate selection verification failed: ${runId}`)
  }
  return group
}

export async function requireSelectedCandidateForAcceptance(
  projectRoot: string,
  run: RunMetadata
): Promise<void> {
  if (!run.candidate_group_id) return
  const current = (await listRuns(projectRoot)).find((item) => item.id === run.id)
  if (!current?.selected_at) {
    throw new Error(`Select this candidate before accepting it: ${run.id}`)
  }
}

interface CandidateSelectionJournal {
  schema_version: 1
  candidate_group_id: string
  selected_run_id: string
  selected_at: string
}

async function recoverCandidateSelection(projectRoot: string): Promise<void> {
  const journalPath = candidateSelectionJournalPath(projectRoot)
  if (!(await pathExists(journalPath))) return
  const journal = JSON.parse(await readText(journalPath)) as Partial<CandidateSelectionJournal>
  if (
    journal.schema_version !== 1 ||
    !journal.candidate_group_id ||
    !journal.selected_run_id ||
    !journal.selected_at
  ) {
    throw new Error(`Invalid candidate selection journal: ${journalPath}`)
  }
  const runs = await readRuns(projectRoot)
  const members = runs.filter((run) => run.candidate_group_id === journal.candidate_group_id)
  if (!members.some((run) => run.id === journal.selected_run_id)) {
    throw new Error(`Candidate selection journal references a missing run: ${journal.selected_run_id}`)
  }
  for (const run of members) {
    const selectedAt = run.id === journal.selected_run_id ? journal.selected_at : undefined
    if (run.selected_at === selectedAt) continue
    await writeRunMetadata(projectRoot, { ...run, selected_at: selectedAt })
  }
  const verified = await readRuns(projectRoot)
  const selectedIds = verified
    .filter((run) => run.candidate_group_id === journal.candidate_group_id && run.selected_at)
    .map((run) => run.id)
  if (selectedIds.length !== 1 || selectedIds[0] !== journal.selected_run_id) {
    throw new Error(`Candidate selection transaction could not be verified: ${journal.candidate_group_id}`)
  }
  await rm(journalPath, { force: true })
}

function candidateSelectionJournalPath(projectRoot: string): string {
  return path.join(projectRoot, 'runs', '.candidate-selection.json')
}

function compareCandidateRuns(left: RunMetadata, right: RunMetadata): number {
  const indexDifference =
    (left.candidate_index ?? Number.MAX_SAFE_INTEGER) - (right.candidate_index ?? Number.MAX_SAFE_INTEGER)
  return indexDifference || left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
}

function isRunStatus(value: string): value is RunMetadata['status'] {
  return value === 'created' || value === 'generated' || value === 'checked' || value === 'accepted'
}

function assertRunDirectory(projectRoot: string, candidate: string): void {
  const runsRoot = path.resolve(projectRoot, 'runs')
  const relative = path.relative(runsRoot, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe run directory outside the project runs folder: ${candidate}`)
  }
}

function resolveRunFile(runDir: string, fileName: string): string {
  const candidate = path.resolve(runDir, fileName)
  const relative = path.relative(runDir, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe run file path: ${candidate}`)
  }
  return candidate
}

function renderSharedGuidanceSnapshot(guidance: SharedGuidanceContent[]): string {
  const sections = guidance.map(
    (item) =>
      `## ${item.id}\n\npath: ${item.path}\nscope: ${item.scope}\nsha256: ${item.sha256}\nread_at: ${item.read_at}\n\n${item.content.trimEnd()}`
  )
  return `# Shared Guidance Snapshot\n\n${sections.join('\n\n')}\n`
}

async function writeImmutablePair(
  firstPath: string,
  firstContent: string,
  secondPath: string,
  secondContent: string
): Promise<void> {
  const nonce = randomUUID()
  const firstTemporary = `${firstPath}.${nonce}.tmp`
  const secondTemporary = `${secondPath}.${nonce}.tmp`
  await writeFile(firstTemporary, firstContent, { encoding: 'utf8', flag: 'wx' })
  try {
    await writeFile(secondTemporary, secondContent, { encoding: 'utf8', flag: 'wx' })
    await rename(firstTemporary, firstPath)
    try {
      await rename(secondTemporary, secondPath)
    } catch (error) {
      await rm(firstPath, { force: true })
      throw error
    }
  } catch (error) {
    await Promise.all([rm(firstTemporary, { force: true }), rm(secondTemporary, { force: true })])
    throw error
  }
}

async function writeImmutableFile(filePath: string, content: string): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    await rename(temporary, filePath)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function assertPortableCompilationSnapshot(blocks: PromptBlock[], trace: ContextTrace): void {
  const paths = [
    ...blocks.flatMap((block) => (block.source.path ? [block.source.path] : [])),
    ...trace.entries.flatMap((entry) => (entry.source_path ? [entry.source_path] : []))
  ]
  for (const sourcePath of paths) {
    if (path.isAbsolute(sourcePath) || path.win32.isAbsolute(sourcePath)) {
      throw new Error(`Context compilation snapshots cannot contain absolute paths: ${sourcePath}`)
    }
    if (sourcePath.replace(/\\/gu, '/').split('/').includes('..')) {
      throw new Error(`Context compilation snapshots cannot contain path traversal: ${sourcePath}`)
    }
  }
}
