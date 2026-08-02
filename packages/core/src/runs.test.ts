import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createRun,
  listRuns,
  readRunFile,
  requireNonEmptyRunOutput,
  writeRunFile,
  writeRunMetadata
} from './runs.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryProject(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-runs-'))
  roots.push(root)
  return root
}

describe('run metadata', () => {
  it('rejects empty accepted output before a caller can overwrite scene prose', () => {
    expect(() => requireNonEmptyRunOutput('  \n', 'run-empty')).toThrow(
      'Run output is empty; refusing to overwrite a scene: run-empty'
    )
    expect(requireNonEmptyRunOutput('Accepted prose.\n', 'run-ready')).toBe('Accepted prose.\n')
  })

  it('round-trips quoted YAML scalars without accumulating quotes', async () => {
    const root = await temporaryProject()
    const created = await createRun(root, 'scene-one', {
      id: 'run-one',
      created_at: '2026-08-02T10:54:30.022Z',
      provider: 'openai-compatible',
      model: 'test-model'
    })

    const loaded = (await listRuns(root))[0]
    expect(loaded).toEqual(created)
    const accepted = { ...loaded, status: 'accepted' as const }
    await writeRunMetadata(root, accepted)

    expect((await listRuns(root))[0]).toEqual(accepted)
    const raw = await readFile(path.join(root, 'runs', 'run-one', 'metadata.yaml'), 'utf8')
    expect(raw).toContain('created_at: "2026-08-02T10:54:30.022Z"')
    expect(raw).not.toContain('source_outline:')
    expect(raw).not.toContain('\\"2026-08-02')
  })

  it('rejects run directory and file traversal', async () => {
    const root = await temporaryProject()
    const run = await createRun(root, 'scene-one', { id: 'run-one' })

    await expect(
      writeRunFile(root, { ...run, run_dir: '../outside' }, 'output-raw.md', 'unsafe')
    ).rejects.toThrow('Unsafe run directory')
    await expect(readRunFile(root, '../outside', 'output-raw.md')).rejects.toThrow('Unsafe run directory')
    await expect(readRunFile(root, run.id, '../metadata.yaml')).rejects.toThrow('Unsafe run file path')
  })
})
