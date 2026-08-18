import path from 'node:path'
import { lstat, readFile } from 'node:fs/promises'
import { dialog, nativeImage, type NativeImage } from 'electron'
import {
  ensureDir,
  loadProject,
  pathExists,
  updateProjectConfig,
  validateProjectCoverPaths,
  writeBinary
} from '@quillarium/core'
import { typedHandle, type ProjectCoverResult } from './contract.js'

export function registerCoverHandlers(): void {
  typedHandle('cover:choose', async (_event, root) => chooseAndSaveProjectCover(root))
  typedHandle('cover:get', async (_event, root) => loadProjectCover(root))
  typedHandle('cover:focus', async (_event, root, focusX, focusY) =>
    updateProjectCoverFocus(root, focusX, focusY)
  )
}

export async function chooseAndSaveProjectCover(root: string): Promise<ProjectCoverResult | null> {
  const selection = await dialog.showOpenDialog({
    title: '选择小说封面',
    properties: ['openFile'],
    filters: [{ name: 'Book cover', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (selection.canceled || !selection.filePaths[0]) return null
  return saveProjectCover(root, selection.filePaths[0], 0.5, 0.5)
}

export async function saveProjectCover(
  root: string,
  sourcePath: string,
  focusX = 0.5,
  focusY = 0.5
): Promise<ProjectCoverResult> {
  const extension = normalizedCoverExtension(sourcePath)
  const bytes = await readFile(path.resolve(sourcePath))
  const image = nativeImage.createFromBuffer(bytes)
  if (image.isEmpty()) throw new Error('COVER_IMAGE_DECODE_FAILED')
  const size = image.getSize()
  const coverDirectory = safeCoverDirectory(root)
  await assertNoProjectSymlink(root, coverDirectory)
  await ensureDir(coverDirectory)
  await assertNoProjectSymlink(root, coverDirectory)
  const originalRelative = `assets/cover/original.${extension}`
  const originalPath = safeProjectRelativePath(root, originalRelative)
  const thumbnailPath = safeProjectRelativePath(root, 'assets/cover/thumbnail.png')
  const exportPath = safeProjectRelativePath(root, 'assets/cover/export.png')
  const cropped = cropBookCover(image, focusX, focusY)
  const thumbnail = cropped.resize({ width: 320, height: 480, quality: 'good' }).toPNG()
  await Promise.all([
    writeBinary(originalPath, bytes),
    writeBinary(thumbnailPath, thumbnail),
    writeBinary(exportPath, cropped.resize({ width: 1200, height: 1800, quality: 'best' }).toPNG())
  ])
  const cover = {
    original_path: originalRelative,
    thumbnail_path: 'assets/cover/thumbnail.png',
    export_png_path: 'assets/cover/export.png',
    focus_x: clampFocus(focusX),
    focus_y: clampFocus(focusY),
    source_width: size.width,
    source_height: size.height
  }
  validateProjectCoverPaths(cover)
  await updateProjectConfig(root, { cover })
  return {
    cover,
    previewDataUrl: nativeImage.createFromBuffer(thumbnail).toDataURL(),
    warning:
      size.width < 1200 || size.height < 1800
        ? `封面分辨率为 ${size.width}×${size.height}；建议至少 1200×1800。`
        : null
  }
}

export async function loadProjectCover(root: string): Promise<ProjectCoverResult | null> {
  const project = await loadProject(root)
  if (!project.cover) return null
  validateProjectCoverPaths(project.cover)
  const thumbnail = safeProjectRelativePath(root, project.cover.thumbnail_path)
  await assertNoProjectSymlink(root, thumbnail)
  const image = nativeImage.createFromBuffer(await readFile(thumbnail))
  if (image.isEmpty()) throw new Error('COVER_THUMBNAIL_DECODE_FAILED')
  return { cover: project.cover, warning: null, previewDataUrl: image.toDataURL() }
}

export async function updateProjectCoverFocus(
  root: string,
  focusX: number,
  focusY: number
): Promise<ProjectCoverResult> {
  const project = await loadProject(root)
  if (!project.cover) throw new Error('PROJECT_COVER_NOT_CONFIGURED')
  const source = safeProjectRelativePath(root, project.cover.original_path)
  await assertNoProjectSymlink(root, source)
  return saveProjectCover(root, source, focusX, focusY)
}

function cropBookCover(image: NativeImage, focusX: number, focusY: number): NativeImage {
  const { width, height } = image.getSize()
  const targetRatio = 2 / 3
  let cropWidth = width
  let cropHeight = height
  if (width / height > targetRatio) cropWidth = Math.max(1, Math.round(height * targetRatio))
  else cropHeight = Math.max(1, Math.round(width / targetRatio))
  const x = Math.round((width - cropWidth) * clampFocus(focusX))
  const y = Math.round((height - cropHeight) * clampFocus(focusY))
  return image.crop({ x, y, width: cropWidth, height: cropHeight })
}

function normalizedCoverExtension(sourcePath: string): 'png' | 'jpg' | 'jpeg' | 'webp' {
  const extension = path.extname(sourcePath).slice(1).toLocaleLowerCase()
  if (extension === 'png' || extension === 'jpg' || extension === 'jpeg' || extension === 'webp') {
    return extension
  }
  throw new Error('COVER_IMAGE_TYPE_UNSUPPORTED')
}

function safeCoverDirectory(root: string): string {
  return safeProjectRelativePath(root, 'assets/cover')
}

function safeProjectRelativePath(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.replace(/\\/gu, '/').split('/').includes('..')) {
    throw new Error('PROJECT_COVER_PATH_UNSAFE')
  }
  const absoluteRoot = path.resolve(root)
  const candidate = path.resolve(absoluteRoot, relativePath)
  const relative = path.relative(absoluteRoot, candidate)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('PROJECT_COVER_PATH_UNSAFE')
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
    if ((await lstat(current)).isSymbolicLink())
      throw new Error(`PROJECT_COVER_SYMLINK_FORBIDDEN: ${segment}`)
  }
}

function clampFocus(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0.5))
}
