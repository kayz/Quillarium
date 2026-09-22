import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, pathExists, readText, writeBinary, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'

export type DisplayImageMime = 'image/png' | 'image/jpeg' | 'image/webp'
export type DisplayImageSource = 'upload' | 'generated'

export interface DisplayImageEntry {
  id: string
  file: string
  mime_type: DisplayImageMime
  alt: string
  source: DisplayImageSource
  created_at: string
}

export interface DisplayImageManifest {
  schema_version: 1
  selected_id: string | null
  images: DisplayImageEntry[]
}

const MANIFEST = 'manifest.json'

const emptyManifest = (): DisplayImageManifest => ({ schema_version: 1, selected_id: null, images: [] })

export function displayImageDir(projectRoot: string, cardId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(cardId)) throw new Error('DISPLAY_IMAGE_CARD_ID_UNSAFE')
  return path.join(projectRoot, 'assets', 'display', cardId)
}

function extensionFor(mime: DisplayImageMime): 'png' | 'jpg' | 'webp' {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

function mimeFromMagic(bytes: Uint8Array): DisplayImageMime | undefined {
  const png =
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  if (png) return 'image/png'
  if (jpeg) return 'image/jpeg'
  if (webp) return 'image/webp'
  return undefined
}

function mimeFromExtension(filePath: string): DisplayImageMime | undefined {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return undefined
}

function assertMagic(bytes: Uint8Array, mime: DisplayImageMime): void {
  if (mimeFromMagic(bytes) === mime) return
  throw new Error('该文件不是可用的 png/jpeg/webp 配图。')
}

export function detectDisplayImageMime(filePath: string, bytes: Uint8Array): DisplayImageMime {
  const fromExt = mimeFromExtension(filePath)
  const fromMagic = mimeFromMagic(bytes)
  if (fromExt && fromMagic && fromExt !== fromMagic) {
    throw new Error('该文件不是可用的 png/jpeg/webp 配图。')
  }
  const mime = fromExt ?? fromMagic
  if (!mime) throw new Error('该文件不是可用的 png/jpeg/webp 配图。')
  assertMagic(bytes, mime)
  return mime
}

async function readManifest(dir: string): Promise<DisplayImageManifest> {
  const file = path.join(dir, MANIFEST)
  if (!(await pathExists(file))) return emptyManifest()
  return JSON.parse(await readText(file)) as DisplayImageManifest
}

async function writeManifest(dir: string, manifest: DisplayImageManifest): Promise<void> {
  await writeText(path.join(dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
}

export async function listDisplayImages(projectRoot: string, cardId: string): Promise<DisplayImageManifest> {
  return readManifest(displayImageDir(projectRoot, cardId))
}

export async function addDisplayImage(
  projectRoot: string,
  cardId: string,
  bytes: Uint8Array,
  meta: { mime_type: DisplayImageMime; alt?: string; source: DisplayImageSource }
): Promise<DisplayImageManifest> {
  assertMagic(bytes, meta.mime_type)
  return withProjectWriteLock(projectRoot, async () => {
    const dir = displayImageDir(projectRoot, cardId)
    await ensureDir(dir)
    const id = randomUUID()
    const file = `${id}.${extensionFor(meta.mime_type)}`
    await writeBinary(path.join(dir, file), bytes)
    const current = await readManifest(dir)
    const entry = {
      id,
      file,
      mime_type: meta.mime_type,
      alt: meta.alt ?? '',
      source: meta.source,
      created_at: new Date().toISOString()
    }
    const next: DisplayImageManifest = {
      schema_version: 1,
      selected_id: id,
      images: [...current.images, entry]
    }
    await writeManifest(dir, next)
    return next
  })
}

export async function removeDisplayImage(
  projectRoot: string,
  cardId: string,
  imageId: string
): Promise<DisplayImageManifest> {
  return withProjectWriteLock(projectRoot, async () => {
    const dir = displayImageDir(projectRoot, cardId)
    const current = await readManifest(dir)
    const entry = current.images.find((image) => image.id === imageId)
    if (!entry) throw new Error('找不到这张配图。')
    await rm(path.join(dir, entry.file), { force: true })
    const images = current.images.filter((image) => image.id !== imageId)
    const selected_id =
      current.selected_id === imageId ? (images[images.length - 1]?.id ?? null) : current.selected_id
    const next: DisplayImageManifest = { schema_version: 1, selected_id, images }
    await writeManifest(dir, next)
    return next
  })
}

export async function selectDisplayImage(
  projectRoot: string,
  cardId: string,
  imageId: string
): Promise<DisplayImageManifest> {
  return withProjectWriteLock(projectRoot, async () => {
    const dir = displayImageDir(projectRoot, cardId)
    const current = await readManifest(dir)
    if (!current.images.some((image) => image.id === imageId)) throw new Error('找不到这张配图。')
    const next = { ...current, selected_id: imageId }
    await writeManifest(dir, next)
    return next
  })
}

export async function removeDisplayImagesForCard(projectRoot: string, cardId: string): Promise<void> {
  return withProjectWriteLock(projectRoot, async () => {
    await rm(displayImageDir(projectRoot, cardId), { recursive: true, force: true })
  })
}
