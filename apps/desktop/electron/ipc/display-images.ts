import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { dialog } from 'electron'
import { generateDisplayImageCandidate, type DisplayImageProfile } from '@quillarium/ai'
import {
  addDisplayImage,
  detectDisplayImageMime,
  displayImageDir,
  listDisplayImages,
  listDocs,
  loadProject,
  removeDisplayImage,
  selectDisplayImage,
  settingCardDocumentTypeSchema,
  type DisplayImageManifest,
  type DisplayImageMime,
  type DocumentIdentity
} from '@quillarium/core'
import { loadDesktopDisplayImageProfile } from './credentials.js'
import { typedHandle, type DesktopDisplayImageManifest } from './contract.js'

export const DISPLAY_LAYER_DISABLED = '展示层已关闭，不能添加配图。'
export const DISPLAY_IMAGE_GENERATE_TIMEOUT_MS = 120_000
const CANDIDATE_TTL_MS = 30 * 60 * 1000

interface StoredCandidate {
  cardKey: string
  bytes: Uint8Array
  mime: DisplayImageMime
  createdAt: number
}

const candidatesById = new Map<string, StoredCandidate>()
const candidateIdByCard = new Map<string, string>()

export function registerDisplayImageHandlers(): void {
  typedHandle('displayImage:list', async (_event, root, cardId) => listDesktopDisplayImages(root, cardId))
  typedHandle('displayImage:choose', async (_event, root, cardId, altText) =>
    chooseDesktopDisplayImage(root, cardId, altText)
  )
  typedHandle('displayImage:remove', async (_event, root, cardId, imageId) =>
    removeDesktopDisplayImage(root, cardId, imageId)
  )
  typedHandle('displayImage:select', async (_event, root, cardId, imageId) =>
    selectDesktopDisplayImage(root, cardId, imageId)
  )
  typedHandle('displayImage:generate', async (_event, root, cardId, prompt) =>
    generateDesktopDisplayImage(root, cardId, prompt)
  )
  typedHandle('displayImage:confirmGenerate', async (_event, root, cardId, candidateId) =>
    confirmDesktopDisplayImage(root, cardId, candidateId)
  )
}

export async function listDesktopDisplayImages(
  root: string,
  cardId: string
): Promise<DesktopDisplayImageManifest> {
  return withDataUrls(root, cardId, await listDisplayImages(root, cardId))
}

export async function chooseDesktopDisplayImage(
  root: string,
  cardId: string,
  altText: string
): Promise<DesktopDisplayImageManifest | null> {
  await assertDisplayImagesWritable(root, cardId)
  const selection = await dialog.showOpenDialog({
    title: '选择配图',
    properties: ['openFile'],
    filters: [{ name: 'Display image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (selection.canceled || !selection.filePaths[0]) return null
  const file = selection.filePaths[0]
  const bytes = new Uint8Array(await readFile(file))
  const mime = detectDisplayImageMime(file, bytes)
  const manifest = await addDisplayImage(root, cardId, bytes, {
    mime_type: mime,
    alt: altText,
    source: 'upload'
  })
  return withDataUrls(root, cardId, manifest)
}

export async function removeDesktopDisplayImage(
  root: string,
  cardId: string,
  imageId: string
): Promise<DesktopDisplayImageManifest> {
  await assertDisplayImagesWritable(root, cardId)
  return withDataUrls(root, cardId, await removeDisplayImage(root, cardId, imageId))
}

export async function selectDesktopDisplayImage(
  root: string,
  cardId: string,
  imageId: string
): Promise<DesktopDisplayImageManifest> {
  await assertDisplayImagesWritable(root, cardId)
  return withDataUrls(root, cardId, await selectDisplayImage(root, cardId, imageId))
}

export async function generateDesktopDisplayImage(
  root: string,
  cardId: string,
  prompt: string
): Promise<{ candidate_id: string; data_url: string }> {
  await assertDisplayImagesWritable(root, cardId)
  const stored = await loadDesktopDisplayImageProfile()
  const profile: DisplayImageProfile = {
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    model: stored.model,
    apiKey: stored.apiKey ?? ''
  }
  let generated: { bytes: Uint8Array; mime: DisplayImageMime }
  try {
    generated = await generateDisplayImageCandidate({
      prompt,
      profile,
      signal: AbortSignal.timeout(DISPLAY_IMAGE_GENERATE_TIMEOUT_MS)
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error('生图已取消或超时。', { cause: error })
    }
    throw error
  }
  const candidateId = rememberCandidate(root, cardId, generated.bytes, generated.mime)
  return { candidate_id: candidateId, data_url: toDataUrl(generated.mime, generated.bytes) }
}

export async function confirmDesktopDisplayImage(
  root: string,
  cardId: string,
  candidateId: string
): Promise<DesktopDisplayImageManifest> {
  await assertDisplayImagesWritable(root, cardId)
  pruneCandidates()
  const stored = candidatesById.get(candidateId)
  if (!stored || stored.cardKey !== cardKey(root, cardId)) {
    throw new Error('生图候选已过期或已取消。')
  }
  const manifest = await addDisplayImage(root, cardId, stored.bytes, {
    mime_type: stored.mime,
    source: 'generated'
  })
  forgetCandidate(candidateId)
  return withDataUrls(root, cardId, manifest)
}

export async function displayImageRenderFields(
  root: string,
  cardId: string
): Promise<{
  image_data_url: string | null
  image_data_urls: Array<{ id: string; alt: string; data_url: string }>
}> {
  const manifest = await listDesktopDisplayImages(root, cardId)
  return {
    image_data_url: manifest.image_data_urls[0]?.data_url ?? null,
    image_data_urls: manifest.image_data_urls
  }
}

async function assertDisplayImagesWritable(root: string, cardId: string): Promise<void> {
  const project = await loadProject(root)
  if (project.display_layer?.enabled !== true || project.display_layer?.migrated !== true) {
    throw new Error(DISPLAY_LAYER_DISABLED)
  }
  const docs = await listDocs(root)
  const card = docs.find((doc) => identity(doc.data).id === cardId)
  if (!card) throw new Error('找不到这张设定卡。')
  if (!settingCardDocumentTypeSchema.safeParse(identity(card.data).type).success) {
    throw new Error('该卡片类型不能配图。')
  }
}

async function withDataUrls(
  root: string,
  cardId: string,
  manifest: DisplayImageManifest
): Promise<DesktopDisplayImageManifest> {
  const dir = displayImageDir(root, cardId)
  const urls = await Promise.all(
    manifest.images.map(async (image) => {
      const bytes = await readFile(path.join(dir, image.file))
      return {
        id: image.id,
        alt: image.alt,
        data_url: toDataUrl(image.mime_type, bytes)
      }
    })
  )
  const selected = urls.filter((image) => image.id === manifest.selected_id)
  const rest = urls.filter((image) => image.id !== manifest.selected_id)
  return { ...manifest, image_data_urls: [...selected, ...rest] }
}

function rememberCandidate(root: string, cardId: string, bytes: Uint8Array, mime: DisplayImageMime): string {
  pruneCandidates()
  const key = cardKey(root, cardId)
  const previous = candidateIdByCard.get(key)
  if (previous) forgetCandidate(previous)
  const id = randomUUID()
  candidatesById.set(id, { cardKey: key, bytes, mime, createdAt: Date.now() })
  candidateIdByCard.set(key, id)
  return id
}

function forgetCandidate(candidateId: string): void {
  const stored = candidatesById.get(candidateId)
  candidatesById.delete(candidateId)
  if (stored && candidateIdByCard.get(stored.cardKey) === candidateId) {
    candidateIdByCard.delete(stored.cardKey)
  }
}

function pruneCandidates(now = Date.now()): void {
  for (const [id, stored] of candidatesById) {
    if (now - stored.createdAt <= CANDIDATE_TTL_MS) continue
    forgetCandidate(id)
  }
}

function cardKey(root: string, cardId: string): string {
  return `${path.resolve(root)}\0${cardId}`
}

function toDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}

function identity(data: unknown): DocumentIdentity {
  return data as unknown as DocumentIdentity
}
