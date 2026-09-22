import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyOutlineOrganize,
  createOutline,
  createProjectAt,
  listDocs,
  loadOutlineSubtreeForOrganize,
  NO_SCENE_NODES,
  OUTLINE_OUTSIDE_SELECTION,
  UNCONFIRMED_EVAL,
  type OutlineDoc,
  type OutlineOrganizeProposalSet
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-outline-organize-'))
  roots.push(root)
  await createProjectAt(root, { id: 'outline-organize-test', title: 'Outline Organize Test' })
  await createOutline(root, 'overview', '作品总览', { id: 'overview' })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', '第一篇', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', '第一章', { id: 'chapter', parent: 'part' })
  return root
}

function baseProposals(
  overrides?: Partial<OutlineOrganizeProposalSet>
): OutlineOrganizeProposalSet {
  return {
    eval_id: 'eval-1',
    outline_id: 'volume',
    creates: [
      {
        proposal_id: 'create-prop-1',
        title: '第二篇',
        level: 'part',
        parent_id: 'volume'
      }
    ],
    ...overrides
  }
}

describe('outline subtree gate + create-only apply', () => {
  it('returns null when outline id is missing', async () => {
    const root = await fixture()
    expect(await loadOutlineSubtreeForOrganize(root, 'missing-outline')).toBeNull()
  })

  it('loads a chapter root without throwing (leaf rejected by facade)', async () => {
    const root = await fixture()
    const subtree = await loadOutlineSubtreeForOrganize(root, 'chapter')
    expect(subtree).not.toBeNull()
    expect(subtree!.root).toEqual({ id: 'chapter', level: 'chapter', title: '第一章' })
    expect(subtree!.member_ids).toEqual(['chapter'])
    expect(subtree!.members).toHaveLength(1)
    expect(subtree!.members[0]!.data.id).toBe('chapter')
  })

  it('refuses unconfirmed apply and writes nothing', async () => {
    const root = await fixture()
    const before = await listDocs<OutlineDoc>(root, 'outline')

    await expect(
      applyOutlineOrganize(root, baseProposals(), {
        confirmed: false,
        creates: ['create-prop-1']
      })
    ).rejects.toThrow(UNCONFIRMED_EVAL)

    const after = await listDocs<OutlineDoc>(root, 'outline')
    expect(after).toHaveLength(before.length)
  })

  it('creates a confirmed part under volume with empty content', async () => {
    const root = await fixture()
    const before = await listDocs<OutlineDoc>(root, 'outline')

    const result = await applyOutlineOrganize(root, baseProposals(), {
      confirmed: true,
      creates: ['create-prop-1']
    })

    expect(result.outline_ids).toHaveLength(1)

    const after = await listDocs<OutlineDoc>(root, 'outline')
    expect(after).toHaveLength(before.length + 1)
    const created = after.find((item) => item.data.id === result.outline_ids[0])
    expect(created).toBeDefined()
    expect(created!.data.title).toBe('第二篇')
    expect(created!.data.level).toBe('part')
    expect(created!.data.parent).toBe('volume')
    // createOutline coerces '' to a title stub; organize must not write model prose.
    expect(created!.content).toBe('## 第二篇\n')
  })

  it('rejects section or scene levels at apply time', async () => {
    const root = await fixture()
    const before = await listDocs<OutlineDoc>(root, 'outline')

    const sectionProposal = baseProposals({
      creates: [
        {
          proposal_id: 'create-section',
          title: '非法节',
          level: 'section' as OutlineOrganizeProposalSet['creates'][number]['level'],
          parent_id: 'volume'
        }
      ]
    })
    // Runtime levels that TypeScript union forbids still arrive via cast/JSON.
    ;(sectionProposal.creates[0] as { level: string }).level = 'section'

    await expect(
      applyOutlineOrganize(root, sectionProposal, {
        confirmed: true,
        creates: ['create-section']
      })
    ).rejects.toThrow(NO_SCENE_NODES)

    const sceneProposal = baseProposals({
      creates: [
        {
          proposal_id: 'create-scene',
          title: '非法场景',
          level: 'chapter',
          parent_id: 'volume'
        }
      ]
    })
    ;(sceneProposal.creates[0] as { level: string }).level = 'scene'

    await expect(
      applyOutlineOrganize(root, sceneProposal, {
        confirmed: true,
        creates: ['create-scene']
      })
    ).rejects.toThrow(NO_SCENE_NODES)

    const after = await listDocs<OutlineDoc>(root, 'outline')
    expect(after).toHaveLength(before.length)
  })

  it('rejects parent outside the live subtree and writes nothing', async () => {
    const root = await fixture()
    const before = await listDocs<OutlineDoc>(root, 'outline')

    await expect(
      applyOutlineOrganize(
        root,
        baseProposals({
          outline_id: 'volume',
          creates: [
            {
              proposal_id: 'create-outside',
              title: '越界篇',
              level: 'part',
              parent_id: 'book'
            }
          ]
        }),
        {
          confirmed: true,
          creates: ['create-outside']
        }
      )
    ).rejects.toThrow(OUTLINE_OUTSIDE_SELECTION)

    const after = await listDocs<OutlineDoc>(root, 'outline')
    expect(after).toHaveLength(before.length)
  })
})
