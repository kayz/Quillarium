import { describe, expect, it } from 'vitest'
import type { PlanningProposal } from '../../app/types.js'
import { OUTLINE_HOME_SECTIONS, VOLUME_SECTIONS, localizedOutlineSection } from '../outline/outline-model.js'
import {
  confirmAllPlanningProposals,
  isAIPlanningContext,
  planningKindForContext,
  planningProposalDependencies
} from './planning-model.js'

describe('planning module mapping', () => {
  it.each([
    ['world', 'world_entry'],
    ['characters', 'character'],
    ['timeline', 'timeline_event'],
    ['locations', 'location'],
    ['foreshadowing', 'foreshadowing'],
    ['narrative', 'narrative'],
    ['issues', 'issue']
  ] as const)('routes %s to the %s guided record type', (context, kind) => {
    expect(planningKindForContext(context)).toBe(kind)
    expect(isAIPlanningContext(context)).toBe(true)
  })

  it.each(['write', 'canon', 'runs', 'volumes', 'parts', 'references'] as const)(
    'leaves %s on its existing non-planning workflow',
    (context) => {
      expect(planningKindForContext(context)).toBeNull()
      expect(isAIPlanningContext(context)).toBe(false)
    }
  )

  it('treats uploaded references as sources for derived cards rather than AI-created cards', () => {
    expect(planningKindForContext('references')).toBeNull()
    expect(isAIPlanningContext('references')).toBe(false)
  })

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

  it('finds session-local dependencies and confirms the complete multi-card set explicitly', () => {
    const proposals: PlanningProposal[] = [
      proposal('membership_zhu_qizhen', 'faction_membership', '朱祁镇所属明皇室', {
        faction_id: 'faction_daming_huangshi',
        character_id: 'zhu_qizhen'
      }),
      proposal('faction_daming_huangshi', 'faction', '明皇室', {})
    ]

    expect(planningProposalDependencies(proposals[0]!, proposals).map((item) => item.id)).toEqual([
      'faction_daming_huangshi'
    ])
    expect(confirmAllPlanningProposals(proposals).map((item) => item.status)).toEqual([
      'confirmed',
      'confirmed'
    ])
    expect(proposals.map((item) => item.status)).toEqual(['draft', 'draft'])
  })
})

function proposal(
  id: string,
  kind: PlanningProposal['draft']['kind'],
  title: string,
  fields: Record<string, unknown>
): PlanningProposal {
  return {
    id,
    operation: 'create',
    source: 'ai',
    status: 'draft',
    draft: { kind, title, fields, content: '' },
    revisions: []
  }
}
