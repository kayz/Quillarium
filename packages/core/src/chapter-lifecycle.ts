import path from 'node:path'
import { chmod, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createChapterProse, listDocs } from './documents.js'
import { ensureDir, pathExists, readMarkdown, writeMarkdown } from './fs.js'
import { listRuns } from './runs.js'
import type { ChapterProseDoc, OutlineDoc, SceneDoc } from './types.js'

export interface ChapterLifecycleSnapshot {
  chapter: { path: string; data: OutlineDoc; content: string }
  prose: { path: string; data: ChapterProseDoc; content: string }
  scenes: Array<{ path: string; data: SceneDoc; content: string }>
}

export interface ChapterPublicationResult {
  prose: { path: string; data: ChapterProseDoc; content: string }
  purged_scene_ids: string[]
  deleted_run_ids: string[]
}

export interface StoryNodeDeletionResult {
  deleted_outline_ids: string[]
  deleted_scene_ids: string[]
  deleted_chapter_prose_ids: string[]
  deleted_run_ids: string[]
}

export async function loadChapterLifecycle(
  projectRoot: string,
  chapterId: string
): Promise<ChapterLifecycleSnapshot> {
  const chapter = (await listDocs<OutlineDoc>(projectRoot, 'outline')).find(
    (item) => item.data.id === chapterId && item.data.level === 'chapter'
  )
  if (!chapter) throw new Error(`Chapter outline not found: ${chapterId}`)
  let prose = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
    (item) => item.data.chapter_id === chapterId
  )
  if (!prose) {
    const file = await createChapterProse(projectRoot, chapterId, `${chapter.data.title} 正文`)
    const parsed = await readMarkdown<Record<string, unknown>>(file)
    prose = {
      path: file,
      data: parsed.data as unknown as ChapterProseDoc,
      content: parsed.content
    }
  }
  const scenes = (await listDocs<SceneDoc>(projectRoot, 'scene'))
    .filter((item) => sceneChapterId(item.data) === chapterId)
    .sort((a, b) => a.data.order - b.data.order || a.data.id.localeCompare(b.data.id))
  return { chapter, prose, scenes }
}

export function sceneChapterId(scene: Pick<SceneDoc, 'chapter_id' | 'section'>): string {
  return scene.chapter_id || scene.section || ''
}

export function countProseCharacters(content: string): number {
  return [...content.replace(/\s/gu, '')].length
}

export function assertPlainProse(content: string): string {
  const value = content.trim()
  if (!value) throw new Error('Prose is empty.')
  const markdown = [
    /^\s{0,3}#{1,6}\s+/mu,
    /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/mu,
    /^\s{0,3}>\s?/mu,
    /```|~~~/u,
    /!?\[[^\]]+\]\([^)]+\)/u,
    /(?:\*\*|__|~~)[^\r\n]+(?:\*\*|__|~~)/u
  ].some((pattern) => pattern.test(value))
  if (markdown) throw new Error('正文必须是纯文字，不能包含 Markdown 标题、列表、引用、链接或强调语法。')
  return value
}

export async function assertChapterAllowsAI(projectRoot: string, chapterId: string): Promise<void> {
  const { prose } = await loadChapterLifecycle(projectRoot, chapterId)
  if (prose.data.status !== 'draft') {
    throw new Error(
      prose.data.status === 'published'
        ? '本章已发布，所有正文与节均已锁定。'
        : '本章已定稿，AI 生成和节修改已锁定；仅可由作者小幅修改章正文。'
    )
  }
}

export async function assertDocumentHumanEditable(
  projectRoot: string,
  data: Record<string, unknown>
): Promise<void> {
  if (data['type'] === 'chapter_prose') {
    const stored = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
      (item) => item.data.id === data['id']
    )
    if ((stored?.data.status ?? data['status']) === 'published') {
      throw new Error('已发布正文永久锁定，不能再修改。')
    }
    return
  }
  if (data['type'] !== 'scene') return
  const chapterId = String(data['chapter_id'] ?? data['section'] ?? '')
  if (!chapterId) throw new Error('节缺少所属章。')
  const { prose, scenes } = await loadChapterLifecycle(projectRoot, chapterId)
  const current = scenes.find((item) => item.data.id === data['id'])
  if (prose.data.status !== 'draft') throw new Error('本章已定稿或已发布，节不允许再修改。')
  if (current?.data.accepted_at) throw new Error('本节已接受进入章正文；请直接编辑章正文。')
}

export async function assertDocumentExternalOpenAllowed(
  projectRoot: string,
  data: Record<string, unknown>
): Promise<void> {
  if (data['type'] === 'chapter_prose' && data['status'] === 'published') {
    throw new Error('已发布正文不能在外部编辑器中打开；请使用只读预览或导出。')
  }
  if (data['type'] === 'scene') {
    await assertDocumentHumanEditable(projectRoot, data)
  }
}

export async function assertDocumentDeletable(
  projectRoot: string,
  data: Record<string, unknown>
): Promise<void> {
  if (data['type'] === 'chapter_prose') {
    const stored = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
      (item) => item.data.id === data['id']
    )
    if ((stored?.data.status ?? data['status']) === 'published') {
      throw new Error('已发布正文永久锁定，不能删除。')
    }
  }
  if (data['type'] === 'scene') await assertDocumentHumanEditable(projectRoot, data)
}

/**
 * Deletes a story-tree branch or scene only after proving that no affected chapter
 * has published prose. Outline deletion is intentionally recursive: a parent node
 * owns every outline, scene, chapter-prose file, and run below it.
 */
export async function deleteStoryNode(
  projectRoot: string,
  target: { type: 'outline' | 'scene'; id: string }
): Promise<StoryNodeDeletionResult> {
  const [outlines, scenes, proseDocs, runs] = await Promise.all([
    listDocs<OutlineDoc>(projectRoot, 'outline'),
    listDocs<SceneDoc>(projectRoot, 'scene'),
    listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose'),
    listRuns(projectRoot)
  ])
  const outlineIds = new Set<string>()
  let scenesToDelete: typeof scenes
  let proseToDelete: typeof proseDocs

  if (target.type === 'outline') {
    const root = outlines.find((item) => item.data.id === target.id)
    if (!root) throw new Error(`Outline not found: ${target.id}`)
    if (!['volume', 'part', 'arc', 'act', 'chapter', 'section'].includes(root.data.level)) {
      throw new Error('总览和总纲是故事根节点，不能从故事树中删除。')
    }
    outlineIds.add(root.data.id)
    let changed = true
    while (changed) {
      changed = false
      for (const outline of outlines) {
        if (outlineIds.has(outline.data.id) || !outline.data.parent) continue
        if (outlineIds.has(outline.data.parent)) {
          outlineIds.add(outline.data.id)
          changed = true
        }
      }
    }
    const chapterIds = new Set(
      outlines
        .filter((item) => outlineIds.has(item.data.id) && item.data.level === 'chapter')
        .map((item) => item.data.id)
    )
    scenesToDelete = scenes.filter((item) => chapterIds.has(sceneChapterId(item.data)))
    proseToDelete = proseDocs.filter((item) => chapterIds.has(item.data.chapter_id))
  } else {
    const scene = scenes.find((item) => item.data.id === target.id)
    if (!scene) throw new Error(`Scene not found: ${target.id}`)
    scenesToDelete = [scene]
    proseToDelete = []
  }

  const affectedChapterIds = new Set([
    ...proseToDelete.map((item) => item.data.chapter_id),
    ...scenesToDelete.map((item) => sceneChapterId(item.data))
  ])
  const affectedProse = proseDocs.filter((item) => affectedChapterIds.has(item.data.chapter_id))
  const published = affectedProse.find((item) => item.data.status === 'published')
  if (published) {
    throw new Error(`「${published.data.title}」已发布；包含已发布正文的故事节点不能删除。`)
  }

  const sceneIds = new Set(scenesToDelete.map((item) => item.data.id))
  const runsToDelete = runs.filter((run) => sceneIds.has(run.scene_id))
  const filesToMove = [
    ...outlines.filter((item) => outlineIds.has(item.data.id)).map((item) => item.path),
    ...scenesToDelete.map((item) => item.path),
    ...proseToDelete.map((item) => item.path)
  ]
  const token = `${Date.now()}-${randomUUID()}`
  const staging = path.resolve(projectRoot, '.quillarium', 'delete-staging', token)
  assertContained(projectRoot, staging)
  await ensureDir(staging)
  const moved: Array<{ from: string; to: string }> = []
  const changedProse: typeof proseDocs = []

  try {
    for (const file of [...new Set(filesToMove)]) {
      const from = path.resolve(file)
      assertContained(projectRoot, from)
      if (!(await pathExists(from))) continue
      const relative = path.relative(path.resolve(projectRoot), from)
      const to = path.join(staging, 'files', relative)
      await ensureDir(path.dirname(to))
      await rename(from, to)
      moved.push({ from, to })
    }
    for (const run of runsToDelete) {
      const from = path.resolve(projectRoot, run.run_dir)
      assertRunPath(projectRoot, from)
      if (!(await pathExists(from))) continue
      const to = path.join(staging, 'runs', path.basename(from))
      await ensureDir(path.dirname(to))
      await rename(from, to)
      moved.push({ from, to })
    }
    const deletedProseIds = new Set(proseToDelete.map((item) => item.data.id))
    for (const prose of affectedProse) {
      if (deletedProseIds.has(prose.data.id)) continue
      const nextSceneIds = prose.data.scene_ids.filter((id) => !sceneIds.has(id))
      if (nextSceneIds.length === prose.data.scene_ids.length) continue
      await writeMarkdown(
        prose.path,
        { ...prose.data, scene_ids: nextSceneIds } as unknown as Record<string, unknown>,
        prose.content
      )
      changedProse.push(prose)
    }
    await rm(staging, { recursive: true, force: true })
  } catch (error) {
    for (const prose of changedProse.reverse()) {
      await writeMarkdown(prose.path, prose.data as unknown as Record<string, unknown>, prose.content).catch(
        () => undefined
      )
    }
    for (const item of moved.reverse()) {
      if (await pathExists(item.to)) {
        await ensureDir(path.dirname(item.from))
        await rename(item.to, item.from).catch(() => undefined)
      }
    }
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }

  return {
    deleted_outline_ids: [...outlineIds],
    deleted_scene_ids: [...sceneIds],
    deleted_chapter_prose_ids: proseToDelete.map((item) => item.data.id),
    deleted_run_ids: runsToDelete.map((run) => run.id)
  }
}

export async function acceptSceneIntoChapter(
  projectRoot: string,
  sceneId: string,
  candidate?: string
): Promise<ChapterLifecycleSnapshot> {
  const scene = (await listDocs<SceneDoc>(projectRoot, 'scene')).find((item) => item.data.id === sceneId)
  if (!scene) throw new Error(`Scene not found: ${sceneId}`)
  const lifecycle = await loadChapterLifecycle(projectRoot, sceneChapterId(scene.data))
  if (lifecycle.prose.data.status !== 'draft') throw new Error('Only a draft chapter can accept a scene.')
  if (scene.data.accepted_at) throw new Error('This scene is already present in the chapter prose.')
  const earlier = lifecycle.scenes.find(
    (item) => item.data.order < scene.data.order && !item.data.accepted_at
  )
  if (earlier) throw new Error(`请先接受前一节「${earlier.data.title}」，章正文必须按节顺序写入。`)
  const prose = assertPlainProse(candidate ?? scene.content)
  const nextScene: SceneDoc = {
    ...scene.data,
    status: 'final',
    outline_content: scene.data.outline_content || scene.content,
    accepted_at: new Date().toISOString()
  }
  const nextProse: ChapterProseDoc = {
    ...lifecycle.prose.data,
    scene_ids: [...lifecycle.prose.data.scene_ids, scene.data.id]
  }
  await writeMarkdown(scene.path, nextScene as unknown as Record<string, unknown>, prose)
  try {
    await writeMarkdown(
      lifecycle.prose.path,
      nextProse as unknown as Record<string, unknown>,
      `${lifecycle.prose.content.trimEnd()}${prose}`
    )
  } catch (error) {
    await writeMarkdown(scene.path, scene.data as unknown as Record<string, unknown>, scene.content)
    throw error
  }
  return loadChapterLifecycle(projectRoot, lifecycle.chapter.data.id)
}

export async function finalizeChapter(
  projectRoot: string,
  chapterId: string
): Promise<ChapterLifecycleSnapshot> {
  const lifecycle = await loadChapterLifecycle(projectRoot, chapterId)
  if (lifecycle.prose.data.status === 'published') throw new Error('Published chapters cannot be changed.')
  if (!lifecycle.prose.content.trim()) throw new Error('Cannot finalize an empty chapter.')
  const unaccepted = lifecycle.scenes.filter((scene) => !scene.data.accepted_at)
  if (unaccepted.length) {
    throw new Error(
      `Cannot finalize while scenes are unaccepted: ${unaccepted.map((item) => item.data.title).join(', ')}`
    )
  }
  const expected = lifecycle.scenes.map((scene) => scene.data.id)
  if (
    expected.length !== lifecycle.prose.data.scene_ids.length ||
    expected.some((sceneId, index) => lifecycle.prose.data.scene_ids[index] !== sceneId)
  ) {
    throw new Error('Chapter prose scene order does not match the accepted scene sequence.')
  }
  const data: ChapterProseDoc = {
    ...lifecycle.prose.data,
    status: 'final',
    finalized_at: lifecycle.prose.data.finalized_at ?? new Date().toISOString()
  }
  await writeMarkdown(
    lifecycle.prose.path,
    data as unknown as Record<string, unknown>,
    lifecycle.prose.content
  )
  return loadChapterLifecycle(projectRoot, chapterId)
}

export async function publishChapter(
  projectRoot: string,
  chapterId: string,
  confirmation: string
): Promise<ChapterPublicationResult> {
  const lifecycle = await loadChapterLifecycle(projectRoot, chapterId)
  if (lifecycle.prose.data.status !== 'final') throw new Error('Only a finalized chapter can be published.')
  if (confirmation !== lifecycle.chapter.data.title) {
    throw new Error('Publication confirmation must exactly match the chapter title.')
  }
  const runs = (await listRuns(projectRoot)).filter((run) =>
    lifecycle.scenes.some((scene) => scene.data.id === run.scene_id)
  )
  const token = `${Date.now()}-${chapterId.replace(/[^a-zA-Z0-9_-]/gu, '_')}`
  const staging = path.resolve(projectRoot, '.quillarium', 'publish-staging', token)
  assertContained(projectRoot, staging)
  await ensureDir(staging)
  const moved: Array<{ from: string; to: string }> = []
  const changedScenes: typeof lifecycle.scenes = []
  let proseChanged = false
  try {
    for (const run of runs) {
      const from = path.resolve(projectRoot, run.run_dir)
      assertRunPath(projectRoot, from)
      if (!(await pathExists(from))) continue
      const to = path.join(staging, path.basename(from))
      await rename(from, to)
      moved.push({ from, to })
    }
    const now = new Date().toISOString()
    for (const scene of lifecycle.scenes) {
      const next: SceneDoc = { ...scene.data, status: 'final', purged_at: now }
      // Generated candidates and exact prompts live under runs/. The durable scene outline is
      // copied back into the Markdown body so publication removes AI prose while preserving 节纲.
      await writeMarkdown(scene.path, next as unknown as Record<string, unknown>, durableSceneOutline(scene))
      changedScenes.push(scene)
    }
    const published: ChapterProseDoc = {
      ...lifecycle.prose.data,
      status: 'published',
      finalized_at: lifecycle.prose.data.finalized_at ?? now,
      published_at: now
    }
    await writeMarkdown(
      lifecycle.prose.path,
      published as unknown as Record<string, unknown>,
      lifecycle.prose.content
    )
    await chmod(lifecycle.prose.path, 0o444)
    proseChanged = true
    await rm(staging, { recursive: true, force: true })
    return {
      prose: { ...lifecycle.prose, data: published },
      purged_scene_ids: lifecycle.scenes.map((scene) => scene.data.id),
      deleted_run_ids: runs.map((run) => run.id)
    }
  } catch (error) {
    if (proseChanged) {
      await chmod(lifecycle.prose.path, 0o644).catch(() => undefined)
      await writeMarkdown(
        lifecycle.prose.path,
        lifecycle.prose.data as unknown as Record<string, unknown>,
        lifecycle.prose.content
      ).catch(() => undefined)
    }
    for (const scene of changedScenes.reverse()) {
      await writeMarkdown(scene.path, scene.data as unknown as Record<string, unknown>, scene.content).catch(
        () => undefined
      )
    }
    for (const item of moved.reverse()) {
      if (await pathExists(item.to)) await rename(item.to, item.from).catch(() => undefined)
    }
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

function durableSceneOutline(scene: { data: SceneDoc; content: string }): string {
  if (scene.data.outline_content.trim()) return scene.data.outline_content
  if (!scene.data.accepted_at) return scene.content
  return [
    `## ${scene.data.title} 节纲`,
    scene.data.writing_focus && `写作重点：${scene.data.writing_focus}`,
    scene.data.scene_goal && `目标：${scene.data.scene_goal}`,
    scene.data.scene_conflict && `冲突：${scene.data.scene_conflict}`,
    scene.data.scene_change && `变化：${scene.data.scene_change}`,
    scene.data.timeline_node && `时间线：${scene.data.timeline_node}`,
    scene.data.location && `地点：${scene.data.location}`,
    scene.data.pov && `视角人物：${scene.data.pov}`
  ]
    .filter(Boolean)
    .join('\n\n')
}

function assertContained(root: string, candidate: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe project path: ${candidate}`)
  }
}

function assertRunPath(root: string, candidate: string): void {
  const runs = path.resolve(root, 'runs')
  const relative = path.relative(runs, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe run path: ${candidate}`)
  }
}
