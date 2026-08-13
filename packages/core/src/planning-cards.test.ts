import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createProjectAt,
  createReference,
  createWorldEntry,
  derivedCardsForReference,
  enabledPlanningCards,
  listDocs,
  readMarkdown,
  validatePlanningCardGraph,
  type DocumentIdentity,
  type ReferenceDoc,
  type WorldEntryDoc
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-card-model-'))
  roots.push(root)
  await createProjectAt(root, { id: 'card-model', title: 'Card Model' })
  return root
}

describe('planning card contract', () => {
  it('stores reference material without lifecycle status and traces derived cards', async () => {
    const root = await project()
    const referenceFile = await createReference(root, 'Research notes', { id: 'ref-notes' }, 'Raw material.')
    await createWorldEntry(
      root,
      'Derived custom',
      { id: 'world-derived', source_refs: ['ref-notes'] },
      'Confirmed story-world knowledge.'
    )

    const stored = await readMarkdown<Record<string, unknown>>(referenceFile)
    expect(stored.data).not.toHaveProperty('status')

    const documents = await listDocs<DocumentIdentity>(root)
    const reference = documents.find((item) => item.data.id === 'ref-notes')
    expect(reference?.data).not.toHaveProperty('status')
    expect(
      derivedCardsForReference(reference!.data as ReferenceDoc, documents).map((item) => item.data.id)
    ).toEqual(['world-derived'])
  })

  it('excludes disabled cards from the enabled-card view', async () => {
    const root = await project()
    await createWorldEntry(root, 'Enabled', { id: 'world-enabled', enabled: true })
    await createWorldEntry(root, 'Disabled', { id: 'world-disabled', enabled: false })

    const cards = await listDocs<WorldEntryDoc>(root, 'world_entry')
    expect(enabledPlanningCards(cards).map((item) => item.data.id)).toEqual(['world-enabled'])
  })

  it('reports missing material, missing relation targets, and isolated cards', async () => {
    const documents = [
      {
        data: {
          id: 'world-connected',
          type: 'world_entry',
          schema_version: 1,
          title: 'Connected',
          status: 'active',
          tags: [],
          enabled: true,
          source_refs: ['ref-missing'],
          relations: [{ kind: 'related' as const, target_id: 'world-missing', note: '' }]
        } as unknown as WorldEntryDoc,
        content: ''
      },
      {
        data: {
          id: 'world-isolated',
          type: 'world_entry',
          schema_version: 1,
          title: 'Isolated',
          status: 'active',
          tags: [],
          enabled: true,
          source_refs: [],
          relations: []
        } as unknown as WorldEntryDoc,
        content: ''
      }
    ]

    expect(validatePlanningCardGraph(documents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-source-reference', card_id: 'world-connected' }),
        expect.objectContaining({ code: 'missing-relation-target', card_id: 'world-connected' }),
        expect.objectContaining({ code: 'isolated-card', card_id: 'world-isolated' })
      ])
    )
  })
})
