import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCharacter,
  createCharacterRelation,
  createForeshadowing,
  createNarrative,
  createLocation,
  createProjectAt,
  createReference,
  createTimelineEventAtNode,
  createTimelineNode,
  createWorldEntry
} from '@quillarium/core'
import { checkPlanningCards } from './planning.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-check-'))
  roots.push(root)
  await createProjectAt(root, { id: 'planning-check', title: 'Planning Check' })
  return root
}

describe('manual planning-card rules', () => {
  it('checks enabled deterministic cards while excluding every world-book entry', async () => {
    const root = await project()
    await createReference(root, 'Source', { id: 'ref-source' })
    await createWorldEntry(root, 'Enabled knowledge', {
      id: 'world-enabled',
      enabled: true,
      source_refs: ['ref-source'],
      triggers: []
    })
    await createWorldEntry(root, 'Disabled knowledge', {
      id: 'world-disabled',
      enabled: false,
      triggers: []
    })
    await createForeshadowing(root, 'Unscheduled clue', {
      id: 'foreshadow-enabled',
      enabled: true,
      trigger_conditions: []
    })
    await createNarrative(root, 'Disabled narrative', {
      id: 'narrative-disabled',
      enabled: false,
      principles: [],
      sample: ''
    })

    const report = await checkPlanningCards(root)

    expect(report.checked_card_ids).toContain('foreshadow-enabled')
    expect(report.checked_card_ids).not.toContain('world-enabled')
    expect(report.checked_card_ids).not.toContain('ref-source')
    expect(report.skipped_disabled_ids).toContain('narrative-disabled')
    expect(report.skipped_disabled_ids).not.toContain('world-disabled')
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'planning-foreshadowing-without-trigger',
          related_ids: ['foreshadow-enabled']
        })
      ])
    )
    expect(report.issues.some((issue) => issue.related_ids?.includes('world-disabled'))).toBe(false)
    expect(report.issues.some((issue) => issue.related_ids?.includes('narrative-disabled'))).toBe(false)
  })

  it('does not turn dangling world-book references into deterministic story issues', async () => {
    const root = await project()
    await createWorldEntry(root, 'Broken link', {
      id: 'world-broken',
      enabled: true,
      triggers: ['gate'],
      links: ['world-missing']
    })

    const report = await checkPlanningCards(root)
    expect(report.checked_card_ids).not.toContain('world-broken')
    expect(report.issues.some((issue) => issue.related_ids?.includes('world-broken'))).toBe(false)
  })

  it('limits a timeline-page check to timeline nodes and events', async () => {
    const root = await project()
    await createTimelineNode(root, '第一日', { id: 'time-one', year: 1, month: 1 })
    await createTimelineEventAtNode(root, 'time-one', '启程', { id: 'event-departure' })
    await createLocation(root, '城门', { id: 'location-gate' })
    await createForeshadowing(root, '暗号', {
      id: 'foreshadow-outside-timeline',
      enabled: true,
      trigger_conditions: []
    })
    await createWorldEntry(root, '杂史材料', { id: 'world-outside-timeline', enabled: true, triggers: [] })

    const report = await checkPlanningCards(root, 'timeline')

    expect(report.checked_card_ids.sort()).toEqual(['event-departure', 'time-one'])
    expect(report.issues.some((issue) => issue.related_ids?.includes('location-gate'))).toBe(false)
    expect(report.issues.some((issue) => issue.related_ids?.includes('foreshadow-outside-timeline'))).toBe(
      false
    )
    expect(report.issues.some((issue) => issue.related_ids?.includes('world-outside-timeline'))).toBe(false)
  })

  it('reports relationship cards that are not anchored to the timeline', async () => {
    const root = await project()
    await createCharacter(root, '甲', { id: 'character-a' })
    await createCharacter(root, '乙', { id: 'character-b' })
    await createCharacterRelation(root, '旧识', {
      id: 'relation-unanchored',
      from_character: 'character-a',
      to_character: 'character-b',
      relation_type: '旧识',
      starts_at: null
    })

    const report = await checkPlanningCards(root)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'planning-character-relation-missing-start',
          related_ids: ['relation-unanchored', 'character-a', 'character-b']
        })
      ])
    )
  })
})
