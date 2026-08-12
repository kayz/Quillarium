import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createProjectAt,
  listWorkspaceProjects,
  registerWorkspaceProject,
  setWorkspaceDir
} from '@quillarium/core'

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
