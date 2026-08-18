import { z } from 'zod'

export const characterRehearsalWorkflowInputV1Schema = z
  .object({
    schema_version: z.literal(1),
    character_id: z.string().min(1),
    timeline_event_id: z.string().min(1),
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
