import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acceptSceneIntoChapter,
  assertChapterAllowsAI,
  assertDocumentDeletable,
  assertDocumentHumanEditable,
  createOutline,
  createProjectAt,
  createRun,
  createScene,
  deleteStoryNode,
  finalizeChapter,
  listDocs,
  listRuns,
  loadChapterLifecycle,
  publishChapter,
  readMarkdown,
  writeMarkdown,
  writeRunFile,
  type ChapterProseDoc,
  type OutlineDoc,
  type SceneDoc
} from './index.js'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-chapter-'))
  await createProjectAt(root, { id: 'chapter-test', title: 'Chapter Test' })
  await createOutline(root, 'overview', '作品总览', { id: 'overview' })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', '第一篇', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', '第一章', { id: 'chapter', parent: 'part' })
  return root
}

describe('seven-level hierarchy and chapter lifecycle', () => {
  it('normalizes legacy arc input to the current part level', async () => {
    const root = await fixture()
    await createOutline(root, 'arc', '旧段纲', { id: 'legacy-part', parent: 'volume' })
    const legacy = (await listDocs<OutlineDoc>(root, 'outline')).find(
      (item) => item.data.id === 'legacy-part'
    )
    expect(legacy?.data.level).toBe('part')
  })

  it('accepts scenes in order and locks AI after finalization', async () => {
    const root = await fixture()
    const first = await createScene(root, '第一节', {
      id: 'scene-one',
      chapter_id: 'chapter',
      section: 'chapter',
      order: 0,
      timeline_node: 'timeline-opening',
      location: 'location-room',
      pov: 'character-protagonist'
    })
    await createScene(root, '第二节', {
      id: 'scene-two',
      chapter_id: 'chapter',
      section: 'chapter',
      order: 1,
      timeline_node: 'timeline-opening',
      location: 'location-room',
      pov: 'character-protagonist'
    })
    await expect(acceptSceneIntoChapter(root, 'scene-two', '后文。')).rejects.toThrow('先接受前一节')
    await acceptSceneIntoChapter(root, 'scene-one', '开篇正文。')
    const lifecycle = await loadChapterLifecycle(root, 'chapter')
    expect(lifecycle.prose.content).toContain('开篇正文。')
    expect(lifecycle.prose.data.scene_ids).toEqual(['scene-one'])
    await expect(finalizeChapter(root, 'chapter')).rejects.toThrow('unaccepted')
    await acceptSceneIntoChapter(root, 'scene-two', '后文。')
    expect((await loadChapterLifecycle(root, 'chapter')).prose.content.trim()).toBe('开篇正文。后文。')
    await finalizeChapter(root, 'chapter')
    await expect(assertChapterAllowsAI(root, 'chapter')).rejects.toThrow('已定稿')
    const scene = await readMarkdown<Record<string, unknown>>(first)
    await expect(assertDocumentHumanEditable(root, scene.data)).rejects.toThrow('已定稿')
  })

  it('publishes with exact-title confirmation, purges generated artifacts, preserves scene outlines, and locks prose', async () => {
    const root = await fixture()
    await createScene(
      root,
      '第一节',
      {
        id: 'scene-one',
        chapter_id: 'chapter',
        section: 'chapter',
        order: 0,
        timeline_node: 'timeline-opening',
        location: 'location-room',
        pov: 'character-protagonist',
        writing_focus: '主角第一次作出不可逆选择',
        scene_goal: '拿到通行凭证',
        scene_change: '主角从旁观者变成参与者'
      },
      '节纲：主角拒绝退路，接受带有代价的通行凭证。'
    )
    await acceptSceneIntoChapter(root, 'scene-one', '最终正文。')
    await finalizeChapter(root, 'chapter')
    const run = await createRun(root, 'scene-one', { id: 'run-scene-one', status: 'generated' })
    await writeRunFile(root, run, 'prompt.md', 'secret prompt')
    await writeRunFile(root, run, 'output-raw.md', 'candidate')
    await expect(publishChapter(root, 'chapter', '错误章名')).rejects.toThrow('exactly match')
    const result = await publishChapter(root, 'chapter', '第一章')
    expect(result.deleted_run_ids).toEqual(['run-scene-one'])
    expect(await listRuns(root)).toEqual([])
    const scenes = await listDocs<SceneDoc>(root, 'scene')
    expect(scenes[0].content).toContain('节纲：主角拒绝退路')
    expect(scenes[0].content).not.toContain('最终正文')
    expect(scenes[0].data.writing_focus).toBe('主角第一次作出不可逆选择')
    expect(scenes[0].data.scene_goal).toBe('拿到通行凭证')
    expect(scenes[0].data.purged_at).toBeTruthy()
    const prose = (await listDocs<ChapterProseDoc>(root, 'chapter_prose'))[0]
    expect(prose.data.status).toBe('published')
    expect(prose.content).toContain('最终正文。')
    await expect(
      assertDocumentHumanEditable(root, prose.data as unknown as Record<string, unknown>)
    ).rejects.toThrow('永久锁定')
    await expect(
      assertDocumentHumanEditable(root, {
        ...(prose.data as unknown as Record<string, unknown>),
        status: 'draft'
      })
    ).rejects.toThrow('永久锁定')
    await expect(
      assertDocumentDeletable(root, {
        ...(prose.data as unknown as Record<string, unknown>),
        status: 'draft'
      })
    ).rejects.toThrow('永久锁定')
    await expect(readFile(path.join(root, 'runs', 'run-scene-one', 'prompt.md'), 'utf8')).rejects.toThrow()
    await expect(deleteStoryNode(root, { type: 'scene', id: 'scene-one' })).rejects.toThrow('已发布')
    await expect(deleteStoryNode(root, { type: 'outline', id: 'volume' })).rejects.toThrow('已发布')
  })

  it('deletes an unpublished outline branch with its prose, scenes, and runs', async () => {
    const root = await fixture()
    await createScene(root, '第一节', {
      id: 'scene-one',
      chapter_id: 'chapter',
      section: 'chapter',
      order: 0,
      timeline_node: 'timeline-opening',
      location: 'location-room',
      pov: 'character-protagonist'
    })
    await acceptSceneIntoChapter(root, 'scene-one', '可删除的正文。')
    await finalizeChapter(root, 'chapter')
    const run = await createRun(root, 'scene-one', { id: 'run-to-delete', status: 'accepted' })
    await writeRunFile(root, run, 'output-accepted.md', '可删除的正文。')

    const result = await deleteStoryNode(root, { type: 'outline', id: 'volume' })

    expect(result.deleted_outline_ids).toEqual(expect.arrayContaining(['volume', 'part', 'chapter']))
    expect(result.deleted_scene_ids).toEqual(['scene-one'])
    expect(result.deleted_run_ids).toEqual(['run-to-delete'])
    expect(new Set((await listDocs<OutlineDoc>(root, 'outline')).map((item) => item.data.id))).toEqual(
      new Set(['overview', 'book'])
    )
    expect(await listDocs<SceneDoc>(root, 'scene')).toEqual([])
    expect(await listDocs<ChapterProseDoc>(root, 'chapter_prose')).toEqual([])
    expect(await listRuns(root)).toEqual([])
  })

  it('deletes an accepted section before publication and keeps manually editable chapter prose', async () => {
    const root = await fixture()
    await createScene(root, '第一节', {
      id: 'scene-one',
      chapter_id: 'chapter',
      section: 'chapter',
      order: 0,
      timeline_node: 'timeline-opening',
      location: 'location-room',
      pov: 'character-protagonist'
    })
    await acceptSceneIntoChapter(root, 'scene-one', '已经写入章正文的文字。')

    const result = await deleteStoryNode(root, { type: 'scene', id: 'scene-one' })
    const lifecycle = await loadChapterLifecycle(root, 'chapter')

    expect(result.deleted_scene_ids).toEqual(['scene-one'])
    expect(lifecycle.scenes).toEqual([])
    expect(lifecycle.prose.data.scene_ids).toEqual([])
    expect(lifecycle.prose.content).toContain('已经写入章正文的文字。')
  })

  it('reconstructs a legacy scene outline instead of retaining legacy accepted prose at publication', async () => {
    const root = await fixture()
    await createScene(
      root,
      '旧第一节',
      {
        id: 'legacy-scene',
        chapter_id: 'chapter',
        section: 'chapter',
        order: 0,
        status: 'final',
        accepted_at: '2026-01-01T00:00:00.000Z',
        timeline_node: 'timeline-opening',
        location: 'location-room',
        pov: 'character-protagonist',
        writing_focus: '守住证据',
        scene_goal: '带走账册',
        outline_content: ''
      },
      '这是旧版本混在节文件中的已接受正文，不应在发布后继续保留。'
    )
    const lifecycle = await loadChapterLifecycle(root, 'chapter')
    await writeMarkdown(
      lifecycle.prose.path,
      {
        ...lifecycle.prose.data,
        scene_ids: ['legacy-scene']
      },
      '这是最终章正文。'
    )
    await finalizeChapter(root, 'chapter')
    await publishChapter(root, 'chapter', '第一章')

    const [scene] = await listDocs<SceneDoc>(root, 'scene')
    expect(scene.content).toContain('旧第一节 节纲')
    expect(scene.content).toContain('写作重点：守住证据')
    expect(scene.content).not.toContain('旧版本混在节文件中的已接受正文')
  })
})
