import path from 'node:path'
import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { dialog } from 'electron'
import { getObsidianDir, loadConfig, saveConfig, setObsidianDir } from '@quillarium/core'
import { isAIConfigured } from '@quillarium/ai'
import {
  loadDesktopAIProfile,
  loadDesktopConfig,
  saveDesktopAIProfile,
  saveDesktopGitHub
} from './credentials.js'
import { typedHandle } from './contract.js'

export function registerConfigHandlers(): void {
  typedHandle('config:get', async () => loadDesktopConfig())
  typedHandle('config:getVault', async () => getObsidianDir())
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
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const targetVault = result.filePaths[0]
    if (currentVault && path.resolve(currentVault) !== path.resolve(targetVault)) {
      await migrateNovelProjects(currentVault, targetVault)
    }
    await setObsidianDir(targetVault)
    return targetVault
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

async function migrateNovelProjects(fromVault: string, toVault: string) {
  const fromNovels = path.join(fromVault, 'novels')
  const toNovels = path.join(toVault, 'novels')
  await mkdir(toNovels, { recursive: true })
  let entries
  try {
    entries = await readdir(fromNovels, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const from = path.join(fromNovels, entry.name)
    const to = path.join(toNovels, entry.name)
    try {
      await rename(from, to)
    } catch {
      await cp(from, to, { recursive: true, force: false, errorOnExist: true })
      await rm(from, { recursive: true, force: true })
    }
  }
}
