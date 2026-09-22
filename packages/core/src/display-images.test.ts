import { mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorldEntry } from './documents.js'
import { pathExists, readText } from './fs.js'
import { createProjectAt, loadProject } from './project.js'
import { WRITER_DEFAULT_DISPLAY_LAYER } from './display-layer.js'
import {
  addDisplayImage,
  listDisplayImages,
  removeDisplayImage,
  selectDisplayImage
} from './display-images.js'

const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
)

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(id: string) {
  const root = path.join(os.tmpdir(), `quillarium-display-images-${id}-${Date.now()}`)
  roots.push(root)
  await createProjectAt(root, { id, title: id, display_layer: WRITER_DEFAULT_DISPLAY_LAYER })
  await createWorldEntry(root, '林舟', { id: 'world-lin' }, '水手。')
  return root
}

describe('display image store', () => {
  it('writes files and manifest without touching card image', async () => {
    const root = await fixture('upload')
    const first = await addDisplayImage(root, 'world-lin', PNG, {
      mime_type: 'image/png',
      alt: '林舟',
      source: 'upload'
    })
    expect(first.selected_id).toBeTruthy()
    expect(first.images).toHaveLength(1)
    expect(await pathExists(path.join(root, 'assets', 'display', 'world-lin', first.images[0]!.file))).toBe(true)
    const card = await readText(path.join(root, 'world', 'world-lin.md'))
    expect(card).not.toMatch(/^image:/m)
    expect(JSON.parse(await readText(path.join(root, 'assets', 'display', 'world-lin', 'manifest.json')))).toMatchObject(
      { schema_version: 1, selected_id: first.selected_id }
    )
  })

  it('keeps a gallery and lets the author change the selected image', async () => {
    const root = await fixture('gallery')
    const first = await addDisplayImage(root, 'world-lin', PNG, { mime_type: 'image/png', alt: 'a', source: 'upload' })
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
})
