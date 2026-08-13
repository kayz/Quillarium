import { describe, expect, it } from 'vitest'
import {
  ContextBudgetExceededError,
  compileContextBlocks,
  type PromptBlockCandidate
} from './context-compiler.js'
import type { ContextTokenCounter } from './tokenization.js'

const counter: ContextTokenCounter = {
  descriptor: {
    id: 'test-exact',
    provider: 'test',
    model: 'test-model',
    exact: true,
    source_revision: 'fixture-v1',
    source_sha256: 'fixture-source',
    vocabulary_sha256: 'fixture-vocabulary'
  },
  count: (text) => [...text].length,
  truncate: (text, maximum, strategy) => {
    const characters = [...text]
    const kept = strategy === 'head' ? characters.slice(0, maximum) : characters.slice(-maximum)
    return {
      text: kept.join(''),
      token_count: kept.length,
      original_token_count: characters.length,
      truncated: kept.length < characters.length
    }
  }
}

function candidate(
  id: string,
  content: string,
  input: Partial<PromptBlockCandidate> = {}
): PromptBlockCandidate {
  return {
    id,
    kind: 'project_guidance',
    title: id,
    content,
    source: { type: 'narrative', id },
    scope: 'chapter',
    purpose: 'test',
    authority: 'project',
    authority_rank: 300,
    priority: 300,
    order: 100,
    selected: true,
    selection_reason: 'test activation',
    truncation: 'head',
    ...input
  }
}

describe('context compiler', () => {
  it('is deterministic and keeps higher-authority material ahead of advisory guidance', async () => {
    const candidates = [
      candidate('shared', 'ssssssssss', {
        kind: 'shared_guidance',
        source: { type: 'shared_guidance', id: 'shared', path: 'methodology/shared.md' },
        authority: 'advisory',
        authority_rank: 100,
        priority: 100
      }),
      candidate('hard-canon', 'cccccccccc', {
        kind: 'canon',
        source: { type: 'canon', id: 'hard-canon', path: 'canon/hard.md' },
        authority: 'hard_canon',
        authority_rank: 500,
        priority: 500
      })
    ]
    const options = {
      token_counter: counter,
      policy: {
        token_budget: 12,
        max_block_tokens: 12,
        min_truncated_block_tokens: 2,
        max_candidates: 10
      }
    }
    const first = await compileContextBlocks({ type: 'scene', id: 'scene-one' }, candidates, options)
    const second = await compileContextBlocks({ type: 'scene', id: 'scene-one' }, candidates, options)
    expect(first).toEqual(second)
    expect(first.trace.budget.used_tokens).toBeLessThanOrEqual(12)
    expect(first.trace.entries.find((entry) => entry.source_id === 'hard-canon')?.outcome).not.toBe(
      'excluded'
    )
    expect(first.trace.entries.find((entry) => entry.source_id === 'shared')?.outcome).toBe('excluded')
    expect(first.blocks[0]?.content_sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(first.blocks[0]?.tokenizer_id).toBe('test-exact')
  })

  it('explains explicit exclusions, candidate caps, and deterministic truncation', async () => {
    const result = await compileContextBlocks(
      { type: 'outline', id: 'chapter-one' },
      [
        candidate('included', '1234567890', { priority: 301 }),
        candidate('capped', 'abc'),
        candidate('explicit', 'xyz', {
          selected: false,
          exclusion_reason: 'explicit project context exclusion'
        })
      ],
      {
        token_counter: counter,
        reached_recursion_depth: 2,
        policy: {
          token_budget: 6,
          max_block_tokens: 10,
          min_truncated_block_tokens: 2,
          max_candidates: 1,
          max_recursion_depth: 2
        }
      }
    )
    expect(result.trace.budget.used_tokens).toBeLessThanOrEqual(6)
    expect(result.trace.candidates).toMatchObject({ limit: 1, reached_recursion_depth: 2 })
    expect(result.trace.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_id: 'included', outcome: 'truncated' }),
        expect.objectContaining({
          source_id: 'capped',
          outcome: 'excluded',
          reason: expect.stringContaining('limit')
        }),
        expect.objectContaining({
          source_id: 'explicit',
          outcome: 'excluded',
          reason: expect.stringContaining('explicit')
        })
      ])
    )
  })

  it('rejects absolute source paths and required content that cannot fit', async () => {
    await expect(
      compileContextBlocks(
        { type: 'scene', id: 'scene-one' },
        [candidate('unsafe', 'abc', { source: { type: 'canon', id: 'unsafe', path: 'C:/secret.md' } })],
        { token_counter: counter }
      )
    ).rejects.toThrow('relative and contained')

    await expect(
      compileContextBlocks(
        { type: 'scene', id: 'scene-one' },
        [candidate('required', 'abcdefghij', { required: true, truncation: 'none' })],
        {
          token_counter: counter,
          policy: { token_budget: 4, max_block_tokens: 10, min_truncated_block_tokens: 2 }
        }
      )
    ).rejects.toBeInstanceOf(ContextBudgetExceededError)
  })

  it('reserves mandatory hard Canon before lower-authority project material', async () => {
    await expect(
      compileContextBlocks(
        { type: 'scene', id: 'scene-authority' },
        [
          candidate('project-outline', 'pppp', {
            required: true,
            truncation: 'none',
            authority: 'project',
            authority_rank: 400
          }),
          candidate('hard-canon', 'cccc', {
            required: true,
            truncation: 'none',
            kind: 'canon',
            authority: 'hard_canon',
            authority_rank: 500
          })
        ],
        {
          token_counter: counter,
          policy: { token_budget: 5, max_block_tokens: 5, min_truncated_block_tokens: 2 }
        }
      )
    ).rejects.toMatchObject({ block_id: 'project-outline', token_budget: 5 })
  })

  it('reserves output and exact framing tokens before allocating context', async () => {
    const result = await compileContextBlocks(
      { type: 'scene', id: 'scene-budget' },
      [candidate('content', 'abcdefghij', { priority: 999 })],
      {
        token_counter: counter,
        reserved_output_tokens: 3,
        framing_text: 'ff',
        policy: {
          token_budget: 10,
          max_block_tokens: 10,
          min_truncated_block_tokens: 2
        }
      }
    )
    expect(result.trace.budget).toMatchObject({
      total_token_budget: 10,
      reserved_output_tokens: 3,
      framing_tokens: 2,
      available_input_tokens: 5,
      selected_tokens: 5,
      unused_input_tokens: 0
    })
    expect(result.blocks[0]).toMatchObject({
      token_count: 5,
      original_token_count: 10,
      retained_token_range: { start: 0, end: 5 },
      truncated: true
    })
  })

  it('uses a complete preset block order and records the preset snapshot identity', async () => {
    const kinds = [
      'packet_header',
      'target',
      'project',
      'accepted_prose',
      'canon',
      'outline',
      'project_guidance',
      'timeline',
      'character',
      'location',
      'world',
      'foreshadowing',
      'issue',
      'shared_guidance',
      'warning',
      'generation_target'
    ] as const
    const order = [...kinds]
    const canonIndex = order.indexOf('canon')
    const guidanceIndex = order.indexOf('project_guidance')
    ;[order[canonIndex], order[guidanceIndex]] = [order[guidanceIndex], order[canonIndex]]

    const result = await compileContextBlocks(
      { type: 'scene', id: 'scene-preset-order' },
      [
        candidate('canon', 'canon', { kind: 'canon', order: 1 }),
        candidate('guidance', 'guidance', { kind: 'project_guidance', order: 99 })
      ],
      {
        token_counter: counter,
        prompt_block_order: order,
        preset: { id: 'focused', version: '2.0.0', snapshot_sha256: 'a'.repeat(64) }
      }
    )

    expect(result.blocks.map((block) => block.id)).toEqual(['guidance', 'canon'])
    expect(result.trace.preset).toEqual({
      id: 'focused',
      version: '2.0.0',
      snapshot_sha256: 'a'.repeat(64)
    })
    await expect(
      compileContextBlocks({ type: 'scene', id: 'scene-invalid-order' }, [candidate('only', 'content')], {
        token_counter: counter,
        prompt_block_order: ['canon']
      })
    ).rejects.toThrow('must contain every supported block kind exactly once')
  })
})
