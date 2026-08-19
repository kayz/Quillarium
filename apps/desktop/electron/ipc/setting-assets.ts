import { createHash } from 'node:crypto'
import { lstat, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { dialog, nativeImage } from 'electron'
import {
  ensureDir,
  listDocs,
  parseKnownDocument,
  pathExists,
  readMarkdown,
  readText,
  settingImageAssetV1Schema,
  sha256Text,
  withProjectWriteLock,
  writeBinary,
  writeMarkdown,
  writeText,
  type DocumentIdentity,
  type SettingImageAssetV1
} from '@quillarium/core'
import { typedHandle, type SettingImagePreview, type SettingImageResult } from './contract.js'

export const SETTING_IMAGE_DOCUMENT_TYPES = new Set([
  'world_entry',
  'character',
  'location',
  'character_relation',
  'faction'
])

export function registerSettingAssetHandlers(): void {
  typedHandle('settingImage:choose', async (_event, root, documentPath, altText) =>
    chooseAndSaveSettingImage(root, documentPath, altText)
  )
  typedHandle('settingImage:get', async (_event, root, documentId) => loadSettingImage(root, documentId))
  typedHandle('settingImage:batch', async (_event, root, documentIds) =>
    loadSettingImageBatch(root, documentIds)
  )
  typedHandle('settingImage:remove', async (_event, root, documentPath) =>
    removeSettingImage(root, documentPath)
  )
}

export async function chooseAndSaveSettingImage(
  root: string,
  documentPath: string,
  altText = ''
): Promise<SettingImageResult | null> {
  const selection = await dialog.showOpenDialog({
    title: '选择设定图片',
    properties: ['openFile'],
    filters: [{ name: 'Setting image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (selection.canceled || !selection.filePaths[0]) return null
  return saveSettingImage(root, documentPath, selection.filePaths[0], altText)
}

export async function saveSettingImage(
  root: string,
  documentPath: string,
  sourcePath: string,
  altText = ''
): Promise<SettingImageResult> {
  const absoluteRoot = path.resolve(root)
  const safeDocumentPath = safeProjectPath(absoluteRoot, documentPath, 'SETTING_IMAGE_DOCUMENT_PATH_UNSAFE')
  await assertNoProjectSymlink(absoluteRoot, safeDocumentPath)
  const extension = normalizedImageExtension(sourcePath)
  const mimeType = mimeForExtension(extension)
  const bytes = await readFile(path.resolve(sourcePath))
  assertImageSignature(bytes, extension)
  const decoded = nativeImage.createFromBuffer(bytes)
  if (decoded.isEmpty()) throw new Error('SETTING_IMAGE_DECODE_FAILED')
  const size = decoded.getSize()
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const thumbnailImage = fitThumbnail(decoded, 720)
  const thumbnail = thumbnailImage.toPNG()
  const paletteImage = fitThumbnail(decoded, 40)
  const paletteSize = paletteImage.getSize()
  const palette = dominantPaletteFromBgra(paletteImage.toBitmap(), paletteSize.width, paletteSize.height)

  return withProjectWriteLock(absoluteRoot, async () => {
    const beforeRaw = await readText(safeDocumentPath)
    const parsed = await readMarkdown<Record<string, unknown>>(safeDocumentPath)
    const data = parseKnownDocument(parsed.data, safeDocumentPath) as Record<string, unknown>
    const id = requiredString(data['id'], 'id')
    const type = requiredString(data['type'], 'type')
    const title = requiredString(data['title'], 'title')
    if (!SETTING_IMAGE_DOCUMENT_TYPES.has(type)) {
      throw new Error(`SETTING_IMAGE_DOCUMENT_TYPE_UNSUPPORTED: ${type}`)
    }
    const assetDirectoryRelative = `assets/settings/${type}/${safeAssetSegment(id)}`
    const assetDirectory = safeProjectPath(absoluteRoot, assetDirectoryRelative, 'SETTING_IMAGE_PATH_UNSAFE')
    await assertNoProjectSymlink(absoluteRoot, assetDirectory)
    await ensureDir(assetDirectory)
    await assertNoProjectSymlink(absoluteRoot, assetDirectory)
    const suffix = sha256.slice(0, 16)
    const originalRelative = `${assetDirectoryRelative}/original-${suffix}.${extension}`
    const thumbnailRelative = `${assetDirectoryRelative}/thumbnail-${suffix}.png`
    const originalPath = safeProjectPath(absoluteRoot, originalRelative, 'SETTING_IMAGE_PATH_UNSAFE')
    const thumbnailPath = safeProjectPath(absoluteRoot, thumbnailRelative, 'SETTING_IMAGE_PATH_UNSAFE')
    const originalExisted = await pathExists(originalPath)
    const thumbnailExisted = await pathExists(thumbnailPath)
    const asset = settingImageAssetV1Schema.parse({
      schema_version: 1,
      original_path: normalizePath(originalRelative),
      thumbnail_path: normalizePath(thumbnailRelative),
      mime_type: mimeType,
      sha256,
      width: size.width,
      height: size.height,
      palette,
      focus_x: 0.5,
      focus_y: 0.5,
      alt_text: altText.trim() || title
    }) as SettingImageAssetV1
    try {
      await Promise.all([writeBinary(originalPath, bytes), writeBinary(thumbnailPath, thumbnail)])
      if (sha256Text(await readText(safeDocumentPath)) !== sha256Text(beforeRaw)) {
        throw new Error('SETTING_IMAGE_DOCUMENT_HASH_CONFLICT')
      }
      await writeMarkdown(safeDocumentPath, { ...data, image: asset }, parsed.content)
      const verified = await readMarkdown<Record<string, unknown>>(safeDocumentPath)
      const verifiedAsset = settingImageAssetV1Schema.parse(verified.data['image'])
      if (verifiedAsset.sha256 !== sha256) throw new Error('SETTING_IMAGE_WRITE_VERIFICATION_FAILED')
    } catch (error) {
      await writeText(safeDocumentPath, beforeRaw).catch(() => undefined)
      await Promise.all([
        originalExisted ? Promise.resolve() : rm(originalPath, { force: true }),
        thumbnailExisted ? Promise.resolve() : rm(thumbnailPath, { force: true })
      ])
      throw error
    }
    return {
      asset,
      previewDataUrl: nativeImage.createFromBuffer(thumbnail).toDataURL(),
      warning:
        size.width < 600 || size.height < 600
          ? `图片分辨率为 ${size.width}×${size.height}；较小图片在大尺寸设定卡中可能模糊。`
          : null
    }
  })
}

export async function loadSettingImage(root: string, documentId: string): Promise<SettingImageResult | null> {
  const absoluteRoot = path.resolve(root)
  const document = (await listDocs<DocumentIdentity>(absoluteRoot)).find(
    (item) => item.data.id === documentId && SETTING_IMAGE_DOCUMENT_TYPES.has(item.data.type)
  )
  if (!document) return null
  return loadSettingImageFromDocument(absoluteRoot, document)
}

async function loadSettingImageFromDocument(
  absoluteRoot: string,
  document: { data: DocumentIdentity & { image?: unknown } }
): Promise<SettingImageResult | null> {
  const image = (document.data as DocumentIdentity & { image?: unknown }).image
  const parsed = settingImageAssetV1Schema.safeParse(image)
  if (!parsed.success) return null
  const thumbnail = safeSettingAssetPath(absoluteRoot, parsed.data.thumbnail_path)
  await assertNoProjectSymlink(absoluteRoot, thumbnail)
  const decoded = nativeImage.createFromBuffer(await readFile(thumbnail))
  if (decoded.isEmpty()) throw new Error('SETTING_IMAGE_THUMBNAIL_DECODE_FAILED')
  return { asset: parsed.data, previewDataUrl: decoded.toDataURL(), warning: null }
}

export async function loadSettingImageBatch(
  root: string,
  documentIds: string[]
): Promise<Record<string, SettingImagePreview>> {
  const unique = [...new Set(documentIds.filter(Boolean))].slice(0, 500)
  const wanted = new Set(unique)
  const documents = (await listDocs<DocumentIdentity & { image?: unknown }>(path.resolve(root))).filter(
    (item) => wanted.has(item.data.id) && SETTING_IMAGE_DOCUMENT_TYPES.has(item.data.type)
  )
  const loaded = await Promise.all(
    documents.map(
      async (document) =>
        [
          document.data.id,
          await loadSettingImageFromDocument(path.resolve(root), document).catch(() => null)
        ] as const
    )
  )
  return Object.fromEntries(
    loaded.flatMap(([id, result]) =>
      result
        ? [[id, { asset: result.asset, previewDataUrl: result.previewDataUrl } satisfies SettingImagePreview]]
        : []
    )
  )
}

export async function removeSettingImage(root: string, documentPath: string): Promise<boolean> {
  const absoluteRoot = path.resolve(root)
  const safeDocumentPath = safeProjectPath(absoluteRoot, documentPath, 'SETTING_IMAGE_DOCUMENT_PATH_UNSAFE')
  await assertNoProjectSymlink(absoluteRoot, safeDocumentPath)
  return withProjectWriteLock(absoluteRoot, async () => {
    const beforeRaw = await readText(safeDocumentPath)
    const parsed = await readMarkdown<Record<string, unknown>>(safeDocumentPath)
    if (!parsed.data['image']) return false
    try {
      if (sha256Text(await readText(safeDocumentPath)) !== sha256Text(beforeRaw)) {
        throw new Error('SETTING_IMAGE_DOCUMENT_HASH_CONFLICT')
      }
      await writeMarkdown(safeDocumentPath, { ...parsed.data, image: null }, parsed.content)
    } catch (error) {
      await writeText(safeDocumentPath, beforeRaw).catch(() => undefined)
      throw error
    }
    return true
  })
}

export function dominantPaletteFromBgra(
  bitmap: Uint8Array,
  width: number,
  height: number,
  limit = 5
): string[] {
  const pixels = Math.min(Math.max(0, width * height), Math.floor(bitmap.length / 4))
  const counts = new Map<string, number>()
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4
    const alpha = bitmap[offset + 3] ?? 0
    if (alpha < 96) continue
    const red = quantize(bitmap[offset + 2] ?? 0)
    const green = quantize(bitmap[offset + 1] ?? 0)
    const blue = quantize(bitmap[offset] ?? 0)
    const key = `#${hex(red)}${hex(green)}${hex(blue)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'en'))
    .slice(0, Math.max(1, Math.min(8, limit)))
    .map(([color]) => color)
}

function fitThumbnail(image: Electron.NativeImage, maxDimension: number): Electron.NativeImage {
  const { width, height } = image.getSize()
  if (width <= maxDimension && height <= maxDimension) return image
  if (width >= height) return image.resize({ width: maxDimension, quality: 'best' })
  return image.resize({ height: maxDimension, quality: 'best' })
}

function safeSettingAssetPath(root: string, relativePath: string): string {
  const normalized = normalizePath(relativePath)
  if (!normalized.startsWith('assets/settings/')) throw new Error('SETTING_IMAGE_PATH_UNSAFE')
  return safeProjectPath(root, normalized, 'SETTING_IMAGE_PATH_UNSAFE')
}

function safeProjectPath(root: string, value: string, code: string): string {
  const absoluteRoot = path.resolve(root)
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(absoluteRoot, value)
  const relative = path.relative(absoluteRoot, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(code)
  }
  return candidate
}

async function assertNoProjectSymlink(root: string, target: string): Promise<void> {
  const absoluteRoot = path.resolve(root)
  const relative = path.relative(absoluteRoot, path.resolve(target))
  let current = absoluteRoot
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!(await pathExists(current))) continue
    if ((await lstat(current)).isSymbolicLink()) throw new Error('SETTING_IMAGE_SYMLINK_FORBIDDEN')
  }
}

function normalizedImageExtension(sourcePath: string): 'png' | 'jpg' | 'jpeg' | 'webp' {
  const extension = path.extname(sourcePath).slice(1).toLocaleLowerCase()
  if (extension === 'png' || extension === 'jpg' || extension === 'jpeg' || extension === 'webp') {
    return extension
  }
  throw new Error('SETTING_IMAGE_TYPE_UNSUPPORTED')
}

function assertImageSignature(bytes: Buffer, extension: 'png' | 'jpg' | 'jpeg' | 'webp'): void {
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp =
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  const matches = extension === 'png' ? png : extension === 'webp' ? webp : jpeg
  if (!matches) throw new Error('SETTING_IMAGE_TYPE_MISMATCH')
}

function mimeForExtension(extension: 'png' | 'jpg' | 'jpeg' | 'webp'): SettingImageAssetV1['mime_type'] {
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

function safeAssetSegment(value: string): string {
  const windowsReservedName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu
  const canUseVerbatim =
    /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,79}$/u.test(value) &&
    !value.endsWith('.') &&
    !windowsReservedName.test(value)
  if (canUseVerbatim) return value

  // Stable document IDs predate the image feature and may legitimately contain CJK text or
  // filename-unsafe characters. The ID remains unchanged in frontmatter; only its asset-directory
  // key is converted to a bounded, deterministic, cross-platform-safe value.
  return `id-${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24)}`
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`SETTING_IMAGE_${label.toUpperCase()}_REQUIRED`)
  return value
}

function quantize(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value / 32) * 32))
}

function hex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, '/')
}
