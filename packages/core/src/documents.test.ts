import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listDocs } from './documents.js'
import type { SceneDoc } from './types.js'

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
})
