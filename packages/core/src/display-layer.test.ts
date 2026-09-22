import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorldEntry, listDocs } from './documents.js'
import { pathExists, writeMarkdown, writeText } from './fs.js'
import {
  WRITER_DEFAULT_DISPLAY_LAYER,
  needsDisplayMigration,
  resetDisplayLayer,
  setDisplayLayerEnabled,
  shouldPromptDisplayReset
} from './display-layer.js'
import { createProjectAt, loadProject } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const sampleImage = {
  schema_version: 1 as const,
  original_path: 'assets/settings/world_entry/world-lin/original.png',
  thumbnail_path: 'assets/settings/world_entry/world-lin/thumb.png',
  mime_type: 'image/png' as const,
  sha256: 'a'.repeat(64),
  width: 8,
  height: 8,
  palette: ['#111111'],
  focus_x: 0.5,
  focus_y: 0.5,
  alt_text: '林舟'
}

async function fixture(id: string) {
  const root = path.join(os.tmpdir(), `quillarium-display-${id}-${Date.now()}`)
  roots.push(root)
  await createProjectAt(root, { id, title: id, display_layer: WRITER_DEFAULT_DISPLAY_LAYER })
  return root
}

describe('display layer reset', () => {
  it('does not treat a new writer project as needing migration', async () => {
    const root = await fixture('new-writer')
    expect(WRITER_DEFAULT_DISPLAY_LAYER).toEqual({ enabled: false, migrated: true })
    expect((await loadProject(root)).display_layer).toEqual({ enabled: false, migrated: true })
    expect(await needsDisplayMigration(root)).toBe(false)
  })

  it('detects leftover setting files when display_layer is absent', async () => {
    const root = path.join(os.tmpdir(), `quillarium-display-legacy-${Date.now()}`)
    roots.push(root)
    await createProjectAt(root, { id: 'legacy-art', title: '旧图' })
    const asset = path.join(root, 'assets', 'settings', 'world_entry', 'x.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    expect(await needsDisplayMigration(root)).toBe(true)
  })

  it('strips image and deletes setting assets after confirm', async () => {
    const root = await fixture('wipe-me')
    const file = await createWorldEntry(root, '林舟', { id: 'world-lin' }, '水手。')
    const current = await (await import('./fs.js')).readMarkdown<Record<string, unknown>>(file)
    await writeMarkdown(file, { ...current.data, image: sampleImage }, current.content)
    const asset = path.join(root, sampleImage.original_path)
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    await resetDisplayLayer(root)
    expect(await needsDisplayMigration(root)).toBe(false)
    expect((await loadProject(root)).display_layer).toEqual({ enabled: true, migrated: true })
    expect((await listDocs(root, 'world_entry'))[0]?.data).not.toHaveProperty('image')
    expect(await pathExists(asset)).toBe(false)
  })

  it('still reports leftovers after migrated is true so reset can retry', async () => {
    const root = await fixture('retry')
    const asset = path.join(root, 'assets', 'settings', 'orphan.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    const { updateProjectConfig } = await import('./project.js')
    await updateProjectConfig(root, { display_layer: { enabled: true, migrated: true } })
    expect(await needsDisplayMigration(root)).toBe(true)
  })
})

describe('display layer prompt and enable', () => {
  it('prompts when leftovers exist and display_layer is missing', async () => {
    const root = path.join(os.tmpdir(), `quillarium-display-prompt-missing-${Date.now()}`)
    roots.push(root)
    await createProjectAt(root, { id: 'legacy-prompt', title: '旧图' })
    const asset = path.join(root, 'assets', 'settings', 'world_entry', 'x.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    expect((await loadProject(root)).display_layer).toBeUndefined()
    expect(await shouldPromptDisplayReset(root)).toBe(true)
  })

  it('does not prompt leftovers when display_layer.migrated is true', async () => {
    const root = await fixture('prompt-migrated')
    const asset = path.join(root, 'assets', 'settings', 'orphan.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    expect((await loadProject(root)).display_layer?.migrated).toBe(true)
    expect(await shouldPromptDisplayReset(root)).toBe(false)
  })

  it('does not stamp migrated true when enabling on leftover missing field', async () => {
    const root = path.join(os.tmpdir(), `quillarium-display-enable-missing-${Date.now()}`)
    roots.push(root)
    await createProjectAt(root, { id: 'legacy-enable', title: '旧图' })
    const asset = path.join(root, 'assets', 'settings', 'world_entry', 'x.png')
    await mkdir(path.dirname(asset), { recursive: true })
    await writeText(asset, 'png')
    const next = await setDisplayLayerEnabled(root, true)
    expect(next.display_layer?.migrated).not.toBe(true)
    expect((await loadProject(root)).display_layer?.migrated).not.toBe(true)
  })
})
