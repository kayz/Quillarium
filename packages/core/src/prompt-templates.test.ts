import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEditableScenePromptPlan } from './chapter.js'
import { createOutline, createReference, createScene, createWorldEntry, requireDoc } from './documents.js'
import { createProjectAt } from './project.js'
import { readText, writeMarkdown } from './fs.js'
import {
  listPromptTemplates,
  savePromptTemplate,
  saveScenePromptLayout,
  setCurrentPromptTemplate
} from './prompt-templates.js'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function work(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-prompt-template-'))
  roots.push(root)
  await createProjectAt(root, { id: 'prompt-template', title: 'Prompt Template' })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', '第一篇', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', '第一章', { id: 'chapter', parent: 'part' })
  return root
}

describe('prompt templates', () => {
  it('uses only the structural segments when the scene outline is empty', async () => {
    const root = await work()
    await createScene(root, '空节', {
      id: 'scene',
      chapter_id: 'chapter',
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person'
    })
    await createWorldEntry(root, '潮汐', { id: 'world-tide' }, '涨潮时不能出海。')
    const plan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' })
    expect([...new Set(plan.sources.map((source) => source.kind))]).toEqual([
      'instruction',
      'outline',
      'scene-outline'
    ])
    expect(plan.prompt).not.toContain('涨潮时不能出海')
  })

  it('keeps an arranged scene order and refreshes segment text without writing it back', async () => {
    const root = await work()
    await createScene(root, '有纲的节', {
      id: 'scene',
      chapter_id: 'chapter',
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person',
      writing_focus: '把潮汐写进出发。',
      world_entries_used: ['world-tide']
    })
    await createWorldEntry(root, '潮汐', { id: 'world-tide' }, '旧的潮汐说明。')
    await saveScenePromptLayout(root, 'scene', [
      { kind: 'instruction', source_type: 'prompt_asset', source_id: 'prose-scene-draft' },
      { kind: 'world', source_type: 'world_entry', source_id: 'world-tide' },
      { kind: 'scene-outline', source_type: 'scene', source_id: 'scene' }
    ])
    const { readMarkdown } = await import('./fs.js')
    const files = await import('node:fs/promises')
    const listed = await files.readdir(path.join(root, 'world'), { recursive: true })
    const worldFile = listed.map(String).find((name) => name.includes('world-tide'))
    expect(worldFile).toBeTruthy()
    const full = path.join(root, 'world', worldFile!)
    const stored = await readMarkdown<Record<string, unknown>>(full)
    await writeMarkdown(full, stored.data, '新的潮汐说明。')

    const plan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' })
    expect(plan.sources.map((source) => source.kind)).toEqual(['instruction', 'world', 'scene-outline'])
    expect(plan.prompt.indexOf('新的潮汐说明')).toBeLessThan(plan.prompt.indexOf('有纲的节'))
    expect(plan.prompt).not.toContain('旧的潮汐说明')
    const again = await readMarkdown<Record<string, unknown>>(full)
    expect(again.content).toContain('新的潮汐说明')
    expect(again.content).not.toContain('【')
  })

  it('stores only segment kinds in the work template', async () => {
    const root = await work()
    const saved = await savePromptTemplate(root, '夜航', ['instruction', 'outline', 'world', 'world'])
    const templates = await listPromptTemplates(root)
    expect(templates).toEqual([
      expect.objectContaining({ title: '夜航', current: true, segments: saved.segments })
    ])
    const raw = await readFile(path.join(root, 'prompt-templates', `${saved.id}.md`), 'utf8')
    expect(raw).toContain('segments:')
    expect(raw).not.toContain('content:')
    expect(saved.segments).toEqual(['instruction', 'outline', 'world', 'world'])
  })

  it('switches the current template and leaves an arranged scene untouched', async () => {
    const root = await work()
    await createScene(root, '已排的节', {
      id: 'scene',
      chapter_id: 'chapter',
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person',
      writing_focus: '保持原来的顺序。'
    })
    await saveScenePromptLayout(root, 'scene', [
      { kind: 'instruction', source_type: 'prompt_asset', source_id: 'prose-scene-draft' },
      { kind: 'scene-outline', source_type: 'scene', source_id: 'scene' }
    ])
    const sceneFile = (await requireDoc(root, 'scene')).path
    const before = await readText(sceneFile)
    const first = await savePromptTemplate(root, '甲', ['instruction', 'outline'])
    await savePromptTemplate(root, '乙', ['instruction', 'world'])
    const current = await setCurrentPromptTemplate(root, first.id)
    expect(current).toMatchObject({ id: first.id, current: true })
    const listed = await listPromptTemplates(root)
    expect(listed.find((template) => template.id === first.id)?.current).toBe(true)
    expect(listed.filter((template) => template.current)).toHaveLength(1)
    expect(await readText(sceneFile)).toBe(before)
    await expect(setCurrentPromptTemplate(root, 'missing')).rejects.toThrow('找不到这份提示词模板')
  })

  it('sends segments in the author order instead of the compiler kind order', async () => {
    const root = await work()
    await createScene(root, '顺序节', {
      id: 'scene',
      chapter_id: 'chapter',
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person',
      writing_focus: '先看附近章节。'
    })
    await createReference(root, '文风笔记', { id: 'ref-voice' }, '句子要短。')
    const plan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' }, {}, [
      {
        id: 'document:reference:ref-voice',
        source_type: 'reference',
        source_id: 'ref-voice',
        mode: 'preferred',
        usage: 'subject',
        text: '这一次改成：句子可以长。'
      },
      {
        id: 'instruction',
        source_type: 'prompt_asset',
        source_id: 'prose-scene-draft',
        mode: 'required',
        usage: 'style'
      }
    ])
    expect(plan.prompt.indexOf('这一次改成：句子可以长。')).toBeLessThan(
      plan.prompt.indexOf('只输出当前节的纯文字正文')
    )
    expect(plan.sources.map((source) => source.id)).toEqual(['document:reference:ref-voice', 'instruction'])
    const referenceFile = path.join(root, 'references')
    const names = await import('node:fs/promises').then((files) =>
      files.readdir(referenceFile, { recursive: true })
    )
    const file = names.map(String).find((name) => name.includes('ref-voice'))
    const raw = await readFile(path.join(referenceFile, file!), 'utf8')
    expect(raw).toContain('句子要短。')
    expect(raw).not.toContain('这一次改成')
  })

  it('fills the template with writing guidance and leaves archived references out', async () => {
    const root = await work()
    await createScene(root, '有文风的节', {
      id: 'scene',
      chapter_id: 'chapter',
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person',
      writing_focus: '用短句写出发。'
    })
    await createReference(root, '史料归档', { id: 'archive' }, '不要进提示词。')
    await createReference(root, '文风', { id: 'voice', prompt_material: true }, '句子要短。')
    const plan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' })
    expect(plan.prompt).toContain('句子要短。')
    expect(plan.prompt).not.toContain('不要进提示词')
    expect(plan.sources.some((source) => source.source_id === 'voice')).toBe(true)
    expect(plan.sources.some((source) => source.source_id === 'archive')).toBe(false)
  })

  it('only includes writing guidance relevant to the scene outline and ignores irrelevant guidance', async () => {
    const root = await work()
    await createScene(root, '风暴之夜', {
      id: 'scene',
      chapter_id: 'chapter',
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person',
      writing_focus: '写海风与文风节奏。'
    })
    await createReference(root, '文风', { id: 'voice', prompt_material: true }, '短句为主。')
    await createReference(root, '太空战术', { id: 'space-tactics', prompt_material: true }, '光速折跃。')
    const plan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' })
    expect(plan.sources.some((source) => source.source_id === 'voice')).toBe(true)
    expect(plan.sources.some((source) => source.source_id === 'space-tactics')).toBe(false)

    // Hand-selected sources still allow including space-tactics
    const handSelectedPlan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' }, {}, [
      {
        id: 'document:reference:space-tactics',
        source_type: 'reference',
        source_id: 'space-tactics',
        mode: 'preferred',
        usage: 'subject'
      }
    ])
    expect(handSelectedPlan.sources.some((source) => source.source_id === 'space-tactics')).toBe(true)
  })
})
