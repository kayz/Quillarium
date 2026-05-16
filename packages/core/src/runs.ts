import path from 'node:path'
import { ensureDir, readText, writeText } from './fs.js'
import { timestampId } from './ids.js'
import { objectToYaml } from './yaml.js'
import type { RunMetadata } from './types.js'

export async function createRun(projectRoot: string, sceneId: string, metadata: Partial<RunMetadata> = {}): Promise<RunMetadata> {
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
  await writeText(path.join(runDir, 'metadata.yaml'), `${objectToYaml(metadata as unknown as Record<string, unknown>)}\n`)
}

export async function writeRunFile(projectRoot: string, metadata: RunMetadata, fileName: string, content: string): Promise<void> {
  await writeText(path.join(projectRoot, metadata.run_dir, fileName), content)
}

export async function readRunFile(projectRoot: string, runId: string, fileName: string): Promise<string> {
  return readText(path.join(projectRoot, 'runs', runId, fileName))
}
