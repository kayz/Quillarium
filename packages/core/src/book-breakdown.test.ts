import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptSceneIntoChapter,
  buildBookBreakdownPlan,
  confirmBookBreakdown,
  createOutline,
  createProjectAt,
  createScene,
  listDocs,
  loadChapterLifecycle,
  splitBookBreakdown
} from './index.js'
import type { ChapterProseDoc, OutlineDoc } from './types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function work(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-breakdown-'))
  roots.push(root)
  await createProjectAt(root, {
    id: 'breakdown',
    title: '拆书试样',
    story_structure: { part_enabled: false, act_enabled: false, scene_enabled: true }
  })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  return root
}

const source = [
  '序言留在第一章前面。',
  '第一卷 山雨',
  '第一篇 不建层',
  '# 第一章 夜航',
  '船离开码头。',
  '## 场景',
  '灯还亮着。',
  '第一幕 也不建层',
  '第二章',
  '他回头。',
  '# 第二卷',
  '第三章 进城',
  '城门关了。'
].join('\n')

describe('book breakdown import', () => {
  it('detects volumes and chapters and leaves other headings in the body', () => {
    const units = splitBookBreakdown(source)
    expect(units.map((unit) => `${unit.kind}:${unit.title}`)).toEqual([
      'volume:第一卷 山雨',
      'chapter:第一章 夜航',
      'chapter:第二章',
      'volume:第二卷',
      'chapter:第三章 进城'
    ])
    const first = units.find((unit) => unit.title === '第一章 夜航')
    expect(first?.content).toContain('序言留在第一章前面。')
    expect(first?.content).toContain('第一篇 不建层')
    expect(first?.content).toContain('## 场景')
    expect(first?.content).toContain('第一幕 也不建层')
    expect(first?.volume_title).toBe('第一卷 山雨')
  })

  it('keeps the source in the import record and writes only selected proposals by default', async () => {
    const root = await work()
    const plan = buildBookBreakdownPlan({
      text: source,
      proposals: [
        { type: 'character', title: '船主', content: '夜里开船。' },
        { type: 'item', title: '铜灯', content: '照码头。', selected: false }
      ]
    })
    expect(plan.import_prose).toBe(false)
    expect(plan.units).toEqual([])
    const result = await confirmBookBreakdown(root, plan)
    const record = await readFile(result.record_path, 'utf8')
    expect(record).toContain('序言留在第一章前面。')
    expect(record).not.toContain('夜里开船')
    expect(await listDocs(root, 'character')).toHaveLength(1)
    expect(await listDocs(root, 'item')).toHaveLength(0)
    expect(await listDocs<OutlineDoc>(root, 'outline')).toHaveLength(1)
  })

  it('appends chapter drafts without overwriting existing prose or creating scenes', async () => {
    const root = await work()
    await createOutline(root, 'volume', '第一卷', { id: 'volume-old', parent: 'book' })
    await createOutline(root, 'chapter', '第一章 夜航', { id: 'chapter-old', parent: 'volume-old' })
    const existing = await loadChapterLifecycle(root, 'chapter-old')
    const { writeMarkdown } = await import('./fs.js')
    await writeMarkdown(
      existing.prose.path,
      existing.prose.data as unknown as Record<string, unknown>,
      '旧的章正文。'
    )
    const plan = buildBookBreakdownPlan({
      text: source,
      importProse: true,
      proposals: [{ type: 'character', title: '船主', content: '夜里开船。', selected: true }]
    })
    plan.proposals[0]!.type = 'faction'
    const result = await confirmBookBreakdown(root, plan)
    const record = await readFile(result.record_path, 'utf8')
    expect(record).not.toContain('船离开码头')
    expect(record).not.toContain(source)
    expect(await listDocs(root, 'faction')).toHaveLength(1)
    expect(await listDocs(root, 'character')).toHaveLength(0)
    expect(await listDocs(root, 'scene')).toHaveLength(0)
    const outlines = await listDocs<OutlineDoc>(root, 'outline')
    const old = outlines.find((item) => item.data.id === 'chapter-old')
    expect(old?.data.parent).toBe('volume-old')
    const prose = await listDocs<ChapterProseDoc>(root, 'chapter_prose')
    expect(prose.find((item) => item.data.chapter_id === 'chapter-old')?.content).toContain('旧的章正文。')
    const imported = prose.filter((item) => item.data.chapter_id !== 'chapter-old')
    expect(imported.map((item) => item.data.status)).toEqual(['draft', 'draft', 'draft'])
    expect(imported.some((item) => item.content.includes('## 场景'))).toBe(true)
    const volumes = outlines.filter((item) => item.data.level === 'volume').map((item) => item.data.title)
    expect(volumes).toContain('第一卷')
    expect(volumes).toContain('第一卷 山雨')
    expect(volumes).toContain('第二卷')
    const unnamed = outlines.find((item) => item.data.title === '第三章 进城')
    expect(unnamed?.data.parent).not.toBe('volume-old')
    await createScene(root, '误写的节', {
      id: 'scene-imported',
      chapter_id: imported[0]!.data.chapter_id,
      section: imported[0]!.data.chapter_id,
      order: 0,
      timeline_node: 'time',
      location: 'place',
      pov: 'person'
    })
    await expect(acceptSceneIntoChapter(root, 'scene-imported', '节正文。')).rejects.toThrow('手写')
  })

  it('puts a chapter without a volume name into the first existing volume', async () => {
    const root = await work()
    await createOutline(root, 'volume', '已有卷', { id: 'volume-first', parent: 'book', order: 0 })
    await createOutline(root, 'volume', '后一卷', { id: 'volume-later', parent: 'book', order: 1 })
    const plan = buildBookBreakdownPlan({
      text: '# 第九章\n补在最前面的卷里。',
      importProse: true
    })
    await confirmBookBreakdown(root, plan)
    const outlines = await listDocs<OutlineDoc>(root, 'outline')
    expect(outlines.find((item) => item.data.title === '第九章')?.data.parent).toBe('volume-first')
    expect(outlines.filter((item) => item.data.level === 'volume')).toHaveLength(2)
  })
})
