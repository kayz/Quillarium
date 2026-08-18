import { describe, expect, it } from 'vitest'
import { boundedPage } from './bounded-page.js'

describe('boundedPage', () => {
  it('keeps the rendered window bounded and preserves source ordering', () => {
    const items = Array.from({ length: 185 }, (_, index) => `card-${index + 1}`)
    const page = boundedPage(items, 2, 48)

    expect(page.items).toHaveLength(48)
    expect(page.items[0]).toBe('card-97')
    expect(page.items.at(-1)).toBe('card-144')
    expect(page.pageCount).toBe(4)
    expect(page.start).toBe(96)
    expect(page.end).toBe(144)
  })

  it('clamps stale page indexes after a filter shrinks the result set', () => {
    const page = boundedPage(['one', 'two', 'three'], 99, 2)

    expect(page.page).toBe(1)
    expect(page.items).toEqual(['three'])
  })
})
