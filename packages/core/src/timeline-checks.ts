import type { CharacterDoc, TimelineEventDoc, TimelineNodeDoc, TimelineTrackV1 } from './types.js'
import { DEFAULT_TIMELINE_TRACK_ID, eventStartNode, sortTimelineNodesForTrack } from './timeline-model.js'
import { timelineNodeKey, validateTimelineChain } from './timeline.js'

export type TimelineDeterministicIssueCode =
  | 'timeline-legacy-chain'
  | 'timeline-missing-track'
  | 'timeline-missing-node'
  | 'timeline-duplicate-node'
  | 'timeline-duplicate-event-order'
  | 'timeline-invalid-interval'
  | 'timeline-character-not-active'
  | 'timeline-causality-reversed'
  | 'timeline-event-unplaced'

export interface TimelineDeterministicIssueV1 {
  schema_version: 1
  code: TimelineDeterministicIssueCode
  severity: 'error' | 'warning' | 'info'
  title: string
  summary: string
  evidence: string[]
  track_ids: string[]
  node_ids: string[]
  event_ids: string[]
  character_ids: string[]
}

export interface TimelineCheckInputV1 {
  tracks: TimelineTrackV1[]
  nodes: TimelineNodeDoc[]
  events: TimelineEventDoc[]
  characters?: CharacterDoc[]
}

export function checkTimelineDeterministically(input: TimelineCheckInputV1): TimelineDeterministicIssueV1[] {
  const issues: TimelineDeterministicIssueV1[] = []
  const trackIds = new Set(input.tracks.map((track) => track.id))
  const nodeById = new Map(input.nodes.map((node) => [node.id, node] as const))
  const eventById = new Map(input.events.map((event) => [event.id, event] as const))

  for (const issue of validateTimelineChain(
    input.nodes.filter((node) => !(node.timeline_tracks ?? []).length)
  )) {
    issues.push(
      timelineIssue(
        'timeline-legacy-chain',
        'warning',
        'Legacy timeline chain is inconsistent',
        issue.message,
        [issue.message],
        [DEFAULT_TIMELINE_TRACK_ID],
        [issue.node_id, ...(issue.related_id ? [issue.related_id] : [])]
      )
    )
  }

  for (const node of input.nodes) {
    for (const placement of node.timeline_tracks ?? []) {
      if (!trackIds.has(placement.timeline_id)) {
        issues.push(
          timelineIssue(
            'timeline-missing-track',
            'error',
            'Timeline node references a missing track',
            `${node.id} references ${placement.timeline_id}.`,
            [`node=${node.id}`, `track=${placement.timeline_id}`],
            [placement.timeline_id],
            [node.id]
          )
        )
      }
    }
  }
  for (const event of input.events) {
    if (!(event.placements ?? []).length && !event.timeline_node) {
      issues.push(
        timelineIssue(
          'timeline-event-unplaced',
          'warning',
          'Timeline event is not placed',
          `${event.title} is not attached to any timeline track.`,
          [`event=${event.id}`],
          [],
          [],
          [event.id]
        )
      )
    }
    for (const placement of event.placements ?? []) {
      if (!trackIds.has(placement.timeline_id)) {
        issues.push(
          timelineIssue(
            'timeline-missing-track',
            'error',
            'Timeline event references a missing track',
            `${event.id} references ${placement.timeline_id}.`,
            [`event=${event.id}`, `track=${placement.timeline_id}`],
            [placement.timeline_id],
            [],
            [event.id]
          )
        )
      }
      for (const nodeId of [placement.start_node_id, placement.end_node_id].filter((id): id is string =>
        Boolean(id)
      )) {
        if (!nodeById.has(nodeId)) {
          issues.push(
            timelineIssue(
              'timeline-missing-node',
              'error',
              'Timeline placement references a missing node',
              `${event.id} references ${nodeId}.`,
              [`event=${event.id}`, `node=${nodeId}`],
              [placement.timeline_id],
              [nodeId],
              [event.id]
            )
          )
        }
      }
    }
  }

  for (const track of input.tracks) {
    const nodes = sortTimelineNodesForTrack(input.nodes, track.id)
    const order = new Map(nodes.map((node, index) => [node.id, index] as const))
    const byCoordinate = new Map<string, string>()
    for (const node of nodes) {
      const key = timelineNodeKey(node)
      const duplicate = byCoordinate.get(key)
      if (duplicate) {
        issues.push(
          timelineIssue(
            'timeline-duplicate-node',
            'error',
            'Duplicate time coordinate on one track',
            `${duplicate} and ${node.id} share one coordinate and occurrence.`,
            [`coordinate=${key}`],
            [track.id],
            [duplicate, node.id]
          )
        )
      } else byCoordinate.set(key, node.id)
    }

    const eventOrders = new Map<string, string>()
    for (const event of input.events) {
      const placement = (event.placements ?? []).find((item) => item.timeline_id === track.id)
      if (!placement) continue
      if (placement.end_node_id) {
        const start = order.get(placement.start_node_id)
        const end = order.get(placement.end_node_id)
        if (start !== undefined && end !== undefined && end < start) {
          issues.push(
            timelineIssue(
              'timeline-invalid-interval',
              'error',
              'Timeline interval is reversed',
              `${event.id} ends before it starts on ${track.id}.`,
              [`start=${placement.start_node_id}`, `end=${placement.end_node_id}`],
              [track.id],
              [placement.start_node_id, placement.end_node_id],
              [event.id]
            )
          )
        }
      }
      const orderKey = `${placement.start_node_id}\0${placement.order}`
      const duplicate = eventOrders.get(orderKey)
      if (duplicate) {
        issues.push(
          timelineIssue(
            'timeline-duplicate-event-order',
            'warning',
            'Events share one presentation order',
            `${duplicate} and ${event.id} have the same order at ${placement.start_node_id}.`,
            [`order=${placement.order}`],
            [track.id],
            [placement.start_node_id],
            [duplicate, event.id]
          )
        )
      } else eventOrders.set(orderKey, event.id)
    }

    for (const event of input.events) {
      const eventNode = eventStartNode(event, track.id)
      const eventPosition = eventNode ? order.get(eventNode) : undefined
      if (eventPosition === undefined) continue
      for (const relation of event.relations ?? []) {
        if (relation.kind !== 'depends_on') continue
        const cause = eventById.get(relation.target_id)
        const causeNode = cause ? eventStartNode(cause, track.id) : null
        const causePosition = causeNode ? order.get(causeNode) : undefined
        if (causePosition !== undefined && causePosition > eventPosition) {
          issues.push(
            timelineIssue(
              'timeline-causality-reversed',
              'error',
              'Cause appears after its dependent event',
              `${event.id} depends on later event ${cause!.id}.`,
              [`effect=${event.id}`, `cause=${cause!.id}`],
              [track.id],
              [eventNode!, causeNode!],
              [event.id, cause!.id]
            )
          )
        }
      }
    }

    const characterById = new Map((input.characters ?? []).map((item) => [item.id, item] as const))
    for (const event of input.events) {
      const eventNode = eventStartNode(event, track.id)
      const eventPosition = eventNode ? order.get(eventNode) : undefined
      if (eventPosition === undefined) continue
      for (const characterId of event.characters) {
        const character = characterById.get(characterId)
        if (!character) continue
        const starts = [character.born_at, character.introduced_at]
          .filter((id): id is string => Boolean(id))
          .map((id) => order.get(id))
          .filter((value): value is number => value !== undefined)
        const ends = [character.exited_at, character.died_at]
          .filter((id): id is string => Boolean(id))
          .map((id) => order.get(id))
          .filter((value): value is number => value !== undefined)
        if (
          starts.some((position) => eventPosition < position) ||
          ends.some((position) => eventPosition > position)
        ) {
          issues.push({
            ...timelineIssue(
              'timeline-character-not-active',
              'error',
              'Character is outside the active time range',
              `${characterId} appears in ${event.id} outside the character time range.`,
              [`character=${characterId}`, `event=${event.id}`],
              [track.id],
              [eventNode!],
              [event.id]
            ),
            character_ids: [characterId]
          })
        }
      }
    }
  }
  return uniqueTimelineIssues(issues)
}

function timelineIssue(
  code: TimelineDeterministicIssueCode,
  severity: TimelineDeterministicIssueV1['severity'],
  title: string,
  summary: string,
  evidence: string[],
  trackIds: string[] = [],
  nodeIds: string[] = [],
  eventIds: string[] = []
): TimelineDeterministicIssueV1 {
  return {
    schema_version: 1,
    code,
    severity,
    title,
    summary,
    evidence,
    track_ids: trackIds,
    node_ids: nodeIds,
    event_ids: eventIds,
    character_ids: []
  }
}

function uniqueTimelineIssues(issues: TimelineDeterministicIssueV1[]): TimelineDeterministicIssueV1[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}\0${issue.track_ids.join(',')}\0${issue.node_ids.join(',')}\0${issue.event_ids.join(',')}\0${issue.character_ids.join(',')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
