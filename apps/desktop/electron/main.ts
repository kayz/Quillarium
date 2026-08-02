import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import { cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import {
  assembleContext,
  assembleContextPacket,
  answerImportIssue,
  buildChapterWritingPlan,
  buildFinalizeReviewPrompt,
  buildImportPrompt,
  confirmFinalizeImpact,
  appendTimelineEvent,
  createFinalizeReviewSession,
  createImportSessionPlan,
  createProject,
  createRun,
  createCanon,
  createCharacterState,
  createCharacter,
  createForeshadowing,
  createIssue,
  createLocation,
  createOutline,
  createPattern,
  createReference,
  createRoute,
  createScene,
  createStrategy,
  createWorldEntry,
  getObsidianDir,
  ensureDefaultPrompts,
  importMarkdownPath,
  landImportSession,
  listMarkdownFiles,
  loadConfig,
  loadFinalizeReviewSession,
  loadImportSession,
  listDocs,
  listRuns,
  loadProject,
  readRunFile,
  readMarkdown,
  readPrompt,
  saveConfig,
  setObsidianDir,
  writeMarkdown,
  writeText,
  writeRunFile,
  writeRunMetadata,
  renderContextPacket,
  type BaseDoc,
  type CharacterDoc,
  type LocationDoc,
  type OutlineDoc,
  type SceneDoc,
  type TimelineEventDoc
} from '@quillarium/core'
import { checkScene, checkTarget, formatCheckReport } from '@quillarium/checks'
import {
  createGenerationRun,
  defaultBaseUrl,
  defaultModel,
  generateCanonText,
  generateIntoRun,
  generateText,
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
Menu.setApplicationMenu(null)
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
ipcMain.handle('config:saveGithub', async (_event, input) => {
  const defaultVisibility: 'private' | 'public' = input.defaultVisibility === 'public' ? 'public' : 'private'
  const config = {
    ...(await loadConfig()),
    github: {
      token: input.token ?? '',
      defaultOwner: input.defaultOwner ?? '',
      defaultVisibility
    }
  }
  await saveConfig(config)
  return config
})
ipcMain.handle('config:migrateVault', async () => {
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
ipcMain.handle('doc:delete', async (_event, filePath: string) => {
  await rm(filePath, { force: true })
  return true
})
ipcMain.handle('doc:openExternal', async (_event, filePath: string) => {
  const error = await shell.openPath(filePath)
  if (error) throw new Error(error)
  return true
})
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
    case 'character_state':
      return createCharacterState(root, input.title, input, input.content ?? '')
    case 'foreshadowing':
      return createForeshadowing(root, input.title, input, input.content ?? '')
    case 'world_entry':
      return createWorldEntry(root, input.title, input, input.content ?? '')
    case 'reference':
      return createReference(root, input.title, input, input.content ?? '')
    case 'issue':
      return createIssue(root, input.title, input, input.content ?? '')
    case 'strategy':
      return createStrategy(root, input.title, input, input.content ?? '')
    case 'pattern':
      return createPattern(root, input.title, input, input.content ?? '')
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

ipcMain.handle('import:chooseMarkdown', async (_event, root: string) => {
  const result = await dialog.showOpenDialog({
    title: '选择要导入的 Markdown',
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
  })
  if (result.canceled) return []
  const imported = []
  for (const filePath of result.filePaths) {
    imported.push(...(await importMarkdownPath(root, filePath)))
  }
  return imported
})

ipcMain.handle('import:markdownText', async (_event, root: string, markdown: string, title?: string) => {
  const name = (title || markdown.match(/^#\s+(.+)$/m)?.[1] || '粘贴导入').trim()
  const file = path.join(root, '.quillarium', 'imports', `${Date.now()}-${slugImportName(name)}.md`)
  await writeText(file, markdown)
  return importMarkdownPath(root, file)
})

ipcMain.handle('import:syncMarkdown', async (_event, root: string) => {
  const targets = (await listMarkdownFiles(root)).filter((file) => isUnmanagedMarkdown(root, file))
  const imported = []
  for (const target of targets) {
    imported.push(...(await importMarkdownPath(root, target)))
  }
  return imported
})

ipcMain.handle('prompt:init', async (_event, root: string) => ensureDefaultPrompts(root))
ipcMain.handle('prompt:read', async (_event, root: string, name) => readPrompt(root, name))

ipcMain.handle('import:aiPlan', async (_event, root: string, input) => {
  const session = await createImportSessionPlan(root, input)
  const config = await loadAIProfile('background')
  if (input?.callAI === false || input?.aiResponse) return session
  const response = await generateText(
    buildImportPrompt(session),
    config,
    'You are Quillarium Background Import Agent. Return strict JSON only.'
  )
  return createImportSessionPlan(root, { ...input, aiResponse: response })
})
ipcMain.handle('import:session', async (_event, root: string, sessionId: string) =>
  loadImportSession(root, sessionId)
)
ipcMain.handle('import:answerIssue', async (_event, root: string, sessionId: string, issueId: string, answer: string) =>
  answerImportIssue(root, sessionId, issueId, answer)
)
ipcMain.handle('import:landSession', async (_event, root: string, sessionId: string) =>
  landImportSession(root, sessionId)
)

ipcMain.handle('canon:discuss', async (_event, _root: string, input) => {
  const config = await loadAIProfile('background')
  const mode = input.mode === 'summarize' ? 'summarize' : 'discuss'
  const content = limitText(input.content ?? '', 12000)
  const transcript = limitText(input.transcript ?? '', mode === 'summarize' ? 24000 : 16000)
  const prompt = [
    `Mode: ${mode}`,
    `Canon title: ${input.title ?? ''}`,
    `Current status: ${input.status ?? 'draft'}`,
    `Current strength: ${input.strength ?? 'hard'}`,
    `Current source: ${input.source ?? 'user'}`,
    '',
    'Current canon body:',
    content.text,
    content.truncated ? '\n[Older canon body was omitted because it exceeded the safe request size.]' : '',
    '',
    'Discussion transcript:',
    transcript.text,
    transcript.truncated
      ? '\n[Earlier discussion was omitted. Continue from the visible recent context and the writer message.]'
      : '',
    '',
    mode === 'summarize'
      ? [
          'Please summarize the discussion into a canon entry.',
          'Return exactly this structure:',
          '## Canon',
          '<the concise content that should be saved as canon>',
          '',
          '## Metadata',
          'status: draft | confirmed | deprecated',
          'strength: hard | soft',
          'source: user | ai | imported | historical'
        ].join('\n')
      : [
          'Writer message:',
          input.message ?? '',
          '',
          'Reply as a careful canon discussion partner. Ask focused questions if the canon is still ambiguous; otherwise propose concrete rules.'
        ].join('\n')
  ].join('\n')
  return generateCanonText(prompt, config)
})

function limitText(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false }
  return { text: value.slice(value.length - maxChars), truncated: true }
}

function slugImportName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'markdown'
}

function isUnmanagedMarkdown(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  if (!relative || relative.startsWith('..')) return false
  const first = relative.split(path.sep)[0]
  const managed = new Set([
    '.quillarium',
    'canon',
    'characters',
    'timeline',
    'locations',
    'foreshadowing',
    'world',
    'references',
    'issues',
    'strategy',
    'patterns',
    'character-states',
    'resources',
    'causality',
    'outlines',
    'scenes',
    'prompts',
    'runs'
  ])
  if (managed.has(first)) return false
  return path.basename(file).toLowerCase() !== 'project.md'
}

ipcMain.handle('scene:context', async (_event, root: string, sceneId: string) =>
  assembleContext(root, sceneId)
)
ipcMain.handle('target:context', async (_event, root: string, target: { type: 'outline' | 'scene'; id: string }) => {
  const packet = await assembleContextPacket(root, target)
  return { packet, markdown: renderContextPacket(packet) }
})
ipcMain.handle('target:check', async (_event, root: string, target: { type: 'outline' | 'scene'; id: string }) => {
  const report = await checkTarget(root, target)
  return { report, markdown: formatCheckReport(report) }
})
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
ipcMain.handle('outline:generate', async (_event, root: string, outlineId: string) => {
  const scene = await ensureSceneForOutline(root, outlineId)
  const packet = await assembleContextPacket(root, { type: 'outline', id: outlineId })
  const context = renderContextPacket(packet)
  const config = await loadAIProfile('prose')
  const run = await createGenerationRun(root, scene.data.id, context, config, {
    target_type: 'outline',
    target_id: outlineId,
    source_outline: outlineId
  })
  const output = await generateIntoRun(root, run, context, config)
  return { run, output, scene }
})
ipcMain.handle('chapter:writingPlan', async (_event, root: string, chapterId: string, selectedByScene) =>
  buildChapterWritingPlan(root, chapterId, selectedByScene ?? {})
)
ipcMain.handle('finalize:reviewPlan', async (_event, root: string, input) => {
  const session = await createFinalizeReviewSession(root, input)
  const config = await loadAIProfile('check')
  if (input?.callAI === false || input?.aiResponse) return session
  const response = await generateText(
    buildFinalizeReviewPrompt(session),
    config,
    'You are Quillarium Finalize Review Agent. Return strict JSON only.'
  )
  return createFinalizeReviewSession(root, { ...input, aiResponse: response })
})
ipcMain.handle('finalize:session', async (_event, root: string, sessionId: string) =>
  loadFinalizeReviewSession(root, sessionId)
)
ipcMain.handle('finalize:confirmImpact', async (_event, root: string, sessionId: string, impactId: string, answer: string, state) =>
  confirmFinalizeImpact(root, sessionId, impactId, answer, state === 'rejected' ? 'rejected' : 'confirmed')
)
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
ipcMain.handle('git:sync', async (_event, root: string, message: string) => {
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
ipcMain.handle('git:setRemote', async (_event, root: string, url: string) => {
  const existing = await git(root, ['remote', 'get-url', 'origin']).catch(() => null)
  if (existing) await git(root, ['remote', 'set-url', 'origin', url])
  else await git(root, ['remote', 'add', 'origin', url])
  return gitStatus(root)
})
ipcMain.handle('github:createRepoForProject', async (_event, root: string) => {
  const config = await loadConfig()
  const token = config.github?.token
  const owner = config.github?.defaultOwner
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
      private: true,
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

async function ensureSceneForOutline(root: string, outlineId: string) {
  const existing = (await listDocs<SceneDoc>(root, 'scene')).find((scene) => scene.data.section === outlineId)
  if (existing) return existing
  const outline = (await listDocs<OutlineDoc>(root, 'outline')).find((doc) => doc.data.id === outlineId)
  if (!outline) throw new Error(`Outline not found: ${outlineId}`)
  const timeline =
    outline.data.related_timeline?.[0] ??
    (await listDocs<TimelineEventDoc>(root, 'timeline_event')).find(Boolean)?.data.id
  const location =
    (await listDocs<LocationDoc>(root, 'location')).find(Boolean)?.data.id ??
    (await listDocs<TimelineEventDoc>(root, 'timeline_event')).find((event) => event.data.location)?.data.location
  const pov =
    outline.data.related_characters?.[0] ??
    outline.data.povs?.[0] ??
    (await listDocs<CharacterDoc>(root, 'character')).find(Boolean)?.data.id
  if (!timeline || !location || !pov) {
    throw new Error('Cannot create a chapter scene before timeline, location, and POV character are available.')
  }
  const file = await createScene(
    root,
    `${outline.data.title} 正文`,
    {
      section: outline.data.id,
      timeline_node: timeline,
      location,
      pov,
      characters: [...new Set([pov, ...(outline.data.related_characters ?? [])])],
      target_words: Number(outline.data.target_words ?? 1000),
      chapter_hook: Boolean(outline.data.chapter_hook),
      tags: ['volume-01', `chapter-${String(outline.data.order + 1).padStart(3, '0')}`]
    },
    '## Draft\n'
  )
  const parsed = await readMarkdown<Record<string, unknown>>(file)
  return { path: file, data: parsed.data as unknown as SceneDoc, content: parsed.content }
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
