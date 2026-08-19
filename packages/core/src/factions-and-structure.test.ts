import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCharacter,
  createFaction,
  createFactionMembership,
  createFactionRelation,
  createOutline,
  createScene,
  listDocs
} from './documents.js'
import { allowedParentLevels } from './outline-rules.js'
import { createProjectAt, updateProjectConfig } from './project.js'
import type { FactionDoc, FactionMembershipDoc, FactionRelationDoc } from './types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('factions and configurable story structure', () => {
  it('persists faction, faction relationship, and character membership as stable documents', async () => {
    const root = await fixture('faction-project')
    await createCharacter(root, '林澜', { id: 'char-lin' })
    await createFaction(root, '海灯会', { id: 'faction-lantern', motto: '守夜' })
    await createFaction(root, '北港议会', { id: 'faction-council' })
    await createFactionMembership(root, '林澜属于海灯会', {
      id: 'member-lin-lantern',
      faction_id: 'faction-lantern',
      character_id: 'char-lin',
      role: 'observer'
    })
    await createFactionRelation(root, '海灯会与北港议会合作', {
      id: 'frel-lantern-council',
      from_faction: 'faction-lantern',
      to_faction: 'faction-council',
      relation_type: 'alliance',
      direction: 'mutual'
    })

    expect((await listDocs<FactionDoc>(root, 'faction')).map((item) => item.data.id)).toEqual([
      'faction-council',
      'faction-lantern'
    ])
    expect((await listDocs<FactionMembershipDoc>(root, 'faction_membership'))[0]?.data).toMatchObject({
      faction_id: 'faction-lantern',
      character_id: 'char-lin'
    })
    expect((await listDocs<FactionRelationDoc>(root, 'faction_relation'))[0]?.data).toMatchObject({
      from_faction: 'faction-lantern',
      to_faction: 'faction-council'
    })
  })

  it('allows chapters under volumes and blocks new scenes when disabled without deleting legacy files', async () => {
    const root = await fixture('flat-story-project')
    const book = await createOutline(root, 'book', '总纲', { id: 'book-main' })
    expect(book).toContain('book-main')
    await createOutline(root, 'volume', '第一卷', { id: 'volume-one', parent: 'book-main' })
    await updateProjectConfig(root, {
      story_structure: { part_enabled: false, act_enabled: false, scene_enabled: false }
    })
    await createOutline(root, 'chapter', '第一章', { id: 'chapter-one', parent: 'volume-one' })

    expect(
      allowedParentLevels('chapter', { part_enabled: false, act_enabled: false, scene_enabled: false })
    ).toEqual(['volume'])
    await expect(
      createOutline(root, 'part', '不应创建', { id: 'part-disabled', parent: 'volume-one' })
    ).rejects.toThrow('Part level is disabled')
    await expect(
      createScene(root, '不应创建的节', { chapter_id: 'chapter-one', section: 'chapter-one' })
    ).rejects.toThrow('SCENE_LEVEL_DISABLED')
    expect((await listDocs(root, 'outline')).some((item) => item.data.id === 'chapter-one')).toBe(true)
  })
})

async function fixture(id: string): Promise<string> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-faction-structure-'))
  roots.push(base)
  const root = path.join(base, id)
  await createProjectAt(root, { id, title: id })
  return root
}
