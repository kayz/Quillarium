import { describe, expect, it } from 'vitest'
import { foreshadowingSchema } from './schema.js'
import { evaluateForeshadowingReminders } from './foreshadowing.js'
import type { ForeshadowingDoc } from './types.js'

describe('evaluateForeshadowingReminders', () => {
  it('matches story nodes, timeline nodes, keywords, and enabled cards deterministically', () => {
    const card = foreshadowingSchema.parse({
      id: 'foreshadow-seal',
      type: 'foreshadowing',
      title: 'The broken seal',
      trigger_conditions: [
        { kind: 'outline_reached', target_id: 'chapter-three', keyword: '' },
        { kind: 'timeline_reached', target_id: 'autumn-node', keyword: '' },
        { kind: 'keyword', target_id: '', keyword: 'black ribbon' },
        { kind: 'card_enabled', target_id: 'world-court-law', keyword: '' }
      ],
      reminder_window: 'before chapter four'
    }) as ForeshadowingDoc

    const reminders = evaluateForeshadowingReminders([card], {
      outline_ids: ['chapter-three'],
      timeline_ids: ['autumn-node'],
      enabled_card_ids: ['world-court-law'],
      text: 'A BLACK RIBBON is found beside the seal.'
    })

    expect(reminders).toHaveLength(1)
    expect(reminders[0]?.matched_conditions.map((condition) => condition.kind)).toEqual([
      'outline_reached',
      'timeline_reached',
      'keyword',
      'card_enabled'
    ])
  })

  it('does not remind for disabled, resolved, or unmatched cards', () => {
    const base = {
      type: 'foreshadowing' as const,
      title: 'A clue',
      trigger_conditions: [{ kind: 'keyword' as const, target_id: '', keyword: 'lantern' }]
    }
    const cards = [
      foreshadowingSchema.parse({ ...base, id: 'disabled', enabled: false }) as ForeshadowingDoc,
      foreshadowingSchema.parse({ ...base, id: 'resolved', state: 'resolved' }) as ForeshadowingDoc,
      foreshadowingSchema.parse({ ...base, id: 'unmatched' }) as ForeshadowingDoc
    ]

    expect(
      evaluateForeshadowingReminders(cards, {
        outline_ids: [],
        timeline_ids: [],
        enabled_card_ids: [],
        text: 'No matching phrase.'
      })
    ).toEqual([])
  })
})

describe('foreshadowing story-time positions', () => {
  it('stores stable timeline/node references without discarding legacy free text', () => {
    const parsed = foreshadowingSchema.parse({
      id: 'foreshadow-harbor-bell',
      type: 'foreshadowing',
      title: 'Harbor bell',
      planned_plant: '旧稿：第二章傍晚',
      planned_plant_ref: {
        timeline_id: 'main-story',
        target_type: 'timeline_event',
        target_id: 'event-harbor-curfew',
        display_name: '港口宵禁钟响',
        outline_id: 'scene-2-3'
      }
    }) as ForeshadowingDoc

    expect(parsed.planned_plant).toBe('旧稿：第二章傍晚')
    expect(parsed.planned_plant_ref).toEqual({
      timeline_id: 'main-story',
      target_type: 'timeline_event',
      target_id: 'event-harbor-curfew',
      display_name: '港口宵禁钟响',
      outline_id: 'scene-2-3'
    })
    expect(parsed.planned_resolve_ref).toBeNull()
  })
})
