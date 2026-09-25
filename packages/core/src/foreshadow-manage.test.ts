import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyForeshadowManage,
  createForeshadowing,
  createOutline,
  createProjectAt,
  DISABLED_UPDATE_CARD,
  FORESHADOW_UNREFERENCED,
  listDocs,
  MISSING_FORESHADOW_PROPOSAL,
  readMarkdown,
  UNCONFIRMED_EVAL,
  type ForeshadowManageProposalSet,
  type ForeshadowingDoc,
  type OutlineDoc
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-foreshadow-manage-'))
  roots.push(root)
  await createProjectAt(root, { id: 'foreshadow-manage-test', title: 'Foreshadow Manage Test' })
  return root
}

async function chapterWithRelated(
  root: string,
  chapterId: string,
  related: string[],
  content = '## Chapter body\n'
): Promise<string> {
  await createOutline(root, 'book', 'Book', { id: 'book' })
  await createOutline(root, 'volume', 'Volume', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', 'Part', { id: 'part', parent: 'volume' })
  return createOutline(
    root,
    'chapter',
    'Chapter',
    { id: chapterId, parent: 'part', related_foreshadowing: related },
    content
  )
}

function baseProposals(overrides?: Partial<ForeshadowManageProposalSet>): ForeshadowManageProposalSet {
  return {
    eval_id: 'eval-1',
    creates: [],
    updates: [],
    bindings: [],
    ...overrides
  }
}

describe('applyForeshadowManage with binding rollback', () => {
  it('creates foreshadowing via world-entry specialize with body and empty world/', async () => {
    const root = await project()
    const result = await applyForeshadowManage(
      root,
      baseProposals({
        creates: [
          {
            proposal_id: 'c-fs',
            title: 'Broken seal',
            content: 'Wax cracked at dawn.',
            fields: { state: 'planned', level: 'L3' }
          }
        ]
      }),
      {
        confirmed: true,
        creates: [{ proposal_id: 'c-fs' }],
        updates: [],
        bindings: []
      }
    )

    expect(result.created_ids).toHaveLength(1)
    expect(await listDocs(root, 'world_entry')).toHaveLength(0)
    const card = (await listDocs<ForeshadowingDoc>(root, 'foreshadowing')).find(
      (item) => item.data.id === result.created_ids[0]
    )
    expect(card?.data.type).toBe('foreshadowing')
    expect(card?.data.state).toBe('planned')
    expect(card?.content).toContain('Wax cracked at dawn')
  })

  it('rejects same-round binding to a newly created foreshadowing id', async () => {
    const root = await project()
    await chapterWithRelated(root, 'ch-1', [])
    const title = `Fresh plant ${Date.now()}-${Math.random().toString(16).slice(2)}`
    const expectedId = `world-${title
      .trim()
      .replace(/[\\/:*?"<>|#^[\]{}%`]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80)
      .replace(/-+$/g, '')
      .toLowerCase()}`

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'c-fs',
              title,
              content: 'Fresh plant.',
              fields: { state: 'planned' }
            }
          ],
          bindings: [
            {
              proposal_id: 'b-1',
              foreshadowing_id: expectedId,
              document_id: 'ch-1',
              plant: 'add'
            }
          ]
        }),
        {
          confirmed: true,
          creates: [{ proposal_id: 'c-fs' }],
          updates: [],
          bindings: ['b-1']
        }
      )
    ).rejects.toThrow(FORESHADOW_UNREFERENCED)

    expect(await listDocs(root, 'foreshadowing')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('plants on a chapter that already lists the foreshadowing as related', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1', state: 'planned' }, 'Chart body.')
    const chapterPath = await chapterWithRelated(root, 'ch-1', ['fs-1'], '## Keep this body\n')
    const before = await readMarkdown<Record<string, unknown>>(chapterPath)

    const result = await applyForeshadowManage(
      root,
      baseProposals({
        bindings: [
          {
            proposal_id: 'b-plant',
            foreshadowing_id: 'fs-1',
            document_id: 'ch-1',
            plant: 'add'
          }
        ]
      }),
      {
        confirmed: true,
        creates: [],
        updates: [],
        bindings: ['b-plant']
      }
    )

    expect(result.binding_document_ids).toEqual(['ch-1'])
    const after = await readMarkdown<Record<string, unknown>>(chapterPath)
    expect(after.data.foreshadowing_planted).toContain('fs-1')
    expect(after.data.related_foreshadowing).toEqual(['fs-1'])
    expect(after.content).toBe(before.content)
  })

  it('rolls back card update when binding targets an unreferenced chapter', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1', state: 'planned' }, 'Old body.')
    await createForeshadowing(root, 'Other', { id: 'fs-other', state: 'planned' })
    await chapterWithRelated(root, 'ch-1', ['fs-other'], '## Chapter\n')

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          updates: [
            {
              proposal_id: 'u-fs',
              card_id: 'fs-1',
              content: 'Should roll back.',
              fields: { state: 'planted' }
            }
          ],
          bindings: [
            {
              proposal_id: 'b-bad',
              foreshadowing_id: 'fs-1',
              document_id: 'ch-1',
              plant: 'add'
            }
          ]
        }),
        {
          confirmed: true,
          creates: [],
          updates: [{ proposal_id: 'u-fs' }],
          bindings: ['b-bad']
        }
      )
    ).rejects.toThrow(FORESHADOW_UNREFERENCED)

    const card = (await listDocs<ForeshadowingDoc>(root, 'foreshadowing')).find(
      (item) => item.data.id === 'fs-1'
    )
    expect(card?.content).toContain('Old body')
    expect(card?.data.state).toBe('planned')
    const chapter = (await listDocs<OutlineDoc>(root, 'outline')).find((item) => item.data.id === 'ch-1')
    expect(chapter?.data.foreshadowing_planted).toEqual([])
  })

  it('restores first binding when a later binding is illegal', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1', state: 'planned' })
    await createForeshadowing(root, 'Other', { id: 'fs-other', state: 'planned' })
    const chapterPath = await chapterWithRelated(root, 'ch-1', ['fs-1'], '## Chapter\n')
    await createOutline(root, 'chapter', 'Other Chapter', {
      id: 'ch-2',
      parent: 'part',
      related_foreshadowing: ['fs-other']
    })

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          bindings: [
            {
              proposal_id: 'b-ok',
              foreshadowing_id: 'fs-1',
              document_id: 'ch-1',
              plant: 'add'
            },
            {
              proposal_id: 'b-bad',
              foreshadowing_id: 'fs-1',
              document_id: 'ch-2',
              plant: 'add'
            }
          ]
        }),
        {
          confirmed: true,
          creates: [],
          updates: [],
          bindings: ['b-ok', 'b-bad']
        }
      )
    ).rejects.toThrow(FORESHADOW_UNREFERENCED)

    const chapter = await readMarkdown<Record<string, unknown>>(chapterPath)
    expect(chapter.data.foreshadowing_planted).toEqual([])
  })

  it('rejects updates with invalid state and leaves the body unchanged', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1', state: 'planned' }, 'Old body.')

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          updates: [
            {
              proposal_id: 'u-fs',
              card_id: 'fs-1',
              content: 'Should not write.',
              fields: { state: 'nope' }
            }
          ]
        }),
        { confirmed: true, creates: [], updates: [{ proposal_id: 'u-fs' }], bindings: [] }
      )
    ).rejects.toThrow()

    const card = (await listDocs<ForeshadowingDoc>(root, 'foreshadowing')).find(
      (item) => item.data.id === 'fs-1'
    )
    expect(card?.content).toContain('Old body')
    expect(card?.data.state).toBe('planned')
  })

  it('rejects updates to disabled foreshadowing cards', async () => {
    const root = await project()
    await createForeshadowing(
      root,
      'Disabled thread',
      { id: 'fs-disabled', state: 'planned', enabled: false },
      'Disabled body.'
    )

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          updates: [
            {
              proposal_id: 'u-fs',
              card_id: 'fs-disabled',
              content: 'Should not write.',
              fields: {}
            }
          ]
        }),
        {
          confirmed: true,
          creates: [],
          updates: [{ proposal_id: 'u-fs' }],
          bindings: []
        }
      )
    ).rejects.toThrow(DISABLED_UPDATE_CARD)

    const card = (await listDocs<ForeshadowingDoc>(root, 'foreshadowing'))[0]!
    expect(card.content).toContain('Disabled body')
  })

  it('refuses unconfirmed apply and writes nothing', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1' })

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'c-fs',
              title: 'Should not create',
              content: 'Nope.',
              fields: {}
            }
          ]
        }),
        {
          confirmed: false,
          creates: [{ proposal_id: 'c-fs' }],
          updates: [],
          bindings: []
        }
      )
    ).rejects.toThrow(UNCONFIRMED_EVAL)

    expect(await listDocs(root, 'foreshadowing')).toHaveLength(1)
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('treats plant add/remove as idempotent', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1' })
    const chapterPath = await chapterWithRelated(root, 'ch-1', ['fs-1'])
    await applyForeshadowManage(
      root,
      baseProposals({
        bindings: [
          {
            proposal_id: 'b-add',
            foreshadowing_id: 'fs-1',
            document_id: 'ch-1',
            plant: 'add'
          }
        ]
      }),
      { confirmed: true, creates: [], updates: [], bindings: ['b-add'] }
    )

    const again = await applyForeshadowManage(
      root,
      baseProposals({
        bindings: [
          {
            proposal_id: 'b-add-again',
            foreshadowing_id: 'fs-1',
            document_id: 'ch-1',
            plant: 'add'
          },
          {
            proposal_id: 'b-remove-absent',
            foreshadowing_id: 'fs-1',
            document_id: 'ch-1',
            resolve: 'remove'
          }
        ]
      }),
      {
        confirmed: true,
        creates: [],
        updates: [],
        bindings: ['b-add-again', 'b-remove-absent']
      }
    )

    expect(again.binding_document_ids).toEqual(['ch-1', 'ch-1'])
    const chapter = await readMarkdown<Record<string, unknown>>(chapterPath)
    expect(chapter.data.foreshadowing_planted).toEqual(['fs-1'])
    expect(chapter.data.foreshadowing_resolved).toEqual([])
  })

  it('rejects selected binding missing plant and resolve', async () => {
    const root = await project()
    await createForeshadowing(root, 'Harbor chart', { id: 'fs-1' })
    await chapterWithRelated(root, 'ch-1', ['fs-1'])

    await expect(
      applyForeshadowManage(
        root,
        baseProposals({
          bindings: [
            {
              proposal_id: 'b-malformed',
              foreshadowing_id: 'fs-1',
              document_id: 'ch-1'
            }
          ]
        }),
        {
          confirmed: true,
          creates: [],
          updates: [],
          bindings: ['b-malformed']
        }
      )
    ).rejects.toThrow(MISSING_FORESHADOW_PROPOSAL('b-malformed'))
  })
})
