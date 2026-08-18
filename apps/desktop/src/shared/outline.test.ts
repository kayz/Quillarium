import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../app/types.js'
import { buildOutlineHierarchy, compareStoryEntries, nextWorkLevel, outlineLevelLabel } from './outline.js'

function outline(id: string, level: string, parent: string | null, title = id): DocEntry {
  return {
    path: `outlines/${id}.md`,
    data: { id, type: 'outline', title, status: 'draft', level, parent },
    content: ''
  }
}

describe('writing hierarchy', () => {
  it('links a legacy unparented child to the preferred parent level', () => {
    const docs = [
      outline('book-index', 'book', null, 'Project overview'),
      outline('book-plan', 'book', null, 'Project 总纲'),
      outline('volume-one', 'volume', null, 'Volume one')
    ]
    const hierarchy = buildOutlineHierarchy(docs)

    expect(hierarchy.children.get('book-plan')?.map((item) => item.data.id)).toEqual(['volume-one'])
    expect(
      hierarchy.children
        .get(null)
        ?.map((item) => item.data.id)
        .sort()
    ).toEqual(['book-index', 'book-plan'])
  })

  it('places AI writing after chapter outlines', () => {
    expect(nextWorkLevel('book')).toBe('volume')
    expect(nextWorkLevel('volume')).toBe('part')
    expect(nextWorkLevel('part')).toBe('act')
    expect(nextWorkLevel('act')).toBe('chapter')
    expect(nextWorkLevel('chapter')).toBe('ai')
    expect(outlineLevelLabel('ai')).toBe('AI 编写')
  })

  it('uses story-node names without appending the outline suffix', () => {
    expect(['volume', 'part', 'act', 'chapter', 'section'].map(outlineLevelLabel)).toEqual([
      '卷',
      '篇',
      '幕',
      '章',
      '节'
    ])
  })

  it('uses one sibling order across mixed levels with a stable legacy fallback', () => {
    const directChapter = outline('chapter-a', 'chapter', 'part', 'Chapter')
    directChapter.data.order = 0
    const act = outline('act-z', 'act', 'part', 'Act')
    act.data.order = 1
    expect([act, directChapter].sort(compareStoryEntries).map((item) => item.data.id)).toEqual([
      'chapter-a',
      'act-z'
    ])

    act.data.order = 0
    expect([act, directChapter].sort(compareStoryEntries).map((item) => item.data.id)).toEqual([
      'act-z',
      'chapter-a'
    ])
  })
})
