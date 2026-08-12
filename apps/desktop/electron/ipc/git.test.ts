import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('@quillarium/core', () => ({ loadProject: vi.fn() }))
vi.mock('./credentials.js', () => ({ loadDesktopGitHubCredentials: vi.fn() }))

import {
  commitProjectChanges,
  getProjectGitStatus,
  initializeProjectRepository,
  resolveProjectGitContext,
  setProjectRemote,
  syncProjectChanges
} from './git.js'

const execFileAsync = promisify(execFile)
const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      const canonicalTemporaryRoot = path.resolve(tmpdir())
      const resolvedRoot = path.resolve(root)
      if (!resolvedRoot.startsWith(`${canonicalTemporaryRoot}${path.sep}`)) {
        throw new Error(`Refusing to remove non-temporary test path: ${resolvedRoot}`)
      }
      await rm(resolvedRoot, { recursive: true, force: true })
    })
  )
})

describe('workspace-aware project Git service', () => {
  it('requires a real project root and exposes an uninitialized standalone repository safely', async () => {
    const root = await makeTemporaryDirectory()
    const projectRoot = path.join(root, 'standalone')
    await mkdir(projectRoot)

    await expect(resolveProjectGitContext('  ')).rejects.toThrow('项目根目录不能为空')
    await expect(resolveProjectGitContext(projectRoot)).rejects.toThrow('缺少')

    await writeProjectConfig(projectRoot, 'standalone')
    const context = await resolveProjectGitContext(projectRoot)
    const status = await getProjectGitStatus(projectRoot)

    expect(context).toMatchObject({
      initialized: false,
      repositoryScope: 'standalone',
      projectPathspec: '.',
      canInitializeRepository: true
    })
    expect(status).toMatchObject({
      initialized: false,
      dirty: false,
      repositoryScope: 'standalone',
      projectPathspec: '.',
      canInitializeRepository: true
    })

    const unsafeParent = path.join(root, 'broken-parent')
    const nestedProject = path.join(unsafeParent, 'nested-project')
    await mkdir(path.join(unsafeParent, '.git'), { recursive: true })
    await mkdir(nestedProject)
    await writeProjectConfig(nestedProject, 'nested-project')
    await expect(initializeProjectRepository(nestedProject)).rejects.toThrow('检测到现有 Git 元数据')
    expect(await exists(path.join(nestedProject, '.git'))).toBe(false)
  })

  it('commits only project A and preserves project B and root-level staged changes', async () => {
    const workspace = await createWorkspaceRepository()
    const projectA = path.join(workspace, 'projects', 'a')
    const projectB = path.join(workspace, 'projects', 'b')

    await writeFile(path.join(projectA, 'chapter.md'), 'A changed\n')
    await writeFile(path.join(projectB, 'chapter.md'), 'B changed\n')
    await writeFile(path.join(workspace, 'README.md'), 'root changed\n')
    await runGit(workspace, ['add', '--', 'projects/b/chapter.md', 'README.md'])

    const before = await getProjectGitStatus(projectA)
    expect(before).toMatchObject({
      initialized: true,
      dirty: true,
      repositoryScope: 'workspace',
      projectPathspec: 'projects/a',
      canInitializeRepository: false
    })

    const after = await commitProjectChanges(projectA, 'Update project A')
    const committedPaths = lines(await runGit(workspace, ['show', '--pretty=format:', '--name-only', 'HEAD']))
    const remainingStagedPaths = lines(await runGit(workspace, ['diff', '--cached', '--name-only']))

    expect(after.dirty).toBe(false)
    expect(committedPaths).toEqual(['projects/a/chapter.md'])
    expect(remainingStagedPaths.sort()).toEqual(['README.md', 'projects/b/chapter.md'])
    expect(await runGit(workspace, ['show', 'HEAD:projects/b/chapter.md'])).toBe('B initial\n')
    expect(await runGit(workspace, ['show', 'HEAD:README.md'])).toBe('root initial\n')
    await expect(initializeProjectRepository(projectA)).rejects.toThrow('工作区 Git 仓库')
    expect(await exists(path.join(projectA, '.git'))).toBe(false)
  }, 20_000)

  it('configures and syncs the workspace remote at the repository root', async () => {
    const workspace = await createWorkspaceRepository()
    const projectA = path.join(workspace, 'projects', 'a')
    const projectB = path.join(workspace, 'projects', 'b')
    const remoteRoot = path.join(await makeTemporaryDirectory(), 'remote.git')
    await runGit(path.dirname(remoteRoot), ['init', '--bare', remoteRoot])

    const remoteStatus = await setProjectRemote(projectA, remoteRoot)
    expect(remoteStatus.repositoryRoot).toBe(await realpath(workspace))
    expect((await runGit(workspace, ['remote', 'get-url', 'origin'])).trim()).toBe(remoteRoot)
    expect(await exists(path.join(projectA, '.git'))).toBe(false)

    await writeFile(path.join(projectA, 'chapter.md'), 'A synchronized\n')
    await writeFile(path.join(projectB, 'chapter.md'), 'B remains local\n')
    await runGit(workspace, ['add', '--', 'projects/b/chapter.md'])
    await syncProjectChanges(projectA, 'Synchronize project A')

    expect((await runGit(remoteRoot, ['rev-parse', 'refs/heads/main'])).trim()).toBe(
      (await runGit(workspace, ['rev-parse', 'HEAD'])).trim()
    )
    expect(lines(await runGit(workspace, ['diff', '--cached', '--name-only']))).toEqual([
      'projects/b/chapter.md'
    ])
  }, 20_000)

  it('keeps a standalone project rooted at itself and uses the dot pathspec', async () => {
    const root = await makeTemporaryDirectory()
    const projectRoot = path.join(root, 'standalone')
    await mkdir(projectRoot)
    await writeProjectConfig(projectRoot, 'standalone')
    await writeFile(path.join(projectRoot, 'chapter.md'), 'Standalone chapter\n')

    const initialized = await initializeProjectRepository(projectRoot)
    await configureRepository(projectRoot)
    await runGit(projectRoot, ['branch', '-M', 'main'])
    const committed = await commitProjectChanges(projectRoot, 'Initial standalone project')

    expect(initialized.repositoryScope).toBe('standalone')
    expect(committed).toMatchObject({
      initialized: true,
      dirty: false,
      repositoryScope: 'standalone',
      projectPathspec: '.',
      canInitializeRepository: false
    })
    expect(await realpath(committed.repositoryRoot)).toBe(await realpath(projectRoot))
    expect(lines(await runGit(projectRoot, ['show', '--pretty=format:', '--name-only', 'HEAD']))).toEqual([
      'chapter.md',
      'project.yaml'
    ])
  })
})

async function createWorkspaceRepository(): Promise<string> {
  const workspace = await makeTemporaryDirectory()
  const projectA = path.join(workspace, 'projects', 'a')
  const projectB = path.join(workspace, 'projects', 'b')
  await Promise.all([mkdir(projectA, { recursive: true }), mkdir(projectB, { recursive: true })])
  await Promise.all([
    writeProjectConfig(projectA, 'a'),
    writeProjectConfig(projectB, 'b'),
    writeFile(path.join(projectA, 'chapter.md'), 'A initial\n'),
    writeFile(path.join(projectB, 'chapter.md'), 'B initial\n'),
    writeFile(path.join(workspace, 'README.md'), 'root initial\n')
  ])
  await runGit(workspace, ['init', '-b', 'main'])
  await configureRepository(workspace)
  await runGit(workspace, ['add', '--all'])
  await runGit(workspace, ['commit', '-m', 'Initial workspace'])
  return workspace
}

async function configureRepository(root: string): Promise<void> {
  await runGit(root, ['config', 'user.name', 'Quillarium Test'])
  await runGit(root, ['config', 'user.email', 'quillarium-test@example.invalid'])
}

async function writeProjectConfig(root: string, id: string): Promise<void> {
  await writeFile(
    path.join(root, 'project.yaml'),
    `schema_version: 2\nid: ${id}\ntitle: Project ${id.toUpperCase()}\naliases: []\n`
  )
}

async function makeTemporaryDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'quillarium-git-test-'))
  temporaryRoots.push(root)
  return root
}

async function runGit(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8'
  })
  return String(result.stdout)
}

async function exists(target: string): Promise<boolean> {
  return stat(target)
    .then(() => true)
    .catch(() => false)
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
