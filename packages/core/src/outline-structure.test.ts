import { describe, expect, it } from 'vitest'
import { assertOutlinePlacementAgainst, inferUniqueLegacyOutlineParent } from './outline-structure.js'
import type { OutlineDoc } from './types.js'

function outline(id: string, level: OutlineDoc['level'], parent: string | null = null): OutlineDoc {
  return {
    id,
    type: 'outline',
    schema_version: 1,
    title: id,
    status: 'draft',
    tags: [],
    level,
    parent,
    order: 0,
    story_purpose: '',
    core_characters: [],
    central_conflict: '',
    final_direction: '',
    worldline_axis: '',
    character_destiny_axis: '',
    key_stages: [],
    causal_chain: [],
    final_state: '',
    stage_goal: '',
    irreversible_change: '',
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
    related_timeline: [],
    related_characters: [],
    related_events: [],
    related_foreshadowing: [],
    world_entries_used: [],
    foreshadowing_planted: [],
    foreshadowing_resolved: [],
    related_patterns: []
  }
}

describe('seven-level outline placement', () => {
  const outlines = [
    outline('overview', 'overview'),
    outline('book', 'book'),
    outline('volume', 'volume', 'book'),
    outline('part', 'part', 'volume'),
    outline('act', 'act', 'part'),
    outline('direct-chapter', 'chapter', 'part'),
    outline('act-chapter', 'chapter', 'act')
  ]

  it('accepts a chapter directly under a part or under an optional act', () => {
    expect(() => assertOutlinePlacementAgainst(outlines, 'chapter', 'part')).not.toThrow()
    expect(() => assertOutlinePlacementAgainst(outlines, 'chapter', 'act')).not.toThrow()
  })

  it('rejects missing, multiple-root, and invalid parent relationships', () => {
    expect(() => assertOutlinePlacementAgainst(outlines, 'chapter', null)).toThrow('requires a parent')
    expect(() => assertOutlinePlacementAgainst(outlines, 'chapter', 'volume')).toThrow('expected part or act')
    expect(() => assertOutlinePlacementAgainst(outlines, 'act', 'act')).toThrow('cannot belong to act')
    expect(() => assertOutlinePlacementAgainst(outlines, 'overview', null)).toThrow('already has a overview')
  })

  it('normalizes the legacy arc level to part while enforcing a volume parent', () => {
    expect(() => assertOutlinePlacementAgainst(outlines, 'arc', 'volume')).not.toThrow()
    expect(() => assertOutlinePlacementAgainst(outlines, 'arc', 'book')).toThrow('expected volume')
  })

  it('repairs a legacy orphan only when its legal parent is unambiguous', () => {
    expect(inferUniqueLegacyOutlineParent(outlines, 'volume', null, 'volume')).toBe('book')
    expect(inferUniqueLegacyOutlineParent(outlines, 'volume', 'book', 'volume')).toBe('book')
    expect(
      inferUniqueLegacyOutlineParent([...outlines, outline('book-two', 'book')], 'volume', null, 'volume')
    ).toBeNull()
  })
})
