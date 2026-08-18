import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { dialog } from 'electron'
import {
  getObsidianDir,
  getWorkspaceDir,
  loadConfig,
  saveConfig,
  setObsidianDir,
  setWorkspaceDir
} from '@quillarium/core'
import { isAIConfigured, listOfficialModelCapabilities } from '@quillarium/ai'
import {
  loadDesktopAIProfile,
  loadDesktopConfig,
  saveDesktopAIProfile,
  saveDesktopGitHub
} from './credentials.js'
import { typedHandle } from './contract.js'
import { applyLegacyProjectMigration, prepareLegacyProjectMigration } from './workspace-migration.js'
import { registerLocalWorkspace } from './local-workspace.js'
import { getProductVersion } from '../product-version.js'

export function registerConfigHandlers(): void {
  typedHandle('app:version', () => getProductVersion())
  typedHandle('config:get', async () => loadDesktopConfig())
  typedHandle('config:modelCapabilities', () => listOfficialModelCapabilities())
  typedHandle('config:getVault', async () => getObsidianDir())
  typedHandle('config:getWorkspace', async () => getWorkspaceDir())
  typedHandle('config:chooseWorkspace', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    return registerLocalWorkspace(result.filePaths[0])
  })
  typedHandle('config:setWorkspace', async (_event, dir) => registerLocalWorkspace(dir))
  typedHandle('config:chooseVault', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    await setObsidianDir(result.filePaths[0])
    return result.filePaths[0]
  })
  typedHandle('config:setVault', async (_event, dir) => (await setObsidianDir(dir)).obsidianDir)
  typedHandle('config:setTheme', async (_event, theme) => {
    const config = { ...(await loadConfig()), theme }
    await saveConfig(config)
    return loadDesktopConfig()
  })
  typedHandle('config:setDensity', async (_event, density) => {
    const config = { ...(await loadConfig()), density }
    await saveConfig(config)
    return loadDesktopConfig()
  })
  typedHandle('config:setLanguage', async (_event, language) => {
    const config = { ...(await loadConfig()), language }
    await saveConfig(config)
    return loadDesktopConfig()
  })
  typedHandle('config:saveAIProfile', async (_event, profile, input) => saveDesktopAIProfile(profile, input))
  typedHandle('config:saveGithub', async (_event, input) => saveDesktopGitHub(input))
  typedHandle('config:migrateVault', async () => {
    const currentVault = await getObsidianDir()
    const workspaceRoot = await getWorkspaceDir()
    if (!currentVault) throw new Error('请先设置旧 Obsidian 目录。')
    if (!workspaceRoot) throw new Error('请先注册写作工作区。')
    const legacyProjectsRoot = path.join(currentVault, 'novels')
    const result = await dialog.showOpenDialog({
      title: '选择要无损迁移的旧小说项目',
      defaultPath: legacyProjectsRoot,
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const sourceRoot = await realpath(path.resolve(result.filePaths[0]))
    const projectsRoot = await realpath(path.resolve(legacyProjectsRoot))
    const relative = path.relative(projectsRoot, sourceRoot)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`请选择旧布局 ${legacyProjectsRoot} 下的一部小说项目。`)
    }

    const prepared = await prepareLegacyProjectMigration(sourceRoot, workspaceRoot)
    const confirmation = await dialog.showMessageBox({
      type: 'warning',
      title: '确认无损迁移',
      message: `将《${prepared.title}》复制到写作工作区？`,
      detail: [
        `源文件：${prepared.dryRun.source_file_count}`,
        `目标：${prepared.targetRoot}`,
        `完整备份：${prepared.backupRoot}`,
        '流程：dry-run → backup → apply → verify → report。源目录不会移动、删除或静默改写。'
      ].join('\n'),
      buttons: ['开始迁移', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (confirmation.response !== 0) return null

    const migrated = await applyLegacyProjectMigration(prepared)
    await setWorkspaceDir(workspaceRoot, migrated.projectRef.id)
    await dialog.showMessageBox({
      type: 'info',
      title: '迁移完成',
      message: `《${prepared.title}》已复制、验证并注册。`,
      detail: `源目录保持不变。\n备份：${migrated.backupRoot}\n报告：${migrated.reportPath}`,
      buttons: ['完成']
    })
    return migrated.targetRoot
  })
  typedHandle('config:aiStatus', async () => {
    const profiles = {
      prose: await loadDesktopAIProfile('prose'),
      background: await loadDesktopAIProfile('background'),
      check: await loadDesktopAIProfile('check')
    }
    return {
      prose: isAIConfigured(profiles.prose),
      background: isAIConfigured(profiles.background),
      check: isAIConfigured(profiles.check),
      ready: Object.values(profiles).every(isAIConfigured),
      storage: (await loadDesktopConfig()).aiKeyStorage
    }
  })
}
