import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import {
  filterPlanningCardOptions,
  nextPlanningCardIndex,
  planningCardSelectorOptions,
  planningCardVirtualWindow
} from './PlanningCardSelector.js'

function doc(id: string, title: string, type: string, aliases: string[] = [], tags: string[] = []): DocEntry {
  return { path: `${id}.md`, data: { id, title, type, aliases, tags }, content: '' }
}

describe('PlanningCardSelector', () => {
  const options = planningCardSelectorOptions([
    doc('char-qin', '秦浩', 'character', ['老秦'], ['主角']),
    doc('lore-river', '运河制度', 'world_entry', ['漕运'], ['经济'])
  ])

  it('filters by title, stable ID, alias, tag, and type while retaining stable IDs', () => {
    expect(filterPlanningCardOptions(options, '秦浩').map((item) => item.id)).toEqual(['char-qin'])
    expect(filterPlanningCardOptions(options, 'lore-river').map((item) => item.id)).toEqual(['lore-river'])
    expect(filterPlanningCardOptions(options, '老秦').map((item) => item.id)).toEqual(['char-qin'])
    expect(filterPlanningCardOptions(options, '经济').map((item) => item.id)).toEqual(['lore-river'])
    expect(filterPlanningCardOptions(options, 'world_entry').map((item) => item.id)).toEqual(['lore-river'])
    expect(options[0]?.id).not.toBe(options[0]?.title)
  })

  it('bounds large result sets to a virtual window', () => {
    expect(planningCardVirtualWindow(10_000, 0)).toEqual({ start: 0, end: 10, top: 0, bottom: 579_420 })
    const middle = planningCardVirtualWindow(10_000, 58 * 5_000)
    expect(middle.end - middle.start).toBeLessThanOrEqual(10)
    expect(middle.top + middle.bottom).toBeLessThan(58 * 10_000)
  })

  it('wraps keyboard movement without using array indexes as saved values', () => {
    expect(nextPlanningCardIndex(-1, 'next', 2)).toBe(0)
    expect(nextPlanningCardIndex(0, 'previous', 2)).toBe(1)
    expect(nextPlanningCardIndex(1, 'next', 2)).toBe(0)
  })
})
