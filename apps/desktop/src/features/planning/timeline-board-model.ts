import type { DocEntry } from '../../app/types.js'

export type TimelineBoardColorToken = 'danger' | 'accent' | 'success' | 'warning'

export interface TimelineBoardTrackInput {
  id: string
  title: string
}

export interface TimelineBoardPointEvent {
  eventId: string
  title: string
  trackIds: string[]
  junction: boolean
}

export interface TimelineBoardStation {
  nodeId: string
  title: string
  label: string
  pointEvents: TimelineBoardPointEvent[]
}

export interface TimelineBoardOverlayBand {
  startTrackIndex: number
  endTrackIndex: number
}

export interface TimelineBoardOverlay {
  eventId: string
  title: string
  trackIds: string[]
  startStationIndex: number
  endStationIndex: number
  bands: TimelineBoardOverlayBand[]
}

export interface TimelineBoardTrack {
  id: string
  title: string
  colorToken: TimelineBoardColorToken
  stations: Array<'visit' | 'bypass'>
}

export interface TimelineBoardModel {
  tracks: TimelineBoardTrack[]
  stations: TimelineBoardStation[]
  overlays: TimelineBoardOverlay[]
}

const COLOR_TOKENS: TimelineBoardColorToken[] = ['danger', 'accent', 'success', 'warning']
const IMPLICIT_TRACK: TimelineBoardTrackInput = { id: 'main', title: 'Main timeline' }

export function inferTimelineTracks(items: DocEntry[]): TimelineBoardTrackInput[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const add = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }
  for (const item of items) {
    if (item.data.type === 'timeline_node') {
      for (const placement of Array.isArray(item.data.timeline_tracks) ? item.data.timeline_tracks : []) {
        if (isRecordValue(placement)) add(String(placement.timeline_id ?? ''))
      }
    }
    if (item.data.type === 'timeline_event') {
      for (const placement of Array.isArray(item.data.placements) ? item.data.placements : []) {
        if (isRecordValue(placement)) add(String(placement.timeline_id ?? ''))
      }
    }
  }
  return ids.map((id) => ({ id, title: id }))
}

export function buildTimelineBoard(
  items: DocEntry[],
  tracksInput: TimelineBoardTrackInput[]
): TimelineBoardModel {
  const tracks = tracksInput.length ? tracksInput : [IMPLICIT_TRACK]
  const trackIds = tracks.map((track) => track.id)
  const nodes = items.filter((item) => item.data.type === 'timeline_node')
  const events = items.filter((item) => item.data.type === 'timeline_event')
  const stationNodes = uniqueById(
    nodes.filter((node) => trackIds.some((trackId) => nodeBelongsToTrack(node, trackId)))
  ).sort((left, right) => compareStationNodes(left, right, trackIds))

  const stations: TimelineBoardStation[] = stationNodes.map((node) => {
    const pointEvents = events
      .map((event) => pointEventAtStation(event, node.data.id, trackIds))
      .filter((item): item is TimelineBoardPointEvent => item !== null)
      .sort((left, right) => {
        const leftOrder = minEventOrder(events, left.eventId, node.data.id, left.trackIds)
        const rightOrder = minEventOrder(events, right.eventId, node.data.id, right.trackIds)
        return leftOrder - rightOrder || left.eventId.localeCompare(right.eventId, 'en')
      })
    return {
      nodeId: node.data.id,
      title: String(node.data.title),
      label: String(node.data.display_time || node.data.title),
      pointEvents
    }
  })

  const overlays = events
    .map((event) => overlayForEvent(event, trackIds, stations))
    .filter((item): item is TimelineBoardOverlay => item !== null)

  return {
    tracks: tracks.map((track, index) => ({
      id: track.id,
      title: track.title,
      colorToken: COLOR_TOKENS[index % COLOR_TOKENS.length]!,
      stations: stationNodes.map((node) => (nodeBelongsToTrack(node, track.id) ? 'visit' : 'bypass'))
    })),
    stations,
    overlays
  }
}

function pointEventAtStation(
  event: DocEntry,
  stationId: string,
  trackIds: string[]
): TimelineBoardPointEvent | null {
  const participating = trackIds.filter((trackId) => {
    const placement = eventPlacementOnTrack(event, trackId)
    return Boolean(placement && isPointPlacement(placement) && placement.start_node_id === stationId)
  })
  if (!participating.length) return null
  return {
    eventId: event.data.id,
    title: String(event.data.title),
    trackIds: participating,
    junction: participating.length > 1
  }
}

function overlayForEvent(
  event: DocEntry,
  trackIds: string[],
  stations: TimelineBoardStation[]
): TimelineBoardOverlay | null {
  const participating = trackIds.filter((trackId) => {
    const placement = eventPlacementOnTrack(event, trackId)
    return Boolean(placement && isSpanPlacement(placement))
  })
  if (!participating.length) return null
  const ranges = participating
    .map((trackId) => {
      const placement = eventPlacementOnTrack(event, trackId)
      if (!placement || !isSpanPlacement(placement)) return null
      const startStationIndex = stations.findIndex((station) => station.nodeId === placement.start_node_id)
      const endStationIndex = stations.findIndex((station) => station.nodeId === placement.end_node_id)
      if (startStationIndex < 0 || endStationIndex < startStationIndex) return null
      return { startStationIndex, endStationIndex }
    })
    .filter((item): item is { startStationIndex: number; endStationIndex: number } => item !== null)
  if (!ranges.length) return null
  const indices = participating
    .map((trackId) => trackIds.indexOf(trackId))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)
  return {
    eventId: event.data.id,
    title: String(event.data.title),
    trackIds: participating,
    startStationIndex: Math.min(...ranges.map((item) => item.startStationIndex)),
    endStationIndex: Math.max(...ranges.map((item) => item.endStationIndex)),
    bands: contiguousBands(indices)
  }
}

function contiguousBands(sortedIndices: number[]): TimelineBoardOverlayBand[] {
  if (!sortedIndices.length) return []
  const bands: TimelineBoardOverlayBand[] = []
  let start = sortedIndices[0]!
  let end = start
  for (const index of sortedIndices.slice(1)) {
    if (index === end + 1) {
      end = index
      continue
    }
    bands.push({ startTrackIndex: start, endTrackIndex: end })
    start = index
    end = index
  }
  bands.push({ startTrackIndex: start, endTrackIndex: end })
  return bands
}

function minEventOrder(events: DocEntry[], eventId: string, stationId: string, trackIds: string[]): number {
  const event = events.find((item) => item.data.id === eventId)
  if (!event) return Number.MAX_SAFE_INTEGER
  const orders = trackIds
    .map((trackId) => eventPlacementOnTrack(event, trackId))
    .filter((placement): placement is TimelinePlacement =>
      Boolean(placement && isPointPlacement(placement) && placement.start_node_id === stationId)
    )
    .map((placement) => placement.order)
  return orders.length ? Math.min(...orders) : Number.MAX_SAFE_INTEGER
}

function compareStationNodes(left: DocEntry, right: DocEntry, trackIds: string[]): number {
  return (
    minNodeOrder(left, trackIds) - minNodeOrder(right, trackIds) ||
    Number(left.data.year ?? Number.MAX_SAFE_INTEGER) - Number(right.data.year ?? Number.MAX_SAFE_INTEGER) ||
    Number(left.data.month ?? 13) - Number(right.data.month ?? 13) ||
    left.data.id.localeCompare(right.data.id, 'en')
  )
}

function minNodeOrder(node: DocEntry, trackIds: string[]): number {
  const orders = trackIds
    .map((trackId) => nodePlacement(node, trackId)?.order)
    .filter((order): order is number => order !== undefined)
  return orders.length ? Math.min(...orders) : Number.MAX_SAFE_INTEGER
}

interface TimelinePlacement {
  timeline_id: string
  start_node_id: string
  end_node_id: string | null
  order: number
}

function isPointPlacement(placement: TimelinePlacement): boolean {
  return !placement.end_node_id || placement.end_node_id === placement.start_node_id
}

function isSpanPlacement(placement: TimelinePlacement): boolean {
  return Boolean(placement.end_node_id && placement.end_node_id !== placement.start_node_id)
}

function eventPlacementOnTrack(event: DocEntry, trackId: string): TimelinePlacement | undefined {
  const placements = Array.isArray(event.data.placements) ? event.data.placements : []
  const match = placements.find(
    (value) => isRecordValue(value) && String(value.timeline_id ?? '') === trackId
  )
  if (match && isRecordValue(match)) {
    return {
      timeline_id: trackId,
      start_node_id: String(match.start_node_id ?? ''),
      end_node_id: match.end_node_id ? String(match.end_node_id) : null,
      order: Number(match.order ?? 0)
    }
  }
  if (trackId === 'main' && !placements.length && typeof event.data.timeline_node === 'string') {
    return {
      timeline_id: 'main',
      start_node_id: event.data.timeline_node,
      end_node_id: null,
      order: 0
    }
  }
  return undefined
}

function nodeBelongsToTrack(node: DocEntry, trackId: string): boolean {
  const placements = Array.isArray(node.data.timeline_tracks) ? node.data.timeline_tracks : []
  if (!placements.length) return trackId === 'main'
  return placements.some(
    (placement) => isRecordValue(placement) && String(placement.timeline_id ?? '') === trackId
  )
}

function nodePlacement(node: DocEntry, trackId: string): { order: number } | undefined {
  const placements = Array.isArray(node.data.timeline_tracks) ? node.data.timeline_tracks : []
  const match = placements.find(
    (placement) => isRecordValue(placement) && String(placement.timeline_id ?? '') === trackId
  )
  if (!match || !isRecordValue(match)) return undefined
  return { order: Number(match.order ?? 0) }
}

function uniqueById(nodes: DocEntry[]): DocEntry[] {
  const seen = new Set<string>()
  return nodes.filter((node) => {
    if (seen.has(node.data.id)) return false
    seen.add(node.data.id)
    return true
  })
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
