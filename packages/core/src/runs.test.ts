import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createRun,
  listRuns,
  readRunFile,
  requireNonEmptyRunOutput,
  snapshotContextCompilation,
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

  it('writes immutable portable context compiler snapshots', async () => {
    const root = await temporaryProject()
    const run = await createRun(root, 'scene-one', { id: 'run-context' })
    const block = {
      id: 'document:canon:canon-one',
      kind: 'canon' as const,
      role: 'user' as const,
      title: 'Canon One',
      content: '### Canon One\n\nA fixed fact.',
      content_sha256: 'block-hash',
      source: { type: 'canon', id: 'canon-one', path: 'canon/canon-one.md' },
      scope: 'scene',
      purpose: 'test',
      authority: 'hard_canon' as const,
      authority_rank: 500,
      priority: 500,
      order: 100,
      token_count: 8,
      original_token_count: 8,
      tokenizer_id: 'fixture',
      retained_token_range: { start: 0, end: 8 },
      truncated: false,
      truncation: 'none' as const,
      selection_reason: 'hard canon',
      trigger_chain: ['target:scene-one']
    }
    const trace = {
      schema_version: 1 as const,
      compiler_version: '1.0.0',
      target: { type: 'scene' as const, id: 'scene-one' },
      policy: {
        schema_version: 1 as const,
        id: 'test',
        token_budget: 100,
        max_block_tokens: 100,
        min_truncated_block_tokens: 1,
        max_candidates: 10,
        max_recursion_depth: 2
      },
      tokenizer: {
        id: 'fixture',
        provider: 'test',
        model: 'test',
        exact: true as const,
        source_revision: 'v1',
        source_sha256: 'source',
        vocabulary_sha256: 'vocab'
      },
      budget: {
        total_token_budget: 100,
        reserved_output_tokens: 0,
        framing_tokens: 0,
        available_input_tokens: 100,
        selected_tokens: 8,
        unused_input_tokens: 92,
        token_budget: 100,
        used_tokens: 8,
        remaining_tokens: 92
      },
      candidates: {
        discovered: 1,
        eligible: 1,
        limit: 10,
        max_recursion_depth: 2,
        reached_recursion_depth: 0
      },
      entries: [
        {
          block_id: block.id,
          source_type: 'canon',
          source_id: 'canon-one',
          source_path: 'canon/canon-one.md',
          authority: 'hard_canon' as const,
          authority_rank: 500,
          priority: 500,
          outcome: 'included' as const,
          reason: 'hard canon',
          trigger_chain: ['target:scene-one'],
          token_count: 8,
          original_token_count: 8,
          content_sha256: 'block-hash',
          tokenizer_id: 'fixture',
          retained_token_range: { start: 0, end: 8 }
        }
      ],
      final_block_ids: [block.id]
    }

    await snapshotContextCompilation(root, run, [block], trace)
    expect(await readRunFile(root, run.id, 'prompt-blocks.json')).toContain('canon/canon-one.md')
    expect(await readRunFile(root, run.id, 'context-trace.json')).toContain('"used_tokens": 8')
    await expect(snapshotContextCompilation(root, run, [block], trace)).rejects.toThrow('immutable')
    await expect(
      snapshotContextCompilation(
        root,
        { ...run, id: 'run-unsafe', run_dir: 'runs/run-unsafe' },
        [{ ...block, source: { ...block.source, path: 'C:/private/canon.md' } }],
        trace
      )
    ).rejects.toThrow('absolute paths')
  })
})
