import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../app/types.js'
import {
  buildOutlineHierarchy,
  childWorkLevels,
  compareStoryEntries,
  nextWorkLevel,
  outlineItemsForLevel,
  outlineLevelLabel,
  parentLevelsForWorkLevel
} from './outline.js'

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

  it('flattens disabled part and act levels in memory while preserving their documents', () => {
    const docs = [
      outline('book', 'book', null),
      outline('volume', 'volume', 'book'),
      outline('part', 'part', 'volume'),
      outline('act', 'act', 'part'),
      outline('chapter', 'chapter', 'act')
    ]
    const flat = buildOutlineHierarchy(docs, {
      part_enabled: false,
      act_enabled: false,
      scene_enabled: false
    })

    expect(flat.children.get('volume')?.map((item) => item.data.id)).toEqual(['chapter'])
    expect(flat.disabledOutlines.map((item) => item.data.id).sort()).toEqual(['act', 'part'])
    expect(docs.find((item) => item.data.id === 'chapter')?.data.parent).toBe('act')
    expect(nextWorkLevel('volume', { part_enabled: false, act_enabled: false, scene_enabled: false })).toBe(
      'chapter'
    )
    expect(
      nextWorkLevel('chapter', { part_enabled: false, act_enabled: false, scene_enabled: false })
    ).toBeNull()
    expect(
      childWorkLevels('volume', { part_enabled: false, act_enabled: false, scene_enabled: false })
    ).toEqual(['chapter'])
    expect(
      parentLevelsForWorkLevel('chapter', {
        part_enabled: false,
        act_enabled: false,
        scene_enabled: false
      })
    ).toEqual(['volume'])
    expect(
      outlineItemsForLevel(
        docs,
        'chapter',
        docs.find((item) => item.data.id === 'volume') ?? null,
        { type: 'outline', id: 'volume' },
        { part_enabled: false, act_enabled: false, scene_enabled: false }
      ).map((item) => item.data.id)
    ).toEqual(['chapter'])
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
