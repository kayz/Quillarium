import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { timestampId } from './ids.js'
import { objectToYaml, parseMarkdown } from './yaml.js'
import type { RunMetadata } from './types.js'

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
  const id = metadata.id ?? `${timestampId('run')}-${targetId}`
  const runDir = path.join(projectRoot, 'runs', id)
  assertRunDirectory(projectRoot, runDir)
  await ensureDir(runDir)
  const full: RunMetadata = {
    id,
    scene_id: sceneId,
    target_type: targetType,
    target_id: targetId,
    source_outline: metadata.source_outline,
    created_at: metadata.created_at ?? new Date().toISOString(),
    provider: metadata.provider ?? 'none',
    model: metadata.model ?? 'none',
    status: metadata.status ?? 'created',
    run_dir: path.relative(projectRoot, runDir).replace(/\\/g, '/')
  }
  await writeRunMetadata(projectRoot, full)
  await writeText(path.join(runDir, 'context.md'), '')
  await writeText(path.join(runDir, 'prompt.md'), '')
  await writeText(path.join(runDir, 'output-raw.md'), '')
  await writeText(path.join(runDir, 'output-accepted.md'), '')
  await writeText(path.join(runDir, 'check-report.md'), '')
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

export async function listRuns(projectRoot: string): Promise<RunMetadata[]> {
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
    const status = get('status')
    const targetType = get('target_type')
    runs.push({
      id: get('id') || entry.name,
      scene_id: get('scene_id'),
      target_type: targetType === 'outline' ? 'outline' : 'scene',
      target_id: get('target_id') || get('scene_id'),
      source_outline: get('source_outline') || undefined,
      created_at: get('created_at'),
      provider: get('provider'),
      model: get('model'),
      status: isRunStatus(status) ? status : 'created',
      // The directory being enumerated is authoritative; metadata must not redirect later reads or writes.
      run_dir: `runs/${entry.name}`
    })
  }
  return runs.sort((a, b) => b.created_at.localeCompare(a.created_at))
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
