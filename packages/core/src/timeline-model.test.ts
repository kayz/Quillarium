import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendTimelineEvent,
  createProjectAt,
  createTimeSystem,
  createTimelineNode,
  createTimelineNodeV2,
  createTimelineTrack,
  getTimelineOrderSnapshot,
  listDocs,
  listTimelineCatalog,
  placeTimelineEvent,
  readMarkdown,
  reorderTimelineEvents,
  reorderTimelineNodes,
  reorderTimelineTracks,
  sortTimelineEventsForTrack,
  type TimeSystemV1,
  type TimelineCoordinateV2,
  type TimelineEventDoc,
  type TimelineNodeDoc,
  type TimelineTrackV1
} from './index.js'
import { compareTimelineCoordinates } from './timeline-model.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-timeline-v2-'))
  roots.push(root)
  await createProjectAt(root, { id: 'timeline-v2', title: 'Timeline v2' })
  return root
}

function system(
  id: string,
  kind: TimeSystemV1['kind'],
  conversion: TimeSystemV1['conversion'] = null
): TimeSystemV1 {
  return {
    schema_version: 1,
    id,
    version: 1,
    title: id,
    kind,
    units: [
      { id: 'era', label: 'Era', order: 0, radix: null, aliases: [] },
      { id: 'turn', label: 'Turn', order: 1, radix: 12, aliases: ['回合'] },
      { id: 'beat', label: 'Beat', order: 2, radix: 10, aliases: ['拍'] }
    ],
    conversion
  }
}

function coordinate(
  timeSystemId: string,
  explicitOrder: number,
  overrides: Partial<TimelineCoordinateV2> = {}
): TimelineCoordinateV2 {
  return {
    schema_version: 2,
    time_system_id: timeSystemId,
    components: { era: 1, turn: explicitOrder + 1 },
    precision: 'turn',
    display_text: `Turn ${explicitOrder + 1}`,
    sort_value: null,
    explicit_order: explicitOrder,
    uncertain: false,
    fuzzy: false,
    cycle: null,
    occurrence: 1,
    ...overrides
  }
}

describe('versioned timeline model', () => {
  it('keeps a virtual legacy catalog until the author explicitly creates versioned objects', async () => {
    const root = await project()
    const before = await listTimelineCatalog(root)
    expect(before.legacy_fallback).toBe(true)
    expect(before.time_systems[0]).toMatchObject({ value: { id: 'legacy-story' }, virtual: true })

    await createTimeSystem(root, system('fictional-clock', 'fictional'))
    await createTimelineTrack(root, {
      schema_version: 1,
      id: 'world-line',
      version: 1,
      title: 'World line',
      time_system_id: 'fictional-clock',
      display_order: 0,
      purpose: 'World chronology'
    })
    const after = await listTimelineCatalog(root)
    expect(after.legacy_fallback).toBe(false)
    expect(after.time_systems.map((item) => item.value.kind)).toEqual(['fictional', 'gregorian'])
  })

  it.each(['gregorian', 'fictional', 'relative', 'cyclic'] as const)(
    'persists a %s time system with custom units',
    async (kind) => {
      const root = await project()
      await createTimeSystem(root, system(`${kind}-system`, kind))
      const catalog = await listTimelineCatalog(root)
      expect(catalog.time_systems[0]?.value).toMatchObject({
        kind,
        units: expect.arrayContaining([expect.objectContaining({ id: 'beat' })])
      })
    }
  )

  it('compares mixed precision only through a declared conversion or explicit order', () => {
    const converted = system('convertible', 'fictional', {
      epoch: 0,
      unit_factors: { era: 120, turn: 10, beat: 1 }
    })
    const earlier = coordinate('convertible', 20, {
      components: { era: 1, turn: 2 },
      precision: 'turn'
    })
    const later = coordinate('convertible', 1, {
      components: { era: 1, turn: 2, beat: 5 },
      precision: 'beat'
    })
    expect(compareTimelineCoordinates(earlier, later, converted)).toBeLessThan(0)
    expect(compareTimelineCoordinates(earlier, later)).toBeGreaterThan(0)
    expect(
      compareTimelineCoordinates({ ...earlier, explicit_order: null }, { ...later, explicit_order: null })
    ).toBeNull()
  })

  it('keeps cycle occurrences distinct at the same cyclic coordinate', async () => {
    const root = await project()
    await createTimeSystem(root, system('cycle-clock', 'cyclic'))
    await createTimelineTrack(root, {
      schema_version: 1,
      id: 'cycle-line',
      version: 1,
      title: 'Cycle line',
      time_system_id: 'cycle-clock',
      display_order: 0,
      purpose: 'Loop chronology'
    })
    await createTimelineNodeV2(root, {
      id: 'cycle-one',
      title: 'First occurrence',
      coordinate: coordinate('cycle-clock', 0, { cycle: 1, occurrence: 1 }),
      track_ids: ['cycle-line']
    })
    await createTimelineNodeV2(root, {
      id: 'cycle-two',
      title: 'Second occurrence',
      coordinate: coordinate('cycle-clock', 0, { cycle: 2, occurrence: 2 }),
      track_ids: ['cycle-line']
    })
    expect(await listDocs<TimelineNodeDoc>(root, 'timeline_node')).toHaveLength(2)
  })

  it('creates a V2 node and places its source event on every selected track in one locked operation', async () => {
    const root = await project()
    await createTimeSystem(root, system('fictional-clock', 'fictional'))
    for (const [id, displayOrder] of [
      ['world-line', 0],
      ['narrative-line', 1]
    ] as const) {
      await createTimelineTrack(root, {
        schema_version: 1,
        id,
        version: 1,
        title: id,
        time_system_id: 'fictional-clock',
        display_order: displayOrder,
        purpose: ''
      })
    }
    await appendTimelineEvent(root, 'Source event', { id: 'source-event', date: '第一纪元' })

    await createTimelineNodeV2(root, {
      id: 'opening-node',
      title: 'Opening node',
      coordinate: coordinate('fictional-clock', 0),
      track_ids: ['world-line', 'narrative-line'],
      source_event_id: 'source-event'
    })

    const [node] = await listDocs<TimelineNodeDoc>(root, 'timeline_node')
    const [event] = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    expect(node?.data.timeline_tracks).toEqual([
      { timeline_id: 'world-line', order: 0, narrative_order: 0 },
      { timeline_id: 'narrative-line', order: 0, narrative_order: 0 }
    ])
    expect(event?.data.placements).toEqual([
      expect.objectContaining({ timeline_id: 'world-line', start_node_id: 'opening-node' }),
      expect.objectContaining({ timeline_id: 'narrative-line', start_node_id: 'opening-node' })
    ])
  })

  it('places one interval event on multiple tracks without duplicating the event fact', async () => {
    const root = await project()
    await createTimelineTrack(root, {
      schema_version: 1,
      id: 'narrative-line',
      version: 1,
      title: 'Narrative line',
      time_system_id: 'legacy-story',
      display_order: 1,
      purpose: 'Narrative appearance'
    })
    await createTimelineNode(root, 'Start', {
      id: 'start',
      year: 1,
      month: 1,
      timeline_tracks: [
        { timeline_id: 'main', order: 0, narrative_order: 0 },
        { timeline_id: 'narrative-line', order: 0, narrative_order: 0 }
      ]
    })
    await createTimelineNode(root, 'End', {
      id: 'end',
      year: 1,
      month: 2,
      timeline_tracks: [
        { timeline_id: 'main', order: 1, narrative_order: 1 },
        { timeline_id: 'narrative-line', order: 1, narrative_order: 1 }
      ]
    })
    const eventPath = await appendTimelineEvent(root, 'Long event', { id: 'long-event' })
    const initial = await getTimelineOrderSnapshot(root, 'main')
    await placeTimelineEvent(root, {
      event_id: 'long-event',
      timeline_id: 'main',
      start_node_id: 'start',
      end_node_id: 'end',
      mode: 'add',
      expected_hash: initial.event_hashes['long-event']
    })
    const afterFirst = await getTimelineOrderSnapshot(root, 'main')
    await placeTimelineEvent(root, {
      event_id: 'long-event',
      timeline_id: 'narrative-line',
      start_node_id: 'start',
      end_node_id: null,
      mode: 'add',
      expected_hash: afterFirst.event_hashes['long-event']
    })
    const parsed = await readMarkdown<Record<string, unknown>>(eventPath)
    expect(parsed.data.id).toBe('long-event')
    expect(parsed.data.placements).toEqual([
      expect.objectContaining({ timeline_id: 'main', start_node_id: 'start', end_node_id: 'end' }),
      expect.objectContaining({
        timeline_id: 'narrative-line',
        start_node_id: 'start',
        end_node_id: null
      })
    ])
    expect(await listDocs<TimelineEventDoc>(root, 'timeline_event')).toHaveLength(1)
  })

  it('atomically persists node and same-node event order across a reload', async () => {
    const root = await project()
    await createTimelineNode(root, 'One', { id: 'one', year: 1, month: 1 })
    await createTimelineNode(root, 'Two', { id: 'two', year: 1, month: 2 })
    await appendTimelineEvent(root, 'A', { id: 'event-a', timeline_node: 'one' })
    await appendTimelineEvent(root, 'B', { id: 'event-b', timeline_node: 'one' })
    const snapshot = await getTimelineOrderSnapshot(root, 'main')

    await reorderTimelineNodes(root, {
      track_id: 'main',
      ordered_node_ids: ['two', 'one'],
      expected_hashes: snapshot.node_hashes
    })
    const secondSnapshot = await getTimelineOrderSnapshot(root, 'main')
    await reorderTimelineEvents(root, {
      track_id: 'main',
      node_id: 'one',
      ordered_event_ids: ['event-b', 'event-a'],
      expected_hashes: secondSnapshot.event_hashes
    })

    const reloaded = await getTimelineOrderSnapshot(root, 'main')
    expect(reloaded.node_ids).toEqual(['two', 'one'])
    expect(reloaded.event_ids_by_node.one).toEqual(['event-b', 'event-a'])
    const [nodes, events] = await Promise.all([
      listDocs<TimelineNodeDoc>(root, 'timeline_node'),
      listDocs<TimelineEventDoc>(root, 'timeline_event')
    ])
    expect(
      sortTimelineEventsForTrack(
        events.map((item) => item.data),
        nodes.map((item) => item.data),
        'main'
      ).map((item) => item.id)
    ).toEqual(['event-b', 'event-a'])
  })

  it('reorders persisted tracks and rejects stale node hashes', async () => {
    const root = await project()
    await createTimeSystem(root, system('clock', 'fictional'))
    const tracks: TimelineTrackV1[] = [
      {
        schema_version: 1,
        id: 'alpha',
        version: 1,
        title: 'Alpha',
        time_system_id: 'clock',
        display_order: 0,
        purpose: ''
      },
      {
        schema_version: 1,
        id: 'beta',
        version: 1,
        title: 'Beta',
        time_system_id: 'clock',
        display_order: 1,
        purpose: ''
      }
    ]
    for (const track of tracks) await createTimelineTrack(root, track)
    const catalog = await listTimelineCatalog(root)
    await reorderTimelineTracks(
      root,
      ['beta', 'alpha'],
      Object.fromEntries(catalog.tracks.map((item) => [item.value.id, item.source_sha256]))
    )
    expect((await listTimelineCatalog(root)).tracks.map((item) => item.value.id)).toEqual([
      'beta',
      'main',
      'alpha'
    ])

    await createTimelineNode(root, 'Node', { id: 'node', year: 1, month: 1 })
    const snapshot = await getTimelineOrderSnapshot(root, 'main')
    await expect(
      reorderTimelineNodes(root, {
        track_id: 'main',
        ordered_node_ids: ['node'],
        expected_hashes: { ...snapshot.node_hashes, node: 'stale' }
      })
    ).rejects.toMatchObject({ code: 'TIMELINE_MODEL_CONFLICT' })
  })
})
