import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadProject } from '@quillarium/core'
import { loadDesktopGitHubCredentials } from './credentials.js'
import { typedHandle } from './contract.js'

const execFileAsync = promisify(execFile)

export function registerGitHandlers(): void {
  typedHandle('git:status', async (_event, root) => gitStatus(root))
  typedHandle('git:init', async (_event, root) => {
    await git(root, ['init'])
    return gitStatus(root)
  })
  typedHandle('git:commit', async (_event, root, message) => {
    await git(root, ['add', '.'])
    await git(root, ['commit', '-m', message || 'Update novel project'])
    return gitStatus(root)
  })
  typedHandle('git:sync', async (_event, root, message) => {
    const status = await gitStatus(root)
    if (!status.initialized) await git(root, ['init'])
    const nextStatus = await gitStatus(root)
    if (!nextStatus.remote) throw new Error('当前小说还没有 GitHub remote。请先创建或绑定仓库。')
    await git(root, ['add', '.'])
    const dirty = (await git(root, ['status', '--short'])).stdout.trim().length > 0
    if (dirty) {
      await git(root, ['commit', '-m', message || 'Update novel project']).catch(async (error) => {
        const text = String(error)
        if (!text.includes('nothing to commit')) throw error
      })
    }
    await git(root, ['push', '-u', 'origin', nextStatus.branch || 'main'])
    return gitStatus(root)
  })
  typedHandle('git:setRemote', async (_event, root, url) => {
    const existing = await git(root, ['remote', 'get-url', 'origin']).catch(() => null)
    if (existing) await git(root, ['remote', 'set-url', 'origin', url])
    else await git(root, ['remote', 'add', 'origin', url])
    return gitStatus(root)
  })
  typedHandle('github:createRepoForProject', async (_event, root) => {
    const github = await loadDesktopGitHubCredentials()
    const token = github.token
    const owner = github.defaultOwner
    if (!token) throw new Error('请先在设置中保存 GitHub Token。')
    const project = await loadProject(root)
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
    await git(root, ['init']).catch(() => undefined)
    await git(root, ['branch', '-M', 'main']).catch(() => undefined)
    const existing = await git(root, ['remote', 'get-url', 'origin']).catch(() => null)
    if (existing) await git(root, ['remote', 'set-url', 'origin', remote])
    else await git(root, ['remote', 'add', 'origin', remote])
    await git(root, ['add', '.'])
    const dirty = (await git(root, ['status', '--short'])).stdout.trim().length > 0
    if (dirty) {
      await git(root, ['commit', '-m', `Initialize ${project.title}`]).catch((error) => {
        const text = String(error)
        if (!text.includes('nothing to commit')) throw error
      })
    }
    await git(root, ['push', '-u', 'origin', 'main'])
    if (owner && !remote.includes(owner)) {
      // The default owner is retained for future organization support; current GitHub API call uses the token owner.
    }
    return gitStatus(root)
  })
}

async function git(root: string, args: string[]) {
  return execFileAsync('git', args, { cwd: root, windowsHide: true })
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

async function gitStatus(root: string) {
  try {
    await git(root, ['rev-parse', '--is-inside-work-tree'])
  } catch {
    return { initialized: false, dirty: false, branch: null, remote: null, summary: '未初始化' }
  }
  const [{ stdout: branchRaw }, { stdout: statusRaw }, remoteResult] = await Promise.all([
    git(root, ['branch', '--show-current']),
    git(root, ['status', '--short']),
    git(root, ['remote', 'get-url', 'origin']).catch(() => ({ stdout: '' }))
  ])
  const dirty = statusRaw.trim().length > 0
  const branch = branchRaw.trim() || 'detached'
  const remote = remoteResult.stdout.trim() || null
  return {
    initialized: true,
    dirty,
    branch,
    remote,
    summary: `${branch} · ${dirty ? '有未提交修改' : '干净'} · ${remote ? 'remote configured' : '仅本地'}`
  }
}
