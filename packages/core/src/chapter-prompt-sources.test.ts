import { describe, expect, it } from 'vitest'
import type { ContextPacket } from './context.js'
import { contextPromptSourceBlocks } from './chapter.js'
import { canonSchema, foreshadowingSchema, narrativeSchema, worldEntrySchema } from './schema.js'

describe('contextPromptSourceBlocks', () => {
  it('keeps selected planning cards as individually removable prompt sources', () => {
    const packet = {
      project: {
        id: 'sample-project',
        aliases: [],
        title: 'Sample project',
        genre: 'general',
        target_words: 0,
        chapter_words: 3000,
        section_words: 1000,
        current_volume: 1,
        current_timeline_node: null,
        default_theme: 'paper',
        schema_version: 2
      },
      target: { type: 'scene', id: 'scene-one', title: 'Scene one', level: 'scene' },
      outline_chain: [],
      scene: null,
      canon: [
        {
          data: canonSchema.parse({ id: 'canon-law', type: 'canon', title: 'Court law' }),
          content: 'The court law is binding.'
        }
      ],
      strategies: [],
      patterns: [],
      narratives: [
        {
          data: narrativeSchema.parse({
            id: 'narrative-dialogue',
            type: 'narrative',
            title: 'Terse dialogue',
            enabled: true
          }),
          content: 'Keep exchanges short.'
        }
      ],
      timeline_nodes: [],
      timeline: [],
      characters: [],
      character_states: [],
      locations: [],
      world_entries: [
        {
          data: worldEntrySchema.parse({ id: 'world-seal', type: 'world_entry', title: 'Official seals' }),
          content: 'Every dispatch requires a seal.'
        }
      ],
      foreshadowing: [
        {
          data: foreshadowingSchema.parse({
            id: 'foreshadow-crack',
            type: 'foreshadowing',
            title: 'Cracked seal'
          }),
          content: 'The crack should be noticed.'
        }
      ],
      issues: [],
      shared_guidance: [],
      context_trace: [],
      warnings: ['Foreshadowing is due.'],
      included_ids: [],
      excluded_ids: []
    } as unknown as ContextPacket

    expect(contextPromptSourceBlocks(packet).map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: 'document:canon:canon-law', kind: 'canon' },
      { id: 'document:narrative:narrative-dialogue', kind: 'narrative' },
      { id: 'document:world_entry:world-seal', kind: 'world' },
      { id: 'document:foreshadowing:foreshadow-crack', kind: 'foreshadowing' },
      { id: 'context:warnings', kind: 'context' }
    ])
  })
})
