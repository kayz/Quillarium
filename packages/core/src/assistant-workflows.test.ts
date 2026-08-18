import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  creatorAssistantWorkflowInputV1Schema,
  validateContinuityReviewRange
} from './assistant-workflows.js'

const candidates = [
  { id: 'scene-1', chapter_id: 'chapter-a', order: 1, accepted: true },
  { id: 'scene-2', chapter_id: 'chapter-a', order: 2, accepted: true },
  { id: 'scene-3', chapter_id: 'chapter-a', order: 3, accepted: true },
  { id: 'scene-4', chapter_id: 'chapter-b', order: 1, accepted: true },
  { id: 'scene-5', chapter_id: 'chapter-a', order: 4, accepted: false }
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
    expect(() =>
      creatorAssistantWorkflowInputV1Schema.parse({
        schema_version: 1,
        task_id: 'continuity-review',
        character_id: 'character-a'
      })
    ).toThrow()
  })
})
