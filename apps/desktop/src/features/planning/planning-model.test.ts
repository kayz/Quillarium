import { describe, expect, it } from 'vitest'
import { OUTLINE_HOME_SECTIONS, VOLUME_SECTIONS, localizedOutlineSection } from '../outline/outline-model.js'
import { isAIPlanningContext, planningKindForContext } from './planning-model.js'

describe('planning module mapping', () => {
  it.each([
    ['world', 'world_entry'],
    ['characters', 'character'],
    ['timeline', 'timeline_event'],
    ['locations', 'location'],
    ['foreshadowing', 'foreshadowing'],
    ['narrative', 'narrative'],
    ['issues', 'issue'],
    ['references', 'reference']
  ] as const)('routes %s to the %s guided record type', (context, kind) => {
    expect(planningKindForContext(context)).toBe(kind)
    expect(isAIPlanningContext(context)).toBe(true)
  })

  it.each(['write', 'canon', 'runs', 'volumes', 'parts'] as const)(
    'leaves %s on its existing non-planning workflow',
    (context) => {
      expect(planningKindForContext(context)).toBeNull()
      expect(isAIPlanningContext(context)).toBe(false)
    }
  )

  it('provides complete Chinese and English labels for outline and volume navigation', () => {
    for (const section of [...OUTLINE_HOME_SECTIONS, ...VOLUME_SECTIONS]) {
      expect(localizedOutlineSection(section, 'zh')).toEqual({
        title: section.title,
        short: section.short,
        heading: section.heading
      })
      expect(localizedOutlineSection(section, 'en')).toEqual({
        title: section.enTitle,
        short: section.enShort,
        heading: section.enHeading
      })
      expect(section.enTitle).not.toMatch(/[\u3400-\u9fff]/u)
      expect(section.enHeading).not.toMatch(/[\u3400-\u9fff]/u)
    }
  })
})
