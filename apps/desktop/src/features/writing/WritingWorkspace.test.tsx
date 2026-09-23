import { describe, expect, it } from 'vitest'
import { shouldShowOrganizeOutline } from './WritingWorkspace.js'

describe('shouldShowOrganizeOutline', () => {
  it('shows for book, volume, part, and act', () => {
    expect(shouldShowOrganizeOutline('book')).toBe(true)
    expect(shouldShowOrganizeOutline('volume')).toBe(true)
    expect(shouldShowOrganizeOutline('part')).toBe(true)
    expect(shouldShowOrganizeOutline('act')).toBe(true)
  })

  it('hides for overview, chapter, and undefined', () => {
    expect(shouldShowOrganizeOutline('overview')).toBe(false)
    expect(shouldShowOrganizeOutline('chapter')).toBe(false)
    expect(shouldShowOrganizeOutline(undefined)).toBe(false)
  })
})
