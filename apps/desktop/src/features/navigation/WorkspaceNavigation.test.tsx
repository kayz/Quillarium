import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { buildStoryDirectionRequest, buildStoryDropRequest, StructureTree } from './WorkspaceNavigation.js'

function outline(id: string, level: string, parent: string | null, title: string, order = 0): DocEntry {
  return {
    path: `outlines/${id}.md`,
    data: { id, type: 'outline', title, status: 'draft', level, parent, order },
    content: ''
  }
}

describe('StructureTree', () => {
  it('renders the complete outline hierarchy and AI writing below its chapter', () => {
    const docs = [
      outline('book', 'book', null, '全书总纲'),
      outline('volume', 'volume', 'book', '第一卷'),
      outline('part', 'part', 'volume', '第一篇'),
      outline('act', 'act', 'part', '第一幕'),
      outline('chapter', 'chapter', 'act', '第一章'),
      {
        path: 'scenes/scene-one.md',
        data: {
          id: 'scene-one',
          type: 'scene',
          title: '第一节',
          status: 'draft',
          chapter_id: 'chapter',
          section: 'chapter'
        },
        content: ''
      }
    ]
    const html = renderToStaticMarkup(
      <StructureTree docs={docs} selectedTarget={null} onSelect={() => undefined} language="zh" />
    )

    const positions = [
      '总纲 · 全书总纲',
      '卷 · 第一卷',
      '篇 · 第一篇',
      '幕 · 第一幕',
      '章 · 第一章',
      '章正文 · 草稿',
      '节 · 第一节',
      '节管理 / AI 编写'
    ].map((label) => html.indexOf(label))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('keeps mixed direct children and scenes in order and builds scoped mouse/keyboard requests', () => {
    const docs: DocEntry[] = [
      outline('book', 'book', null, '总纲', 0),
      outline('volume', 'volume', 'book', '卷', 0),
      outline('part', 'part', 'volume', '篇', 0),
      outline('act', 'act', 'part', '幕', 1),
      outline('chapter-direct', 'chapter', 'part', '直属章', 0),
      outline('chapter-nested', 'chapter', 'act', '幕内章', 0),
      {
        path: 'scenes/scene-b.md',
        data: {
          id: 'scene-b',
          type: 'scene',
          title: '第二节',
          status: 'draft',
          chapter_id: 'chapter-direct',
          section: 'chapter-direct',
          order: 1
        },
        content: ''
      },
      {
        path: 'scenes/scene-a.md',
        data: {
          id: 'scene-a',
          type: 'scene',
          title: '第一节',
          status: 'draft',
          chapter_id: 'chapter-direct',
          section: 'chapter-direct',
          order: 0
        },
        content: ''
      }
    ]
    const html = renderToStaticMarkup(
      <StructureTree
        docs={docs}
        selectedTarget={null}
        onSelect={() => undefined}
        onReorder={() => undefined}
        language="zh"
      />
    )
    expect(html.indexOf('章 · 直属章')).toBeLessThan(html.indexOf('幕 · 幕'))
    expect(html.indexOf('节 · 第一节')).toBeLessThan(html.indexOf('节 · 第二节'))
    expect(html).toContain('拖动“直属章”排序；按上下方向键移动')

    expect(buildStoryDirectionRequest(docs, { kind: 'scene', id: 'scene-b' }, 'up')).toMatchObject({
      node: { kind: 'scene', id: 'scene-b' },
      direction: 'up',
      expected_siblings: [
        { kind: 'scene', id: 'scene-a', order: 0 },
        { kind: 'scene', id: 'scene-b', order: 1 }
      ]
    })
    expect(
      buildStoryDropRequest(
        docs,
        { kind: 'outline', id: 'chapter-direct' },
        { kind: 'outline', id: 'act' },
        'after'
      )
    ).toMatchObject({ placement: 'after' })
    expect(
      buildStoryDropRequest(
        docs,
        { kind: 'outline', id: 'chapter-direct' },
        { kind: 'outline', id: 'chapter-nested' },
        'after'
      )
    ).toBeNull()
  })
})
