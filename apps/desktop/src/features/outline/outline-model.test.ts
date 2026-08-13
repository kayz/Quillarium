import { describe, expect, it } from 'vitest'
import type { DocEntry, ProjectListItem } from '../../app/types.js'
import { createInputForOutlineSection, docTypeLabel, structuredLineForSection } from './outline-model.js'

const project: ProjectListItem = {
  root: 'C:/workspace/projects/sample',
  id: 'sample',
  aliases: [],
  title: '示例作品',
  genre: 'fiction',
  target_words: 100_000,
  chapter_words: 3_000,
  section_words: 1_000
}

function book(id: string, title: string): DocEntry {
  return {
    path: `outlines/${id}.md`,
    data: { id, type: 'outline', title, level: 'book', parent: null, status: 'draft' },
    content: ''
  }
}

describe('outline creation input', () => {
  it('places a new volume under the preferred book outline when multiple book documents exist', () => {
    const input = createInputForOutlineSection(
      'volumes',
      '第一卷',
      [book('book-overview', '项目总览'), book('book-outline', '作品总纲')],
      project
    )

    expect(input.data.parent).toBe('book-outline')
  })

  it('localizes outline levels, field labels, and enum values in collection summaries', () => {
    const volume = {
      ...book('volume-one', 'First volume'),
      data: { ...book('volume-one', 'First volume').data, level: 'volume' }
    }
    const worldEntry: DocEntry = {
      path: 'world/example.md',
      data: {
        id: 'world-one',
        type: 'world_entry',
        title: 'Signal tower',
        status: 'active',
        triggers: ['beacon'],
        role: 'both',
        valid_from: 'Opening'
      },
      content: ''
    }

    expect(docTypeLabel(volume, 'en')).toBe('Volume')
    expect(structuredLineForSection(worldEntry, 'zh')).toContain('设定作用: 约束与质感')
    expect(structuredLineForSection(worldEntry, 'en')).toContain('World-entry role: Both')
    expect(structuredLineForSection(worldEntry, 'zh')).not.toContain('role')
  })
})
