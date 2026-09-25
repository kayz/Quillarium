import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTimelineManage,
  createProjectAt,
  createTimelineEventAtNode,
  createTimelineNode,
  createWorldEntry,
  DEFAULT_TIMELINE_TRACK_ID,
  DISABLED_UPDATE_CARD,
  EVENT_OUT_OF_SCOPE,
  eventStartNode,
  listDocs,
  MISSING_TIMELINE_PROPOSAL,
  MISSING_TRACK,
  NODE_NOT_ON_TRACK,
  NO_TRACK_SELECTION,
  placeTimelineEvent,
  readMarkdown,
  readText,
  sha256Text,
  specializePlanningCard,
  UNCONFIRMED_EVAL,
  writeMarkdown,
  type TimelineEventDoc,
  type TimelineManageProposalSet
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-timeline-manage-'))
  roots.push(root)
  await createProjectAt(root, { id: 'timeline-manage-test', title: 'Timeline Manage Test' })
  return root
}

async function withDawnNode(root: string): Promise<void> {
  await createTimelineNode(root, 'Dawn', { id: 'node-dawn', year: 1, month: 1 })
}

function baseProposals(overrides?: Partial<TimelineManageProposalSet>): TimelineManageProposalSet {
  return {
    eval_id: 'eval-1',
    track_id: DEFAULT_TIMELINE_TRACK_ID,
    creates: [],
    updates: [],
    placements: [],
    orders: [],
    ...overrides
  }
}

function emptyDecisions(
  overrides?: Partial<{
    confirmed: boolean
    creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    placements: string[]
    orders: string[]
  }>
) {
  return {
    confirmed: true,
    creates: [] as Array<{ proposal_id: string; fields?: Record<string, unknown> }>,
    updates: [] as Array<{ proposal_id: string; fields?: Record<string, unknown> }>,
    placements: [] as string[],
    orders: [] as string[],
    ...overrides
  }
}

describe('applyTimelineManage with rollback', () => {
  it('refuses unconfirmed apply and writes nothing', async () => {
    const root = await project()
    await withDawnNode(root)
    const beforeEvents = await listDocs(root, 'timeline_event')
    const beforeWorld = await listDocs(root, 'world_entry')

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-create',
              title: 'Harbor arrival',
              content: 'Ships dock.',
              fields: {}
            }
          ]
        }),
        emptyDecisions({
          confirmed: false,
          creates: [{ proposal_id: 'p-create' }]
        })
      )
    ).rejects.toThrow(UNCONFIRMED_EVAL)

    expect(await listDocs(root, 'timeline_event')).toHaveLength(beforeEvents.length)
    expect(await listDocs(root, 'world_entry')).toHaveLength(beforeWorld.length)
  })

  it('rejects blank track selection', async () => {
    const root = await project()
    await expect(
      applyTimelineManage(root, baseProposals({ track_id: '   ' }), emptyDecisions())
    ).rejects.toThrow(NO_TRACK_SELECTION)
  })

  it('rejects a missing track id', async () => {
    const root = await project()
    await expect(
      applyTimelineManage(root, baseProposals({ track_id: 'missing-track' }), emptyDecisions())
    ).rejects.toThrow(MISSING_TRACK)
  })

  it('creates a specialized timeline_event and leaves world_entry empty of that card', async () => {
    const root = await project()
    await withDawnNode(root)

    const result = await applyTimelineManage(
      root,
      baseProposals({
        creates: [
          {
            proposal_id: 'p-create',
            title: 'Harbor arrival',
            content: 'Ships dock.',
            fields: {}
          }
        ]
      }),
      emptyDecisions({ creates: [{ proposal_id: 'p-create' }] })
    )

    expect(result.created_ids).toHaveLength(1)
    expect(await listDocs(root, 'world_entry')).toEqual([])
    const card = (await listDocs<TimelineEventDoc>(root, 'timeline_event')).find(
      (item) => item.data.id === result.created_ids[0]
    )
    expect(card?.data.type).toBe('timeline_event')
    expect(card?.data.title).toBe('Harbor arrival')
    expect(card?.content).toContain('Ships dock.')
  })

  it('places a same-round create onto a node without end_node_id', async () => {
    const root = await project()
    await withDawnNode(root)

    const result = await applyTimelineManage(
      root,
      baseProposals({
        creates: [
          {
            proposal_id: 'p-create',
            title: 'Harbor arrival',
            content: 'Ships dock.',
            fields: {}
          }
        ],
        placements: [
          {
            proposal_id: 'p-place',
            node_id: 'node-dawn',
            create_proposal_id: 'p-create'
          }
        ]
      }),
      emptyDecisions({
        creates: [{ proposal_id: 'p-create' }],
        placements: ['p-place']
      })
    )

    const eventId = result.created_ids[0]!
    expect(result.placed_event_ids).toEqual([eventId])
    const card = (await listDocs<TimelineEventDoc>(root, 'timeline_event')).find(
      (item) => item.data.id === eventId
    )
    expect(card).toBeTruthy()
    expect(eventStartNode(card!.data, DEFAULT_TIMELINE_TRACK_ID)).toBe('node-dawn')
    const placement = (card!.data.placements ?? []).find(
      (item) => item.timeline_id === DEFAULT_TIMELINE_TRACK_ID
    )
    expect(placement).toMatchObject({
      start_node_id: 'node-dawn',
      end_node_id: null
    })
  })

  it('updates enabled event body and date without clearing placements', async () => {
    const root = await project()
    await withDawnNode(root)
    const eventPath = await createTimelineEventAtNode(
      root,
      'node-dawn',
      'Harbor arrival',
      { id: 'evt-harbor' },
      'Old ships.'
    )
    const beforeHash = sha256Text(await readText(eventPath))
    await placeTimelineEvent(root, {
      event_id: 'evt-harbor',
      timeline_id: DEFAULT_TIMELINE_TRACK_ID,
      start_node_id: 'node-dawn',
      mode: 'move',
      expected_hash: beforeHash
    })
    const before = await readMarkdown<TimelineEventDoc>(eventPath)
    const placementsBefore = before.data.placements

    await applyTimelineManage(
      root,
      baseProposals({
        updates: [
          {
            proposal_id: 'p-update',
            card_id: 'evt-harbor',
            content: 'Ships dock at dawn.',
            fields: { date: 'Year 2', placements: [] }
          }
        ]
      }),
      emptyDecisions({ updates: [{ proposal_id: 'p-update' }] })
    )

    const after = await readMarkdown<TimelineEventDoc>(eventPath)
    expect(after.content).toContain('Ships dock at dawn.')
    expect(after.data.date).toBe('Year 2')
    expect(after.data.type).toBe('timeline_event')
    expect(after.data.placements).toEqual(placementsBefore)
  })

  it('rejects updates to disabled timeline events', async () => {
    const root = await project()
    await withDawnNode(root)
    const eventPath = await createTimelineEventAtNode(
      root,
      'node-dawn',
      'Disabled docking',
      { id: 'evt-disabled', enabled: false },
      'Disabled body.'
    )

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          updates: [
            {
              proposal_id: 'p-update',
              card_id: 'evt-disabled',
              content: 'Should not write.',
              fields: { date: 'Year 9' }
            }
          ]
        }),
        emptyDecisions({ updates: [{ proposal_id: 'p-update' }] })
      )
    ).rejects.toThrow(DISABLED_UPDATE_CARD)

    const card = await readMarkdown<TimelineEventDoc>(eventPath)
    expect(card.content).toContain('Disabled body.')
    expect(card.data.date).not.toBe('Year 9')
  })

  it('rejects placement with both event_id and create_proposal_id and writes nothing', async () => {
    const root = await project()
    await withDawnNode(root)
    const eventPath = await createTimelineEventAtNode(
      root,
      'node-dawn',
      'Harbor arrival',
      { id: 'evt-harbor' },
      'Body.'
    )
    const beforeRaw = await readText(eventPath)
    const beforeEvents = await listDocs(root, 'timeline_event')
    const beforeWorld = await listDocs(root, 'world_entry')

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          placements: [
            {
              proposal_id: 'p-place',
              node_id: 'node-dawn',
              event_id: 'evt-harbor',
              create_proposal_id: 'p-create'
            }
          ]
        }),
        emptyDecisions({ placements: ['p-place'] })
      )
    ).rejects.toThrow(MISSING_TIMELINE_PROPOSAL('p-place'))

    expect(await readText(eventPath)).toBe(beforeRaw)
    expect(await listDocs(root, 'timeline_event')).toHaveLength(beforeEvents.length)
    expect(await listDocs(root, 'world_entry')).toHaveLength(beforeWorld.length)
  })

  it('rehangs on main with add without wiping a side-track placement', async () => {
    const root = await project()
    await withDawnNode(root)
    await createTimelineNode(root, 'Noon', { id: 'node-noon', year: 1, month: 1, day: 2 })
    const eventPath = await createTimelineEventAtNode(
      root,
      'node-dawn',
      'Harbor arrival',
      { id: 'evt-harbor' },
      'Body.'
    )
    const before = await readMarkdown<TimelineEventDoc>(eventPath)
    await writeMarkdown(
      eventPath,
      {
        ...before.data,
        timeline_node: 'node-dawn',
        placements: [
          {
            timeline_id: DEFAULT_TIMELINE_TRACK_ID,
            start_node_id: 'node-dawn',
            end_node_id: null,
            order: 0,
            narrative_order: 0,
            occurrence: 1
          },
          {
            timeline_id: 'side',
            start_node_id: 'node-dawn',
            end_node_id: null,
            order: 0,
            narrative_order: 0,
            occurrence: 1
          }
        ]
      } as unknown as Record<string, unknown>,
      before.content
    )

    await applyTimelineManage(
      root,
      baseProposals({
        placements: [
          {
            proposal_id: 'p-place',
            node_id: 'node-noon',
            event_id: 'evt-harbor'
          }
        ]
      }),
      emptyDecisions({ placements: ['p-place'] })
    )

    const after = await readMarkdown<TimelineEventDoc>(eventPath)
    expect(eventStartNode(after.data, DEFAULT_TIMELINE_TRACK_ID)).toBe('node-noon')
    const side = (after.data.placements ?? []).find((item) => item.timeline_id === 'side')
    expect(side).toMatchObject({
      timeline_id: 'side',
      start_node_id: 'node-dawn',
      end_node_id: null
    })
    expect((after.data.placements ?? []).some((item) => item.timeline_id === DEFAULT_TIMELINE_TRACK_ID)).toBe(
      true
    )
  })

  it('rejects placement of an event outside the track pool', async () => {
    const root = await project()
    await withDawnNode(root)
    const worldPath = await createWorldEntry(root, 'Side only', {}, 'Side body.')
    const created = await readMarkdown<{ id: string }>(worldPath)
    const specialized = await specializePlanningCard(
      root,
      created.data.id,
      'timeline_event',
      {}
    )
    await writeMarkdown(
      specialized.path,
      {
        ...specialized.data,
        timeline_node: null,
        placements: [
          {
            timeline_id: 'side',
            start_node_id: 'node-dawn',
            end_node_id: null,
            order: 0,
            narrative_order: 0,
            occurrence: 1
          }
        ]
      } as unknown as Record<string, unknown>,
      specialized.content
    )
    const beforeRaw = await readText(specialized.path)

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          placements: [
            {
              proposal_id: 'p-place',
              node_id: 'node-dawn',
              event_id: specialized.data.id
            }
          ]
        }),
        emptyDecisions({ placements: ['p-place'] })
      )
    ).rejects.toThrow(EVENT_OUT_OF_SCOPE)

    expect(await readText(specialized.path)).toBe(beforeRaw)
  })

  it('rejects placement onto a missing node', async () => {
    const root = await project()
    await withDawnNode(root)
    await createTimelineEventAtNode(root, 'node-dawn', 'Harbor', { id: 'evt-harbor' }, 'Body.')

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          placements: [
            {
              proposal_id: 'p-place',
              node_id: 'missing-node',
              event_id: 'evt-harbor'
            }
          ]
        }),
        emptyDecisions({ placements: ['p-place'] })
      )
    ).rejects.toThrow(NODE_NOT_ON_TRACK)
  })

  it('rolls back create when placement targets a missing node', async () => {
    const root = await project()

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-create',
              title: 'Harbor arrival',
              content: 'Ships dock.',
              fields: {}
            }
          ],
          placements: [
            {
              proposal_id: 'p-place',
              node_id: 'node-dawn',
              create_proposal_id: 'p-create'
            }
          ]
        }),
        emptyDecisions({
          creates: [{ proposal_id: 'p-create' }],
          placements: ['p-place']
        })
      )
    ).rejects.toThrow(NODE_NOT_ON_TRACK)

    expect(await listDocs(root, 'timeline_event')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('rolls back create and place when order omits the new event', async () => {
    const root = await project()
    await withDawnNode(root)

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-create',
              title: 'Harbor arrival',
              content: 'Ships dock.',
              fields: {}
            }
          ],
          placements: [
            {
              proposal_id: 'p-place',
              node_id: 'node-dawn',
              create_proposal_id: 'p-create'
            }
          ],
          orders: [
            {
              proposal_id: 'p-order',
              node_id: 'node-dawn',
              event_ids: []
            }
          ]
        }),
        emptyDecisions({
          creates: [{ proposal_id: 'p-create' }],
          placements: ['p-place'],
          orders: ['p-order']
        })
      )
    ).rejects.toThrow()

    expect(await listDocs(root, 'timeline_event')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('rolls back the first placement and create when a later placement is illegal', async () => {
    const root = await project()
    await withDawnNode(root)

    await expect(
      applyTimelineManage(
        root,
        baseProposals({
          creates: [
            {
              proposal_id: 'p-create',
              title: 'Harbor arrival',
              content: 'Ships dock.',
              fields: {}
            }
          ],
          placements: [
            {
              proposal_id: 'p-place-ok',
              node_id: 'node-dawn',
              create_proposal_id: 'p-create'
            },
            {
              proposal_id: 'p-place-bad',
              node_id: 'missing-node',
              event_id: 'evt-does-not-matter'
            }
          ]
        }),
        emptyDecisions({
          creates: [{ proposal_id: 'p-create' }],
          placements: ['p-place-ok', 'p-place-bad']
        })
      )
    ).rejects.toThrow(NODE_NOT_ON_TRACK)

    expect(await listDocs(root, 'timeline_event')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })
})
