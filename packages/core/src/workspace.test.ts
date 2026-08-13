import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assembleContextPacket } from './context.js'
import { createCanon, createOutline, createStrategy } from './documents.js'
import { createProjectAt } from './project.js'
import { createRun, snapshotSharedGuidance } from './runs.js'
import { objectToYaml } from './yaml.js'
import {
  listWorkspaceProjects,
  loadSharedGuidance,
  loadWorkspace,
  registerWorkspaceProject,
  type WorkspaceManifestV1
} from './index.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

async function writeManifest(root: string, manifest: WorkspaceManifestV1): Promise<void> {
  await writeFile(
    path.join(root, 'quillarium-workspace.yaml'),
    `${objectToYaml(manifest as unknown as Record<string, unknown>)}\n`,
    'utf8'
  )
}

function manifest(projectPath = 'projects/sample-project'): WorkspaceManifestV1 {
  return {
    schema_version: 1,
    id: 'sample-workspace',
    projects_dir: 'projects',
    projects: [{ id: 'sample-project', path: projectPath }],
    shared_guidance: [
      {
        id: 'chapter-method',
        path: 'methodology/chapter-method.md',
        scopes: ['chapter', 'scene']
      }
    ]
  }
}

async function createWorkspaceFixture(): Promise<{
  root: string
  projectRoot: string
  guidancePath: string
}> {
  const root = await temporaryRoot('quillarium-workspace-')
  const projectRoot = path.join(root, 'projects', 'sample-project')
  const guidancePath = path.join(root, 'methodology', 'chapter-method.md')
  await mkdir(path.dirname(guidancePath), { recursive: true })
  await writeFile(guidancePath, '# Chapter Method\n\n必须使用第一人称。\n', 'utf8')
  await createProjectAt(projectRoot, {
    id: 'sample-project',
    title: 'Sample Project',
    aliases: ['Early Sample']
  })
  await writeManifest(root, manifest())
  return { root, projectRoot, guidancePath }
}

describe('workspace manifest validation', () => {
  it('loads contained projects and creates a direct Obsidian project root', async () => {
    const { root, projectRoot } = await createWorkspaceFixture()

    const workspace = await loadWorkspace(root)
    const projects = await listWorkspaceProjects(root)

    expect(workspace.manifest.schema_version).toBe(1)
    expect(projects).toHaveLength(1)
    expect(projects[0].root).toBe(path.resolve(projectRoot))
    expect(projects[0].config).toMatchObject({
      id: 'sample-project',
      title: 'Sample Project',
      aliases: ['Early Sample'],
      schema_version: 2
    })
    await expect(readFile(path.join(projectRoot, 'project.yaml'), 'utf8')).resolves.toContain(
      'schema_version: 2'
    )
    await expect(readFile(path.join(projectRoot, 'README.md'), 'utf8')).resolves.toContain(
      'Open this folder in Obsidian'
    )
    await expect(readFile(path.join(projectRoot, '.obsidian', 'app.json'), 'utf8')).rejects.toThrow()
  })

  it.each([
    ['absolute project path', 'C:/outside/project'],
    ['parent traversal', '../outside/project'],
    ['embedded parent traversal', 'projects/../outside/project']
  ])('rejects %s', async (_name, projectPath) => {
    const { root } = await createWorkspaceFixture()
    await writeManifest(root, manifest(projectPath))
    await expect(loadWorkspace(root)).rejects.toThrow(/relative|traversal/)
  })

  it('rejects duplicate project IDs and missing projects', async () => {
    const { root } = await createWorkspaceFixture()
    const duplicate = manifest()
    duplicate.projects.push({ id: 'sample-project', path: 'projects/missing-project' })
    await writeManifest(root, duplicate)
    await expect(loadWorkspace(root)).rejects.toThrow('Duplicate workspace project id')

    const missing = manifest('projects/missing-project')
    await writeManifest(root, missing)
    await expect(loadWorkspace(root)).rejects.toThrow(/does not exist|missing project.yaml/)
  })

  it('rejects a project directory symlink that resolves outside the workspace', async () => {
    const root = await temporaryRoot('quillarium-workspace-link-')
    const outside = await temporaryRoot('quillarium-outside-project-')
    const outsideProject = path.join(outside, 'sample-project')
    await createProjectAt(outsideProject, { id: 'sample-project', title: 'Outside Sample' })
    await mkdir(path.join(root, 'projects'), { recursive: true })
    await mkdir(path.join(root, 'methodology'), { recursive: true })
    await writeFile(path.join(root, 'methodology', 'chapter-method.md'), '# Guidance\n', 'utf8')
    await symlink(outsideProject, path.join(root, 'projects', 'sample-project'), 'junction')
    await writeManifest(root, manifest())

    await expect(loadWorkspace(root)).rejects.toThrow('resolves outside the workspace')
  })

  it('atomically registers a safe existing project and rejects duplicate IDs', async () => {
    const { root } = await createWorkspaceFixture()
    const secondRoot = path.join(root, 'projects', 'second-project')
    await createProjectAt(secondRoot, { id: 'second-project', title: 'Second Project' })

    const registered = await registerWorkspaceProject(root, {
      id: 'second-project',
      path: 'projects/second-project'
    })
    expect(registered).toMatchObject({
      ref: { id: 'second-project', path: 'projects/second-project' },
      root: path.resolve(secondRoot),
      config: { id: 'second-project' }
    })
    expect((await loadWorkspace(root)).manifest.projects.map((item) => item.id)).toEqual([
      'sample-project',
      'second-project'
    ])
    await expect(
      registerWorkspaceProject(root, { id: 'second-project', path: 'projects/another-project' })
    ).rejects.toThrow('Duplicate workspace project id')
  })
})

describe('shared guidance integration', () => {
  it('selects by scope below project facts, warns on conflict, and snapshots immutable bytes', async () => {
    const { projectRoot, guidancePath } = await createWorkspaceFixture()
    await createCanon(projectRoot, 'Point of View', '禁止使用第一人称。', {
      id: 'canon-point-of-view',
      strength: 'hard'
    })
    await createStrategy(
      projectRoot,
      'Narration Policy',
      { id: 'strategy-narration', principles: ['遵守项目视角。'] },
      '项目规则优先。'
    )
    await createOutline(projectRoot, 'book', 'Book', { id: 'book-one' })
    await createOutline(projectRoot, 'volume', 'Volume', {
      id: 'volume-one',
      parent: 'book-one'
    })
    await createOutline(projectRoot, 'part', 'Part', {
      id: 'part-one',
      parent: 'volume-one'
    })
    await createOutline(projectRoot, 'chapter', 'Chapter One', {
      id: 'chapter-one',
      parent: 'part-one'
    })

    const packet = await assembleContextPacket(projectRoot, { type: 'outline', id: 'chapter-one' })
    expect(packet.shared_guidance).toHaveLength(1)
    expect(packet.shared_guidance[0]).toMatchObject({
      id: 'chapter-method',
      path: 'methodology/chapter-method.md',
      scope: 'chapter'
    })
    expect(packet.context_trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source_id: 'canon-point-of-view', priority: 400 }),
        expect.objectContaining({ source_id: 'strategy-narration', priority: 300 }),
        expect.objectContaining({ source_id: 'chapter-method', priority: 100 })
      ])
    )
    expect(packet.warnings).toContain(
      '共享指导 chapter-method 与项目事实或策略存在冲突；已保留项目内容，未自动覆盖。'
    )

    const before = packet.shared_guidance[0]
    const run = await createRun(projectRoot, 'chapter-one', {
      id: 'run-guidance',
      target_type: 'outline',
      target_id: 'chapter-one'
    })
    await snapshotSharedGuidance(projectRoot, run, packet.shared_guidance)
    const markdownBefore = await readFile(
      path.join(projectRoot, 'runs', 'run-guidance', 'shared-guidance.md'),
      'utf8'
    )
    const metadataBefore = await readFile(
      path.join(projectRoot, 'runs', 'run-guidance', 'shared-guidance.json'),
      'utf8'
    )

    await writeFile(guidancePath, '# Chapter Method\n\n使用第三人称限知视角。\n', 'utf8')
    const next = await loadSharedGuidance(projectRoot, 'chapter')
    expect(next[0].sha256).not.toBe(before.sha256)
    expect(next[0].content).not.toBe(before.content)
    await expect(snapshotSharedGuidance(projectRoot, run, next)).rejects.toThrow(
      'snapshot already exists and is immutable'
    )
    await expect(
      readFile(path.join(projectRoot, 'runs', 'run-guidance', 'shared-guidance.md'), 'utf8')
    ).resolves.toBe(markdownBefore)
    await expect(
      readFile(path.join(projectRoot, 'runs', 'run-guidance', 'shared-guidance.json'), 'utf8')
    ).resolves.toBe(metadataBefore)
    expect(JSON.parse(metadataBefore).items[0].sha256).toBe(before.sha256)
  })

  it('does not inject guidance outside its declared scope', async () => {
    const { projectRoot } = await createWorkspaceFixture()
    await createOutline(projectRoot, 'book', 'Book Plan', { id: 'book-plan' })
    const packet = await assembleContextPacket(projectRoot, { type: 'outline', id: 'book-plan' })
    expect(packet.shared_guidance).toEqual([])
  })
})
