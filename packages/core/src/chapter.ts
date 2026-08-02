import path from 'node:path'
import { assembleContextPacket, renderContextPacket } from './context.js'
import { listDocs, requireDoc } from './documents.js'
import { readPrompt } from './prompts.js'
import type { OutlineDoc, SceneDoc } from './types.js'

export interface ScenePromptInput {
  sceneId: string
  selectedElements?: {
    timeline?: string[]
    locations?: string[]
    characters?: string[]
    foreshadowing?: string[]
    worldEntries?: string[]
    patterns?: string[]
  }
  previousOutput?: string
}

export interface ScenePromptPlan {
  scene_id: string
  chapter_id: string
  title: string
  prompt: string
}

export interface ChapterPromptPlan {
  chapter_id: string
  scene_prompts: ScenePromptPlan[]
  style_reference?: {
    scene_id: string
    title: string
    excerpt: string
  }
}

export async function buildSceneWritingPrompt(
  projectRoot: string,
  input: ScenePromptInput
): Promise<ScenePromptPlan> {
  const scene = await requireDoc<SceneDoc>(projectRoot, input.sceneId)
  const chapter = await requireDoc<OutlineDoc>(projectRoot, scene.data.section)
  const packet = await assembleContextPacket(projectRoot, { type: 'scene', id: scene.data.id })
  const systemPrompt = await readPrompt(projectRoot, 'prose-scene-draft')
  const style = await latestFinalSceneStyle(projectRoot, scene.data.id)
  const selected = input.selectedElements ?? {}
  const prompt = [
    systemPrompt,
    '',
    '# 章纲',
    `title: ${chapter.data.title}`,
    chapter.content,
    '',
    '# 当前 scene / 节纲',
    `title: ${scene.data.title}`,
    `goal: ${scene.data.scene_goal}`,
    `conflict: ${scene.data.scene_conflict}`,
    `change: ${scene.data.scene_change}`,
    `environment: ${scene.data.writing_environment}`,
    scene.content,
    '',
    '# 用户选择要素',
    renderSelectedElements(selected),
    '',
    '# 上下文包',
    renderContextPacket(packet),
    style
      ? ['# 文风参考：最后一个定稿 scene', `title: ${style.title}`, style.excerpt].join('\n')
      : '# 文风参考\n暂无定稿 scene，请以作者章纲和项目策略为准。',
    input.previousOutput ? ['# 前一 scene 输出', input.previousOutput].join('\n') : '',
    '',
    '# 输出要求',
    '只输出当前 scene 正文。'
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    scene_id: scene.data.id,
    chapter_id: chapter.data.id,
    title: scene.data.title,
    prompt
  }
}

export async function buildChapterWritingPlan(
  projectRoot: string,
  chapterId: string,
  selectedByScene: Record<string, ScenePromptInput['selectedElements']> = {}
): Promise<ChapterPromptPlan> {
  const scenes = (await listDocs<SceneDoc>(projectRoot, 'scene'))
    .filter((scene) => scene.data.section === chapterId)
    .sort((a, b) => sceneSortKey(a).localeCompare(sceneSortKey(b)))
  const scene_prompts: ScenePromptPlan[] = []
  let previousOutput = ''
  for (const scene of scenes) {
    const plan = await buildSceneWritingPrompt(projectRoot, {
      sceneId: scene.data.id,
      selectedElements: selectedByScene[scene.data.id],
      previousOutput
    })
    scene_prompts.push(plan)
    previousOutput = `【${scene.data.title}】写作完成后，将此处替换为该 scene 的输出。`
  }
  const style = await latestFinalSceneStyle(projectRoot)
  return {
    chapter_id: chapterId,
    scene_prompts,
    style_reference: style
  }
}

export async function latestFinalSceneStyle(
  projectRoot: string,
  excludeSceneId?: string
): Promise<{ scene_id: string; title: string; excerpt: string } | undefined> {
  const scenes = (await listDocs<SceneDoc>(projectRoot, 'scene'))
    .filter((scene) => scene.data.status === 'final' && scene.data.id !== excludeSceneId)
    .sort((a, b) => path.basename(b.path).localeCompare(path.basename(a.path)))
  const scene = scenes[0]
  if (!scene) return undefined
  return {
    scene_id: scene.data.id,
    title: scene.data.title,
    excerpt: scene.content.slice(-2400)
  }
}

function renderSelectedElements(selected: NonNullable<ScenePromptInput['selectedElements']>): string {
  return [
    ['timeline', selected.timeline],
    ['locations', selected.locations],
    ['characters', selected.characters],
    ['foreshadowing', selected.foreshadowing],
    ['world_entries', selected.worldEntries],
    ['patterns', selected.patterns]
  ]
    .map(([key, value]) => `${key}: ${Array.isArray(value) && value.length ? value.join(', ') : '未指定'}`)
    .join('\n')
}

function sceneSortKey(scene: { data: SceneDoc; path: string }): string {
  return `${String(scene.data.chapter_number ?? '').padStart(6, '0')}-${String(scene.data.tags?.join('-') ?? '')}-${path.basename(scene.path)}`
}
