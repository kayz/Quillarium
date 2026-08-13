import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCharacter,
  createCharacterRelation,
  createForeshadowing,
  createNarrative,
  createProjectAt,
  createReference,
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
  it('checks enabled cards, keeps references as material, and skips disabled cards', async () => {
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

    expect(report.checked_card_ids).toEqual(expect.arrayContaining(['world-enabled', 'foreshadow-enabled']))
    expect(report.checked_card_ids).not.toContain('ref-source')
    expect(report.skipped_disabled_ids).toEqual(
      expect.arrayContaining(['world-disabled', 'narrative-disabled'])
    )
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'planning-world-entry-without-trigger',
          related_ids: ['world-enabled']
        }),
        expect.objectContaining({
          code: 'planning-foreshadowing-without-trigger',
          related_ids: ['foreshadow-enabled']
        })
      ])
    )
    expect(report.issues.some((issue) => issue.related_ids?.includes('world-disabled'))).toBe(false)
    expect(report.issues.some((issue) => issue.related_ids?.includes('narrative-disabled'))).toBe(false)
  })

  it('reports intrinsic dangling links with the field that needs repair', async () => {
    const root = await project()
    await createWorldEntry(root, 'Broken link', {
      id: 'world-broken',
      enabled: true,
      triggers: ['gate'],
      links: ['world-missing']
    })

    const report = await checkPlanningCards(root)
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'planning-missing-relation-target',
          evidence: 'Field: links',
          related_ids: ['world-broken', 'world-missing']
        })
      ])
    )
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
