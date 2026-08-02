import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCharacter, listDocs, requireDoc } from './documents.js'
import type { BaseDoc, CharacterDoc, SceneDoc } from './types.js'

describe('document reads', () => {
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
          'timeline_node: event-001',
          'location: location-001',
          '---',
          '',
          'Missing required POV.',
          ''
        ].join('\n'),
        'utf8'
      )

      await expect(listDocs<SceneDoc>(projectRoot, 'scene')).rejects.toThrow(
        `Invalid scene document at ${file}: pov: Required`
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
})
