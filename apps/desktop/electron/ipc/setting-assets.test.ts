import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => {
  const image: Record<string, unknown> = {}
  Object.assign(image, {
    isEmpty: () => false,
    getSize: () => ({ width: 1200, height: 1800 }),
    resize: () => image,
    toPNG: () => Buffer.from('thumbnail-png'),
    toBitmap: () => new Uint8Array([0x20, 0x40, 0x60, 0xff, 0x30, 0x50, 0x70, 0xff]),
    toDataURL: () => 'data:image/png;base64,dGh1bWJuYWls'
  })
  return {
    image,
    nativeImage: { createFromBuffer: vi.fn(() => image) },
    dialog: { showOpenDialog: vi.fn() }
  }
})

vi.mock('electron', () => ({
  dialog: electronMock.dialog,
  nativeImage: electronMock.nativeImage
}))

import { createCharacter, createProjectAt, pathExists, readMarkdown } from '@quillarium/core'
import {
  dominantPaletteFromBgra,
  loadSettingImageBatch,
  removeSettingImage,
  saveSettingImage
} from './setting-assets.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  vi.clearAllMocks()
})

describe('setting image assets', () => {
  it('stores an original and thumbnail under the project and keeps only relative metadata in Markdown', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-image-'))
    roots.push(base)
    const root = path.join(base, 'project')
    await createProjectAt(root, { id: 'setting-image-project', title: 'Setting image project' })
    const documentPath = await createCharacter(root, '林澜', { id: 'char-lin' })
    const source = path.join(base, 'portrait.png')
    await writeFile(source, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    const result = await saveSettingImage(root, documentPath, source, '林澜肖像')
    const stored = await readMarkdown<Record<string, unknown>>(documentPath)
    const image = stored.data['image'] as Record<string, unknown>

    expect(result.asset).toMatchObject({
      original_path: expect.stringMatching(/^assets\/settings\/character\/char-lin\//u),
      thumbnail_path: expect.stringMatching(/^assets\/settings\/character\/char-lin\//u),
      width: 1200,
      height: 1800,
      alt_text: '林澜肖像'
    })
    expect(path.isAbsolute(String(image['original_path']))).toBe(false)
    expect(await pathExists(path.join(root, String(image['original_path'])))).toBe(true)
    expect(await pathExists(path.join(root, String(image['thumbnail_path'])))).toBe(true)
    expect(await loadSettingImageBatch(root, ['char-lin', 'char-lin'])).toHaveProperty('char-lin')

    await removeSettingImage(root, documentPath)
    expect((await readMarkdown<Record<string, unknown>>(documentPath)).data['image']).toBeNull()
    expect(await pathExists(path.join(root, String(image['original_path'])))).toBe(true)
  })

  it('stores images for legacy Unicode stable IDs without changing the document identity', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-setting-image-unicode-'))
    roots.push(base)
    const root = path.join(base, 'project')
    await createProjectAt(root, { id: 'setting-image-unicode', title: 'Unicode setting image' })
    const documentPath = await createCharacter(root, '于谦', { id: 'char-于谦' })
    const source = path.join(base, 'portrait.png')
    await writeFile(source, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    const result = await saveSettingImage(root, documentPath, source)
    const stored = await readMarkdown<Record<string, unknown>>(documentPath)

    expect(stored.data['id']).toBe('char-于谦')
    expect(result.asset.original_path).toMatch(
      /^assets\/settings\/character\/id-[a-f0-9]{24}\/original-[a-f0-9]{16}\.png$/u
    )
    expect(await pathExists(path.join(root, result.asset.original_path))).toBe(true)
    expect(await loadSettingImageBatch(root, ['char-于谦'])).toHaveProperty('char-于谦')
  })

  it('extracts a bounded deterministic palette from BGRA pixels', () => {
    expect(
      dominantPaletteFromBgra(
        new Uint8Array([
          0x20, 0x40, 0x60, 0xff, 0x20, 0x40, 0x60, 0xff, 0xa0, 0x80, 0x40, 0xff, 0xff, 0xff, 0xff, 0x00
        ]),
        2,
        2,
        2
      )
    ).toEqual(['#604020', '#4080a0'])
  })
})
