import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt } from './project.js'
import {
  WritingPresetNotFoundError,
  applyWritingPresetMigration,
  assertWritingPresetSnapshot,
  createWritingPreset,
  createWritingPresetSnapshot,
  defaultWritingPreset,
  listWritingPresets,
  loadSelectedWritingPreset,
  loadWritingPreset,
  planWritingPresetMigration,
  selectWritingPreset,
  writingPresetSnapshotHash
} from './writing-presets.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-preset-'))
  roots.push(base)
  return (
    await createProjectAt(path.join(base, 'project'), { id: 'preset-project', title: 'Preset Project' })
  ).root
}

function resolvedModel() {
  return {
    profile: 'prose' as const,
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    temperature: 0.4,
    max_output_tokens: 2048,
    tokenizer_id: 'o200k' as const
  }
}

describe('writing presets', () => {
  it('creates and selects versioned project presets without storing connection secrets', async () => {
    const root = await project()
    const custom = defaultWritingPreset('focused-prose', 'Focused Prose')
    custom.version = '2.1.0'
    custom.model = {
      profile: 'prose',
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_output_tokens: 2048,
      tokenizer_id: 'o200k'
    }
    await createWritingPreset(root, custom)

    expect(await listWritingPresets(root)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'default', selected: true, source_schema_version: 2 }),
        expect.objectContaining({ id: 'focused-prose', version: '2.1.0', selected: false })
      ])
    )
    const selected = await selectWritingPreset(root, 'focused-prose')
    expect((await loadSelectedWritingPreset(root)).preset.id).toBe('focused-prose')
    expect((await listWritingPresets(root)).find((item) => item.id === 'focused-prose')?.selected).toBe(true)

    const snapshot = createWritingPresetSnapshot(selected, resolvedModel())
    const serialized = JSON.stringify(snapshot)
    expect(snapshot).toMatchObject({
      preset_id: 'focused-prose',
      preset_version: '2.1.0',
      source: { path: 'presets/focused-prose.yaml', schema_version: 2 },
      model: { provider: 'openai', model: 'gpt-4o-mini', tokenizer_id: 'o200k' }
    })
    expect(writingPresetSnapshotHash(snapshot)).toBe(snapshot.snapshot_sha256)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('baseUrl')
    expect(serialized).not.toContain(root)
  })

  it('keeps an old snapshot explainable after the preset file changes', async () => {
    const root = await project()
    const original = await loadSelectedWritingPreset(root)
    const oldSnapshot = createWritingPresetSnapshot(original, resolvedModel())
    const updated = defaultWritingPreset('default', 'Updated Default')
    updated.version = '1.1.0'
    updated.prompt_stack.user_instructions = ['Use the revised instruction stack.']
    await writeFile(
      path.join(root, 'presets', 'default.yaml'),
      `${(await import('./yaml.js')).objectToYaml(updated as unknown as Record<string, unknown>)}\n`,
      'utf8'
    )

    const current = await loadSelectedWritingPreset(root)
    const newSnapshot = createWritingPresetSnapshot(current, resolvedModel())

    expect(oldSnapshot.preset_version).toBe('1.0.0')
    expect(oldSnapshot.prompt_stack.user_instructions).not.toEqual(newSnapshot.prompt_stack.user_instructions)
    expect(oldSnapshot.snapshot_sha256).not.toBe(newSnapshot.snapshot_sha256)
    expect(assertWritingPresetSnapshot(oldSnapshot)).toEqual(oldSnapshot)
  })

  it('loads schema v1 in memory, then backs up and verifies an explicit migration', async () => {
    const root = await project()
    const filePath = path.join(root, 'presets', 'legacy.yaml')
    const source = [
      'schema_version: 1',
      'id: legacy',
      'version: 3',
      'title: Legacy Preset',
      'profile: prose',
      'provider: openai',
      'model: gpt-4o-mini',
      'max_tokens: 1024',
      'prompt_block_order:',
      '  - canon',
      '  - outline',
      'semantic_checks: true',
      ''
    ].join('\n')
    await writeFile(filePath, source, 'utf8')

    const loaded = await loadWritingPreset(root, 'legacy')
    expect(loaded).toMatchObject({
      source_schema_version: 1,
      preset: {
        schema_version: 2,
        version: '3.0.0',
        model: { max_output_tokens: 1024 },
        prompt_stack: {
          block_order: expect.arrayContaining(['canon', 'outline', 'accepted_prose', 'shared_guidance'])
        },
        check_policy: { semantic: 'on-demand' }
      }
    })
    expect(new Set(loaded.preset.prompt_stack.block_order).size).toBe(
      loaded.preset.prompt_stack.block_order.length
    )
    await expect(readFile(filePath, 'utf8')).resolves.toBe(source)

    const plan = await planWritingPresetMigration(root, 'legacy')
    expect(plan).toMatchObject({ from_version: 1, to_version: 2, changed: true })
    const applied = await applyWritingPresetMigration(root, plan)
    expect(applied.preset.source_schema_version).toBe(2)
    expect(applied.backup_path).toMatch(
      /^imports\/backups\/writing-presets\/legacy\.schema-v1\.[a-f0-9]{12}\.yaml$/u
    )
    await expect(readFile(path.join(root, applied.backup_path!), 'utf8')).resolves.toBe(source)
  })

  it('fails clearly for missing, incompatible, tampered, or machine-local presets', async () => {
    const root = await project()
    await expect(loadWritingPreset(root, 'missing')).rejects.toBeInstanceOf(WritingPresetNotFoundError)
    await writeFile(
      path.join(root, 'presets', 'future.yaml'),
      'schema_version: 99\nid: future\ntitle: Future\n',
      'utf8'
    )
    await expect(loadWritingPreset(root, 'future')).rejects.toThrow(
      'Unsupported writing preset schema_version 99'
    )

    const loaded = await loadSelectedWritingPreset(root)
    const snapshot = createWritingPresetSnapshot(loaded, resolvedModel())
    await expect(() =>
      assertWritingPresetSnapshot({
        ...snapshot,
        source: { ...snapshot.source, path: 'C:/private/preset.yaml' }
      })
    ).toThrow('project-relative')
    await expect(() => assertWritingPresetSnapshot({ ...snapshot, title: 'tampered' })).toThrow(
      'hash does not match'
    )
  })
})
