import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt, loadProject } from './project.js'
import {
  WORK_ROLE_PRESETS,
  projectDefaultsForRole,
  roleOpensWorldBook,
  updateWorkCapabilitySwitches
} from './work-capabilities.js'
import type { WorkRole } from './types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('work capabilities', () => {
  it('maps the five roles onto the four switches', () => {
    expect(WORK_ROLE_PRESETS.traditional_writer).toMatchObject({
      scene_prose: false,
      display: false,
      image_generation: false,
      short_drama_export: false
    })
    expect(WORK_ROLE_PRESETS.ai_writer.scene_prose).toBe(true)
    expect(WORK_ROLE_PRESETS.ai_writer.display).toBe(false)
    expect(WORK_ROLE_PRESETS.ai_screenwriter.short_drama_export).toBe(true)
    expect(WORK_ROLE_PRESETS.oc_person).toMatchObject({
      scene_prose: false,
      display: true,
      image_generation: false
    })
    expect(WORK_ROLE_PRESETS.ai_native).toMatchObject({
      scene_prose: true,
      display: true,
      image_generation: true,
      short_drama_export: true
    })
  })

  it('opens the world book first for OC roles only', () => {
    const worldRoles: WorkRole[] = ['oc_person', 'ai_native']
    const writingRoles: WorkRole[] = ['traditional_writer', 'ai_writer', 'ai_screenwriter']
    for (const role of worldRoles) expect(roleOpensWorldBook(role)).toBe(true)
    for (const role of writingRoles) expect(roleOpensWorldBook(role)).toBe(false)
    expect(roleOpensWorldBook(undefined)).toBe(false)
  })

  it('writes the role onto a new work and leaves an unscoped work without one', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quill-capabilities-'))
    roots.push(base)
    const shaped = projectDefaultsForRole('oc_person')
    const recorded = path.join(base, 'recorded')
    await createProjectAt(recorded, {
      id: 'recorded',
      title: 'Recorded',
      ...shaped
    })
    const loaded = await loadProject(recorded)
    expect(loaded.capabilities).toEqual(WORK_ROLE_PRESETS.oc_person)
    expect(loaded.story_structure).toEqual({
      part_enabled: false,
      act_enabled: false,
      scene_enabled: false
    })
    expect(loaded.display_layer).toEqual({ enabled: true, migrated: true })

    const plain = path.join(base, 'plain')
    await createProjectAt(plain, { id: 'plain', title: 'Plain' })
    expect((await loadProject(plain)).capabilities).toBeUndefined()
  })

  it('turns a switch off and keeps the files and the role', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quill-capability-switch-'))
    roots.push(base)
    const root = path.join(base, 'native')
    await createProjectAt(root, { id: 'native', title: 'Native', ...projectDefaultsForRole('ai_native') })
    const updated = await updateWorkCapabilitySwitches(root, { image_generation: false, scene_prose: false })
    expect(updated.capabilities).toMatchObject({
      role: 'ai_native',
      scene_prose: false,
      display: true,
      image_generation: false,
      short_drama_export: true
    })
    expect(updated.story_structure?.scene_enabled).toBe(false)
    expect(updated.display_layer).toMatchObject({ enabled: true })
    const plain = path.join(base, 'plain')
    await createProjectAt(plain, { id: 'plain', title: 'Plain' })
    await expect(updateWorkCapabilitySwitches(plain, { display: true })).rejects.toThrow('问卷')
  })
})
