import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createCharacter,
  createCharacterRelation,
  createTimelineNode,
  listDocs,
  requireDoc
} from './documents.js'
import { createProjectAt } from './project.js'
import type { BaseDoc, CharacterDoc, CharacterRelationDoc, ReferenceDoc, SceneDoc } from './types.js'

describe('document reads', () => {
  it('keeps pure Markdown prompt assets out of ordinary document listings', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-prompts-'))
    const projectRoot = path.join(base, 'project')
    try {
      await createProjectAt(projectRoot, { id: 'prompt-filter-project', title: 'Prompt Filter Project' })
      const docs = await listDocs(projectRoot)
      expect(docs.some((doc) => doc.path.includes(`${path.sep}prompts${path.sep}`))).toBe(false)
      expect(await listDocs(projectRoot, 'prompt')).toEqual([])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('applies schema defaults to legacy documents', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-'))
    const scenesDir = path.join(projectRoot, 'scenes')
    await mkdir(scenesDir, { recursive: true })

    try {
      await writeFile(
        path.join(scenesDir, 'legacy-scene.md'),
        [
          '---',
          'id: legacy-scene',
          'type: scene',
          'title: Legacy Scene',
          'section: section-001',
          'timeline_node: event-001',
          'location: location-001',
          'pov: character-001',
          '---',
          '',
          'Legacy prose.',
          ''
        ].join('\n'),
        'utf8'
      )

      const [scene] = await listDocs<SceneDoc>(projectRoot, 'scene')

      expect(scene.data).toMatchObject({
        id: 'legacy-scene',
        schema_version: 1,
        status: 'draft',
        tags: [],
        chapter_number: '',
        volume: '',
        act: '',
        world_time: '',
        characters: [],
        chapter_hook: false,
        previous_scene: null,
        context_pins: []
      })
      expect(scene.content).toBe('Legacy prose.\n')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('reports the file and invalid field for malformed known documents', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-invalid-'))
    const scenesDir = path.join(projectRoot, 'scenes')
    await mkdir(scenesDir, { recursive: true })
    const file = path.join(scenesDir, 'broken-scene.md')

    try {
      await writeFile(
        file,
        [
          '---',
          'id: broken-scene',
          'type: scene',
          'title: Broken Scene',
          'section: section-001',
          'order: not-a-number',
          'timeline_node: event-001',
          'location: location-001',
          '---',
          '',
          'Invalid scene order.',
          ''
        ].join('\n'),
        'utf8'
      )

      await expect(listDocs<SceneDoc>(projectRoot, 'scene')).rejects.toThrow(
        `Invalid scene document at ${file}: order: Expected number, received string`
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('returns an empty list for a missing document directory and reports a missing required id', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-missing-'))

    try {
      await expect(listDocs<SceneDoc>(projectRoot, 'scene')).resolves.toEqual([])
      await expect(requireDoc(projectRoot, 'scene-not-found')).rejects.toThrow(
        'Document not found: scene-not-found'
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('surfaces malformed YAML from list and require operations', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-yaml-'))
    const scenesDir = path.join(projectRoot, 'scenes')
    await mkdir(scenesDir, { recursive: true })
    await writeFile(
      path.join(scenesDir, 'malformed.md'),
      '---\nid: malformed\ntype: scene\ntitle: [unterminated\n---\nBody\n',
      'utf8'
    )

    try {
      await expect(listDocs<SceneDoc>(projectRoot, 'scene')).rejects.toThrow()
      await expect(requireDoc(projectRoot, 'anything')).rejects.toThrow()
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('preserves unknown document types for unfiltered reads and excludes them from typed reads', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-unknown-'))
    const canonDir = path.join(projectRoot, 'canon')
    await mkdir(canonDir, { recursive: true })
    await writeFile(
      path.join(canonDir, 'future-note.md'),
      [
        '---',
        'id: future-note',
        'type: future_note',
        'schema_version: 99',
        'title: Future Note',
        'status: draft',
        'tags: []',
        'future_field: 保留',
        '---',
        '',
        'Future body.',
        ''
      ].join('\n'),
      'utf8'
    )

    try {
      const docs = await listDocs<BaseDoc>(projectRoot)
      const required = await requireDoc<BaseDoc>(projectRoot, 'future-note')

      expect(docs).toHaveLength(1)
      expect(docs[0].data).toMatchObject({
        id: 'future-note',
        type: 'future_note',
        future_field: '保留'
      })
      expect(required.content).toBe('Future body.\n')
      await expect(listDocs(projectRoot, 'canon')).resolves.toEqual([])
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('removes legacy planning lifecycle fields from reference material reads', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-reference-identity-'))
    const referencesDir = path.join(projectRoot, 'references')
    await mkdir(referencesDir, { recursive: true })
    await writeFile(
      path.join(referencesDir, 'legacy-reference.md'),
      [
        '---',
        'id: reference-legacy',
        'type: reference',
        'title: Legacy source',
        'status: draft',
        'enabled: true',
        'source_refs: []',
        'relations: []',
        'quillarium_origin:',
        '  schema_version: 1',
        '  kind: document-import',
        '  sources: []',
        '---',
        '',
        'Source body.',
        ''
      ].join('\n'),
      'utf8'
    )

    try {
      const [reference] = await listDocs<ReferenceDoc>(projectRoot, 'reference')

      expect(reference.data).not.toHaveProperty('status')
      expect(reference.data).not.toHaveProperty('enabled')
      expect(reference.data).not.toHaveProperty('source_refs')
      expect(reference.data).not.toHaveProperty('relations')
      expect(reference.data).toHaveProperty('quillarium_origin.kind', 'document-import')
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('allocates a new automatic id when the same id already exists on disk', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-documents-collision-'))
    const title = 'Concurrent Collision 7c91'

    try {
      const original = await createCharacter(
        projectRoot,
        title,
        { id: 'char-concurrent-collision-7c91' },
        'Original character body.'
      )
      const [imported, concurrent] = await Promise.all([
        createCharacter(projectRoot, title, {}, 'Second character body.'),
        createCharacter(projectRoot, title, {}, 'Third character body.')
      ])
      const characters = await listDocs<CharacterDoc>(projectRoot, 'character')

      expect(imported).not.toBe(original)
      expect(concurrent).not.toBe(imported)
      expect(characters.map((item) => item.data.id).sort()).toEqual([
        'char-concurrent-collision-7c91',
        'char-concurrent-collision-7c91-2',
        'char-concurrent-collision-7c91-3'
      ])
      expect(characters.map((item) => item.content)).toEqual(
        expect.arrayContaining([
          'Original character body.\n',
          'Second character body.\n',
          'Third character body.\n'
        ])
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })

  it('requires a relationship end node to be strictly after its start node', async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-character-relation-time-'))

    try {
      await createCharacter(projectRoot, '甲', { id: 'character-a' })
      await createCharacter(projectRoot, '乙', { id: 'character-b' })
      await createTimelineNode(projectRoot, '初见', { id: 'time-1', year: 1, month: 1 })
      await createTimelineNode(projectRoot, '反目', { id: 'time-3', year: 1, month: 3 })

      await expect(
        createCharacterRelation(projectRoot, '无效关系', {
          from_character: 'character-a',
          to_character: 'character-b',
          relation_type: '朋友',
          starts_at: 'time-1',
          ends_at: 'time-1'
        })
      ).rejects.toThrow('Relationship end time must be after start time.')

      await createCharacterRelation(projectRoot, '关系阶段', {
        id: 'relation-phase',
        from_character: 'character-a',
        to_character: 'character-b',
        relation_type: '朋友',
        starts_at: 'time-1',
        ends_at: 'time-3'
      })
      const [relation] = await listDocs<CharacterRelationDoc>(projectRoot, 'character_relation')
      expect(relation.data).toMatchObject({
        id: 'relation-phase',
        starts_at: 'time-1',
        ends_at: 'time-3'
      })
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  })
})
