import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { loadProject } from '@quillarium/core'
import { loadDesktopGitHubCredentials } from './credentials.js'
import { typedHandle } from './contract.js'

const execFileAsync = promisify(execFile)

export interface ProjectGitContext {
  projectRoot: string
  repositoryRoot: string
  projectPathspec: string
  initialized: boolean
  repositoryScope: 'standalone' | 'workspace'
  canInitializeRepository: boolean
}

export interface ProjectGitStatus {
  initialized: boolean
  dirty: boolean
  branch: string | null
  remote: string | null
  summary: string
  repositoryScope: 'standalone' | 'workspace'
  repositoryRoot: string
  projectPathspec: string
  canInitializeRepository: boolean
}

export function registerGitHandlers(): void {
  typedHandle('git:status', async (_event, root) => getProjectGitStatus(root))
  typedHandle('git:init', async (_event, root) => initializeProjectRepository(root))
  typedHandle('git:commit', async (_event, root, message) =>
    commitProjectChanges(root, message || 'Update novel project')
  )
  typedHandle('git:sync', async (_event, root, message) =>
    syncProjectChanges(root, message || 'Update novel project')
  )
  typedHandle('git:setRemote', async (_event, root, url) => setProjectRemote(root, url))
  typedHandle('github:createRepoForProject', async (_event, root) => {
    const initialContext = await resolveProjectGitContext(root)
    if (initialContext.initialized && initialContext.repositoryScope === 'workspace') {
      throw new Error(
        '当前作品属于写作工作区 Git 仓库，不能为子项目创建嵌套仓库。请在工作区级别配置 remote。'
      )
    }

    const github = await loadDesktopGitHubCredentials()
    const token = github.token
    const owner = github.defaultOwner
    if (!token) throw new Error('请先在设置中保存 GitHub Token。')
    const project = await loadProject(initialContext.projectRoot)
    const repoName = slugRepoName(project.title)
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        name: repoName,
        private: github.defaultVisibility !== 'public',
        description: `Quillarium novel project: ${project.title}`
      })
    })
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(formatGitHubCreateRepoError(response.status, detail))
    }
    const json = (await response.json()) as { ssh_url?: string; clone_url?: string }
    const remote = json.clone_url ?? json.ssh_url
    if (!remote) throw new Error('GitHub 返回中没有可用 remote 地址。')

    if (!initialContext.initialized) {
      await initializeProjectRepository(initialContext.projectRoot)
    }
    const context = await requireInitializedProjectRepository(initialContext.projectRoot)
    if (context.repositoryScope !== 'standalone') {
      throw new Error('安全检查失败：拒绝在写作工作区的子项目中初始化嵌套仓库。')
    }
    await git(context.repositoryRoot, ['branch', '-M', 'main'])
    await setProjectRemote(context.projectRoot, remote)
    await commitProjectChanges(context.projectRoot, `Initialize ${project.title}`)
    await git(context.repositoryRoot, ['push', '-u', 'origin', 'main'])
    if (owner && !remote.includes(owner)) {
      // The default owner is retained for future organization support; current GitHub API call uses the token owner.
    }
    return getProjectGitStatus(context.projectRoot)
  })
}

export async function resolveProjectGitContext(projectRoot: string): Promise<ProjectGitContext> {
  if (!projectRoot.trim()) throw new Error('项目根目录不能为空。')

  const requestedRoot = path.resolve(projectRoot)
  const projectRootStat = await stat(requestedRoot).catch(() => null)
  if (!projectRootStat?.isDirectory()) throw new Error(`项目目录不存在：${requestedRoot}`)
  const canonicalProjectRoot = await realpath(requestedRoot)
  const projectConfigStat = await stat(path.join(canonicalProjectRoot, 'project.yaml')).catch(() => null)
  if (!projectConfigStat?.isFile()) {
    throw new Error(`不是有效的 Quillarium 项目：缺少 ${path.join(canonicalProjectRoot, 'project.yaml')}`)
  }

  const repositoryResult = await git(canonicalProjectRoot, ['rev-parse', '--show-toplevel']).catch(
    async (error) => {
      if (await hasGitMetadataAncestor(canonicalProjectRoot)) {
        throw new Error(
          `检测到现有 Git 元数据，但无法解析仓库根目录；已拒绝初始化嵌套仓库。${gitErrorDetail(error)}`
        )
      }
      return null
    }
  )
  if (!repositoryResult) {
    return {
      projectRoot: canonicalProjectRoot,
      repositoryRoot: canonicalProjectRoot,
      projectPathspec: '.',
      initialized: false,
      repositoryScope: 'standalone',
      canInitializeRepository: true
    }
  }

  const reportedRepositoryRoot = repositoryResult.stdout.trim()
  if (!reportedRepositoryRoot) throw new Error('Git 未返回仓库根目录。')
  const canonicalRepositoryRoot = await realpath(path.resolve(canonicalProjectRoot, reportedRepositoryRoot))
  const relativeProjectPath = path.relative(canonicalRepositoryRoot, canonicalProjectRoot)
  if (
    relativeProjectPath === '..' ||
    relativeProjectPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeProjectPath)
  ) {
    throw new Error('项目目录不在 Git 仓库内，已拒绝执行。')
  }

  const sameRoot = relativeProjectPath === ''
  const projectPathspec = sameRoot ? '.' : relativeProjectPath.split(path.sep).join('/')
  if (!sameRoot && projectPathspec.split('/').includes('.git')) {
    throw new Error('项目目录不能位于 Git 元数据目录中。')
  }

  return {
    projectRoot: canonicalProjectRoot,
    repositoryRoot: canonicalRepositoryRoot,
    projectPathspec,
    initialized: true,
    repositoryScope: sameRoot ? 'standalone' : 'workspace',
    canInitializeRepository: false
  }
}

export async function getProjectGitStatus(projectRoot: string): Promise<ProjectGitStatus> {
  const context = await resolveProjectGitContext(projectRoot)
  if (!context.initialized) {
    return {
      initialized: false,
      dirty: false,
      branch: null,
      remote: null,
      summary: '未初始化 · 可创建独立项目仓库',
      repositoryScope: context.repositoryScope,
      repositoryRoot: context.repositoryRoot,
      projectPathspec: context.projectPathspec,
      canInitializeRepository: context.canInitializeRepository
    }
  }

  const [{ stdout: branchRaw }, { stdout: statusRaw }, remoteResult] = await Promise.all([
    git(context.repositoryRoot, ['branch', '--show-current']),
    git(context.repositoryRoot, scopedArgs(context, ['status', '--short', '--untracked-files=all'])),
    git(context.repositoryRoot, ['remote', 'get-url', 'origin']).catch(() => ({
      stdout: '',
      stderr: ''
    }))
  ])
  const dirty = statusRaw.trim().length > 0
  const branch = branchRaw.trim() || 'detached'
  const remote = remoteResult.stdout.trim() || null
  const scopeLabel = context.repositoryScope === 'workspace' ? '工作区仓库' : '独立项目仓库'
  return {
    initialized: true,
    dirty,
    branch,
    remote,
    summary: `${branch} · ${dirty ? '当前项目有未提交修改' : '当前项目干净'} · ${scopeLabel} · ${remote ? 'remote configured' : '仅本地'}`,
    repositoryScope: context.repositoryScope,
    repositoryRoot: context.repositoryRoot,
    projectPathspec: context.projectPathspec,
    canInitializeRepository: false
  }
}

export async function initializeProjectRepository(projectRoot: string): Promise<ProjectGitStatus> {
  const context = await resolveProjectGitContext(projectRoot)
  if (context.initialized) {
    if (context.repositoryScope === 'workspace') {
      throw new Error(
        '当前作品已经属于写作工作区 Git 仓库，不能创建项目级嵌套仓库。请使用工作区级 Git 操作。'
      )
    }
    return getProjectGitStatus(context.projectRoot)
  }

  await git(context.projectRoot, ['init'])
  return getProjectGitStatus(context.projectRoot)
}

export async function commitProjectChanges(projectRoot: string, message: string): Promise<ProjectGitStatus> {
  const context = await requireInitializedProjectRepository(projectRoot)
  await git(context.repositoryRoot, scopedArgs(context, ['add', '--all']))

  if (await hasScopedStagedChanges(context)) {
    await git(
      context.repositoryRoot,
      scopedArgs(context, ['commit', '--only', '-m', message || 'Update novel project'])
    )
  }
  return getProjectGitStatus(context.projectRoot)
}

export async function setProjectRemote(projectRoot: string, url: string): Promise<ProjectGitStatus> {
  const context = await requireInitializedProjectRepository(projectRoot)
  const existing = await git(context.repositoryRoot, ['remote', 'get-url', 'origin']).catch(() => null)
  if (existing) await git(context.repositoryRoot, ['remote', 'set-url', 'origin', url])
  else await git(context.repositoryRoot, ['remote', 'add', 'origin', url])
  return getProjectGitStatus(context.projectRoot)
}

export async function syncProjectChanges(projectRoot: string, message: string): Promise<ProjectGitStatus> {
  const context = await requireInitializedProjectRepository(projectRoot)
  const remote = await git(context.repositoryRoot, ['remote', 'get-url', 'origin']).catch(() => null)
  if (!remote?.stdout.trim()) {
    throw new Error(
      context.repositoryScope === 'workspace'
        ? '写作工作区还没有 GitHub remote。请先在工作区级别创建或绑定仓库。'
        : '当前小说还没有 GitHub remote。请先创建或绑定仓库。'
    )
  }

  await commitProjectChanges(context.projectRoot, message || 'Update novel project')
  const { stdout: branchRaw } = await git(context.repositoryRoot, ['branch', '--show-current'])
  const branch = branchRaw.trim()
  if (!branch) throw new Error('当前仓库处于 detached HEAD，无法安全同步。')
  await git(context.repositoryRoot, ['push', '-u', 'origin', branch])
  return getProjectGitStatus(context.projectRoot)
}

async function requireInitializedProjectRepository(projectRoot: string): Promise<ProjectGitContext> {
  const context = await resolveProjectGitContext(projectRoot)
  if (!context.initialized) throw new Error('当前项目尚未初始化 Git 仓库。')
  return context
}

async function hasScopedStagedChanges(context: ProjectGitContext): Promise<boolean> {
  try {
    await git(context.repositoryRoot, scopedArgs(context, ['diff', '--cached', '--quiet']))
    return false
  } catch (error) {
    if (gitExitCode(error) === 1) return true
    throw error
  }
}

async function hasGitMetadataAncestor(root: string): Promise<boolean> {
  let current = root
  while (true) {
    const metadata = await stat(path.join(current, '.git')).catch((error: unknown) => {
      if (nativeErrorCode(error) === 'ENOENT') return null
      throw error
    })
    if (metadata) return true
    const parent = path.dirname(current)
    if (parent === current) return false
    current = parent
  }
}

function scopedArgs(context: ProjectGitContext, command: string[]): string[] {
  return ['--literal-pathspecs', ...command, '--', context.projectPathspec]
}

async function git(root: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync('git', args, {
    cwd: root,
    windowsHide: true,
    encoding: 'utf8'
  })
  return { stdout: String(result.stdout), stderr: String(result.stderr) }
}

function gitExitCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'number' ? code : null
}

function nativeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function gitErrorDetail(error: unknown): string {
  if (!error || typeof error !== 'object' || !('stderr' in error)) return ''
  const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim()
  return stderr ? ` Git 返回：${stderr}` : ''
}

function slugRepoName(title: string): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return ascii || `novel-${Date.now()}`
}

function formatGitHubCreateRepoError(status: number, detail: string): string {
  if (status === 401) {
    return `GitHub Token 无效或已过期。请在设置里重新保存 Token。\n\nGitHub 返回：${detail}`
  }
  if (status === 403) {
    return [
      'GitHub Token 无权创建仓库。',
      '请使用 classic token 并勾选 repo scope；如果使用 fine-grained token，需要允许创建仓库，并授予新仓库 Administration: write 权限。',
      '当前版本只支持用 Token 所属账号创建私有仓库；组织仓库后续再单独接入。',
      '',
      `GitHub 返回：${detail}`
    ].join('\n')
  }
  if (status === 422) {
    return [
      'GitHub 仓库创建失败：仓库名可能已存在，或请求参数不符合 GitHub 要求。',
      '可以修改小说名后重试，或先手工创建仓库再绑定 remote。',
      '',
      `GitHub 返回：${detail}`
    ].join('\n')
  }
  return `GitHub 仓库创建失败 ${status}: ${detail}`
}
