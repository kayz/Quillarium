import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import {
  collectTagSuggestions,
  displayTag,
  findTagMatches,
  indexableValues,
  normalizeTag
} from './tag-index.js'

const docs: DocEntry[] = [
  {
    path: 'world/harbor.md',
    data: {
      id: 'world-harbor',
      type: 'world_entry',
      title: '河港制度',
      status: 'active',
      tags: ['制度'],
      triggers: ['通行证', '#河港'],
      category_tags: ['交通']
    },
    content: '正文也提到蜂鸣，但它不应被当作标签。'
  },
  {
    path: 'characters/boatman.md',
    data: {
      id: 'char-boatman',
      type: 'character',
      title: '摆渡人',
      status: 'active',
      tags: ['河港'],
      aliases: ['老舟'],
      role: 'supporting'
    },
    content: ''
  },
  {
    path: 'issues/permit.md',
    data: {
      id: 'issue-permit',
      type: 'issue',
      title: '通行证归属待定',
      status: 'open',
      tags: ['通行证'],
      priority: 'high'
    },
    content: ''
  }
]

describe('tag index', () => {
  it('normalizes optional hash markers and renders a single visual hash', () => {
    expect(normalizeTag('  #河港 ')).toBe('河港')
    expect(displayTag('#河港')).toBe('#河港')
    expect(displayTag('河港')).toBe('#河港')
  })

  it('indexes tag, trigger and category fields without scanning Markdown prose', () => {
    expect(indexableValues(docs[0].data)).toEqual(
      expect.arrayContaining([
        { field: 'tags', value: '制度' },
        { field: 'triggers', value: '通行证' },
        { field: 'category_tags', value: '交通' }
      ])
    )
    expect(findTagMatches(docs, '蜂鸣')).toEqual([])
  })

  it('returns all exact cross-type matches and the fields that matched', () => {
    const matches = findTagMatches(docs, '#河港')
    expect(matches.map(({ doc }) => doc.data.id)).toEqual(['char-boatman', 'world-harbor'])
    expect(matches.find(({ doc }) => doc.data.id === 'world-harbor')?.fields).toEqual(['triggers'])
    expect(matches.find(({ doc }) => doc.data.id === 'char-boatman')?.fields).toEqual(['tags'])
  })

  it('deduplicates suggestions across hash spelling variants', () => {
    expect(collectTagSuggestions(docs).filter((value) => value === '河港')).toHaveLength(1)
  })

  it('indexes category, kind and scope values as clickable category tags', () => {
    const categorized: DocEntry[] = [
      {
        path: 'strategy/pace.md',
        data: { id: 'strategy-pace', type: 'strategy', title: '加速', status: 'active', category: 'pacing' },
        content: ''
      },
      {
        path: 'patterns/pace.md',
        data: {
          id: 'pattern-pace',
          type: 'pattern',
          title: '短场景',
          status: 'active',
          kind: 'story',
          scope: 'chapter'
        },
        content: ''
      }
    ]
    expect(findTagMatches(categorized, 'pacing').map(({ doc }) => doc.data.id)).toEqual(['strategy-pace'])
    expect(findTagMatches(categorized, 'chapter').map(({ doc }) => doc.data.id)).toEqual(['pattern-pace'])
  })
})
