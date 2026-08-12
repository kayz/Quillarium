import { describe, expect, it } from 'vitest'
import { makeId, slugify, timestampId } from './ids.js'

describe('document identifiers', () => {
  it('normalizes whitespace and removes unsafe filename characters', () => {
    expect(slugify('  第一章  雨夜 / 危机:*?"<>|#^[]{}%`  ')).toBe('第一章-雨夜-危机')
    expect(slugify('alpha---beta    gamma')).toBe('alpha-beta-gamma')
    expect(slugify('***')).toBe('untitled')
  })

  it('limits slugs to 80 characters without a trailing separator', () => {
    expect(slugify(`${'a'.repeat(79)} -- tail`)).toBe('a'.repeat(79))
    expect(slugify('中'.repeat(100))).toBe('中'.repeat(80))
  })

  it('creates lowercase, prefix-scoped, unique ids', () => {
    const title = 'Unique ID Fixture 4E9F6A'
    const first = makeId('scene', title)
    const second = makeId('scene', title)
    const otherPrefix = makeId('outline', title)

    expect(first).toBe('scene-unique-id-fixture-4e9f6a')
    expect(second).toBe('scene-unique-id-fixture-4e9f6a-2')
    expect(otherPrefix).toBe('outline-unique-id-fixture-4e9f6a')
    expect(new Set([first, second, otherPrefix])).toHaveLength(3)
  })

  it('formats deterministic timestamp ids with default and custom prefixes', () => {
    const date = new Date(2024, 0, 2, 3, 4, 5)

    expect(timestampId(undefined, date)).toBe('run-20240102-030405')
    expect(timestampId('review', date)).toBe('review-20240102-030405')
  })
})
