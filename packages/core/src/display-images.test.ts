import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorldEntry } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown } from './fs.js'
import { createProjectAt } from './project.js'
import { WRITER_DEFAULT_DISPLAY_LAYER } from './display-layer.js'
import {
  addDisplayImage,
  listDisplayImages,
  removeDisplayImage,
  removeDisplayImagesForCard,
  selectDisplayImage
} from './display-images.js'

function displaySegment(cardId: string): string {
  return `id-${createHash('sha256').update(cardId, 'utf8').digest('hex').slice(0, 24)}`
}

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
)

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(id: string) {
  const root = path.join(os.tmpdir(), `quillarium-display-images-${id}-${Date.now()}`)
  roots.push(root)
  await createProjectAt(root, { id, title: id, display_layer: WRITER_DEFAULT_DISPLAY_LAYER })
  const cardFile = await createWorldEntry(root, '林舟', { id: 'world-lin' }, '水手。')
  return { root, cardFile }
}

describe('display image store', () => {
  it('writes files and manifest without touching card image', async () => {
    const { root, cardFile } = await fixture('upload')
    const current = await readMarkdown<Record<string, unknown>>(cardFile)
    delete current.data.image
    await writeMarkdown(cardFile, current.data, current.content)
    const first = await addDisplayImage(root, 'world-lin', PNG, {
      mime_type: 'image/png',
      alt: '林舟',
      source: 'upload'
    })
    expect(first.selected_id).toBeTruthy()
    expect(first.images).toHaveLength(1)
    expect(await pathExists(path.join(root, 'assets', 'display', 'world-lin', first.images[0]!.file))).toBe(
      true
    )
    const card = await readText(cardFile)
    expect(card).not.toMatch(/^image:/m)
    expect(
      JSON.parse(await readText(path.join(root, 'assets', 'display', 'world-lin', 'manifest.json')))
    ).toMatchObject({ schema_version: 1, selected_id: first.selected_id })
  })

  it('keeps a gallery and lets the author change the selected image', async () => {
    const { root } = await fixture('gallery')
    const first = await addDisplayImage(root, 'world-lin', PNG, {
      mime_type: 'image/png',
      alt: 'a',
      source: 'upload'
    })
    const second = await addDisplayImage(root, 'world-lin', PNG, {
      mime_type: 'image/png',
      alt: 'b',
      source: 'generated'
    })
    expect(second.images).toHaveLength(2)
    expect(second.selected_id).toBe(second.images[1]!.id)
    const selected = await selectDisplayImage(root, 'world-lin', first.images[0]!.id)
    expect(selected.selected_id).toBe(first.images[0]!.id)
    const removed = await removeDisplayImage(root, 'world-lin', second.images[1]!.id)
    expect(removed.images).toHaveLength(1)
    expect(removed.selected_id).toBe(first.images[0]!.id)
  })

  it('deletes the display image directory for a card', async () => {
    const { root } = await fixture('remove-card')
    await addDisplayImage(root, 'world-lin', PNG, { mime_type: 'image/png', alt: 'a', source: 'upload' })
    expect(await pathExists(path.join(root, 'assets', 'display', 'world-lin'))).toBe(true)
    await removeDisplayImagesForCard(root, 'world-lin')
    expect(await pathExists(path.join(root, 'assets', 'display', 'world-lin'))).toBe(false)
  })

  it('stores CJK auto-id galleries under a hashed display segment', async () => {
    const root = path.join(os.tmpdir(), `quillarium-display-images-cjk-${Date.now()}`)
    roots.push(root)
    await createProjectAt(root, { id: 'cjk', title: 'cjk', display_layer: WRITER_DEFAULT_DISPLAY_LAYER })
    const cardFile = await createWorldEntry(root, '林舟', {}, '水手。')
    const current = await readMarkdown<Record<string, unknown>>(cardFile)
    delete current.data.image
    await writeMarkdown(cardFile, current.data, current.content)
    const cardId = 'world-林舟'
    const segment = displaySegment(cardId)
    const galleryDir = path.join(root, 'assets', 'display', segment)

    const added = await addDisplayImage(root, cardId, PNG, {
      mime_type: 'image/png',
      alt: '林舟',
      source: 'upload'
    })
    expect(added.images).toHaveLength(1)
    expect(await pathExists(path.join(galleryDir, added.images[0]!.file))).toBe(true)
    expect(await listDisplayImages(root, cardId)).toMatchObject({
      schema_version: 1,
      selected_id: added.selected_id,
      images: [{ id: added.images[0]!.id }]
    })
    const card = await readText(cardFile)
    expect(card).toMatch(/^id:\s*world-林舟$/m)
    expect(card).not.toMatch(/^image:/m)

    await removeDisplayImagesForCard(root, cardId)
    expect(await pathExists(galleryDir)).toBe(false)
    expect(await listDisplayImages(root, cardId)).toEqual({
      schema_version: 1,
      selected_id: null,
      images: []
    })
  })
})
