import { describe, expect, it } from 'vitest'
import {
  chapterNumberForOutline,
  timelineEventCoversChapter,
  timelineIdsForOutline
} from './chapter-relations.js'
import type { OutlineDoc, TimelineEventDoc } from './types.js'

function chapter(title: string, order = 0, related_timeline: string[] = []): OutlineDoc {
  return {
    id: 'chapter-one',
    type: 'outline',
    schema_version: 1,
    title,
    status: 'draft',
    tags: [],
    level: 'chapter',
    parent: null,
    order,
    reader_promise: '',
    reader_payoff: '',
    reader_benefit: '',
    core_appeal: [],
    core_suspense: [],
    genre_boundary: [],
    volume_goal: '',
    event_chain: [],
    character_growth: [],
    story_cycles: [],
    conflict_ladder: [],
    cast_lock: [],
    fixed_reveals: [],
    chapter_goal: '',
    chapter_conflict: '',
    chapter_change: '',
    ending_hook: '',
    invariants: [],
    narrative_function: '',
    emotional_curve: '',
    povs: [],
    start_state: '',
    end_state: '',
    context_pins: [],
    context_exclusions: [],
    related_timeline,
    related_characters: [],
    related_events: [],
    related_foreshadowing: [],
    world_entries_used: [],
    foreshadowing_planted: [],
    foreshadowing_resolved: [],
    related_patterns: []
  }
}

function event(id: string, content: string): { data: TimelineEventDoc; content: string } {
  return {
    data: {
      id,
      type: 'timeline_event',
      schema_version: 1,
      title: id,
      status: 'confirmed',
      tags: [],
      enabled: true,
      source_refs: [],
      relations: [],
      timeline_node: null,
      date: '',
      previous: null,
      next: null,
      duration: '',
      location: null,
      characters: []
    },
    content
  }
}

describe('chapter timeline relations', () => {
  it('matches the first chapter to a timeline body range written as 1-3', () => {
    const outline = chapter('第一章 初临大明')
    expect(chapterNumberForOutline(outline)).toBe(1)
    expect(timelineIdsForOutline(outline, [event('opening', '## Event\n关联章节: 1-3\n备注: 开篇')])).toEqual(
      ['opening']
    )
  })

  it('supports Chinese chapter ranges and rejects chapters outside the range', () => {
    expect(timelineEventCoversChapter('关联章节：第一章至第三章', 2)).toBe(true)
    expect(timelineEventCoversChapter('关联章节：第一章至第三章', 4)).toBe(false)
  })

  it('keeps explicit structured timeline relations authoritative', () => {
    const outline = chapter('第一章', 0, ['explicit'])
    expect(timelineIdsForOutline(outline, [event('inferred', '关联章节: 1-3')])).toEqual(['explicit'])
  })
})
