import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendTimelineEvent,
  assembleContext,
  buildIndex,
  createCanon,
  createCharacter,
  createLocation,
  createOutline,
  createProject,
  createRoute,
  createScene,
  listDocs,
  pathExists
} from './index.js'

describe('core project flow', () => {
  it('creates a project and assembles context', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'quillarium-'))
    try {
      const project = await createProject({ vault: tmp, title: 'Test Novel', genre: 'test' })
      expect(await pathExists(path.join(project.root, 'project.yaml'))).toBe(true)

      await createCanon(project.root, 'Core Rule', 'Do not break canon.')
      const charFile = await createCharacter(project.root, 'Asha', {
        ooc_guardrails: ['Do not become childish.']
      })
      const locFile = await createLocation(project.root, 'Old Palace')
      await createRoute(project.root, 'loc-old-palace', 'loc-old-road')
      const evtFile = await appendTimelineEvent(project.root, 'Opening Night', { location: 'loc-old-palace' })
      const outlineFile = await createOutline(project.root, 'section', 'Opening Section')

      const charId = path.basename(charFile).split('-Asha')[0]
      const locId = path.basename(locFile).split('-Old')[0]
      const evtId = path.basename(evtFile).split('-Opening')[0]
      const sectionId = path.basename(outlineFile).split('-Opening')[0]

      await createScene(project.root, 'Opening Scene', {
        section: sectionId,
        timeline_node: evtId,
        location: locId,
        pov: charId,
        characters: [charId]
      })
      const scenes = await listDocs(project.root, 'scene')
      const context = await assembleContext(project.root, scenes[0].data.id)
      expect(context).toContain('Do not break canon')
      expect(context).toContain('Asha')
      const index = await buildIndex(project.root)
      expect(index.entries.length).toBeGreaterThan(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
