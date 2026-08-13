import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { StructureTree } from './WorkspaceNavigation.js'

function outline(id: string, level: string, parent: string | null, title: string): DocEntry {
  return {
    path: `outlines/${id}.md`,
    data: { id, type: 'outline', title, status: 'draft', level, parent },
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
})
