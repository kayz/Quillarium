import path from 'node:path'
import { readdir, rm } from 'node:fs/promises'
import { z } from 'zod'
import {
  ensureDir,
  listMarkdownFiles,
  pathExists,
  readMarkdown,
  readText,
  writeMarkdown,
  writeText
} from './fs.js'
import { makeId, slugify } from './ids.js'
import { listDocs } from './documents.js'
import { loadProject } from './project.js'
import { assertSensitiveSourcesSafe } from './sensitive-data.js'
import { objectToYaml, parseMarkdown } from './yaml.js'
import type { CharacterDoc, ItemDoc, LocationDoc, OutlineDoc, SceneDoc } from './types.js'

export const SHORT_PLAY_DIR = 'short-play'
export const SHORT_PLAY_ASSET_CATEGORIES = ['character', 'costume', 'architecture', 'style', 'prop'] as const
export type ShortPlayAssetCategory = (typeof SHORT_PLAY_ASSET_CATEGORIES)[number]

export const SHORT_PLAY_ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '2.35:1'] as const
export type ShortPlayAspectRatio = (typeof SHORT_PLAY_ASPECT_RATIOS)[number]

export const SHORT_PLAY_CHAPTER_MAPPINGS = [
  'one-chapter-one-episode',
  'one-chapter-multi-episode',
  'multi-chapter-one-episode'
] as const
export type ShortPlayChapterMapping = (typeof SHORT_PLAY_CHAPTER_MAPPINGS)[number]

export const SHORT_PLAY_SHOT_DURATION_MIN_SEC = 5
export const SHORT_PLAY_SHOT_DURATION_MAX_SEC = 15

export const shortPlayEpisodeSettingSchema = z.object({
  episode_id: z.string().min(1),
  episode_number: z.number().int().min(1),
  title: z.string().min(1),
  chapter_ids: z.array(z.string().min(1)).default([]),
  scene_ids: z.array(z.string().min(1)).default([]),
  target_duration_sec: z.number().int().min(15).max(600).default(90),
  hook_note: z.string().default(''),
  ending_cliffhanger: z.string().default('')
})
export type ShortPlayEpisodeSettingV1 = z.infer<typeof shortPlayEpisodeSettingSchema>

export const shortPlaySettingsSchema = z.object({
  schema_version: z.literal(1).default(1),
  default_episode_duration_sec: z.number().int().min(15).max(600).default(90),
  default_shot_duration_sec: z
    .number()
    .int()
    .min(SHORT_PLAY_SHOT_DURATION_MIN_SEC)
    .max(SHORT_PLAY_SHOT_DURATION_MAX_SEC)
    .default(8),
  aspect_ratio: z.enum(SHORT_PLAY_ASPECT_RATIOS).default('9:16'),
  chapter_episode_mapping: z.enum(SHORT_PLAY_CHAPTER_MAPPINGS).default('one-chapter-one-episode'),
  visual_style_preset: z.string().default(''),
  pacing_notes: z.string().default(''),
  episodes: z.array(shortPlayEpisodeSettingSchema).default([])
})
export type ShortPlaySettingsV1 = z.infer<typeof shortPlaySettingsSchema>

export const shortPlayAssetFrontmatterSchema = z.object({
  id: z.string().min(1),
  seed_id: z.string().min(1),
  category: z.enum(SHORT_PLAY_ASSET_CATEGORIES),
  title: z.string().min(1),
  linked_doc_id: z.string().optional(),
  external_result_ref: z.string().default(''),
  external_result_status: z.enum(['pending', 'reconciled']).default('pending'),
  tags: z.array(z.string()).default([]),
  schema_version: z.literal(1).default(1),
  updated_at: z.string().optional()
})

export interface ShortPlayAssetV1 {
  id: string
  seed_id: string
  category: ShortPlayAssetCategory
  title: string
  linked_doc_id?: string
  external_result_ref: string
  external_result_status: 'pending' | 'reconciled'
  tags: string[]
  prompt: string
  path: string
  updated_at?: string
}

export interface ShortPlayAssetInput {
  id?: string
  seed_id?: string
  category: ShortPlayAssetCategory
  title: string
  linked_doc_id?: string
  external_result_ref?: string
  external_result_status?: 'pending' | 'reconciled'
  tags?: string[]
  prompt: string
}

export interface ShortPlayAssetProposalV1 {
  proposal_id: string
  seed_id: string
  category: ShortPlayAssetCategory
  title: string
  linked_doc_id: string
  linked_doc_type: string
  prompt: string
  tags: string[]
}

export const shortPlayShotSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  duration_sec: z.number().int().min(SHORT_PLAY_SHOT_DURATION_MIN_SEC).max(SHORT_PLAY_SHOT_DURATION_MAX_SEC),
  shot_size: z.string().default('中景'),
  camera_movement: z.string().default('固定'),
  asset_seed_ids: z.array(z.string().min(1)).default([]),
  action_description: z.string().default(''),
  dialogue: z.string().default(''),
  shot_prompt: z.string().min(1)
})
export type ShortPlayShotV1 = z.infer<typeof shortPlayShotSchema>

export const shortPlaySceneStoryboardSchema = z.object({
  schema_version: z.literal(1).default(1),
  scene_id: z.string().min(1),
  chapter_id: z.string().default(''),
  episode_id: z.string().default(''),
  target_total_duration_sec: z.number().int().min(5).max(600).default(90),
  notes: z.string().default(''),
  shots: z.array(shortPlayShotSchema).default([]),
  updated_at: z.string().optional()
})
export type ShortPlaySceneStoryboardV1 = z.infer<typeof shortPlaySceneStoryboardSchema>

export interface ShortPlayStoryboardProposalV1 {
  scene_id: string
  scene_title: string
  chapter_id: string
  target_total_duration_sec: number
  shots: ShortPlayShotV1[]
}

export interface ShortPlayExportPackageV1 {
  project_title: string
  generated_at: string
  settings: ShortPlaySettingsV1
  asset_prompts: Array<{
    asset_id: string
    seed_id: string
    category: ShortPlayAssetCategory
    title: string
    linked_doc_id?: string
    prompt: string
    external_result_status: 'pending' | 'reconciled'
    external_result_ref: string
  }>
  storyboard_prompts: Array<{
    scene_id: string
    scene_title: string
    chapter_id: string
    episode_id: string
    shot_id: string
    order: number
    duration_sec: number
    shot_size: string
    camera_movement: string
    asset_seed_ids: string[]
    action_description: string
    dialogue: string
    shot_prompt: string
  }>
  markdown: string
  json: string
}

function shortPlayRoot(projectRoot: string): string {
  return path.join(projectRoot, SHORT_PLAY_DIR)
}

function shortPlaySettingsFile(projectRoot: string): string {
  return path.join(shortPlayRoot(projectRoot), 'settings.yaml')
}

function shortPlayAssetsDir(projectRoot: string): string {
  return path.join(shortPlayRoot(projectRoot), 'assets')
}

function shortPlayStoryboardsDir(projectRoot: string): string {
  return path.join(shortPlayRoot(projectRoot), 'storyboards')
}

function parseYamlRecord(raw: string): Record<string, unknown> {
  return parseMarkdown<Record<string, unknown>>(`---\n${raw.trimEnd()}\n---\n`).data
}

export function defaultShortPlaySettings(): ShortPlaySettingsV1 {
  return shortPlaySettingsSchema.parse({})
}

export async function loadShortPlaySettings(projectRoot: string): Promise<ShortPlaySettingsV1> {
  const filePath = shortPlaySettingsFile(projectRoot)
  if (!(await pathExists(filePath))) {
    return defaultShortPlaySettings()
  }
  const raw = await readText(filePath)
  return shortPlaySettingsSchema.parse(parseYamlRecord(raw))
}

export async function saveShortPlaySettings(
  projectRoot: string,
  input: Partial<ShortPlaySettingsV1>
): Promise<ShortPlaySettingsV1> {
  const current = await loadShortPlaySettings(projectRoot)
  const next = shortPlaySettingsSchema.parse({
    ...current,
    ...input,
    schema_version: 1
  })
  const filePath = shortPlaySettingsFile(projectRoot)
  await ensureDir(path.dirname(filePath))
  await writeText(filePath, `${objectToYaml(next as unknown as Record<string, unknown>)}\n`)
  return next
}

export function makeAssetSeedId(category: ShortPlayAssetCategory, title: string, id?: string): string {
  const slug = slugify(title) || slugify(id ?? 'asset')
  return `seed-${category}-${slug}`
}

export async function listShortPlayAssets(projectRoot: string): Promise<ShortPlayAssetV1[]> {
  const dir = shortPlayAssetsDir(projectRoot)
  if (!(await pathExists(dir))) return []
  const files = await listMarkdownFiles(dir)
  const items: ShortPlayAssetV1[] = []
  for (const file of files.sort((a, b) => a.localeCompare(b, 'en'))) {
    const parsed = await readMarkdown<Record<string, unknown>>(file)
    const fm = shortPlayAssetFrontmatterSchema.parse(parsed.data)
    items.push({
      id: fm.id,
      seed_id: fm.seed_id,
      category: fm.category,
      title: fm.title,
      ...(fm.linked_doc_id ? { linked_doc_id: fm.linked_doc_id } : {}),
      external_result_ref: fm.external_result_ref,
      external_result_status: fm.external_result_status,
      tags: fm.tags,
      prompt: parsed.content.trim(),
      path: path.relative(projectRoot, file).replace(/\\/g, '/'),
      ...(fm.updated_at ? { updated_at: fm.updated_at } : {})
    })
  }
  return items
}

export async function saveShortPlayAsset(
  projectRoot: string,
  input: ShortPlayAssetInput
): Promise<ShortPlayAssetV1> {
  const existing = await listShortPlayAssets(projectRoot)
  const title = input.title.trim()
  if (!title) {
    throw new Error('剧本资产标题不能为空。')
  }
  const prompt = input.prompt.trim()
  if (!prompt) {
    throw new Error('剧本资产提示词不能为空。')
  }
  const id = input.id?.trim() || makeId('sp-asset', title)
  const current = existing.find((item) => item.id === id)
  const baseSeedId = input.seed_id?.trim() || current?.seed_id || makeAssetSeedId(input.category, title, id)

  const duplicateSeed = existing.find((item) => item.seed_id === baseSeedId && item.id !== id)
  const seed_id = duplicateSeed ? `${baseSeedId}-${slugify(id)}` : baseSeedId

  const updated_at = new Date().toISOString()
  const frontmatter = shortPlayAssetFrontmatterSchema.parse({
    id,
    seed_id,
    category: input.category,
    title,
    ...(input.linked_doc_id?.trim() ? { linked_doc_id: input.linked_doc_id.trim() } : {}),
    external_result_ref: input.external_result_ref?.trim() ?? current?.external_result_ref ?? '',
    external_result_status:
      input.external_result_status ??
      (input.external_result_ref?.trim() ? 'reconciled' : (current?.external_result_status ?? 'pending')),
    tags: input.tags ?? current?.tags ?? [],
    schema_version: 1,
    updated_at
  })

  const dir = shortPlayAssetsDir(projectRoot)
  await ensureDir(dir)
  const filePath = current
    ? path.join(projectRoot, current.path)
    : path.join(dir, `${id}-${slugify(title)}.md`)
  await writeMarkdown(filePath, frontmatter as unknown as Record<string, unknown>, prompt)

  return {
    ...frontmatter,
    prompt,
    path: path.relative(projectRoot, filePath).replace(/\\/g, '/')
  }
}

export async function deleteShortPlayAsset(projectRoot: string, assetId: string): Promise<void> {
  const existing = await listShortPlayAssets(projectRoot)
  const target = existing.find((item) => item.id === assetId)
  if (!target) return
  await rm(path.join(projectRoot, target.path), { force: true })
}

export async function reconcileShortPlayAssetBySeedId(
  projectRoot: string,
  seedId: string,
  externalResultRef: string
): Promise<ShortPlayAssetV1> {
  const normalizedSeed = seedId.trim()
  if (!normalizedSeed) {
    throw new Error('种子 ID（seed_id）不能为空。')
  }
  const ref = externalResultRef.trim()
  if (!ref) {
    throw new Error('外部生成结果标识不能为空。')
  }
  const assets = await listShortPlayAssets(projectRoot)
  const target = assets.find((item) => item.seed_id === normalizedSeed)
  if (!target) {
    throw new Error(`未找到与种子 ID "${normalizedSeed}" 匹配的本地剧本资产。`)
  }
  return saveShortPlayAsset(projectRoot, {
    id: target.id,
    seed_id: target.seed_id,
    category: target.category,
    title: target.title,
    linked_doc_id: target.linked_doc_id,
    external_result_ref: ref,
    external_result_status: 'reconciled',
    tags: target.tags,
    prompt: target.prompt
  })
}

export async function proposeShortPlayAssetsFromWorldbook(
  projectRoot: string
): Promise<ShortPlayAssetProposalV1[]> {
  const [characters, locations, items, currentAssets, settings] = await Promise.all([
    listDocs<CharacterDoc>(projectRoot, 'character'),
    listDocs<LocationDoc>(projectRoot, 'location'),
    listDocs<ItemDoc>(projectRoot, 'item'),
    listShortPlayAssets(projectRoot),
    loadShortPlaySettings(projectRoot)
  ])
  const linkedDocSet = new Set(currentAssets.map((asset) => `${asset.category}:${asset.linked_doc_id ?? ''}`))
  const styleSuffix = settings.visual_style_preset.trim()
    ? `，画风要求：${settings.visual_style_preset.trim()}`
    : ''

  const proposals: ShortPlayAssetProposalV1[] = []

  for (const character of characters) {
    if (character.data.enabled === false) continue
    const summary = (
      character.content.trim() ||
      character.data.desire ||
      character.data.role ||
      character.data.title
    ).slice(0, 180)
    if (!linkedDocSet.has(`character:${character.data.id}`)) {
      proposals.push({
        proposal_id: `prop-char-${character.data.id}`,
        seed_id: makeAssetSeedId('character', character.data.title, character.data.id),
        category: 'character',
        title: `${character.data.title}（人物立绘）`,
        linked_doc_id: character.data.id,
        linked_doc_type: 'character',
        prompt: `人物外观设定：${character.data.title}。${summary}。正面、侧面与半身三视图，面部特征稳定，光影清晰${styleSuffix}。`,
        tags: [...(character.data.tags ?? []), '人物资产']
      })
    }
    if (!linkedDocSet.has(`costume:${character.data.id}`)) {
      proposals.push({
        proposal_id: `prop-costume-${character.data.id}`,
        seed_id: makeAssetSeedId('costume', `${character.data.title}-costume`, character.data.id),
        category: 'costume',
        title: `${character.data.title}（标志服装）`,
        linked_doc_id: character.data.id,
        linked_doc_type: 'character',
        prompt: `人物常服与造型细节：${character.data.title}。结合人物设定（${summary}），展现材质纹理、配饰与色彩搭配${styleSuffix}。`,
        tags: [...(character.data.tags ?? []), '服装资产']
      })
    }
  }

  for (const location of locations) {
    if (location.data.enabled === false) continue
    if (linkedDocSet.has(`architecture:${location.data.id}`)) continue
    const summary = (location.content.trim() || location.data.description || location.data.title).slice(
      0,
      180
    )
    proposals.push({
      proposal_id: `prop-arch-${location.data.id}`,
      seed_id: makeAssetSeedId('architecture', location.data.title, location.data.id),
      category: 'architecture',
      title: `${location.data.title}（场景建筑）`,
      linked_doc_id: location.data.id,
      linked_doc_type: 'location',
      prompt: `场景与空间设定：${location.data.title}。${summary}。空镜全景，空间层次明确，适合作为短剧镜头背景${styleSuffix}。`,
      tags: [...(location.data.tags ?? []), '建筑场景']
    })
  }

  for (const item of items) {
    if (item.data.enabled === false) continue
    if (linkedDocSet.has(`prop:${item.data.id}`)) continue
    const summary = (
      item.content.trim() ||
      item.data.description ||
      item.data.function_text ||
      item.data.title
    ).slice(0, 180)
    proposals.push({
      proposal_id: `prop-item-${item.data.id}`,
      seed_id: makeAssetSeedId('prop', item.data.title, item.data.id),
      category: 'prop',
      title: `${item.data.title}（核心道具）`,
      linked_doc_id: item.data.id,
      linked_doc_type: 'item',
      prompt: `关键道具特写设定：${item.data.title}。${summary}。主体突出，材质细节清晰${styleSuffix}。`,
      tags: [...(item.data.tags ?? []), '道具资产']
    })
  }

  return proposals
}

export async function applyShortPlayAssetProposals(
  projectRoot: string,
  proposals: Array<{
    seed_id?: string
    category: ShortPlayAssetCategory
    title: string
    linked_doc_id?: string
    prompt: string
    tags?: string[]
  }>
): Promise<ShortPlayAssetV1[]> {
  const saved: ShortPlayAssetV1[] = []
  for (const proposal of proposals) {
    saved.push(
      await saveShortPlayAsset(projectRoot, {
        seed_id: proposal.seed_id,
        category: proposal.category,
        title: proposal.title,
        linked_doc_id: proposal.linked_doc_id,
        prompt: proposal.prompt,
        tags: proposal.tags
      })
    )
  }
  return saved
}

function storyboardFileForScene(projectRoot: string, sceneId: string): string {
  const safeSceneId = sceneId.replace(/[^a-zA-Z0-9_-]/g, '-')
  return path.join(shortPlayStoryboardsDir(projectRoot), `${safeSceneId}.yaml`)
}

export async function loadSceneStoryboard(
  projectRoot: string,
  sceneId: string
): Promise<ShortPlaySceneStoryboardV1 | null> {
  const filePath = storyboardFileForScene(projectRoot, sceneId)
  if (!(await pathExists(filePath))) return null
  const raw = await readText(filePath)
  const parsed = shortPlaySceneStoryboardSchema.parse(parseYamlRecord(raw))
  return {
    ...parsed,
    shots: [...parsed.shots]
      .sort((a, b) => a.order - b.order)
      .map((shot, index) => ({ ...shot, order: index + 1 }))
  }
}

export async function listSceneStoryboards(projectRoot: string): Promise<ShortPlaySceneStoryboardV1[]> {
  const dir = shortPlayStoryboardsDir(projectRoot)
  if (!(await pathExists(dir))) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const out: ShortPlaySceneStoryboardV1[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
    const raw = await readText(path.join(dir, entry.name))
    const parsed = shortPlaySceneStoryboardSchema.parse(parseYamlRecord(raw))
    out.push({
      ...parsed,
      shots: [...parsed.shots]
        .sort((a, b) => a.order - b.order)
        .map((shot, index) => ({ ...shot, order: index + 1 }))
    })
  }
  return out
}

export async function saveSceneStoryboard(
  projectRoot: string,
  input: Omit<ShortPlaySceneStoryboardV1, 'schema_version'>
): Promise<ShortPlaySceneStoryboardV1> {
  const normalizedShots = input.shots.map((shot, index) => {
    if (
      shot.duration_sec < SHORT_PLAY_SHOT_DURATION_MIN_SEC ||
      shot.duration_sec > SHORT_PLAY_SHOT_DURATION_MAX_SEC
    ) {
      throw new Error(
        `分镜时长必须在 ${SHORT_PLAY_SHOT_DURATION_MIN_SEC}–${SHORT_PLAY_SHOT_DURATION_MAX_SEC} 秒之间（当前镜头 #${index + 1}: ${shot.duration_sec} 秒）。`
      )
    }
    return shortPlayShotSchema.parse({
      ...shot,
      order: index + 1,
      shot_prompt: shot.shot_prompt.trim()
    })
  })

  const next = shortPlaySceneStoryboardSchema.parse({
    schema_version: 1,
    scene_id: input.scene_id,
    chapter_id: input.chapter_id ?? '',
    episode_id: input.episode_id ?? '',
    target_total_duration_sec:
      input.target_total_duration_sec ||
      normalizedShots.reduce((sum, item) => sum + item.duration_sec, 0) ||
      90,
    notes: input.notes ?? '',
    shots: normalizedShots,
    updated_at: new Date().toISOString()
  })

  const filePath = storyboardFileForScene(projectRoot, input.scene_id)
  await ensureDir(path.dirname(filePath))
  await writeText(filePath, `${objectToYaml(next as unknown as Record<string, unknown>)}\n`)
  return next
}

export async function reorderSceneStoryboardShots(
  projectRoot: string,
  sceneId: string,
  orderedShotIds: string[]
): Promise<ShortPlaySceneStoryboardV1> {
  const current = await loadSceneStoryboard(projectRoot, sceneId)
  if (!current) {
    throw new Error(`未找到节 ${sceneId} 的分镜记录。`)
  }
  const byId = new Map(current.shots.map((shot) => [shot.id, shot]))
  const reordered: ShortPlayShotV1[] = []
  for (const id of orderedShotIds) {
    const found = byId.get(id)
    if (found) {
      reordered.push(found)
      byId.delete(id)
    }
  }
  for (const remaining of byId.values()) {
    reordered.push(remaining)
  }
  return saveSceneStoryboard(projectRoot, {
    ...current,
    shots: reordered.map((shot, idx) => ({ ...shot, order: idx + 1 }))
  })
}

export async function proposeSceneStoryboard(
  projectRoot: string,
  sceneId: string,
  options?: { shotDurationSec?: number; targetTotalDurationSec?: number }
): Promise<ShortPlayStoryboardProposalV1> {
  const [scenes, assets, settings] = await Promise.all([
    listDocs<SceneDoc>(projectRoot, 'scene'),
    listShortPlayAssets(projectRoot),
    loadShortPlaySettings(projectRoot)
  ])
  const scene = scenes.find((item) => item.data.id === sceneId)
  if (!scene) {
    throw new Error(`未找到节文档: ${sceneId}`)
  }

  const shotDurationSec = Math.min(
    SHORT_PLAY_SHOT_DURATION_MAX_SEC,
    Math.max(
      SHORT_PLAY_SHOT_DURATION_MIN_SEC,
      Math.round(options?.shotDurationSec ?? settings.default_shot_duration_sec ?? 8)
    )
  )
  const targetTotalDurationSec =
    options?.targetTotalDurationSec ?? settings.default_episode_duration_sec ?? 90

  const sourceText =
    scene.content.trim() ||
    scene.data.outline_content?.trim() ||
    scene.data.scene_goal?.trim() ||
    scene.data.scene_conflict?.trim() ||
    scene.data.title.trim()

  const rawSegments = sourceText
    .split(/\n{2,}|(?<=[。！？!?])\s*/u)
    .map((segment: string) => segment.trim())
    .filter((segment: string) => segment.length > 0)

  const targetShotCount = Math.max(3, Math.min(16, Math.round(targetTotalDurationSec / shotDurationSec)))

  const groupedSegments: string[] = []
  if (rawSegments.length === 0) {
    groupedSegments.push(scene.data.title)
  } else if (rawSegments.length <= targetShotCount) {
    groupedSegments.push(...rawSegments)
  } else {
    const chunkSize = Math.ceil(rawSegments.length / targetShotCount)
    for (let index = 0; index < rawSegments.length; index += chunkSize) {
      groupedSegments.push(rawSegments.slice(index, index + chunkSize).join(' '))
    }
  }

  const relevantDocIds = new Set<string>([
    ...(scene.data.characters ?? []),
    ...(scene.data.location ? [scene.data.location] : []),
    ...(scene.data.pov ? [scene.data.pov] : [])
  ])

  const defaultMatchedAssets = assets.filter(
    (asset) =>
      (asset.linked_doc_id && relevantDocIds.has(asset.linked_doc_id)) ||
      asset.category === 'style' ||
      sourceText.includes(asset.title.replace(/（.*）$/u, ''))
  )

  const shotSizes = ['全景', '中景', '近景', '特写', '中景', '跟拍近景']
  const cameraMovements = ['推镜', '固定', '摇镜', '跟拍', '拉镜', '固定']
  const styleTag = settings.visual_style_preset.trim() ? `，画风：${settings.visual_style_preset.trim()}` : ''

  const shots: ShortPlayShotV1[] = groupedSegments.map((segment, index) => {
    const shotSize = shotSizes[index % shotSizes.length]
    const cameraMovement = cameraMovements[index % cameraMovements.length]
    const dialogueMatch = segment.match(/[“「"]([^”」"]+)[”」"]/u)
    const dialogue = dialogueMatch ? dialogueMatch[1] : ''
    const matchedSeeds = defaultMatchedAssets.map((asset) => asset.seed_id)
    const seedNote = matchedSeeds.length ? ` [关联资产种子: ${matchedSeeds.join(', ')}]` : ''

    return {
      id: `${scene.data.id}-shot-${index + 1}`,
      order: index + 1,
      duration_sec: shotDurationSec,
      shot_size: shotSize,
      camera_movement: cameraMovement,
      asset_seed_ids: matchedSeeds,
      action_description: segment,
      dialogue,
      shot_prompt: `镜头 #${index + 1}（${shotDurationSec}s，${shotSize}·${cameraMovement}，画幅 ${settings.aspect_ratio}）：${segment}${
        dialogue ? `；角色台词：「${dialogue}」` : ''
      }${styleTag}${seedNote}`
    }
  })

  return {
    scene_id: scene.data.id,
    scene_title: scene.data.title,
    chapter_id: scene.data.chapter_id,
    target_total_duration_sec: shots.reduce((sum, item) => sum + item.duration_sec, 0),
    shots
  }
}

export async function buildShortPlayExportPackage(projectRoot: string): Promise<ShortPlayExportPackageV1> {
  const project = await loadProject(projectRoot)
  if (project.capabilities && !project.capabilities.short_drama_export) {
    throw new Error('SHORT_DRAMA_EXPORT_DISABLED: 当前作品已关闭短剧导出能力（CAP-7）。')
  }

  const [settings, assets, storyboards, scenes, outlines] = await Promise.all([
    loadShortPlaySettings(projectRoot),
    listShortPlayAssets(projectRoot),
    listSceneStoryboards(projectRoot),
    listDocs<SceneDoc>(projectRoot, 'scene'),
    listDocs<OutlineDoc>(projectRoot, 'outline')
  ])

  const sceneMap = new Map(scenes.map((scene) => [scene.data.id, scene.data]))
  const chapterOrderMap = new Map(
    outlines.filter((doc) => doc.data.level === 'chapter').map((doc) => [doc.data.id, doc.data.order ?? 0])
  )

  const orderedStoryboards = [...storyboards].sort((left, right) => {
    const leftChapterOrder = chapterOrderMap.get(left.chapter_id) ?? 0
    const rightChapterOrder = chapterOrderMap.get(right.chapter_id) ?? 0
    if (leftChapterOrder !== rightChapterOrder) return leftChapterOrder - rightChapterOrder
    const leftSceneOrder = sceneMap.get(left.scene_id)?.order ?? 0
    const rightSceneOrder = sceneMap.get(right.scene_id)?.order ?? 0
    if (leftSceneOrder !== rightSceneOrder) return leftSceneOrder - rightSceneOrder
    return left.scene_id.localeCompare(right.scene_id, 'en')
  })

  const assetPrompts = assets.map((asset) => ({
    asset_id: asset.id,
    seed_id: asset.seed_id,
    category: asset.category,
    title: asset.title,
    ...(asset.linked_doc_id ? { linked_doc_id: asset.linked_doc_id } : {}),
    prompt: asset.prompt,
    external_result_status: asset.external_result_status,
    external_result_ref: asset.external_result_ref
  }))

  const storyboardPrompts: ShortPlayExportPackageV1['storyboard_prompts'] = []
  for (const board of orderedStoryboards) {
    const sceneTitle = sceneMap.get(board.scene_id)?.title ?? board.scene_id
    for (const shot of board.shots) {
      storyboardPrompts.push({
        scene_id: board.scene_id,
        scene_title: sceneTitle,
        chapter_id: board.chapter_id,
        episode_id: board.episode_id,
        shot_id: shot.id,
        order: shot.order,
        duration_sec: shot.duration_sec,
        shot_size: shot.shot_size,
        camera_movement: shot.camera_movement,
        asset_seed_ids: shot.asset_seed_ids,
        action_description: shot.action_description,
        dialogue: shot.dialogue,
        shot_prompt: shot.shot_prompt
      })
    }
  }

  assertSensitiveSourcesSafe([
    { source: 'short-play/settings.yaml', text: `${settings.visual_style_preset}\n${settings.pacing_notes}` },
    ...assetPrompts.map((asset) => ({
      source: `short-play/assets/${asset.asset_id}`,
      text: `${asset.title}\n${asset.prompt}\n${asset.external_result_ref}`
    })),
    ...storyboardPrompts.map((shot) => ({
      source: `short-play/storyboards/${shot.scene_id}#${shot.shot_id}`,
      text: `${shot.action_description}\n${shot.dialogue}\n${shot.shot_prompt}`
    }))
  ])

  const generatedAt = new Date().toISOString()

  const markdownLines: string[] = [
    `# ${project.title} · 短剧提示词导出包`,
    '',
    `- 导出时间：${generatedAt}`,
    `- 默认单集时长：${settings.default_episode_duration_sec} 秒`,
    `- 默认单镜头时长：${settings.default_shot_duration_sec} 秒（5–15 秒规范）`,
    `- 画幅比例：${settings.aspect_ratio}`,
    `- 剧集与章映射：${settings.chapter_episode_mapping}`,
    ...(settings.visual_style_preset ? [`- 整体画风设定：${settings.visual_style_preset}`] : []),
    ...(settings.pacing_notes ? [`- 叙事与卡点要求：${settings.pacing_notes}`] : []),
    '',
    '## 一、资产提示词清单（带本地种子 ID / Seed ID）',
    ''
  ]

  if (assetPrompts.length === 0) {
    markdownLines.push('_暂无剧本资产提示词。_', '')
  } else {
    for (const asset of assetPrompts) {
      markdownLines.push(
        `### [${asset.category}] ${asset.title}`,
        `- **Seed ID**: \`${asset.seed_id}\``,
        `- **资产 ID**: \`${asset.asset_id}\``,
        ...(asset.linked_doc_id ? [`- **关联设定卡 ID**: \`${asset.linked_doc_id}\``] : []),
        `- **对回状态**: ${
          asset.external_result_status === 'reconciled'
            ? `已对回 (${asset.external_result_ref})`
            : '待外部生成对回'
        }`,
        '',
        asset.prompt,
        ''
      )
    }
  }

  markdownLines.push('## 二、分镜提示词清单（5–15 秒视频生成序列）', '')
  if (storyboardPrompts.length === 0) {
    markdownLines.push('_暂无分镜提示词。_', '')
  } else {
    let currentScene = ''
    for (const shot of storyboardPrompts) {
      if (shot.scene_id !== currentScene) {
        currentScene = shot.scene_id
        markdownLines.push(`### 节：${shot.scene_title} (\`${shot.scene_id}\`)`, '')
      }
      markdownLines.push(
        `#### 镜头 #${shot.order} (\`${shot.shot_id}\` · ${shot.duration_sec}s · ${shot.shot_size} / ${shot.camera_movement})`,
        ...(shot.asset_seed_ids.length
          ? [`- **引用资产 Seed ID**: ${shot.asset_seed_ids.map((id) => `\`${id}\``).join(', ')}`]
          : []),
        ...(shot.action_description ? [`- **画面动作**: ${shot.action_description}`] : []),
        ...(shot.dialogue ? [`- **台词**: ${shot.dialogue}`] : []),
        '',
        shot.shot_prompt,
        ''
      )
    }
  }

  const markdown = `${markdownLines.join('\n').trimEnd()}\n`
  const jsonPayload = {
    schema_version: 1,
    project_title: project.title,
    generated_at: generatedAt,
    settings,
    asset_prompts: assetPrompts,
    storyboard_prompts: storyboardPrompts
  }

  return {
    project_title: project.title,
    generated_at: generatedAt,
    settings,
    asset_prompts: assetPrompts,
    storyboard_prompts: storyboardPrompts,
    markdown,
    json: `${JSON.stringify(jsonPayload, null, 2)}\n`
  }
}

export async function exportShortPlayPromptsToFile(
  projectRoot: string,
  destinationPath: string,
  format: 'markdown' | 'json' = 'markdown'
): Promise<{ outputPath: string; assetCount: number; shotCount: number }> {
  const pkg = await buildShortPlayExportPackage(projectRoot)
  const resolved = path.resolve(destinationPath)
  await ensureDir(path.dirname(resolved))
  await writeText(resolved, format === 'json' ? pkg.json : pkg.markdown)
  return {
    outputPath: resolved,
    assetCount: pkg.asset_prompts.length,
    shotCount: pkg.storyboard_prompts.length
  }
}
