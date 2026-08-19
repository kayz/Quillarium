import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  creatorAssistantWorkflowInputV1Schema,
  selectCharacterTimePointContext,
  validateContinuityReviewRange
} from './assistant-workflows.js'
import type { DocumentIdentity } from './types.js'

const candidates = [
  { id: 'scene-1', chapter_id: 'chapter-a', order: 1, accepted: true },
  { id: 'scene-2', chapter_id: 'chapter-a', order: 2, accepted: true },
  { id: 'scene-3', chapter_id: 'chapter-a', order: 3, accepted: true },
  { id: 'scene-4', chapter_id: 'chapter-b', order: 1, accepted: true },
  { id: 'scene-5', chapter_id: 'chapter-a', order: 4, accepted: false }
]

const document = (data: Record<string, unknown>): { data: DocumentIdentity } => ({
  data: data as unknown as DocumentIdentity
})

const temporalDocuments = [
  document({
    id: 'node-1',
    type: 'timeline_node',
    title: 'Before',
    timeline_tracks: [{ timeline_id: 'main', order: 1, narrative_order: 1 }]
  }),
  document({
    id: 'node-2',
    type: 'timeline_node',
    title: 'Now',
    timeline_tracks: [{ timeline_id: 'main', order: 2, narrative_order: 2 }]
  }),
  document({
    id: 'node-3',
    type: 'timeline_node',
    title: 'Future',
    timeline_tracks: [{ timeline_id: 'main', order: 3, narrative_order: 3 }]
  }),
  document({
    id: 'event-exact',
    type: 'timeline_event',
    title: 'Exact event',
    placements: [
      {
        timeline_id: 'main',
        start_node_id: 'node-2',
        end_node_id: null,
        order: 2,
        narrative_order: 2,
        occurrence: 0
      }
    ]
  }),
  document({
    id: 'event-history',
    type: 'timeline_event',
    title: 'History event',
    placements: [
      {
        timeline_id: 'main',
        start_node_id: 'node-2',
        end_node_id: null,
        order: 2,
        narrative_order: 2,
        occurrence: 0
      }
    ]
  }),
  document({
    id: 'state-exact',
    type: 'character_state',
    title: 'Exact',
    character: 'character-a',
    scope_type: 'timeline_event',
    scope_id: 'event-exact',
    timeline_node: 'node-3'
  }),
  document({
    id: 'state-prior',
    type: 'character_state',
    title: 'Prior',
    character: 'character-a',
    scope_type: 'scene',
    scope_id: 'scene-1',
    timeline_node: 'node-1'
  }),
  document({
    id: 'state-future',
    type: 'character_state',
    title: 'Future',
    character: 'character-a',
    scope_type: 'scene',
    scope_id: 'scene-3',
    timeline_node: 'node-3'
  }),
  document({
    id: 'relation-active',
    type: 'character_relation',
    title: 'Active',
    from_character: 'character-a',
    to_character: 'character-b',
    starts_at: 'node-2',
    ends_at: null
  }),
  document({
    id: 'relation-ended',
    type: 'character_relation',
    title: 'Ended',
    from_character: 'character-a',
    to_character: 'character-c',
    starts_at: 'node-1',
    ends_at: 'node-2'
  }),
  document({
    id: 'relation-future',
    type: 'character_relation',
    title: 'Future relation',
    from_character: 'character-a',
    to_character: 'character-d',
    starts_at: 'node-3',
    ends_at: null
  }),
  document({
    id: 'relation-untimed',
    type: 'character_relation',
    title: 'Untimed',
    from_character: 'character-a',
    to_character: 'character-e',
    starts_at: null,
    ends_at: null
  })
]

describe('creator assistant workflow guards', () => {
  it('publishes a browser-safe package subpath without Node built-ins', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      exports?: Record<string, unknown>
    }
    const source = await readFile(new URL('./assistant-workflows.ts', import.meta.url), 'utf8')

    expect(packageJson.exports?.['./assistant-workflows']).toEqual({
      types: './dist/assistant-workflows.d.ts',
      import: './dist/assistant-workflows.js'
    })
    expect(source).not.toMatch(/from\s+['"]node:/u)
  })

  it('accepts one scene or a same-chapter contiguous accepted range in story order', () => {
    expect(validateContinuityReviewRange(candidates, ['scene-2'])).toEqual({
      valid: true,
      ordered_ids: ['scene-2']
    })
    expect(validateContinuityReviewRange(candidates, ['scene-1', 'scene-2', 'scene-3'])).toEqual({
      valid: true,
      ordered_ids: ['scene-1', 'scene-2', 'scene-3']
    })
  })

  it('rejects reordered, non-contiguous, and cross-chapter ranges while allowing selected draft prose', () => {
    expect(validateContinuityReviewRange(candidates, ['scene-2', 'scene-1']).error).toBe('OUT_OF_STORY_ORDER')
    expect(validateContinuityReviewRange(candidates, ['scene-1', 'scene-3']).error).toBe(
      'NON_CONTIGUOUS_RANGE'
    )
    expect(validateContinuityReviewRange(candidates, ['scene-1', 'scene-4']).error).toBe(
      'CROSS_CHAPTER_RANGE'
    )
    expect(validateContinuityReviewRange(candidates, ['scene-5'])).toEqual({
      valid: true,
      ordered_ids: ['scene-5']
    })
  })

  it('validates task-scoped stable workflow inputs', () => {
    expect(
      creatorAssistantWorkflowInputV1Schema.parse({
        schema_version: 1,
        task_id: 'character-rehearsal',
        character_id: 'character-a',
        timeline_event_id: 'event-a',
        location_id: 'location-a',
        workflow_step: 'propose'
      })
    ).toMatchObject({ task_id: 'character-rehearsal', character_id: 'character-a' })
    expect(
      creatorAssistantWorkflowInputV1Schema.parse({
        schema_version: 1,
        task_id: 'character-rehearsal',
        character_id: 'character-a',
        timeline_event_id: 'event-a',
        timeline_id: 'branch-a',
        location_id: 'location-a'
      })
    ).toMatchObject({ timeline_id: 'branch-a' })
    expect(() =>
      creatorAssistantWorkflowInputV1Schema.parse({
        schema_version: 1,
        task_id: 'continuity-review',
        character_id: 'character-a'
      })
    ).toThrow()
  })

  it('prefers the exact event state over node history', () => {
    const selected = selectCharacterTimePointContext(temporalDocuments, {
      character_id: 'character-a',
      timeline_event_id: 'event-exact'
    })

    expect(selected).toMatchObject({
      status: 'resolved',
      selected_state_id: 'state-exact',
      state_source: 'event-exact'
    })
  })

  it('uses the nearest prior state, excludes future state, and applies relation time boundaries', () => {
    const selected = selectCharacterTimePointContext(temporalDocuments, {
      character_id: 'character-a',
      timeline_event_id: 'event-history'
    })

    expect(selected).toMatchObject({
      selected_state_id: 'state-prior',
      state_source: 'nearest-prior',
      active_relation_ids: ['relation-active'],
      untimed_relation_ids: ['relation-untimed']
    })
    expect(selected.active_relation_ids).not.toContain('relation-ended')
    expect(selected.active_relation_ids).not.toContain('relation-future')
    expect(selected.warnings).toContain(
      'Relationship relation-untimed has no start time and is only low-authority material.'
    )
  })

  it('requires an explicit timeline for conflicting placements but auto-selects the main timeline', () => {
    const documents = [
      ...temporalDocuments,
      document({
        id: 'alpha-1',
        type: 'timeline_node',
        title: 'Alpha',
        timeline_tracks: [{ timeline_id: 'alpha', order: 1, narrative_order: 1 }]
      }),
      document({
        id: 'beta-1',
        type: 'timeline_node',
        title: 'Beta',
        timeline_tracks: [{ timeline_id: 'beta', order: 1, narrative_order: 1 }]
      }),
      document({
        id: 'event-ambiguous',
        type: 'timeline_event',
        title: 'Ambiguous',
        placements: [
          {
            timeline_id: 'alpha',
            start_node_id: 'alpha-1',
            end_node_id: null,
            order: 1,
            narrative_order: 1,
            occurrence: 0
          },
          {
            timeline_id: 'beta',
            start_node_id: 'beta-1',
            end_node_id: null,
            order: 1,
            narrative_order: 1,
            occurrence: 0
          }
        ]
      }),
      document({
        id: 'event-main',
        type: 'timeline_event',
        title: 'Main',
        placements: [
          {
            timeline_id: 'main',
            start_node_id: 'node-2',
            end_node_id: null,
            order: 2,
            narrative_order: 2,
            occurrence: 0
          },
          {
            timeline_id: 'alpha',
            start_node_id: 'alpha-1',
            end_node_id: null,
            order: 1,
            narrative_order: 1,
            occurrence: 0
          }
        ]
      })
    ]

    expect(
      selectCharacterTimePointContext(documents, { timeline_event_id: 'event-ambiguous' })
    ).toMatchObject({ status: 'ambiguous', timeline_options: ['alpha', 'beta'] })
    expect(
      selectCharacterTimePointContext(documents, {
        timeline_event_id: 'event-ambiguous',
        timeline_id: 'beta'
      })
    ).toMatchObject({ status: 'resolved', timeline_id: 'beta', timeline_node_id: 'beta-1' })
    expect(selectCharacterTimePointContext(documents, { timeline_event_id: 'event-main' })).toMatchObject({
      status: 'resolved',
      timeline_id: 'main',
      timeline_node_id: 'node-2'
    })
  })
})
