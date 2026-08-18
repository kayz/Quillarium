import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { buildTimelineBoard } from './timeline-board-model.js'

function doc(type: string, id: string, title: string, data: Record<string, unknown> = {}): DocEntry {
  return {
    path: `${type}/${id}.md`,
    data: { id, type, title, schema_version: 1, tags: [], ...data },
    content: ''
  }
}

function node(id: string, title: string, trackIds: string[], order: number): DocEntry {
  return doc('timeline_node', id, title, {
    display_time: title,
    timeline_tracks: trackIds.map((timeline_id) => ({
      timeline_id,
      order,
      narrative_order: order
    }))
  })
}

function event(
  id: string,
  title: string,
  placements: Array<{ timeline_id: string; start_node_id: string; end_node_id: string | null; order: number }>
): DocEntry {
  return doc('timeline_event', id, title, {
    placements: placements.map((placement) => ({
      ...placement,
      narrative_order: placement.order,
      occurrence: 1
    }))
  })
}

const tracks = [
  { id: 'lin', title: '林深' },
  { id: 'shen', title: '沈晚' },
  { id: 'north', title: '北境军' }
]

const winterNodes = [
  node('eve', '冬至前夜', ['lin', 'shen', 'north'], 0),
  node('gate', '城门开启', ['lin', 'shen', 'north'], 1),
  node('later', '三日后', ['lin', 'shen', 'north'], 2)
]

const winterEvents = [
  event('dress', '更衣', [{ timeline_id: 'shen', start_node_id: 'gate', end_node_id: null, order: 0 }]),
  event('swap', '调包出城', [
    { timeline_id: 'lin', start_node_id: 'gate', end_node_id: null, order: 1 },
    { timeline_id: 'shen', start_node_id: 'gate', end_node_id: null, order: 1 }
  ]),
  event('knife', '弃刀', [{ timeline_id: 'lin', start_node_id: 'gate', end_node_id: null, order: 2 }]),
  event('siege', '围城', [
    { timeline_id: 'shen', start_node_id: 'gate', end_node_id: 'later', order: 3 },
    { timeline_id: 'north', start_node_id: 'gate', end_node_id: 'later', order: 3 }
  ])
]

describe('buildTimelineBoard', () => {
  it('stacks point events at a station and marks a multi-track event as a junction', () => {
    const board = buildTimelineBoard([...winterNodes, ...winterEvents], tracks)

    expect(board.stations.map((station) => station.nodeId)).toEqual(['eve', 'gate', 'later'])
    expect(board.stations[1]?.label).toBe('城门开启')
    expect(board.stations[1]?.pointEvents.map((item) => item.eventId)).toEqual(['dress', 'swap', 'knife'])
    expect(board.stations[1]?.pointEvents[1]).toMatchObject({
      eventId: 'swap',
      trackIds: ['lin', 'shen'],
      junction: true
    })
    expect(board.stations[1]?.pointEvents[0]?.junction).toBe(false)
    expect(board.overlays.map((item) => item.eventId)).toEqual(['siege'])
  })

  it('covers participating tracks with a span overlay and splits when a non-participating track sits between them', () => {
    const adjacent = buildTimelineBoard([...winterNodes, ...winterEvents], tracks)
    expect(adjacent.overlays[0]).toMatchObject({
      eventId: 'siege',
      startStationIndex: 1,
      endStationIndex: 2,
      trackIds: ['shen', 'north']
    })
    expect(adjacent.overlays[0]?.bands).toEqual([{ startTrackIndex: 1, endTrackIndex: 2 }])

    const split = buildTimelineBoard(
      [...winterNodes, ...winterEvents],
      [
        { id: 'shen', title: '沈晚' },
        { id: 'lin', title: '林深' },
        { id: 'north', title: '北境军' }
      ]
    )
    expect(split.overlays[0]?.bands).toEqual([
      { startTrackIndex: 0, endTrackIndex: 0 },
      { startTrackIndex: 2, endTrackIndex: 2 }
    ])
  })

  it('lets a track bypass a station that does not belong to it', () => {
    const board = buildTimelineBoard(
      [
        node('gate', '城门开启', ['lin', 'shen'], 0),
        node('later', '三日后', ['lin', 'north'], 1),
        event('swap', '调包出城', [
          { timeline_id: 'lin', start_node_id: 'gate', end_node_id: null, order: 0 },
          { timeline_id: 'shen', start_node_id: 'gate', end_node_id: null, order: 0 }
        ])
      ],
      tracks
    )

    expect(board.tracks.map((track) => track.id)).toEqual(['lin', 'shen', 'north'])
    expect(board.tracks[0]?.stations).toEqual(['visit', 'visit'])
    expect(board.tracks[1]?.stations).toEqual(['visit', 'bypass'])
    expect(board.tracks[2]?.stations).toEqual(['bypass', 'visit'])
  })

  it('uses the implicit main track when no catalog tracks are provided', () => {
    const spring = doc('timeline_node', 'spring', '春季', { year: 20, month: 3, display_time: '20年春' })
    const meeting = doc('timeline_event', 'meeting', '春日会议', { timeline_node: 'spring' })
    const board = buildTimelineBoard([spring, meeting], [])

    expect(board.tracks).toEqual([
      { id: 'main', title: 'Main timeline', colorToken: 'danger', stations: ['visit'] }
    ])
    expect(board.stations[0]?.pointEvents.map((item) => item.eventId)).toEqual(['meeting'])
  })
})
