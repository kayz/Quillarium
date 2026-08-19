import { describe, expect, it } from 'vitest'
import type { PlanningProposal } from '../../app/types.js'
import { OUTLINE_HOME_SECTIONS, VOLUME_SECTIONS, localizedOutlineSection } from '../outline/outline-model.js'
import {
  blankSettingCardInput,
  confirmAllPlanningProposals,
  isAIPlanningContext,
  PLANNING_UNSET_REFERENCE,
  planningConversionKinds,
  planningDraftFieldsForKind,
  planningKindForContext,
  planningKindsForContext,
  planningProposalDependencies
} from './planning-model.js'

describe('planning module mapping', () => {
  it('creates blank hand-authored setting cards as disabled drafts with safe type defaults', () => {
    expect(blankSettingCardInput('character', '空白人物')).toMatchObject({
      title: '空白人物',
      content: '',
      status: 'draft',
      enabled: false
    })
    expect(blankSettingCardInput('canon', '空白正设')).toMatchObject({
      status: 'draft',
      enabled: false,
      strength: 'hard',
      source: 'user'
    })
    expect(blankSettingCardInput('world_entry', '空白世界书')).toMatchObject({
      entry_status: 'candidate'
    })
    expect(() => blankSettingCardInput('character_relation', '无端点关系')).toThrow(/not available/u)
  })

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

  it('uses World as the conversion hub and keeps unsupported operational cards out', () => {
    expect(planningConversionKinds('canon')).toEqual(['canon', 'world_entry'])
    expect(planningConversionKinds('location')).toEqual(['location', 'world_entry'])
    expect(planningConversionKinds('world_entry')).toEqual([
      'world_entry',
      'canon',
      'character',
      'character_relation',
      'location',
      'timeline_event',
      'faction',
      'faction_relation',
      'faction_membership',
      'foreshadowing',
      'narrative'
    ])
    expect(planningConversionKinds('issue')).toEqual([])
    expect(planningKindsForContext('card-conversion', 'faction')).toEqual(['faction', 'world_entry'])
  })

  it('seeds required target references while preserving only shared card metadata', () => {
    expect(
      planningDraftFieldsForKind('character_relation', {
        status: 'active',
        tags: ['旧标签'],
        image: { schema_version: 1 },
        triggers: ['不应沿用'],
        role: 'constraint'
      })
    ).toEqual({
      from_character: PLANNING_UNSET_REFERENCE,
      to_character: PLANNING_UNSET_REFERENCE,
      relation_type: 'related',
      status: 'active',
      tags: ['旧标签'],
      image: { schema_version: 1 }
    })
    expect(planningDraftFieldsForKind('faction_membership', {})).toMatchObject({
      faction_id: PLANNING_UNSET_REFERENCE,
      character_id: PLANNING_UNSET_REFERENCE
    })
  })

  it('allows prose extraction to propose Canon and setting cards, but never prose updates', () => {
    expect(planningKindsForContext('prose-extraction')).toEqual(
      expect.arrayContaining(['canon', 'world_entry', 'character', 'timeline_event', 'faction'])
    )
    expect(planningKindsForContext('prose-extraction')).not.toContain('issue')
    expect(planningKindsForContext('prose-extraction')).not.toContain('reference')
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
