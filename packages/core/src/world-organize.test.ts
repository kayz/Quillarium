import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyWorldOrganize,
  createCharacter,
  createProjectAt,
  createWorldEntry,
  listDocs,
  UNCONFIRMED_EVAL,
  WORLD_ENTRY_ONLY,
  type WorldEntryDoc,
  type WorldOrganizeProposalSet
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-world-organize-'))
  roots.push(root)
  await createProjectAt(root, { id: 'world-organize-test', title: 'World Organize Test' })
  return root
}

function baseProposals(overrides?: Partial<WorldOrganizeProposalSet>): WorldOrganizeProposalSet {
  return {
    eval_id: 'eval-1',
    creates: [
      {
        proposal_id: 'create-prop-1',
        title: '北港',
        content: '北方港口城市。'
      }
    ],
    updates: [],
    ...overrides
  }
}

describe('world-book create/update apply with rollback', () => {
  it('refuses unconfirmed apply and writes nothing', async () => {
    const root = await fixture()
    await createWorldEntry(root, 'Existing', { id: 'world-existing' }, '原正文。')
    const before = await listDocs(root, 'world_entry')

    await expect(
      applyWorldOrganize(root, baseProposals(), {
        confirmed: false,
        creates: [{ proposal_id: 'create-prop-1' }],
        updates: []
      })
    ).rejects.toThrow(UNCONFIRMED_EVAL)

    const after = await listDocs(root, 'world_entry')
    expect(after).toHaveLength(before.length)
    expect(after.map((item) => item.data.id).sort()).toEqual(before.map((item) => item.data.id).sort())
  })

  it('creates a confirmed world_entry', async () => {
    const root = await fixture()

    const result = await applyWorldOrganize(root, baseProposals(), {
      confirmed: true,
      creates: [{ proposal_id: 'create-prop-1' }],
      updates: []
    })

    expect(result.created_ids).toHaveLength(1)
    expect(result.updated_ids).toEqual([])

    const worlds = await listDocs<WorldEntryDoc>(root, 'world_entry')
    expect(worlds).toHaveLength(1)
    expect(worlds[0]!.data.id).toBe(result.created_ids[0])
    expect(worlds[0]!.data.title).toBe('北港')
    expect(worlds[0]!.data.type).toBe('world_entry')
    expect(worlds[0]!.content).toBe('北方港口城市。\n')
  })

  it('updates an enabled world_entry body to the proposal content', async () => {
    const root = await fixture()
    await createWorldEntry(root, '北港', { id: 'world-north', enabled: true }, '旧正文。')

    const proposals = baseProposals({
      creates: [],
      updates: [
        {
          proposal_id: 'update-prop-1',
          card_id: 'world-north',
          content: '整段替换后的新正文。'
        }
      ]
    })

    const result = await applyWorldOrganize(root, proposals, {
      confirmed: true,
      creates: [],
      updates: [{ proposal_id: 'update-prop-1' }]
    })

    expect(result.updated_ids).toEqual(['world-north'])
    expect(result.created_ids).toEqual([])

    const worlds = await listDocs<WorldEntryDoc>(root, 'world_entry')
    expect(worlds).toHaveLength(1)
    expect(worlds[0]!.data.id).toBe('world-north')
    expect(worlds[0]!.data.title).toBe('北港')
    expect(worlds[0]!.content).toBe('整段替换后的新正文。\n')
  })

  it('rejects updates to character or disabled world_entry', async () => {
    const root = await fixture()
    await createCharacter(root, '阿宁', { id: 'char-aning' }, '人物卡。')
    await createWorldEntry(root, '禁用港', { id: 'world-disabled', enabled: false }, '禁用正文。')

    const characterUpdate = baseProposals({
      creates: [],
      updates: [
        {
          proposal_id: 'update-char',
          card_id: 'char-aning',
          content: '不该写入。'
        }
      ]
    })
    await expect(
      applyWorldOrganize(root, characterUpdate, {
        confirmed: true,
        creates: [],
        updates: [{ proposal_id: 'update-char' }]
      })
    ).rejects.toThrow(WORLD_ENTRY_ONLY)

    const disabledUpdate = baseProposals({
      creates: [],
      updates: [
        {
          proposal_id: 'update-disabled',
          card_id: 'world-disabled',
          content: '不该写入。'
        }
      ]
    })
    await expect(
      applyWorldOrganize(root, disabledUpdate, {
        confirmed: true,
        creates: [],
        updates: [{ proposal_id: 'update-disabled' }]
      })
    ).rejects.toThrow(WORLD_ENTRY_ONLY)

    const characters = await listDocs(root, 'character')
    expect(characters).toHaveLength(1)
    expect(characters[0]!.content).toBe('人物卡。\n')

    const worlds = await listDocs<WorldEntryDoc>(root, 'world_entry')
    expect(worlds).toHaveLength(1)
    expect(worlds[0]!.content).toBe('禁用正文。\n')
  })

  it('rolls back create when specialize is missing required fields', async () => {
    const root = await fixture()
    await createWorldEntry(root, 'Existing', { id: 'world-existing' }, '原正文保持不变。')

    await expect(
      applyWorldOrganize(root, baseProposals(), {
        confirmed: true,
        creates: [{ proposal_id: 'create-prop-1', type: 'character_relation', fields: {} }],
        updates: []
      })
    ).rejects.toThrow('特化缺少必填字段：')

    expect(await listDocs(root, 'world_entry')).toHaveLength(1)
    const existing = (await listDocs<WorldEntryDoc>(root, 'world_entry'))[0]!
    expect(existing.data.id).toBe('world-existing')
    expect(existing.content).toBe('原正文保持不变。\n')
    expect(await listDocs(root, 'character_relation')).toEqual([])
  })
})
