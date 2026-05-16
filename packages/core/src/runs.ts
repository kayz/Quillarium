import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { timestampId } from './ids.js'
import { objectToYaml } from './yaml.js'
import type { RunMetadata } from './types.js'

export async function createRun(
  projectRoot: string,
  sceneId: string,
  metadata: Partial<RunMetadata> = {}
): Promise<RunMetadata> {
  const id = metadata.id ?? `${timestampId('run')}-${sceneId}`
  const runDir = path.join(projectRoot, 'runs', id)
  await ensureDir(runDir)
  const full: RunMetadata = {
    id,
    scene_id: sceneId,
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
  const runDir = path.join(projectRoot, metadata.run_dir)
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
  await writeText(path.join(projectRoot, metadata.run_dir, fileName), content)
}

export async function readRunFile(projectRoot: string, runId: string, fileName: string): Promise<string> {
  return readText(path.join(projectRoot, 'runs', runId, fileName))
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
    const get = (key: string) => raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
    runs.push({
      id: get('id') ?? entry.name,
      scene_id: get('scene_id') ?? '',
      created_at: get('created_at') ?? '',
      provider: get('provider') ?? '',
      model: get('model') ?? '',
      status: (get('status') as RunMetadata['status']) ?? 'created',
      run_dir: get('run_dir') ?? `runs/${entry.name}`
    })
  }
  return runs.sort((a, b) => b.created_at.localeCompare(a.created_at))
}
