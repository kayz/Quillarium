import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildEditableScenePromptPlan, savePromptSourcesAsContextBundle } from './chapter.js'
import { createCanon, createOutline, createScene } from './documents.js'
import { createProjectAt } from './project.js'
import type { ContextTokenCounter } from './tokenization.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const counter: ContextTokenCounter = {
  descriptor: {
    id: 'prompt-overlay-test',
    provider: 'test',
    model: 'test',
    exact: true,
    source_revision: 'fixture',
    source_sha256: 'fixture-source',
    vocabulary_sha256: 'fixture-vocabulary'
  },
  count: (text) => [...text].length,
  truncate: (text, maximum, strategy) => {
    const value = [...text]
    const retained = strategy === 'tail' ? value.slice(-maximum) : value.slice(0, maximum)
    return {
      text: retained.join(''),
      token_count: retained.length,
      original_token_count: value.length,
      truncated: retained.length < value.length
    }
  }
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-prompt-overlay-'))
  roots.push(root)
  await createProjectAt(root, { id: 'prompt-overlay', title: 'Prompt Overlay' })
  await createOutline(root, 'book', 'Book', { id: 'book' })
  await createOutline(root, 'volume', 'Volume', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', 'Part', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', 'Chapter', { id: 'chapter', parent: 'part' })
  await createScene(root, 'Scene', {
    id: 'scene',
    chapter_id: 'chapter',
    order: 0,
    timeline_node: 'time-one',
    location: 'place-one',
    pov: 'character-one',
    writing_focus: 'Force one irreversible choice.'
  })
  await createCanon(root, 'Gate rule', 'The gate opens only once.', {
    id: 'canon-gate',
    strength: 'hard'
  })
  return root
}

describe('temporary ContextBundle prompt overlays', () => {
  it('re-resolves stable sources server-side and keeps the product output boundary mandatory', async () => {
    const root = await fixture()
    const initial = await buildEditableScenePromptPlan(root, { sceneId: 'scene' }, { token_counter: counter })
    const selected = initial.source_selections.filter((source) =>
      ['prompt_asset', 'outline', 'scene', 'canon'].includes(source.source_type ?? '')
    )
    expect(selected.some((source) => source.source_id === 'canon-gate')).toBe(true)

    const compiled = await buildEditableScenePromptPlan(
      root,
      { sceneId: 'scene' },
      { token_counter: counter },
      selected
    )
    expect(compiled.prompt).toContain('The gate opens only once.')
    expect(compiled.prompt).toContain('只输出当前节的纯文字正文')
    expect(compiled.prompt_blocks.at(-1)).toMatchObject({
      id: 'prompt-overlay:plain-prose-output',
      role: 'system',
      authority: 'system'
    })
    expect(compiled.context_trace.final_block_ids).toContain('prompt-overlay:plain-prose-output')

    await expect(
      buildEditableScenePromptPlan(root, { sceneId: 'scene' }, { token_counter: counter }, [
        selected[0]!,
        selected[0]!
      ])
    ).rejects.toThrow('PROMPT_OVERLAY_SOURCE_DUPLICATE')
  })

  it('saves only stable document identities and never serializes prompt text or file paths', async () => {
    const root = await fixture()
    const plan = await buildEditableScenePromptPlan(root, { sceneId: 'scene' }, { token_counter: counter })
    const saved = await savePromptSourcesAsContextBundle(
      root,
      'Reviewed scene sources',
      plan.source_selections
    )
    expect(saved.value.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ document_type: 'outline', document_id: 'chapter' }),
        expect.objectContaining({ document_type: 'scene', document_id: 'scene' }),
        expect.objectContaining({ document_type: 'canon', document_id: 'canon-gate' })
      ])
    )
    const serialized = JSON.stringify(saved.value)
    expect(serialized).not.toContain('prompt_asset')
    expect(serialized).not.toContain('The gate opens only once.')
    expect(serialized).not.toContain(root)
  })
})
