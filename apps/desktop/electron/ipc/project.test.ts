import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendTimelineEvent,
  createOutline,
  createProjectAt,
  listDocs,
  listWorkspaceProjects,
  readMarkdown,
  registerWorkspaceProject,
  setWorkspaceDir
} from '@quillarium/core'
import type { TimelineEventDoc, TimelineNodeDoc } from '@quillarium/core'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() }
}))

import { createProjectDocument, readDesktopDocument, saveDesktopDocument } from './project.js'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace project primitives used by desktop', () => {
  it('creates a direct project-vault and registers it atomically', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-desktop-workspace-'))
    roots.push(root)
    const configRoot = path.join(root, 'config')
    vi.stubEnv('QUILL_CONFIG_DIR', configRoot)
    await mkdir(path.join(root, 'projects'), { recursive: true })
    await writeFile(
      path.join(root, 'quillarium-workspace.yaml'),
      [
        'schema_version: 1',
        'id: sample-workspace',
        'projects_dir: projects',
        'projects: []',
        'shared_guidance: []',
        ''
      ].join('\n'),
      'utf8'
    )

    const projectRoot = path.join(root, 'projects', 'sample-project')
    await createProjectAt(projectRoot, { id: 'sample-project', title: 'Sample Project' })
    await registerWorkspaceProject(root, {
      id: 'sample-project',
      path: 'projects/sample-project'
    })
    await setWorkspaceDir(root, 'sample-project')

    const projects = await listWorkspaceProjects(root)
    expect(projects).toHaveLength(1)
    expect(projects[0]?.root).toBe(projectRoot)
    expect((await stat(path.join(projectRoot, '.obsidian'))).isDirectory()).toBe(true)
  })
})

describe('desktop document identity', () => {
  it('keeps a legacy overview distinct from the book outline when its title changes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-desktop-overview-'))
    roots.push(root)
    await createProjectAt(root, { id: 'sample-project', title: 'Sample Project' })
    const bookPath = await createOutline(root, 'book', 'Sample Project 总纲', { id: 'book-outline' })
    const overviewPath = path.join(root, 'outlines', 'legacy-overview.md')
    await writeFile(
      overviewPath,
      [
        '---',
        'id: story-overview',
        'type: outline',
        'schema_version: 1',
        'title: Sample Project 总览',
        'status: draft',
        'tags: []',
        'level: book',
        'parent: null',
        'order: 0',
        '---',
        '',
        '# Story overview',
        ''
      ].join('\n'),
      'utf8'
    )

    const opened = await readDesktopDocument(overviewPath)
    expect(opened.data['level']).toBe('overview')

    await expect(
      saveDesktopDocument(overviewPath, { ...opened.data, title: 'Renamed story purpose' }, opened.content)
    ).resolves.toBe(true)

    const saved = await readMarkdown<Record<string, unknown>>(overviewPath)
    expect(saved.data).toMatchObject({
      id: 'story-overview',
      level: 'overview',
      title: 'Renamed story purpose'
    })
    expect((await readMarkdown<Record<string, unknown>>(bookPath)).data['level']).toBe('book')
  })
})

describe('desktop timeline coordinate creation', () => {
  it('uses an existing event story time and attaches that event to the new coordinate', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-desktop-timeline-'))
    roots.push(root)
    await createProjectAt(root, { id: 'timeline-project', title: 'Timeline Project' })
    await appendTimelineEvent(root, 'Opening event', {
      id: 'event-opening',
      date: '1449-08'
    })

    await createProjectDocument(root, 'timeline_node', {
      title: 'Opening coordinate',
      story_time: '1449-08',
      source_event_id: 'event-opening'
    })

    const nodes = await listDocs<TimelineNodeDoc>(root, 'timeline_node')
    const events = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.data).toMatchObject({ year: 1449, month: 8, display_time: '1449-08' })
    expect(events[0]?.data.timeline_node).toBe(nodes[0]?.data.id)
  })
})
