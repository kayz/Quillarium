import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  assembleContext,
  appendTimelineEvent,
  createProject,
  createRun,
  createCanon,
  createCharacter,
  createLocation,
  createOutline,
  createRoute,
  createScene,
  getObsidianDir,
  loadConfig,
  listDocs,
  listRuns,
  loadProject,
  readRunFile,
  readMarkdown,
  saveConfig,
  setObsidianDir,
  writeMarkdown,
  writeRunFile,
  writeRunMetadata,
  type BaseDoc
} from '@quillarium/core'
import { checkScene, formatCheckReport } from '@quillarium/checks'
import {
  createGenerationRun,
  defaultBaseUrl,
  defaultModel,
  generateIntoRun,
  isAIConfigured,
  loadAIProfile
} from '@quillarium/ai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const execFileAsync = promisify(execFile)

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    title: 'Quillarium',
    backgroundColor: '#f4f0e7',
    webPreferences: {
      preload: path.join(__dirname, '../../electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})

ipcMain.handle('config:get', async () => loadConfig())
ipcMain.handle('config:getVault', async () => getObsidianDir())
ipcMain.handle('config:chooseVault', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  await setObsidianDir(result.filePaths[0])
  return result.filePaths[0]
})
ipcMain.handle('config:setVault', async (_event, dir: string) => (await setObsidianDir(dir)).obsidianDir)
ipcMain.handle('config:setTheme', async (_event, theme: 'paper' | 'ink' | 'mist' | 'bamboo') => {
  const config = { ...(await loadConfig()), theme }
  await saveConfig(config)
  return config
})
ipcMain.handle('config:setDensity', async (_event, density: 'compact' | 'comfortable') => {
  const config = { ...(await loadConfig()), density }
  await saveConfig(config)
  return config
})
ipcMain.handle('config:setLanguage', async (_event, language: 'zh' | 'en') => {
  const config = { ...(await loadConfig()), language }
  await saveConfig(config)
  return config
})
ipcMain.handle('config:saveAIProfile', async (_event, profile: 'prose' | 'background' | 'check', input) => {
  const provider = input.provider ?? 'openai-compatible'
  const config = {
    ...(await loadConfig()),
    aiProfiles: {
      ...(await loadConfig()).aiProfiles,
      [profile]: {
        provider,
        baseUrl: input.baseUrl || defaultBaseUrl(provider),
        apiKey: input.apiKey ?? '',
        model: input.model || defaultModel(provider),
        temperature: Number(input.temperature ?? 0.7),
        maxTokens: Number(input.maxTokens ?? 2000)
      }
    }
  }
  await saveConfig(config)
  return config
})
ipcMain.handle('config:aiStatus', async () => {
  const profiles = {
    prose: await loadAIProfile('prose'),
    background: await loadAIProfile('background'),
    check: await loadAIProfile('check')
  }
  return {
    prose: isAIConfigured(profiles.prose),
    background: isAIConfigured(profiles.background),
    check: isAIConfigured(profiles.check),
    ready: Object.values(profiles).every(isAIConfigured)
  }
})

ipcMain.handle('project:list', async () => {
  const vault = await getObsidianDir()
  if (!vault) return []
  const { readdir } = await import('node:fs/promises')
  const novelsRoot = path.join(vault, 'novels')
  try {
    const entries = await readdir(novelsRoot, { withFileTypes: true })
    const projects = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const root = path.join(novelsRoot, entry.name)
      try {
        const project = await loadProject(root)
        projects.push({ root, ...project })
      } catch {
        // ignore non-project directories
      }
    }
    return projects
  } catch {
    return []
  }
})

ipcMain.handle('project:create', async (_event, input) => {
  const vault = await getObsidianDir()
  if (!vault) throw new Error('Obsidian vault is not configured')
  const paths = await createProject({ vault, ...input })
  return { root: paths.root, ...(await loadProject(paths.root)) }
})
ipcMain.handle('project:choose', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0]) return null
  const root = result.filePaths[0]
  return { root, ...(await loadProject(root)) }
})

ipcMain.handle('project:load', async (_event, root: string) => {
  const project = await loadProject(root)
  const docs = await listDocs<BaseDoc>(root)
  const runs = await listRuns(root)
  return { project, docs, runs }
})

ipcMain.handle('doc:read', async (_event, filePath: string) => readMarkdown(filePath))
ipcMain.handle(
  'doc:saveBody',
  async (_event, filePath: string, data: Record<string, unknown>, body: string) => {
    await writeMarkdown(filePath, data, body)
    return true
  }
)
ipcMain.handle('doc:create', async (_event, root: string, kind: string, input) => {
  switch (kind) {
    case 'canon':
      return createCanon(root, input.title, input.content ?? '', {
        strength: input.strength ?? 'hard',
        source: input.source ?? 'user',
        status: input.status ?? 'confirmed'
      })
    case 'character':
      return createCharacter(root, input.title, input, input.content ?? '')
    case 'timeline_event':
      return appendTimelineEvent(root, input.title, input, input.content ?? '')
    case 'location':
      return createLocation(root, input.title, input, input.content ?? '')
    case 'route':
      return createRoute(root, input.from, input.to, input)
    case 'outline':
      return createOutline(root, input.level, input.title, input, input.content ?? '')
    case 'scene':
      return createScene(root, input.title, input, input.content ?? '')
    default:
      throw new Error(`Unsupported document kind: ${kind}`)
  }
})

ipcMain.handle('scene:context', async (_event, root: string, sceneId: string) =>
  assembleContext(root, sceneId)
)
ipcMain.handle('scene:check', async (_event, root: string, sceneId: string) => {
  const report = await checkScene(root, sceneId)
  return { report, markdown: formatCheckReport(report) }
})
ipcMain.handle('scene:checkIntoRun', async (_event, root: string, sceneId: string) => {
  const report = await checkScene(root, sceneId)
  const markdown = formatCheckReport(report)
  const run = await createRun(root, sceneId, { provider: 'none', model: 'none', status: 'checked' })
  await writeRunFile(root, run, 'check-report.md', markdown)
  return { run, report, markdown }
})
ipcMain.handle('scene:generateDryRun', async (_event, root: string, sceneId: string) => {
  const context = await assembleContext(root, sceneId)
  const config = await loadAIProfile('prose')
  return createGenerationRun(root, sceneId, context, config)
})
ipcMain.handle('scene:generate', async (_event, root: string, sceneId: string) => {
  const context = await assembleContext(root, sceneId)
  const config = await loadAIProfile('prose')
  const run = await createGenerationRun(root, sceneId, context, config)
  const output = await generateIntoRun(root, run, context, config)
  return { run, output }
})
ipcMain.handle('run:readFile', async (_event, root: string, runId: string, file: string) =>
  readRunFile(root, runId, file)
)
ipcMain.handle('run:accept', async (_event, root: string, runId: string) => {
  const runs = await listRuns(root)
  const run = runs.find((item) => item.id === runId)
  if (!run) throw new Error(`Run not found: ${runId}`)
  const raw = await readRunFile(root, runId, 'output-raw.md')
  const scene = await listDocs<BaseDoc>(root, 'scene').then((docs) =>
    docs.find((doc) => doc.data.id === run.scene_id)
  )
  if (!scene) throw new Error(`Scene not found: ${run.scene_id}`)
  const next = { ...run, status: 'accepted' as const }
  await writeRunFile(root, next, 'output-accepted.md', raw)
  await writeRunMetadata(root, next)
  await writeMarkdown(scene.path, scene.data as unknown as Record<string, unknown>, raw)
  return next
})
ipcMain.handle('git:status', async (_event, root: string) => gitStatus(root))
ipcMain.handle('git:init', async (_event, root: string) => {
  await git(root, ['init'])
  return gitStatus(root)
})
ipcMain.handle('git:commit', async (_event, root: string, message: string) => {
  await git(root, ['add', '.'])
  await git(root, ['commit', '-m', message || 'Update novel project'])
  return gitStatus(root)
})
ipcMain.handle('git:setRemote', async (_event, root: string, url: string) => {
  const existing = await git(root, ['remote', 'get-url', 'origin']).catch(() => null)
  if (existing) await git(root, ['remote', 'set-url', 'origin', url])
  else await git(root, ['remote', 'add', 'origin', url])
  return gitStatus(root)
})

async function git(root: string, args: string[]) {
  return execFileAsync('git', args, { cwd: root, windowsHide: true })
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
