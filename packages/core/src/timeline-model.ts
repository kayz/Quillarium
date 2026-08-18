import path from 'node:path'
import { realpath, rm } from 'node:fs/promises'
import type { ZodType } from 'zod'
import {
  createVersionedYaml,
  deleteVersionedYaml,
  listVersionedYaml,
  loadVersionedYaml,
  sha256Text,
  updateVersionedYaml,
  type LoadedVersionedYaml
} from './versioned-yaml-store.js'
import { createTimelineNode, listDocs } from './documents.js'
import { readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { timeSystemV1Schema, timelineCoordinateV2Schema, timelineTrackV1Schema } from './schema.js'
import type {
  TimeSystemV1,
  TimelineCoordinateV2,
  TimelineEventDoc,
  TimelineNodeDoc,
  TimelinePlacementV1,
  TimelineTrackV1
} from './types.js'

export const DEFAULT_TIME_SYSTEM_ID = 'legacy-story'
export const DEFAULT_TIMELINE_TRACK_ID = 'main'
const TIME_SYSTEM_DIRECTORY = 'timeline/time-systems'
const TRACK_DIRECTORY = 'timeline/tracks'
const timeSystemSchema = timeSystemV1Schema as ZodType<TimeSystemV1>
const trackSchema = timelineTrackV1Schema as ZodType<TimelineTrackV1>

export interface TimelineCatalogV1 {
  time_systems: Array<LoadedVersionedYaml<TimeSystemV1> & { virtual?: boolean }>
  tracks: Array<LoadedVersionedYaml<TimelineTrackV1> & { virtual?: boolean }>
  legacy_fallback: boolean
}

export interface TimelineOrderSnapshotV1 {
  schema_version: 1
  track_id: string
  node_hashes: Record<string, string>
  event_hashes: Record<string, string>
  node_ids: string[]
  event_ids_by_node: Record<string, string[]>
}

export interface ReorderTimelineNodesRequestV1 {
  track_id: string
  ordered_node_ids: string[]
  expected_hashes: Record<string, string>
  order_kind?: 'display' | 'narrative'
}

export interface ReorderTimelineEventsRequestV1 {
  track_id: string
  node_id: string
  ordered_event_ids: string[]
  expected_hashes: Record<string, string>
  order_kind?: 'display' | 'narrative'
}

export interface PlaceTimelineEventRequestV1 {
  event_id: string
  timeline_id: string
  start_node_id: string
  end_node_id?: string | null
  mode: 'add' | 'move'
  expected_hash: string
  occurrence?: number
}

export interface CreateTimelineNodeV2Input {
  id?: string
  title: string
  coordinate: TimelineCoordinateV2
  track_ids: string[]
  source_event_id?: string
  content?: string
}

export class TimelineModelConflictError extends Error {
  readonly code = 'TIMELINE_MODEL_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'TimelineModelConflictError'
  }
}

export const LEGACY_TIME_SYSTEM: TimeSystemV1 = {
  schema_version: 1,
  id: DEFAULT_TIME_SYSTEM_ID,
  version: 1,
  title: 'Story calendar',
  kind: 'gregorian',
  units: [
    { id: 'year', label: 'Year', order: 0, radix: null, aliases: ['年'] },
    { id: 'month', label: 'Month', order: 1, radix: 12, aliases: ['月'] },
    { id: 'day', label: 'Day', order: 2, radix: 31, aliases: ['日'] },
    { id: 'hour', label: 'Hour', order: 3, radix: 24, aliases: ['时辰', '时'] },
    { id: 'minute', label: 'Minute', order: 4, radix: 60, aliases: ['分'] }
  ],
  conversion: {
    epoch: 0,
    unit_factors: { year: 12 * 31 * 24 * 60, month: 31 * 24 * 60, day: 24 * 60, hour: 60, minute: 1 }
  }
}

export const LEGACY_TIMELINE_TRACK: TimelineTrackV1 = {
  schema_version: 1,
  id: DEFAULT_TIMELINE_TRACK_ID,
  version: 1,
  title: 'Main timeline',
  time_system_id: DEFAULT_TIME_SYSTEM_ID,
  display_order: 0,
  purpose: 'Legacy-compatible world chronology'
}

export async function listTimelineCatalog(projectRoot: string): Promise<TimelineCatalogV1> {
  const [systems, tracks] = await Promise.all([
    listVersionedYaml(projectRoot, TIME_SYSTEM_DIRECTORY, timeSystemSchema),
    listVersionedYaml(projectRoot, TRACK_DIRECTORY, trackSchema)
  ])
  const effectiveSystems = systems.some((item) => item.value.id === DEFAULT_TIME_SYSTEM_ID)
    ? systems
    : [...systems, { value: LEGACY_TIME_SYSTEM, source_path: '', source_sha256: '', virtual: true as const }]
  const effectiveTracks = tracks.some((item) => item.value.id === DEFAULT_TIMELINE_TRACK_ID)
    ? tracks
    : [
        ...tracks,
        { value: LEGACY_TIMELINE_TRACK, source_path: '', source_sha256: '', virtual: true as const }
      ]
  const systemIds = new Set(effectiveSystems.map((item) => item.value.id))
  for (const track of effectiveTracks) {
    if (!systemIds.has(track.value.time_system_id)) {
      throw new Error(
        `Timeline track ${track.value.id} references missing time system ${track.value.time_system_id}.`
      )
    }
  }
  return {
    time_systems: effectiveSystems,
    tracks: effectiveTracks
      .slice()
      .sort(
        (left, right) =>
          left.value.display_order - right.value.display_order ||
          left.value.id.localeCompare(right.value.id, 'en')
      ),
    legacy_fallback: systems.length === 0 && tracks.length === 0
  }
}

export async function createTimeSystem(
  projectRoot: string,
  value: TimeSystemV1
): Promise<LoadedVersionedYaml<TimeSystemV1>> {
  return withProjectWriteLock(projectRoot, async () => {
    const parsed = timeSystemSchema.parse(value)
    validateTimeSystem(parsed)
    return createVersionedYaml(projectRoot, TIME_SYSTEM_DIRECTORY, parsed, timeSystemSchema)
  })
}

export async function updateTimeSystem(
  projectRoot: string,
  value: TimeSystemV1,
  expectedSha256: string
): Promise<LoadedVersionedYaml<TimeSystemV1>> {
  return withProjectWriteLock(projectRoot, async () => {
    const parsed = timeSystemSchema.parse(value)
    validateTimeSystem(parsed)
    return updateVersionedYaml(projectRoot, TIME_SYSTEM_DIRECTORY, parsed, expectedSha256, timeSystemSchema)
  })
}

export async function deleteTimeSystem(
  projectRoot: string,
  id: string,
  expectedSha256: string
): Promise<void> {
  await withProjectWriteLock(projectRoot, async () => {
    const tracks = await listVersionedYaml(projectRoot, TRACK_DIRECTORY, trackSchema)
    if (tracks.some((track) => track.value.time_system_id === id)) {
      throw new Error(`Time system ${id} is still used by a timeline track.`)
    }
    await deleteVersionedYaml(projectRoot, TIME_SYSTEM_DIRECTORY, id, expectedSha256, timeSystemSchema)
  })
}

export async function createTimelineTrack(
  projectRoot: string,
  value: TimelineTrackV1
): Promise<LoadedVersionedYaml<TimelineTrackV1>> {
  return withProjectWriteLock(projectRoot, async () => {
    const parsed = trackSchema.parse(value)
    await assertTimeSystemExists(projectRoot, parsed.time_system_id)
    return createVersionedYaml(projectRoot, TRACK_DIRECTORY, parsed, trackSchema)
  })
}

export async function updateTimelineTrack(
  projectRoot: string,
  value: TimelineTrackV1,
  expectedSha256: string
): Promise<LoadedVersionedYaml<TimelineTrackV1>> {
  return withProjectWriteLock(projectRoot, async () => {
    const parsed = trackSchema.parse(value)
    await assertTimeSystemExists(projectRoot, parsed.time_system_id)
    return updateVersionedYaml(projectRoot, TRACK_DIRECTORY, parsed, expectedSha256, trackSchema)
  })
}

export async function deleteTimelineTrack(
  projectRoot: string,
  id: string,
  expectedSha256: string
): Promise<void> {
  await withProjectWriteLock(projectRoot, async () => {
    const [nodes, events] = await Promise.all([
      listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node'),
      listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
    ])
    if (
      nodes.some((node) =>
        (node.data.timeline_tracks ?? []).some((placement) => placement.timeline_id === id)
      )
    ) {
      throw new Error(`Timeline track ${id} still contains time nodes.`)
    }
    if (
      events.some((event) => (event.data.placements ?? []).some((placement) => placement.timeline_id === id))
    ) {
      throw new Error(`Timeline track ${id} still contains events.`)
    }
    await deleteVersionedYaml(projectRoot, TRACK_DIRECTORY, id, expectedSha256, trackSchema)
  })
}

export function compareTimelineCoordinates(
  left: TimelineCoordinateV2,
  right: TimelineCoordinateV2,
  timeSystem?: TimeSystemV1
): number | null {
  const a = timelineCoordinateV2Schema.parse(left)
  const b = timelineCoordinateV2Schema.parse(right)
  if (a.time_system_id !== b.time_system_id) return null
  if (a.sort_value !== null && b.sort_value !== null) {
    return a.sort_value - b.sort_value || compareOccurrence(a, b)
  }
  if (timeSystem?.id === a.time_system_id && timeSystem.conversion) {
    const leftValue = coordinateConversionValue(a, timeSystem)
    const rightValue = coordinateConversionValue(b, timeSystem)
    if (leftValue !== null && rightValue !== null) {
      return leftValue - rightValue || compareOccurrence(a, b)
    }
  }
  if (a.explicit_order !== null && b.explicit_order !== null) {
    return a.explicit_order - b.explicit_order || compareOccurrence(a, b)
  }
  return null
}

export async function createTimelineNodeV2(
  projectRoot: string,
  input: CreateTimelineNodeV2Input
): Promise<string> {
  const root = await realpath(projectRoot)
  return withProjectWriteLock(root, async () => {
    const coordinate = timelineCoordinateV2Schema.parse(input.coordinate) as TimelineCoordinateV2
    const catalog = await listTimelineCatalog(root)
    if (!catalog.time_systems.some((item) => item.value.id === coordinate.time_system_id)) {
      throw new Error(`Time system not found: ${coordinate.time_system_id}`)
    }
    const uniqueTracks = [...new Set(input.track_ids)]
    if (!uniqueTracks.length) throw new Error('A timeline node must belong to at least one track.')
    for (const trackId of uniqueTracks) {
      const track = catalog.tracks.find((item) => item.value.id === trackId)
      if (!track) throw new Error(`Timeline track not found: ${trackId}`)
      if (track.value.time_system_id !== coordinate.time_system_id) {
        throw new Error(`Timeline track ${trackId} uses a different time system.`)
      }
    }
    const [nodes, events] = await Promise.all([
      listDocs<TimelineNodeDoc>(root, 'timeline_node'),
      listDocs<TimelineEventDoc>(root, 'timeline_event')
    ])
    const sourceEvent = input.source_event_id
      ? events.find((item) => item.data.id === input.source_event_id)
      : undefined
    if (input.source_event_id && !sourceEvent) {
      throw new Error(`Timeline event not found: ${input.source_event_id}`)
    }
    const snapshots = new Map<string, string>()
    for (const document of [...nodes, ...events]) snapshots.set(document.path, await readText(document.path))
    const placements = uniqueTracks.map((trackId) => {
      const order = nodes.filter((item) => nodeBelongsToTrack(item.data, trackId)).length
      return { timeline_id: trackId, order, narrative_order: order }
    })
    const component = (id: string, fallback: number): number => {
      const value = coordinate.components[id]
      return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
    }
    let createdPath: string | undefined
    try {
      createdPath = await createTimelineNode(
        root,
        input.title,
        {
          ...(input.id ? { id: input.id } : {}),
          year: component('year', 0),
          month: Math.min(12, Math.max(1, component('month', 1))),
          day:
            coordinate.precision === 'day' ||
            coordinate.precision === 'hour' ||
            coordinate.precision === 'minute'
              ? Math.min(31, Math.max(1, component('day', 1)))
              : null,
          hour:
            coordinate.precision === 'hour' || coordinate.precision === 'minute'
              ? Math.min(23, Math.max(0, component('hour', 0)))
              : null,
          minute:
            coordinate.precision === 'minute' ? Math.min(59, Math.max(0, component('minute', 0))) : null,
          precision: ['month', 'day', 'hour', 'minute'].includes(coordinate.precision)
            ? (coordinate.precision as TimelineNodeDoc['precision'])
            : 'month',
          display_time: coordinate.display_text,
          fuzzy: coordinate.fuzzy,
          coordinate_v2: coordinate,
          timeline_tracks: placements
        },
        input.content ?? ''
      )
      const created = await readMarkdown<Record<string, unknown>>(createdPath)
      const nodeId = String(created.data['id'])
      if (sourceEvent) {
        const current = await readMarkdown<Record<string, unknown>>(sourceEvent.path)
        const currentPlacements = Array.isArray(current.data['placements'])
          ? current.data['placements'].filter(isTimelinePlacementRecord)
          : []
        const sourcePlacements = uniqueTracks.map((trackId) => {
          const order = events.filter(
            (event) => event.data.id !== sourceEvent.data.id && eventStartNode(event.data, trackId) === nodeId
          ).length
          return {
            timeline_id: trackId,
            start_node_id: nodeId,
            end_node_id: null,
            order,
            narrative_order: order,
            occurrence: coordinate.occurrence
          }
        })
        await writeMarkdown(
          sourceEvent.path,
          {
            ...current.data,
            timeline_node: uniqueTracks.includes(DEFAULT_TIMELINE_TRACK_ID)
              ? nodeId
              : current.data['timeline_node'],
            date: coordinate.display_text,
            placements: [
              ...currentPlacements.filter(
                (placement) => !uniqueTracks.includes(String(placement['timeline_id']))
              ),
              ...sourcePlacements
            ]
          },
          current.content
        )
      }
      const verifiedNode = await readMarkdown<Record<string, unknown>>(createdPath)
      if (JSON.stringify(verifiedNode.data['coordinate_v2']) !== JSON.stringify(coordinate)) {
        throw new Error('Timeline node creation verification failed for coordinate_v2.')
      }
      if (sourceEvent) {
        const verifiedEvent = await readMarkdown<Record<string, unknown>>(sourceEvent.path)
        const verifiedPlacements = Array.isArray(verifiedEvent.data['placements'])
          ? verifiedEvent.data['placements'].filter(isTimelinePlacementRecord)
          : []
        if (
          uniqueTracks.some(
            (trackId) =>
              !verifiedPlacements.some(
                (placement) => placement['timeline_id'] === trackId && placement['start_node_id'] === nodeId
              )
          )
        ) {
          throw new Error('Timeline event placement verification failed after node creation.')
        }
      }
      return createdPath
    } catch (error) {
      if (createdPath) await rm(createdPath, { force: true })
      for (const [file, raw] of snapshots) await writeText(file, raw)
      throw error
    }
  })
}

export async function getTimelineOrderSnapshot(
  projectRoot: string,
  trackId: string
): Promise<TimelineOrderSnapshotV1> {
  await assertTimelineTrackExists(projectRoot, trackId)
  const [nodes, events] = await Promise.all([
    listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node'),
    listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
  ])
  const orderedNodes = sortTimelineNodesForTrack(
    nodes.map((item) => item.data),
    trackId
  )
  const nodeHashes = Object.fromEntries(
    await Promise.all(
      nodes.map(async (item) => [item.data.id, sha256Text(await readText(item.path))] as const)
    )
  )
  const eventHashes = Object.fromEntries(
    await Promise.all(
      events.map(async (item) => [item.data.id, sha256Text(await readText(item.path))] as const)
    )
  )
  const eventIdsByNode: Record<string, string[]> = {}
  for (const node of orderedNodes) {
    eventIdsByNode[node.id] = sortTimelineEventsForTrack(
      events.map((item) => item.data),
      nodes.map((item) => item.data),
      trackId
    )
      .filter((event) => eventStartNode(event, trackId) === node.id)
      .map((event) => event.id)
  }
  return {
    schema_version: 1,
    track_id: trackId,
    node_hashes: nodeHashes,
    event_hashes: eventHashes,
    node_ids: orderedNodes.map((node) => node.id),
    event_ids_by_node: eventIdsByNode
  }
}

export async function reorderTimelineTracks(
  projectRoot: string,
  orderedTrackIds: string[],
  expectedHashes: Record<string, string>
): Promise<TimelineTrackV1[]> {
  return withProjectWriteLock(projectRoot, async () => {
    const tracks = await listVersionedYaml(projectRoot, TRACK_DIRECTORY, trackSchema)
    assertSameIds(
      orderedTrackIds,
      tracks.map((track) => track.value.id),
      'timeline tracks'
    )
    const byId = new Map(tracks.map((track) => [track.value.id, track] as const))
    for (const track of tracks) {
      if (expectedHashes[track.value.id] !== track.source_sha256) {
        throw new TimelineModelConflictError(`Timeline track changed: ${track.value.id}`)
      }
    }
    const snapshots = new Map(
      await Promise.all(
        tracks.map(
          async (track) =>
            [track.source_path, await readText(path.join(projectRoot, track.source_path))] as const
        )
      )
    )
    const written: string[] = []
    try {
      for (const [displayOrder, id] of orderedTrackIds.entries()) {
        const current = byId.get(id)!
        await updateVersionedYaml(
          projectRoot,
          TRACK_DIRECTORY,
          { ...current.value, display_order: displayOrder },
          current.source_sha256,
          trackSchema
        )
        written.push(current.source_path)
      }
    } catch (error) {
      await rollbackRawFiles(projectRoot, written, snapshots)
      throw error
    }
    return (await listVersionedYaml(projectRoot, TRACK_DIRECTORY, trackSchema))
      .map((item) => item.value)
      .sort((left, right) => left.display_order - right.display_order)
  })
}

export async function reorderTimelineNodes(
  projectRoot: string,
  request: ReorderTimelineNodesRequestV1
): Promise<TimelineNodeDoc[]> {
  return withProjectWriteLock(projectRoot, async () => {
    await assertTimelineTrackExists(projectRoot, request.track_id)
    const documents = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
    const eligible = documents.filter((item) => nodeBelongsToTrack(item.data, request.track_id))
    assertSameIds(
      request.ordered_node_ids,
      eligible.map((item) => item.data.id),
      'timeline nodes'
    )
    const byId = new Map(eligible.map((item) => [item.data.id, item] as const))
    const changes = request.ordered_node_ids.map((id, order) => {
      const document = byId.get(id)!
      const placement = nodePlacement(document.data, request.track_id)
      const updatedPlacement = {
        timeline_id: request.track_id,
        order: request.order_kind === 'narrative' ? placement.order : order,
        narrative_order: request.order_kind === 'display' ? placement.narrative_order : order
      }
      return {
        document,
        expected_hash: request.expected_hashes[id],
        data: {
          ...document.data,
          timeline_tracks: [
            ...(document.data.timeline_tracks ?? []).filter((item) => item.timeline_id !== request.track_id),
            updatedPlacement
          ]
        }
      }
    })
    await atomicRewriteDocuments(projectRoot, changes)
    return sortTimelineNodesForTrack(
      changes.map((change) => change.data),
      request.track_id
    )
  })
}

export async function reorderTimelineEvents(
  projectRoot: string,
  request: ReorderTimelineEventsRequestV1
): Promise<TimelineEventDoc[]> {
  return withProjectWriteLock(projectRoot, async () => {
    await assertTimelineTrackExists(projectRoot, request.track_id)
    const [events, nodes] = await Promise.all([
      listDocs<TimelineEventDoc>(projectRoot, 'timeline_event'),
      listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
    ])
    if (
      !nodes.some(
        (node) => node.data.id === request.node_id && nodeBelongsToTrack(node.data, request.track_id)
      )
    ) {
      throw new Error(`Timeline node ${request.node_id} does not belong to track ${request.track_id}.`)
    }
    const eligible = events.filter(
      (event) => eventStartNode(event.data, request.track_id) === request.node_id
    )
    assertSameIds(
      request.ordered_event_ids,
      eligible.map((item) => item.data.id),
      'timeline events'
    )
    const byId = new Map(eligible.map((item) => [item.data.id, item] as const))
    const changes = request.ordered_event_ids.map((id, order) => {
      const document = byId.get(id)!
      const placement = eventPlacement(document.data, request.track_id)
      const updated: TimelinePlacementV1 = {
        ...placement,
        order: request.order_kind === 'narrative' ? placement.order : order,
        narrative_order: request.order_kind === 'display' ? placement.narrative_order : order
      }
      return {
        document,
        expected_hash: request.expected_hashes[id],
        data: {
          ...document.data,
          placements: [
            ...(document.data.placements ?? []).filter((item) => item.timeline_id !== request.track_id),
            updated
          ]
        }
      }
    })
    await atomicRewriteDocuments(projectRoot, changes)
    return changes
      .map((change) => change.data)
      .sort(
        (left, right) =>
          eventPlacement(left, request.track_id).order - eventPlacement(right, request.track_id).order
      )
  })
}

export async function placeTimelineEvent(
  projectRoot: string,
  request: PlaceTimelineEventRequestV1
): Promise<TimelineEventDoc> {
  return withProjectWriteLock(projectRoot, async () => {
    await assertTimelineTrackExists(projectRoot, request.timeline_id)
    const [events, nodes] = await Promise.all([
      listDocs<TimelineEventDoc>(projectRoot, 'timeline_event'),
      listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
    ])
    const event = events.find((item) => item.data.id === request.event_id)
    if (!event) throw new Error(`Timeline event not found: ${request.event_id}`)
    const start = nodes.find((item) => item.data.id === request.start_node_id)
    const end = request.end_node_id ? nodes.find((item) => item.data.id === request.end_node_id) : undefined
    if (!start || !nodeBelongsToTrack(start.data, request.timeline_id)) {
      throw new Error(`Start node ${request.start_node_id} is not on track ${request.timeline_id}.`)
    }
    if (request.end_node_id && (!end || !nodeBelongsToTrack(end.data, request.timeline_id))) {
      throw new Error(`End node ${request.end_node_id} is not on track ${request.timeline_id}.`)
    }
    const nodeOrder = new Map(
      sortTimelineNodesForTrack(
        nodes.map((item) => item.data),
        request.timeline_id
      ).map((node, index) => [node.id, index] as const)
    )
    if (end && Number(nodeOrder.get(end.data.id)) < Number(nodeOrder.get(start.data.id))) {
      throw new Error('Timeline interval end must not precede its start.')
    }
    const siblings = events.filter(
      (item) => eventStartNode(item.data, request.timeline_id) === request.start_node_id
    )
    const placement: TimelinePlacementV1 = {
      timeline_id: request.timeline_id,
      start_node_id: request.start_node_id,
      end_node_id: request.end_node_id ?? null,
      order: siblings.length,
      narrative_order: siblings.length,
      occurrence: request.occurrence ?? 1
    }
    const data: TimelineEventDoc = {
      ...event.data,
      timeline_node:
        request.timeline_id === DEFAULT_TIMELINE_TRACK_ID ? request.start_node_id : event.data.timeline_node,
      placements: [
        ...(request.mode === 'move'
          ? []
          : (event.data.placements ?? []).filter((item) => item.timeline_id !== request.timeline_id)),
        placement
      ]
    }
    await atomicRewriteDocuments(projectRoot, [
      { document: event, expected_hash: request.expected_hash, data }
    ])
    return data
  })
}

export function sortTimelineNodesForTrack(nodes: TimelineNodeDoc[], trackId: string): TimelineNodeDoc[] {
  return nodes
    .filter((node) => nodeBelongsToTrack(node, trackId))
    .slice()
    .sort((left, right) => {
      const a = nodePlacement(left, trackId)
      const b = nodePlacement(right, trackId)
      return a.order - b.order || a.narrative_order - b.narrative_order || legacyNodeFallback(left, right)
    })
}

export function sortTimelineEventsForTrack(
  events: TimelineEventDoc[],
  nodes: TimelineNodeDoc[],
  trackId: string
): TimelineEventDoc[] {
  const nodeOrder = new Map(sortTimelineNodesForTrack(nodes, trackId).map((node, index) => [node.id, index]))
  return events
    .filter((event) => eventStartNode(event, trackId) !== null)
    .slice()
    .sort((left, right) => {
      const a = eventPlacement(left, trackId)
      const b = eventPlacement(right, trackId)
      return (
        Number(nodeOrder.get(a.start_node_id) ?? Number.MAX_SAFE_INTEGER) -
          Number(nodeOrder.get(b.start_node_id) ?? Number.MAX_SAFE_INTEGER) ||
        a.order - b.order ||
        a.narrative_order - b.narrative_order ||
        left.id.localeCompare(right.id, 'en')
      )
    })
}

export function nodeBelongsToTrack(node: TimelineNodeDoc, trackId: string): boolean {
  if ((node.timeline_tracks ?? []).some((placement) => placement.timeline_id === trackId)) return true
  return trackId === DEFAULT_TIMELINE_TRACK_ID && (node.timeline_tracks ?? []).length === 0
}

export function eventStartNode(event: TimelineEventDoc, trackId: string): string | null {
  const placement = (event.placements ?? []).find((item) => item.timeline_id === trackId)
  if (placement) return placement.start_node_id
  if (trackId === DEFAULT_TIMELINE_TRACK_ID && (event.placements ?? []).length === 0) {
    return event.timeline_node
  }
  return null
}

function nodePlacement(node: TimelineNodeDoc, trackId: string) {
  const placement = (node.timeline_tracks ?? []).find((item) => item.timeline_id === trackId)
  if (placement) return placement
  if (trackId !== DEFAULT_TIMELINE_TRACK_ID) {
    throw new Error(`Timeline node ${node.id} is not on track ${trackId}.`)
  }
  const fallback = legacyNodeSortValue(node)
  return { timeline_id: trackId, order: fallback, narrative_order: fallback }
}

function eventPlacement(event: TimelineEventDoc, trackId: string): TimelinePlacementV1 {
  const placement = (event.placements ?? []).find((item) => item.timeline_id === trackId)
  if (placement) return placement
  if (trackId !== DEFAULT_TIMELINE_TRACK_ID || !event.timeline_node) {
    throw new Error(`Timeline event ${event.id} is not on track ${trackId}.`)
  }
  return {
    timeline_id: trackId,
    start_node_id: event.timeline_node,
    end_node_id: null,
    order: 0,
    narrative_order: 0,
    occurrence: 1
  }
}

function isTimelinePlacementRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

async function assertTimeSystemExists(projectRoot: string, id: string): Promise<void> {
  if (id === DEFAULT_TIME_SYSTEM_ID) return
  await loadVersionedYaml(projectRoot, TIME_SYSTEM_DIRECTORY, id, timeSystemSchema)
}

async function assertTimelineTrackExists(projectRoot: string, id: string): Promise<void> {
  if (id === DEFAULT_TIMELINE_TRACK_ID) return
  await loadVersionedYaml(projectRoot, TRACK_DIRECTORY, id, trackSchema)
}

function validateTimeSystem(system: TimeSystemV1): void {
  const unitIds = new Set<string>()
  const orders = new Set<number>()
  for (const unit of system.units) {
    if (unitIds.has(unit.id)) throw new Error(`Duplicate time unit id: ${unit.id}`)
    if (orders.has(unit.order)) throw new Error(`Duplicate time unit order: ${unit.order}`)
    unitIds.add(unit.id)
    orders.add(unit.order)
  }
  for (const id of Object.keys(system.conversion?.unit_factors ?? {})) {
    if (!unitIds.has(id)) throw new Error(`Conversion references unknown time unit: ${id}`)
  }
}

function coordinateConversionValue(coordinate: TimelineCoordinateV2, system: TimeSystemV1): number | null {
  const factors = system.conversion?.unit_factors
  if (!factors) return null
  let value = system.conversion?.epoch ?? 0
  for (const unit of system.units) {
    const component = coordinate.components[unit.id]
    if (component === undefined) continue
    if (typeof component !== 'number' || factors[unit.id] === undefined) return null
    value += component * factors[unit.id]
  }
  return value
}

function compareOccurrence(left: TimelineCoordinateV2, right: TimelineCoordinateV2): number {
  return (left.cycle ?? 0) - (right.cycle ?? 0) || left.occurrence - right.occurrence
}

function legacyNodeSortValue(node: TimelineNodeDoc): number {
  if (node.coordinate_v2?.explicit_order !== null && node.coordinate_v2?.explicit_order !== undefined) {
    return node.coordinate_v2.explicit_order
  }
  return (
    (((node.year + 1_000_000) * 13 + node.month) * 32 + (node.day ?? 0)) * 1_440 +
    (node.hour ?? 0) * 60 +
    (node.minute ?? 0)
  )
}

function legacyNodeFallback(left: TimelineNodeDoc, right: TimelineNodeDoc): number {
  return legacyNodeSortValue(left) - legacyNodeSortValue(right) || left.id.localeCompare(right.id, 'en')
}

function assertSameIds(actual: string[], expected: string[], label: string): void {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) {
    throw new Error(`Reorder request must contain every ${label} exactly once.`)
  }
  const expectedSet = new Set(expected)
  if (actual.some((id) => !expectedSet.has(id))) {
    throw new Error(`Reorder request contains a ${label} item outside the requested scope.`)
  }
}

async function atomicRewriteDocuments<T extends TimelineNodeDoc | TimelineEventDoc>(
  projectRoot: string,
  changes: Array<{
    document: { path: string; data: T; content: string }
    expected_hash: string | undefined
    data: T
  }>
): Promise<void> {
  const root = await realpath(projectRoot)
  const snapshots = new Map<string, string>()
  for (const change of changes) {
    const absolute = await realpath(change.document.path)
    const relative = path.relative(root, absolute)
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Timeline document is outside the project: ${change.document.path}`)
    }
    const raw = await readText(absolute)
    if (!change.expected_hash || sha256Text(raw) !== change.expected_hash) {
      throw new TimelineModelConflictError(`Timeline document changed: ${change.document.data.id}`)
    }
    snapshots.set(absolute, raw)
  }
  const written: string[] = []
  try {
    for (const change of changes) {
      await writeMarkdown(
        change.document.path,
        change.data as unknown as Record<string, unknown>,
        change.document.content
      )
      written.push(change.document.path)
    }
    for (const change of changes) {
      const parsed = await readMarkdown<Record<string, unknown>>(change.document.path)
      const expected = change.data as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(expected)) {
        if (JSON.stringify(parsed.data[key]) !== JSON.stringify(value)) {
          throw new Error(`Timeline write verification failed for ${change.document.data.id}.${key}`)
        }
      }
    }
  } catch (error) {
    await rollbackRawFiles(root, written, snapshots)
    throw error
  }
}

async function rollbackRawFiles(
  projectRoot: string,
  written: string[],
  snapshots: Map<string, string>
): Promise<void> {
  const errors: Error[] = []
  for (const file of [...written].reverse()) {
    const absolute = path.isAbsolute(file) ? file : path.join(projectRoot, file)
    const raw = snapshots.get(file) ?? snapshots.get(absolute)
    if (raw === undefined) continue
    try {
      await writeText(absolute, raw)
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Timeline rollback was incomplete.')
}
