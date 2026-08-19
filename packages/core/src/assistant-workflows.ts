import { z } from 'zod'
import { compareTimelineNodes } from './timeline.js'
import type {
  CharacterRelationDoc,
  CharacterStateDoc,
  TimelineEventDoc,
  TimelineNodeDoc,
  TimelinePlacementV1
} from './types.js'

export const characterRehearsalWorkflowInputV1Schema = z
  .object({
    schema_version: z.literal(1),
    character_id: z.string().min(1),
    timeline_event_id: z.string().min(1),
    timeline_id: z.string().min(1).optional(),
    location_id: z.string().min(1),
    workflow_step: z
      .enum([
        'select-character',
        'select-time',
        'select-location',
        'preview',
        'rehearse',
        'analyze',
        'propose'
      ])
      .default('select-character')
  })
  .strict()

export type CharacterRehearsalWorkflowInputV1 = z.infer<typeof characterRehearsalWorkflowInputV1Schema>

export const continuityReviewRangeInputV1Schema = z
  .object({
    schema_version: z.literal(1),
    document_ids: z.array(z.string().min(1)).min(1),
    chapter_id: z.string().min(1)
  })
  .strict()

export type ContinuityReviewRangeInputV1 = z.infer<typeof continuityReviewRangeInputV1Schema>

export const creatorAssistantWorkflowInputV1Schema = z.discriminatedUnion('task_id', [
  characterRehearsalWorkflowInputV1Schema.extend({ task_id: z.literal('character-rehearsal') }),
  continuityReviewRangeInputV1Schema.extend({ task_id: z.literal('continuity-review') })
])

export type CreatorAssistantWorkflowInputV1 = z.infer<typeof creatorAssistantWorkflowInputV1Schema>

export interface CharacterTimePointContextSelection {
  status: 'resolved' | 'ambiguous'
  timeline_options: string[]
  timeline_id?: string
  timeline_node_id?: string
  timeline_event_id: string
  character_id?: string
  selected_state_id?: string
  state_source: 'event-exact' | 'nearest-prior' | 'node-exact' | 'none'
  active_relation_ids: string[]
  untimed_relation_ids: string[]
  warnings: string[]
}

/** Pure, browser-safe selector shared by ContextBundle resolution and rehearsal IPC. */
export function selectCharacterTimePointContext(
  documents: Array<{ data: { id: string; type: string } }>,
  input: { timeline_event_id: string; character_id?: string; timeline_id?: string }
): CharacterTimePointContextSelection {
  const event = documents.find(
    (document) => document.data.type === 'timeline_event' && document.data.id === input.timeline_event_id
  )?.data as unknown as TimelineEventDoc | undefined
  if (!event) throw new Error(`CHARACTER_TIME_EVENT_NOT_FOUND: ${input.timeline_event_id}`)
  const placements = eventTimelinePlacements(event)
  if (!placements.length) {
    throw new Error(`CHARACTER_TIME_EVENT_UNPLACED: ${event.id}`)
  }
  const timelineOptions = [...new Set(placements.map((placement) => placement.timeline_id))].sort((a, b) =>
    a.localeCompare(b, 'en')
  )
  const selectedPlacement = input.timeline_id
    ? placements.find((placement) => placement.timeline_id === input.timeline_id)
    : placements.length === 1
      ? placements[0]
      : placements.find((placement) => placement.timeline_id === 'main')
  if (!selectedPlacement) {
    if (input.timeline_id) throw new Error(`CHARACTER_TIME_TIMELINE_NOT_FOUND: ${input.timeline_id}`)
    return {
      status: 'ambiguous',
      timeline_options: timelineOptions,
      timeline_event_id: event.id,
      ...(input.character_id ? { character_id: input.character_id } : {}),
      state_source: 'none',
      active_relation_ids: [],
      untimed_relation_ids: [],
      warnings: ['The selected event has multiple timeline placements; choose one timeline explicitly.']
    }
  }
  const nodes = timelineNodesForTrack(documents, selectedPlacement.timeline_id)
  const nodeIndex = nodes.findIndex((node) => node.id === selectedPlacement.start_node_id)
  if (nodeIndex < 0) {
    throw new Error(`CHARACTER_TIME_NODE_NOT_FOUND: ${selectedPlacement.start_node_id}`)
  }
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index] as const))
  const warnings: string[] = []
  let selectedState: CharacterStateDoc | undefined
  let stateSource: CharacterTimePointContextSelection['state_source'] = 'none'
  if (input.character_id) {
    const states = documents
      .filter(
        (document) =>
          document.data.type === 'character_state' &&
          (document.data as unknown as CharacterStateDoc).character === input.character_id
      )
      .map((document) => document.data as unknown as CharacterStateDoc)
    const exact = states
      .filter((state) => state.scope_type === 'timeline_event' && state.scope_id === event.id)
      .sort((left, right) => left.id.localeCompare(right.id, 'en'))
    if (exact.length) {
      selectedState = exact[0]
      stateSource = 'event-exact'
      if (exact.length > 1)
        warnings.push('Multiple exact event states exist; the first stable ID was selected.')
    } else {
      const historical = states
        .map((state) => ({
          state,
          index: state.timeline_node ? nodeOrder.get(state.timeline_node) : undefined
        }))
        .filter(
          (candidate): candidate is { state: CharacterStateDoc; index: number } =>
            candidate.index !== undefined && candidate.index <= nodeIndex
        )
        .sort((left, right) => right.index - left.index || left.state.id.localeCompare(right.state.id, 'en'))
      selectedState = historical[0]?.state
      if (selectedState) {
        stateSource = historical[0]!.index === nodeIndex ? 'node-exact' : 'nearest-prior'
        if (historical.filter((candidate) => candidate.index === historical[0]!.index).length > 1) {
          warnings.push(
            'Multiple states share the selected historical node; the first stable ID was selected.'
          )
        }
      }
    }
  }
  const activeRelations: string[] = []
  const untimedRelations: string[] = []
  for (const document of documents) {
    if (document.data.type !== 'character_relation') continue
    const relation = document.data as unknown as CharacterRelationDoc
    if (
      input.character_id &&
      relation.from_character !== input.character_id &&
      relation.to_character !== input.character_id
    ) {
      continue
    }
    if (!relation.starts_at) {
      untimedRelations.push(relation.id)
      warnings.push(`Relationship ${relation.id} has no start time and is only low-authority material.`)
      continue
    }
    const starts = nodeOrder.get(relation.starts_at)
    const ends = relation.ends_at ? nodeOrder.get(relation.ends_at) : undefined
    if (starts === undefined || (relation.ends_at && ends === undefined)) {
      warnings.push(
        `Relationship ${relation.id} cannot be placed on timeline ${selectedPlacement.timeline_id}.`
      )
      continue
    }
    if (starts <= nodeIndex && (ends === undefined || nodeIndex < ends)) activeRelations.push(relation.id)
  }
  return {
    status: 'resolved',
    timeline_options: timelineOptions,
    timeline_id: selectedPlacement.timeline_id,
    timeline_node_id: selectedPlacement.start_node_id,
    timeline_event_id: event.id,
    ...(input.character_id ? { character_id: input.character_id } : {}),
    ...(selectedState ? { selected_state_id: selectedState.id } : {}),
    state_source: stateSource,
    active_relation_ids: activeRelations.sort((a, b) => a.localeCompare(b, 'en')),
    untimed_relation_ids: untimedRelations.sort((a, b) => a.localeCompare(b, 'en')),
    warnings
  }
}

function eventTimelinePlacements(event: TimelineEventDoc): TimelinePlacementV1[] {
  if (event.placements?.length) return event.placements
  return event.timeline_node
    ? [
        {
          timeline_id: 'main',
          start_node_id: event.timeline_node,
          end_node_id: null,
          order: 0,
          narrative_order: 0,
          occurrence: 0
        }
      ]
    : []
}

function timelineNodesForTrack(
  documents: Array<{ data: { id: string; type: string } }>,
  timelineId: string
): TimelineNodeDoc[] {
  return documents
    .filter((document) => document.data.type === 'timeline_node')
    .map((document) => document.data as unknown as TimelineNodeDoc)
    .filter((node) =>
      node.timeline_tracks?.length
        ? node.timeline_tracks.some((placement) => placement.timeline_id === timelineId)
        : timelineId === 'main'
    )
    .sort((left, right) => {
      const leftPlacement = left.timeline_tracks?.find((placement) => placement.timeline_id === timelineId)
      const rightPlacement = right.timeline_tracks?.find((placement) => placement.timeline_id === timelineId)
      return (
        Number(leftPlacement?.order ?? Number.MAX_SAFE_INTEGER) -
          Number(rightPlacement?.order ?? Number.MAX_SAFE_INTEGER) || compareTimelineNodes(left, right)
      )
    })
}

export interface ContinuityRangeCandidate {
  id: string
  chapter_id: string
  order: number
  accepted: boolean
}

export interface ContinuityRangeValidation {
  valid: boolean
  ordered_ids: string[]
  error?:
    'EMPTY_RANGE' | 'UNKNOWN_DOCUMENT' | 'CROSS_CHAPTER_RANGE' | 'OUT_OF_STORY_ORDER' | 'NON_CONTIGUOUS_RANGE'
}

/** Code-owned range guard used before continuity context is assembled. */
export function validateContinuityReviewRange(
  candidates: ContinuityRangeCandidate[],
  selectedIds: string[]
): ContinuityRangeValidation {
  const ids = [...new Set(selectedIds)]
  if (!ids.length) return { valid: false, ordered_ids: [], error: 'EMPTY_RANGE' }
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const selected = ids.map((id) => byId.get(id))
  if (selected.some((candidate) => !candidate)) {
    return { valid: false, ordered_ids: [], error: 'UNKNOWN_DOCUMENT' }
  }
  const present = selected as ContinuityRangeCandidate[]
  const chapterId = present[0]!.chapter_id
  if (present.some((candidate) => candidate.chapter_id !== chapterId)) {
    return { valid: false, ordered_ids: [], error: 'CROSS_CHAPTER_RANGE' }
  }
  const chapter = candidates
    .filter((candidate) => candidate.chapter_id === chapterId)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, 'en'))
  const positions = present.map((candidate) => chapter.findIndex((item) => item.id === candidate.id))
  if (positions.some((position) => position < 0)) {
    return { valid: false, ordered_ids: [], error: 'UNKNOWN_DOCUMENT' }
  }
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) {
    return { valid: false, ordered_ids: [], error: 'OUT_OF_STORY_ORDER' }
  }
  if (positions.some((position, index) => index > 0 && position !== positions[index - 1]! + 1)) {
    return { valid: false, ordered_ids: [], error: 'NON_CONTIGUOUS_RANGE' }
  }
  return { valid: true, ordered_ids: present.map((candidate) => candidate.id) }
}

export function continuityRangeCandidatesFromDocuments(
  documents: Array<{ data: { id: string; type: string } }>
): ContinuityRangeCandidate[] {
  const dataOf = (document: { data: { id: string; type: string } }) =>
    document.data as { id: string; type: string } & Record<string, unknown>
  const byId = new Map(documents.map((document) => [document.data.id, document]))
  const chapterFor = (document: { data: { id: string; type: string } }): string => {
    const data = dataOf(document)
    const direct = String(data['chapter_id'] ?? data['section'] ?? '').trim()
    if (direct) return direct
    let parent = String(data['parent'] ?? '').trim()
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) {
      visited.add(parent)
      const ancestor = byId.get(parent)
      if (!ancestor) return parent
      const ancestorData = dataOf(ancestor)
      if (ancestorData.type === 'outline' && ancestorData['level'] === 'chapter') return parent
      parent = String(ancestorData['parent'] ?? '').trim()
    }
    return data.id
  }
  return documents
    .filter((document) => ['scene', 'chapter_prose'].includes(document.data.type))
    .map((document, index) => {
      const data = dataOf(document)
      return {
        id: data.id,
        chapter_id: chapterFor(document),
        order: Number.isFinite(Number(data['order'])) ? Number(data['order']) : index,
        accepted:
          data['accepted'] === true ||
          ['accepted', 'final', 'published'].includes(String(data['status'] ?? ''))
      }
    })
    .filter((candidate) => candidate.id && candidate.chapter_id)
    .sort(
      (left, right) =>
        left.chapter_id.localeCompare(right.chapter_id, 'en') ||
        left.order - right.order ||
        left.id.localeCompare(right.id, 'en')
    )
}
