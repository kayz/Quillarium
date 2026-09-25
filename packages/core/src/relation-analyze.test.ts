import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyRelationAnalyze,
  createCharacter,
  createCharacterRelation,
  createFaction,
  createProjectAt,
  DISABLED_UPDATE_CARD,
  listDocs,
  MISSING_CHARACTER,
  MISSING_RELATION_CARD,
  NO_CHARACTER_SELECTION,
  UNCONFIRMED_EVAL,
  type CharacterRelationDoc,
  type FactionMembershipDoc,
  type FactionRelationDoc,
  type RelationAnalyzeProposalSet
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-relation-analyze-'))
  roots.push(root)
  await createProjectAt(root, { id: 'relation-analyze-test', title: 'Relation Analyze Test' })
  return root
}

function baseProposals(overrides?: Partial<RelationAnalyzeProposalSet>): RelationAnalyzeProposalSet {
  return {
    eval_id: 'eval-1',
    character_id: 'char-lin',
    creates: [],
    updates: [],
    ...overrides
  }
}

describe('applyRelationAnalyze with rollback', () => {
  it('refuses unconfirmed apply and writes nothing', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })

    await expect(
      applyRelationAnalyze(root, baseProposals(), {
        confirmed: false,
        creates: [],
        updates: []
      })
    ).rejects.toThrow(UNCONFIRMED_EVAL)

    expect(await listDocs(root, 'character_relation')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('rejects empty character_id', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })

    await expect(
      applyRelationAnalyze(root, baseProposals({ character_id: '   ' }), {
        confirmed: true,
        creates: [],
        updates: []
      })
    ).rejects.toThrow(NO_CHARACTER_SELECTION)
  })

  it('rejects missing character document', async () => {
    const root = await project()

    await expect(
      applyRelationAnalyze(root, baseProposals({ character_id: 'char-missing' }), {
        confirmed: true,
        creates: [],
        updates: []
      })
    ).rejects.toThrow(MISSING_CHARACTER)
  })

  it('rejects proposals.character_id that mismatches planted character', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })

    await expect(
      applyRelationAnalyze(root, baseProposals({ character_id: 'char-other' }), {
        confirmed: true,
        creates: [],
        updates: []
      })
    ).rejects.toThrow(MISSING_CHARACTER)
  })

  it('creates a character_relation through world-entry specialize', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })
    const result = await applyRelationAnalyze(
      root,
      {
        eval_id: 'eval-1',
        character_id: 'char-lin',
        creates: [
          {
            proposal_id: 'p-rel',
            title: 'Lin and Mei',
            content: 'They share a harbor oath.',
            type: 'character_relation',
            fields: {
              from_character: 'char-lin',
              to_character: 'char-mei',
              relation_type: 'ally'
            }
          }
        ],
        updates: []
      },
      { confirmed: true, creates: [{ proposal_id: 'p-rel', type: 'character_relation' }], updates: [] }
    )
    expect(result.created_ids).toHaveLength(1)
    expect(await listDocs(root, 'world_entry')).toHaveLength(0)
    const rel = (await listDocs<CharacterRelationDoc>(root, 'character_relation')).find(
      (item) => item.data.id === result.created_ids[0]
    )
    expect(rel?.data.from_character).toBe('char-lin')
    expect(rel?.content).toContain('harbor oath')
  })

  it('rolls back when confirm-time fields omit to_character', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })

    await expect(
      applyRelationAnalyze(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-rel',
              title: 'Lin and Mei',
              content: 'Incomplete fields.',
              type: 'character_relation',
              fields: {
                from_character: 'char-lin',
                relation_type: 'ally'
              }
            }
          ]
        }),
        {
          confirmed: true,
          creates: [
            {
              proposal_id: 'p-rel',
              type: 'character_relation',
              fields: { from_character: 'char-lin' }
            }
          ],
          updates: []
        }
      )
    ).rejects.toThrow(/特化缺少必填字段/u)

    expect(await listDocs(root, 'character_relation')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('updates an enabled character_relation body and relation_type', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })
    await createCharacterRelation(
      root,
      'Lin and Mei',
      {
        id: 'rel-1',
        from_character: 'char-lin',
        to_character: 'char-mei',
        relation_type: 'ally'
      },
      'Old body.'
    )

    const result = await applyRelationAnalyze(
      root,
      baseProposals({
        updates: [
          {
            proposal_id: 'u-rel',
            card_id: 'rel-1',
            content: 'New harbor oath.',
            fields: { relation_type: 'rival' }
          }
        ]
      }),
      {
        confirmed: true,
        creates: [],
        updates: [{ proposal_id: 'u-rel', fields: { relation_type: 'rival' } }]
      }
    )

    expect(result.updated_ids).toEqual(['rel-1'])
    const rel = (await listDocs<CharacterRelationDoc>(root, 'character_relation'))[0]!
    expect(rel.data.type).toBe('character_relation')
    expect(rel.data.relation_type).toBe('rival')
    expect(rel.content).toContain('New harbor oath')
  })

  it('rejects updates to disabled relation cards', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })
    await createCharacterRelation(
      root,
      'Lin and Mei',
      {
        id: 'rel-disabled',
        from_character: 'char-lin',
        to_character: 'char-mei',
        relation_type: 'ally',
        enabled: false
      },
      'Disabled body.'
    )

    await expect(
      applyRelationAnalyze(
        root,
        baseProposals({
          updates: [
            {
              proposal_id: 'u-rel',
              card_id: 'rel-disabled',
              content: 'Should not write.',
              fields: {}
            }
          ]
        }),
        { confirmed: true, creates: [], updates: [{ proposal_id: 'u-rel' }] }
      )
    ).rejects.toThrow(DISABLED_UPDATE_CARD)

    const rel = (await listDocs<CharacterRelationDoc>(root, 'character_relation'))[0]!
    expect(rel.content).toBe('Disabled body.\n')
  })

  it('rejects updates that make from_character equal to_character and leaves the body unchanged', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })
    await createCharacterRelation(
      root,
      'Lin and Mei',
      {
        id: 'rel-1',
        from_character: 'char-lin',
        to_character: 'char-mei',
        relation_type: 'ally'
      },
      'Original body.'
    )

    await expect(
      applyRelationAnalyze(
        root,
        baseProposals({
          updates: [
            {
              proposal_id: 'u-rel',
              card_id: 'rel-1',
              content: 'Should not write.',
              fields: { to_character: 'char-lin' }
            }
          ]
        }),
        { confirmed: true, creates: [], updates: [{ proposal_id: 'u-rel' }] }
      )
    ).rejects.toThrow('人物关系必须连接两个不同的人物。')

    const rel = (await listDocs<CharacterRelationDoc>(root, 'character_relation'))[0]!
    expect(rel.content).toContain('Original body')
    expect(rel.data.from_character).toBe('char-lin')
    expect(rel.data.to_character).toBe('char-mei')
  })

  it('ignores enabled:false in update fields and keeps the card enabled', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createCharacter(root, 'Mei', { id: 'char-mei' })
    await createCharacterRelation(
      root,
      'Lin and Mei',
      {
        id: 'rel-1',
        from_character: 'char-lin',
        to_character: 'char-mei',
        relation_type: 'ally'
      },
      'Keep enabled.'
    )

    const result = await applyRelationAnalyze(
      root,
      baseProposals({
        updates: [
          {
            proposal_id: 'u-rel',
            card_id: 'rel-1',
            content: 'Keep enabled.',
            fields: { enabled: false, relation_type: 'rival' }
          }
        ]
      }),
      {
        confirmed: true,
        creates: [],
        updates: [{ proposal_id: 'u-rel', fields: { enabled: false, relation_type: 'rival' } }]
      }
    )

    expect(result.updated_ids).toEqual(['rel-1'])
    const rel = (await listDocs<CharacterRelationDoc>(root, 'character_relation'))[0]!
    expect(rel.data.relation_type).toBe('rival')
    expect(rel.data.enabled).not.toBe(false)
  })

  it('rejects faction_relation when character has no membership in either faction', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createFaction(root, 'Harbor Guild', { id: 'faction-a' })
    await createFaction(root, 'Inland Court', { id: 'faction-b' })

    await expect(
      applyRelationAnalyze(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-frel',
              title: 'Guild vs Court',
              content: 'Trade pressure.',
              type: 'faction_relation',
              fields: {
                from_faction: 'faction-a',
                to_faction: 'faction-b',
                relation_type: 'rival'
              }
            }
          ]
        }),
        {
          confirmed: true,
          creates: [{ proposal_id: 'p-frel', type: 'faction_relation' }],
          updates: []
        }
      )
    ).rejects.toThrow(MISSING_RELATION_CARD)

    expect(await listDocs(root, 'faction_relation')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('allows same-turn membership then faction_relation', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createFaction(root, 'Harbor Guild', { id: 'faction-a' })
    await createFaction(root, 'Inland Court', { id: 'faction-b' })

    const result = await applyRelationAnalyze(
      root,
      baseProposals({
        creates: [
          {
            proposal_id: 'p-mem',
            title: 'Lin in Guild',
            content: 'Lin joins the harbor guild.',
            type: 'faction_membership',
            fields: {
              character_id: 'char-lin',
              faction_id: 'faction-a'
            }
          },
          {
            proposal_id: 'p-frel',
            title: 'Guild vs Court',
            content: 'Trade pressure.',
            type: 'faction_relation',
            fields: {
              from_faction: 'faction-a',
              to_faction: 'faction-b',
              relation_type: 'rival'
            }
          }
        ]
      }),
      {
        confirmed: true,
        creates: [
          { proposal_id: 'p-mem', type: 'faction_membership' },
          { proposal_id: 'p-frel', type: 'faction_relation' }
        ],
        updates: []
      }
    )

    expect(result.created_ids).toHaveLength(2)
    expect(await listDocs(root, 'world_entry')).toHaveLength(0)

    const memberships = await listDocs<FactionMembershipDoc>(root, 'faction_membership')
    expect(memberships).toHaveLength(1)
    expect(memberships[0]!.data.faction_id).toBe('faction-a')
    expect(memberships[0]!.data.character_id).toBe('char-lin')

    const relations = await listDocs<FactionRelationDoc>(root, 'faction_relation')
    expect(relations).toHaveLength(1)
    expect(relations[0]!.data.from_faction).toBe('faction-a')
    expect(relations[0]!.data.to_faction).toBe('faction-b')
  })

  it('rejects faction_relation that only references membership not yet written this turn', async () => {
    const root = await project()
    await createCharacter(root, 'Lin', { id: 'char-lin' })
    await createFaction(root, 'Harbor Guild', { id: 'faction-a' })
    await createFaction(root, 'Inland Court', { id: 'faction-b' })

    await expect(
      applyRelationAnalyze(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-frel',
              title: 'Guild vs Court',
              content: 'Trade pressure.',
              type: 'faction_relation',
              fields: {
                from_faction: 'faction-a',
                to_faction: 'faction-b',
                relation_type: 'rival'
              }
            },
            {
              proposal_id: 'p-mem',
              title: 'Lin in Guild',
              content: 'Lin joins later.',
              type: 'faction_membership',
              fields: {
                character_id: 'char-lin',
                faction_id: 'faction-a'
              }
            }
          ]
        }),
        {
          confirmed: true,
          creates: [
            { proposal_id: 'p-frel', type: 'faction_relation' },
            { proposal_id: 'p-mem', type: 'faction_membership' }
          ],
          updates: []
        }
      )
    ).rejects.toThrow(MISSING_RELATION_CARD)

    expect(await listDocs(root, 'faction_relation')).toEqual([])
    expect(await listDocs(root, 'faction_membership')).toEqual([])
  })
})
