import React, { Component, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Eye,
  FileText,
  FolderOpen,
  GitBranch,
  Library,
  LayoutGrid,
  List,
  MapPin,
  MessageSquareText,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  WandSparkles
} from 'lucide-react'
import './styles.css'

type ThemeName = 'paper' | 'ink' | 'mist' | 'bamboo'
type ModuleName =
  | 'write'
  | 'canon'
  | 'world'
  | 'characters'
  | 'timeline'
  | 'foreshadowing'
  | 'issues'
  | 'references'
  | 'strategy'
  | 'patterns'
  | 'locations'
  | 'runs'
type CenterTab = 'editor' | 'outline' | 'beats'
type WorkLevel = 'book' | 'volume' | 'arc' | 'chapter'
type ViewMode = 'list' | 'tile'
type LeftMode = 'write' | 'read'
type WorkspaceMode = 'planning' | 'writing'
type WorkspacePage = 'outline' | 'volume'
type OutlineHomeSection =
  | 'volumes'
  | 'canon'
  | 'world'
  | 'characters'
  | 'timeline'
  | 'locations'
  | 'foreshadowing'
  | 'style'
  | 'patterns'
  | 'issues'
  | 'references'
type VolumeSection = OutlineHomeSection | 'arcs'
type DensityName = 'compact' | 'comfortable'
type LanguageName = 'zh' | 'en'
type AIProfileName = 'prose' | 'background' | 'check'
type AIProviderName = 'openai-compatible' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'ollama'

interface AIProfileForm {
  provider: AIProviderName
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

interface AIStatus {
  prose: boolean
  background: boolean
  check: boolean
  ready: boolean
}

interface GitHubSettings {
  token: string
  defaultOwner: string
  defaultVisibility: 'private' | 'public'
}

interface ProjectListItem {
  root: string
  title: string
  genre: string
  target_words: number
  chapter_words: number
  section_words: number
  default_theme?: ThemeName
}

interface DocEntry {
  path: string
  data: {
    id: string
    type: string
    title: string
    status: string
    tags?: string[]
    [key: string]: unknown
  }
  content: string
}

interface TargetSelection {
  type: string
  id: string
}

interface ContextPacketSummary {
  target: { type: 'outline' | 'scene'; id: string; title: string; level: string }
  canon: DocEntry[]
  strategies: DocEntry[]
  patterns: DocEntry[]
  timeline: DocEntry[]
  characters: DocEntry[]
  character_states: DocEntry[]
  locations: DocEntry[]
  world_entries: DocEntry[]
  foreshadowing: DocEntry[]
  issues: DocEntry[]
  references: DocEntry[]
  warnings: string[]
  included_ids: string[]
  excluded_ids: string[]
}

interface RunSummary {
  id: string
  scene_id: string
  status: string
  model: string
  created_at: string
}

interface WorkspaceData {
  project: ProjectListItem
  docs: DocEntry[]
  runs: RunSummary[]
}

interface GitState {
  initialized: boolean
  dirty: boolean
  branch: string | null
  remote: string | null
  summary: string
}

function App() {
  const [theme, setTheme] = useState<ThemeName>('paper')
  const [density, setDensity] = useState<DensityName>('comfortable')
  const [language, setLanguage] = useState<LanguageName>('zh')
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    prose: false,
    background: false,
    check: false,
    ready: false
  })
  const [vault, setVault] = useState<string | null>(null)
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  const refresh = async () => {
    try {
      if (!window.quillarium) {
        setError('Quillarium desktop bridge is not available. Please reload the Electron window.')
        return
      }
      const config = await window.quillarium.getConfig()
      if (config.theme) setTheme(config.theme as ThemeName)
      if (config.density) setDensity(config.density as DensityName)
      if (config.language) setLanguage(config.language as LanguageName)
      const v = await window.quillarium.getVault()
      setVault(v)
      setProjects(await window.quillarium.listProjects())
      setAiStatus(await window.quillarium.aiStatus())
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!vault || !workspaceRoot) {
    return (
      <Welcome
        vault={vault}
        projects={projects}
        theme={theme}
        density={density}
        language={language}
        aiStatus={aiStatus}
        error={error}
        onTheme={setTheme}
        onDensity={setDensity}
        onLanguage={setLanguage}
        onAIStatus={setAiStatus}
        onRefresh={refresh}
        onOpen={setWorkspaceRoot}
      />
    )
  }

  return (
    <ErrorBoundary>
      <Workspace
        root={workspaceRoot}
        theme={theme}
        density={density}
        language={language}
        aiStatus={aiStatus}
        onTheme={setTheme}
        onDensity={setDensity}
        onLanguage={setLanguage}
        onAIStatus={setAiStatus}
        onBack={() => setWorkspaceRoot(null)}
      />
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) }
  }

  render() {
    if (this.state.error) return <div className="loading error-box">{this.state.error}</div>
    return this.props.children
  }
}

function Welcome({
  vault,
  projects,
  theme,
  density,
  language,
  aiStatus,
  error,
  onTheme,
  onDensity,
  onLanguage,
  onAIStatus,
  onRefresh,
  onOpen
}: {
  vault: string | null
  projects: ProjectListItem[]
  theme: ThemeName
  density: DensityName
  language: LanguageName
  aiStatus: AIStatus
  error: string | null
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
  onLanguage: (language: LanguageName) => void
  onAIStatus: (status: AIStatus) => void
  onRefresh: () => Promise<void>
  onOpen: (root: string) => void
}) {
  const [form, setForm] = useState({
    title: '',
    genre: 'general',
    targetWords: 100000,
    chapterWords: 3200,
    sectionWords: 1000,
    defaultTheme: theme
  })

  const chooseVault = async () => {
    await window.quillarium.chooseVault()
    await onRefresh()
  }

  const migrateVault = async () => {
    await window.quillarium.migrateVault()
    await onRefresh()
  }

  const chooseProject = async () => {
    const project = await window.quillarium.chooseProject()
    if (project) onOpen(project.root)
  }

  const create = async () => {
    if (!form.title.trim()) return
    const project = await window.quillarium.createProject({ ...form, defaultTheme: theme })
    const config = await window.quillarium.getConfig()
    if (config.github?.token && window.confirm('是否为这部小说创建私有 GitHub 仓库？')) {
      await window.quillarium.githubCreateRepoForProject(project.root)
    }
    await onRefresh()
    onOpen(project.root)
  }

  return (
    <div className="welcome">
      <TopChrome
        theme={theme}
        density={density}
        language={language}
        aiStatus={aiStatus}
        onTheme={onTheme}
        onDensity={onDensity}
        onLanguage={onLanguage}
        onAIStatus={onAIStatus}
        projectName="Quillarium"
        path="羽笔馆"
      />
      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="app-logo" aria-label="Quillarium logo">
            <span className="logo-feather">✒</span>
            <span className="logo-book" />
          </div>
          <h1>Quillarium</h1>
          <p>{t(language, 'welcomeSubtitle')}</p>
          <div className="vault-card">
            <div>
              <strong>Obsidian 目录</strong>
              <code>{vault ?? '未设置'}</code>
            </div>
            <div className="vault-actions">
              <button className="secondary" onClick={chooseVault}>
                <FolderOpen size={16} /> {vault ? t(language, 'changeVault') : t(language, 'chooseVault')}
              </button>
              <button className="secondary" onClick={migrateVault} disabled={!vault}>
                <FolderOpen size={16} /> 迁移到新目录
              </button>
            </div>
          </div>
          {error && <div className="error-box">{error}</div>}
        </section>
        <section className="welcome-panel">
          <div className="panel-title">
            <BookOpen size={17} /> {t(language, 'novelProjects')}
          </div>
          <div className="project-section">
            <h3>已有小说</h3>
            {projects.length === 0 ? (
              <div className="empty">{t(language, 'noProjects')}</div>
            ) : (
              <div className="project-list">
                {projects.map((project) => (
                  <div key={project.root} className="project-row">
                    <div>
                      <strong>{project.title}</strong>
                      <small>{project.genre}</small>
                    </div>
                    <button className="secondary project-enter" onClick={() => onOpen(project.root)}>
                      进入
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="create-form">
            <h3>创建小说</h3>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t(language, 'novelTitle')}
            />
            <input
              value={form.genre}
              onChange={(e) => setForm({ ...form, genre: e.target.value })}
              placeholder="类型"
            />
            <div className="number-grid">
              <label>
                全书字数
                <input
                  type="number"
                  value={form.targetWords}
                  onChange={(e) => setForm({ ...form, targetWords: Number(e.target.value) })}
                />
              </label>
              <label>
                章字数
                <input
                  type="number"
                  value={form.chapterWords}
                  onChange={(e) => setForm({ ...form, chapterWords: Number(e.target.value) })}
                />
              </label>
              <label>
                节字数
                <input
                  type="number"
                  value={form.sectionWords}
                  onChange={(e) => setForm({ ...form, sectionWords: Number(e.target.value) })}
                />
              </label>
            </div>
            <button className="primary" onClick={create} disabled={!vault || !form.title.trim()}>
              创建小说
            </button>
            <button className="secondary" onClick={chooseProject}>
              <FolderOpen size={16} /> {t(language, 'openExistingProject')}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

function Workspace({
  root,
  theme,
  density,
  language,
  aiStatus,
  onTheme,
  onDensity,
  onLanguage,
  onAIStatus,
  onBack
}: {
  root: string
  theme: ThemeName
  density: DensityName
  language: LanguageName
  aiStatus: AIStatus
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
  onLanguage: (language: LanguageName) => void
  onAIStatus: (status: AIStatus) => void
  onBack: () => void
}) {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(null)
  const [activeModule, setActiveModule] = useState<ModuleName>('write')
  const [doc, setDoc] = useState<{ data: Record<string, unknown>; content: string; path: string } | null>(
    null
  )
  const [context, setContext] = useState('')
  const [contextPacket, setContextPacket] = useState<ContextPacketSummary | null>(null)
  const [checkReport, setCheckReport] = useState('')
  const [dirty, setDirty] = useState(false)
  const [git, setGit] = useState<GitState | null>(null)
  const [busy, setBusy] = useState(false)
  const [gitBusy, setGitBusy] = useState(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(false)
  const [middlePct, setMiddlePct] = useState(58)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('planning')
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>('outline')
  const [outlineSection, setOutlineSection] = useState<OutlineHomeSection>('volumes')
  const [volumeSection, setVolumeSection] = useState<VolumeSection>('arcs')
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null)
  const [workLevel, setWorkLevel] = useState<WorkLevel>('book')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [leftMode, setLeftMode] = useState<LeftMode>('write')
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importTitle, setImportTitle] = useState('')
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [gitMessage, setGitMessage] = useState('')

  const load = async () => {
    const loaded = await window.quillarium.loadProject(root)
    setData(loaded)
    if (loaded.project.default_theme) onTheme(loaded.project.default_theme)
    setGit(await window.quillarium.gitStatus(root))
    const scenes = loaded.docs.filter((item: DocEntry) => item.data.type === 'scene')
    const outlines = loaded.docs.filter((item: DocEntry) => item.data.type === 'outline')
    if (!selectedTarget && outlines[0]) setSelectedTarget({ type: 'outline', id: outlines[0].data.id })
    else if (!selectedTarget && scenes[0]) setSelectedTarget({ type: 'scene', id: scenes[0].data.id })
  }

  useEffect(() => {
    void load()
  }, [root])

  const selectedScene = useMemo(
    () =>
      selectedTarget?.type === 'scene'
        ? (data?.docs.find((item) => item.data.id === selectedTarget.id && item.data.type === 'scene') ??
          null)
        : null,
    [data, selectedTarget?.type, selectedTarget?.id]
  )
  const selectedOutline = useMemo(
    () =>
      selectedTarget?.type === 'outline'
        ? (data?.docs.find((item) => item.data.id === selectedTarget.id && item.data.type === 'outline') ??
          null)
        : null,
    [data, selectedTarget?.type, selectedTarget?.id]
  )
  const selectedEntry = useMemo(
    () =>
      data?.docs.find(
        (item) => item.data.id === selectedTarget?.id && item.data.type === selectedTarget?.type
      ) ?? null,
    [data, selectedTarget?.type, selectedTarget?.id]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
      if (event.key.toLowerCase() === 'g') {
        event.preventDefault()
        void generate()
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        void runCheck()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, selectedScene?.data.id, selectedOutline?.data.id])

  useEffect(() => {
    async function openTarget() {
      const selected = selectedEntry
      if (!selected || !selectedTarget) return
      const parsed = await window.quillarium.readDoc(selected.path)
      setDoc({ ...parsed, path: selected.path })
      setDirty(false)
      if (selectedTarget.type === 'outline' || selectedTarget.type === 'scene') {
        const target = selectedTarget as { type: 'outline' | 'scene'; id: string }
        const contextResult = await window.quillarium.assembleTargetContext(root, target)
        setContext(contextResult.markdown)
        setContextPacket(contextResult.packet)
        const result = await window.quillarium.checkTarget(root, target)
        setCheckReport(result.markdown)
      } else {
        setContext('')
        setContextPacket(null)
        setCheckReport('')
      }
    }
    void openTarget()
  }, [root, selectedTarget?.type, selectedTarget?.id, selectedEntry?.path])

  if (!data) return <div className="loading">加载中...</div>

  const docs = data.docs
  const volumes = docs
    .filter((item) => item.data.type === 'outline' && item.data.level === 'volume')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const activeVolume =
    volumes.find((item) => item.data.id === activeVolumeId) ??
    (selectedOutline?.data.level === 'volume'
      ? selectedOutline
      : selectedOutline
        ? findAncestor(
            docs.filter((item) => item.data.type === 'outline'),
            selectedOutline,
            'volume'
          )
        : null) ??
    volumes[0] ??
    null
  const projectPath = selectedScene
    ? buildScenePath(docs, selectedScene, language)
    : selectedOutline
      ? buildOutlinePath(docs, selectedOutline)
      : '大纲'
  const writingOutline =
    selectedOutline ??
    (selectedScene
      ? (docs.find((item) => item.data.type === 'outline' && item.data.id === selectedScene.data.section) ??
        null)
      : null)
  const visibleItems = outlineItemsForLevel(docs, workLevel, selectedOutline, selectedTarget)
  const filteredItems = filterDocs(visibleItems, search)
  const finalizedScenes = docs.filter((item) => item.data.type === 'scene' && item.data.status === 'final')

  const save = async () => {
    if (!doc) return
    await window.quillarium.saveDocBody(doc.path, doc.data, doc.content)
    setDirty(false)
    await load()
  }

  const runCheck = async () => {
    if (!selectedTarget) return
    setBusy(true)
    const result =
      selectedTarget.type === 'scene'
        ? await window.quillarium.checkSceneIntoRun(root, selectedTarget.id)
        : await window.quillarium.checkTarget(root, selectedTarget)
    setCheckReport(result.markdown)
    await load()
    setBusy(false)
  }

  const dryRun = async () => {
    if (!selectedScene) return
    setBusy(true)
    await window.quillarium.generateDryRun(root, selectedScene.data.id)
    await load()
    setBusy(false)
  }

  const generate = async () => {
    if (!selectedTarget) return
    setBusy(true)
    if (selectedTarget.type === 'outline') await window.quillarium.generateOutline(root, selectedTarget.id)
    else await window.quillarium.generate(root, selectedTarget.id)
    await load()
    setBusy(false)
  }

  const rewrite = async () => {
    await generate()
  }

  const createGitHubRepo = async () => {
    setGitBusy(true)
    setGitMessage('')
    try {
      setGit(await window.quillarium.githubCreateRepoForProject(root))
      setGitMessage('已创建私有 GitHub 仓库，并完成初次同步。')
    } catch (err) {
      setGitMessage(formatDesktopError(err))
      setGit(await window.quillarium.gitStatus(root))
    } finally {
      setGitBusy(false)
    }
  }

  const syncGitHub = async () => {
    setGitBusy(true)
    setGitMessage('')
    try {
      setGit(await window.quillarium.gitSync(root, `Update ${data.project.title}`))
      setGitMessage('GitHub 同步完成。')
    } catch (err) {
      setGitMessage(formatDesktopError(err))
      setGit(await window.quillarium.gitStatus(root))
    } finally {
      setGitBusy(false)
    }
  }

  const createDoc = async (kind: string, input: Record<string, unknown>) => {
    const created = await window.quillarium.createDoc(root, kind, input)
    await load()
    return created
  }

  const selectWorkLevel = (level: WorkLevel) => {
    setWorkLevel(level)
    setLeftMode('write')
    const next = firstSelectableForLevel(docs, level, selectedOutline)
    if (next) setSelectedTarget({ type: 'outline', id: next.data.id })
  }

  const selectWritingTarget = (target: TargetSelection) => {
    setSelectedTarget(target)
    setActiveModule('write')
    if (target.type === 'scene') {
      setWorkLevel('chapter')
      return
    }
    const targetOutline = docs.find((item) => item.data.type === 'outline' && item.data.id === target.id)
    const level = String(targetOutline?.data.level ?? '')
    if (level === 'section') setWorkLevel('chapter')
    else if (isWorkLevel(level)) setWorkLevel(level)
  }

  const createOutlineAtLevel = async (level: WorkLevel, parent?: string | null) => {
    const title = window.prompt(`新建${outlineLevelLabel(level)}名称`)
    if (!title?.trim()) return
    const siblings = docs.filter(
      (item) =>
        item.data.type === 'outline' && item.data.level === level && item.data.parent === (parent ?? null)
    )
    const created = await createDoc('outline', {
      title: title.trim(),
      level,
      parent: parent ?? null,
      order: siblings.length,
      target_words: level === 'chapter' ? data.project.chapter_words : undefined,
      content: `## ${title.trim()}\n`
    })
    const loaded = await window.quillarium.readDoc(String(created))
    setDoc({ ...loaded, path: String(created) })
    setSelectedTarget({ type: 'outline', id: String(loaded.data.id) })
    setWorkLevel(level)
  }

  const importMarkdown = async () => {
    setBusy(true)
    try {
      const result = await window.quillarium.chooseMarkdownImport(root)
      setImportMessage(formatImportResult(result))
      await load()
    } finally {
      setBusy(false)
    }
  }

  const importMarkdownFromText = async () => {
    if (!importText.trim()) return
    setBusy(true)
    try {
      const result = await window.quillarium.importMarkdownText(root, importText, importTitle)
      setImportMessage(formatImportResult(result))
      setImportText('')
      setImportTitle('')
      setImportOpen(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const syncMarkdown = async () => {
    setBusy(true)
    try {
      const result = await window.quillarium.syncMarkdownImports(root)
      setImportMessage(formatImportResult(result))
      await load()
    } finally {
      setBusy(false)
    }
  }

  const deleteSelectedDoc = async () => {
    if (!doc) return
    const ok = window.confirm(`删除「${String(doc.data.title ?? '当前文档')}」？此操作会删除 Markdown 文件。`)
    if (!ok) return
    await window.quillarium.deleteDoc(doc.path)
    setDoc(null)
    setSelectedTarget(null)
    setRightOpen(false)
    await load()
  }

  return (
    <div
      className={
        workspaceMode === 'writing'
          ? `app-shell writing-shell level-${workLevel} ${leftOpen ? '' : 'left-collapsed'}`
          : `app-shell outline-shell ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`
      }
    >
      <TopChrome
        theme={theme}
        density={density}
        language={language}
        aiStatus={aiStatus}
        onTheme={onTheme}
        onDensity={onDensity}
        onLanguage={onLanguage}
        onAIStatus={onAIStatus}
        projectName={data.project.title}
        path={projectPath}
        onBack={onBack}
        git={git}
        gitBusy={gitBusy}
        onGitCreateRemote={createGitHubRepo}
        onGitSync={syncGitHub}
        root={root}
        locationLabel={
          workspaceMode === 'writing'
            ? `${t(language, 'writing')} / ${projectPath}`
            : workspacePage === 'volume' && activeVolume
              ? `大纲 / ${activeVolume.data.title}`
              : '大纲'
        }
        workspaceMode={workspaceMode}
        onWorkspaceMode={(mode) => {
          setWorkspaceMode(mode)
          if (mode === 'writing') setActiveModule('write')
        }}
      />
      {workspaceMode === 'writing' ? (
        <>
          <div className="workspace writing-route">
            <aside className="sidebar writing-route-sidebar">
              <div className="sidebar-header">
                <span>{t(language, 'bookOutline')}</span>
                <button onClick={() => setLeftOpen(false)}>{t(language, 'collapse')}</button>
              </div>
              <StructureTree
                docs={docs}
                selectedTarget={selectedTarget}
                onSelect={selectWritingTarget}
                language={language}
              />
              <ModuleNav
                active={activeModule}
                onSelect={(module) => setActiveModule(module)}
                docs={docs}
                language={language}
              />
            </aside>
            <main className="center">
              {!leftOpen && (
                <button className="panel-toggle left" onClick={() => setLeftOpen(true)}>
                  {t(language, 'bookOutline')}
                </button>
              )}
              {activeModule === 'write' ? (
                <WritingWorkspace
                  docs={docs}
                  level={workLevel}
                  viewMode={viewMode}
                  search={search}
                  selectedOutline={writingOutline}
                  selectedScene={selectedScene}
                  selectedTarget={selectedTarget}
                  doc={doc}
                  contextPacket={contextPacket}
                  checkReport={checkReport}
                  dirty={dirty}
                  busy={busy}
                  visibleItems={filteredItems}
                  finalizedScenes={finalizedScenes}
                  leftMode={leftMode}
                  onLevel={selectWorkLevel}
                  onSearch={setSearch}
                  onViewMode={setViewMode}
                  onSelect={selectWritingTarget}
                  onCreate={createOutlineAtLevel}
                  onDocChange={(next) => {
                    setDoc(next)
                    setDirty(true)
                  }}
                  onSave={save}
                  onCheck={runCheck}
                  onGenerate={generate}
                  onDryRun={dryRun}
                  onRewrite={rewrite}
                  onImportPanel={() => setImportOpen(true)}
                  language={language}
                />
              ) : (
                <ModuleView
                  root={root}
                  module={activeModule}
                  docs={docs}
                  runs={data.runs}
                  onCreate={createDoc}
                  onReload={load}
                  language={language}
                />
              )}
            </main>
          </div>
          <WritingBottomPanel
            root={root}
            docs={docs}
            runs={data.runs}
            level={workLevel}
            sceneId={selectedScene?.data.id ?? null}
            outline={writingOutline}
            scene={selectedScene}
            context={context}
            contextPacket={contextPacket}
            checkReport={checkReport}
            busy={busy}
            onCheck={runCheck}
            onGenerate={generate}
            onAccepted={load}
            language={language}
          />
        </>
      ) : workspacePage === 'volume' && activeVolume ? (
        <VolumeHome
          docs={docs}
          doc={doc}
          selectedTarget={selectedTarget}
          volume={activeVolume}
          volumes={volumes}
          activeSection={volumeSection}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          middlePct={middlePct}
          viewMode={viewMode}
          search={search}
          dirty={dirty}
          busy={busy}
          project={data.project}
          onBackOutline={() => {
            setWorkspacePage('outline')
            setOutlineSection('volumes')
            setSelectedTarget({ type: 'outline', id: activeVolume.data.id })
          }}
          onVolume={(volume) => {
            setActiveVolumeId(volume.data.id)
            setVolumeSection('arcs')
            setSelectedTarget({ type: 'outline', id: volume.data.id })
            setRightOpen(true)
          }}
          onSection={(section) => {
            setVolumeSection(section)
            setSelectedTarget(section === 'arcs' ? { type: 'outline', id: activeVolume.data.id } : null)
            setDoc(null)
            setRightOpen(section === 'arcs')
          }}
          onToggleLeft={() => setLeftOpen((value) => !value)}
          onToggleRight={() => setRightOpen((value) => !value)}
          onMiddlePct={setMiddlePct}
          onSearch={setSearch}
          onViewMode={setViewMode}
          onSelect={(target) => {
            setSelectedTarget(target)
            setRightOpen(true)
          }}
          onCreate={async (kind, input) => {
            const created = await createDoc(kind, input)
            const loaded = await window.quillarium.readDoc(String(created))
            setDoc({ ...loaded, path: String(created) })
            setSelectedTarget({ type: String(loaded.data.type), id: String(loaded.data.id) })
            setRightOpen(true)
          }}
          onDelete={deleteSelectedDoc}
          onOpenExternal={async () => {
            if (!doc) return
            await window.quillarium.openDocExternal(doc.path)
          }}
          onReloadDoc={async () => {
            if (!doc) return
            if (dirty && !window.confirm('当前有未保存修改。同步外部文件会覆盖右栏内容，继续吗？')) return
            const parsed = await window.quillarium.readDoc(doc.path)
            setDoc({ ...parsed, path: doc.path })
            setDirty(false)
          }}
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onSave={save}
          onImport={() => setImportOpen(true)}
          language={language}
        />
      ) : (
        <OutlineHome
          docs={docs}
          doc={doc}
          selectedTarget={selectedTarget}
          activeSection={outlineSection}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          middlePct={middlePct}
          viewMode={viewMode}
          search={search}
          dirty={dirty}
          busy={busy}
          project={data.project}
          onSection={(section) => {
            setOutlineSection(section)
            setSelectedTarget(null)
            setDoc(null)
            setRightOpen(false)
          }}
          onToggleLeft={() => setLeftOpen((value) => !value)}
          onToggleRight={() => setRightOpen((value) => !value)}
          onMiddlePct={setMiddlePct}
          onSearch={setSearch}
          onViewMode={setViewMode}
          onSelect={(target) => {
            setSelectedTarget(target)
            setRightOpen(true)
          }}
          onOpenVolume={(volume) => {
            setActiveVolumeId(volume.data.id)
            setWorkspacePage('volume')
            setVolumeSection('arcs')
            setSelectedTarget({ type: 'outline', id: volume.data.id })
            setRightOpen(true)
          }}
          onCreate={async (kind, input) => {
            const created = await createDoc(kind, input)
            const loaded = await window.quillarium.readDoc(String(created))
            setDoc({ ...loaded, path: String(created) })
            setSelectedTarget({ type: String(loaded.data.type), id: String(loaded.data.id) })
            setRightOpen(true)
          }}
          onDelete={deleteSelectedDoc}
          onOpenExternal={async () => {
            if (!doc) return
            await window.quillarium.openDocExternal(doc.path)
          }}
          onReloadDoc={async () => {
            if (!doc) return
            if (dirty && !window.confirm('当前有未保存修改。同步外部文件会覆盖右栏内容，继续吗？')) return
            const parsed = await window.quillarium.readDoc(doc.path)
            setDoc({ ...parsed, path: doc.path })
            setDirty(false)
          }}
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onSave={save}
          onImport={() => setImportOpen(true)}
          language={language}
        />
      )}
      {importOpen && (
        <div className="modal-backdrop">
          <section className="modal import-modal">
            <h2>粘贴 Markdown 导入</h2>
            <p>
              后台会先走现有 Markdown 结构判断；接入背景 AI 后会在这里完成分类、pattern 标注和低置信 issue。
            </p>
            <label>
              标题
              <input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} />
            </label>
            <label>
              Markdown
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button
                className="primary"
                onClick={importMarkdownFromText}
                disabled={busy || !importText.trim()}
              >
                导入
              </button>
            </div>
          </section>
        </div>
      )}
      {(importMessage || gitMessage) && <div className="toast">{gitMessage || importMessage}</div>}
    </div>
  )
}

function OutlineHome({
  docs,
  doc,
  selectedTarget,
  activeSection,
  leftOpen,
  rightOpen,
  middlePct,
  viewMode,
  search,
  dirty,
  busy,
  project,
  onSection,
  onToggleLeft,
  onToggleRight,
  onMiddlePct,
  onSearch,
  onViewMode,
  onSelect,
  onOpenVolume,
  onCreate,
  onDelete,
  onOpenExternal,
  onReloadDoc,
  onDocChange,
  onSave,
  onImport,
  language
}: {
  docs: DocEntry[]
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  selectedTarget: TargetSelection | null
  activeSection: OutlineHomeSection
  leftOpen: boolean
  rightOpen: boolean
  middlePct: number
  viewMode: ViewMode
  search: string
  dirty: boolean
  busy: boolean
  project: ProjectListItem
  onSection: (section: OutlineHomeSection) => void
  onToggleLeft: () => void
  onToggleRight: () => void
  onMiddlePct: (pct: number) => void
  onSearch: (value: string) => void
  onViewMode: (mode: ViewMode) => void
  onSelect: (target: TargetSelection) => void
  onOpenVolume: (volume: DocEntry) => void
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
  onOpenExternal: () => Promise<void>
  onReloadDoc: () => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onImport: () => void
  language: LanguageName
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const section = OUTLINE_HOME_SECTIONS.find((item) => item.id === activeSection) ?? OUTLINE_HOME_SECTIONS[0]
  const items = filterDocs(outlineSectionDocs(docs, activeSection), search)
  const selected = selectedTarget
    ? docs.find((item) => item.data.id === selectedTarget.id && item.data.type === selectedTarget.type)
    : null
  const volumes = docs
    .filter((item) => item.data.type === 'outline' && item.data.level === 'volume')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = shellRef.current?.getBoundingClientRect()
    if (!box) return
    const move = (moveEvent: PointerEvent) => {
      const next = ((moveEvent.clientX - box.left) / box.width) * 100
      onMiddlePct(Math.min(72, Math.max(36, Math.round(next))))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    event.preventDefault()
  }

  const createCurrent = async () => {
    const title = window.prompt(`新建${section.title}`)
    if (!title?.trim()) return
    const input = createInputForOutlineSection(activeSection, title.trim(), docs, project)
    await onCreate(input.kind, input.data)
  }

  return (
    <main className={`outline-home ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`}>
      <aside className="outline-nav">
        <div className="outline-nav-head">
          <button className="icon-button" onClick={onToggleLeft} title={leftOpen ? '收窄左栏' : '展开左栏'}>
            <ChevronDown size={16} />
          </button>
          {leftOpen && <strong>大纲</strong>}
        </div>
        <div className="outline-nav-list">
          {OUTLINE_HOME_SECTIONS.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? 'active' : ''}
              onClick={() => onSection(item.id)}
              title={item.title}
            >
              <item.icon size={17} />
              {leftOpen ? (
                <>
                  <span>{item.title}</span>
                  <small>{countSection(docs, item.id)}</small>
                </>
              ) : (
                <span className="one-char">{item.short}</span>
              )}
            </button>
          ))}
        </div>
        {activeSection === 'volumes' && leftOpen && (
          <div className="volume-quick-list">
            {volumes.map((volume) => (
              <button
                key={volume.data.id}
                className={selectedTarget?.id === volume.data.id ? 'active' : ''}
                onClick={() => onOpenVolume(volume)}
              >
                {volume.data.title}
              </button>
            ))}
          </div>
        )}
        <button className="outline-import" onClick={onImport} title="导入新的设定">
          <Upload size={17} />
          {leftOpen ? <span>导入新的设定</span> : <span className="one-char">导</span>}
        </button>
      </aside>
      <section
        ref={shellRef}
        className="outline-main"
        style={{ gridTemplateColumns: rightOpen ? `${middlePct}% 8px 1fr` : '1fr 8px 44px' }}
      >
        <div className="outline-collection">
          <div className="outline-collection-head">
            <div>
              <span className="badge ok">{section.title}</span>
              <h2>{section.heading}</h2>
            </div>
            <div className="outline-actions">
              <button onClick={createCurrent} disabled={busy}>
                <Plus size={15} /> 新增
              </button>
              <button onClick={onDelete} disabled={!doc || busy}>
                <Trash2 size={15} /> 删除
              </button>
            </div>
          </div>
          <div className="overview-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="搜索标题、字段或正文"
              />
            </label>
            <div className="icon-segment">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onViewMode('list')}
                title="列表"
              >
                <List size={16} />
              </button>
              <button
                className={viewMode === 'tile' ? 'active' : ''}
                onClick={() => onViewMode('tile')}
                title="平铺"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          <div className={viewMode === 'tile' ? 'outline-tile-grid' : 'outline-list'}>
            {items.map((item) => (
              <button
                key={item.data.id}
                className={`outline-item ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                onClick={() => onSelect({ type: item.data.type, id: item.data.id })}
              >
                <span>
                  <b>{item.data.title}</b>
                  <small>
                    {docTypeLabel(item)} · {String(item.data.status ?? 'draft')}
                  </small>
                </span>
                {viewMode === 'list' && <em>{structuredLineForSection(item)}</em>}
                {viewMode === 'tile' && <StructuredTile doc={item} />}
              </button>
            ))}
            {!items.length && <p className="empty-row">当前栏目还没有内容。</p>}
          </div>
        </div>
        <div className="resize-handle" onPointerDown={startDrag} />
        <aside className="outline-detail">
          {rightOpen ? (
            doc ? (
              <>
                <div className="detail-head">
                  <div>
                    <span className="badge ok">{selected ? docTypeLabel(selected) : '文档'}</span>
                    <h2>{String(doc.data.title ?? '未命名')}</h2>
                  </div>
                  <button className="icon-button" onClick={onToggleRight} title="收窄右栏">
                    <ChevronDown size={16} />
                  </button>
                </div>
                <MetadataEditor data={doc.data} onChange={(data) => onDocChange({ ...doc, data })} />
                <label className="detail-editor">
                  正文
                  <textarea
                    value={doc.content}
                    onChange={(event) => onDocChange({ ...doc, content: event.target.value })}
                  />
                </label>
                <div className="detail-actions">
                  <button onClick={onOpenExternal}>
                    <FileText size={15} /> 编辑
                  </button>
                  <button onClick={onReloadDoc}>
                    <RefreshCw size={15} /> 同步
                  </button>
                  <button onClick={onSave} disabled={!dirty}>
                    <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-editor">
                <h2>请选择内容</h2>
                <p>从中栏选择条目后，右侧会展开编辑。</p>
              </div>
            )
          ) : (
            <button className="detail-rail" onClick={onToggleRight} title="展开详情">
              详
            </button>
          )}
        </aside>
      </section>
    </main>
  )
}

function VolumeHome({
  docs,
  doc,
  selectedTarget,
  volume,
  volumes,
  activeSection,
  leftOpen,
  rightOpen,
  middlePct,
  viewMode,
  search,
  dirty,
  busy,
  project,
  onBackOutline,
  onVolume,
  onSection,
  onToggleLeft,
  onToggleRight,
  onMiddlePct,
  onSearch,
  onViewMode,
  onSelect,
  onCreate,
  onDelete,
  onOpenExternal,
  onReloadDoc,
  onDocChange,
  onSave,
  onImport,
  language
}: {
  docs: DocEntry[]
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  selectedTarget: TargetSelection | null
  volume: DocEntry
  volumes: DocEntry[]
  activeSection: VolumeSection
  leftOpen: boolean
  rightOpen: boolean
  middlePct: number
  viewMode: ViewMode
  search: string
  dirty: boolean
  busy: boolean
  project: ProjectListItem
  onBackOutline: () => void
  onVolume: (volume: DocEntry) => void
  onSection: (section: VolumeSection) => void
  onToggleLeft: () => void
  onToggleRight: () => void
  onMiddlePct: (pct: number) => void
  onSearch: (value: string) => void
  onViewMode: (mode: ViewMode) => void
  onSelect: (target: TargetSelection) => void
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
  onOpenExternal: () => Promise<void>
  onReloadDoc: () => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onImport: () => void
  language: LanguageName
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const section = VOLUME_SECTIONS.find((item) => item.id === activeSection) ?? VOLUME_SECTIONS[0]
  const arcs = docs
    .filter(
      (item) =>
        item.data.type === 'outline' && item.data.level === 'arc' && item.data.parent === volume.data.id
    )
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const items = filterDocs(volumeSectionDocs(docs, volume, activeSection), search)
  const selected = selectedTarget
    ? docs.find((item) => item.data.id === selectedTarget.id && item.data.type === selectedTarget.type)
    : null

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = shellRef.current?.getBoundingClientRect()
    if (!box) return
    const move = (moveEvent: PointerEvent) => {
      const next = ((moveEvent.clientX - box.left) / box.width) * 100
      onMiddlePct(Math.min(72, Math.max(36, Math.round(next))))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    event.preventDefault()
  }

  const createCurrent = async () => {
    const title = window.prompt(`新建${section.title}`)
    if (!title?.trim()) return
    if (activeSection === 'arcs') {
      await onCreate('outline', {
        title: title.trim(),
        level: 'arc',
        parent: volume.data.id,
        order: arcs.length,
        target_words: Math.max(project.chapter_words * 10, 1),
        content: `## ${title.trim()}\n`
      })
      return
    }
    const input = createInputForOutlineSection(activeSection, title.trim(), docs, project)
    await onCreate(input.kind, applyVolumeScope(input.data, volume))
  }

  return (
    <main
      className={`outline-home volume-home ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`}
    >
      <aside className="outline-nav">
        <div className="outline-nav-head">
          <button className="icon-button" onClick={onToggleLeft} title={leftOpen ? '收窄左栏' : '展开左栏'}>
            <ChevronDown size={16} />
          </button>
          {leftOpen && <strong>卷纲</strong>}
        </div>
        {leftOpen && (
          <div className="volume-switcher">
            <button onClick={onBackOutline}>返回大纲</button>
            <select
              value={volume.data.id}
              onChange={(event) => {
                const next = volumes.find((item) => item.data.id === event.target.value)
                if (next) onVolume(next)
              }}
            >
              {volumes.map((item, index) => (
                <option key={item.data.id} value={item.data.id}>
                  {index + 1}. {item.data.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="outline-nav-list">
          {VOLUME_SECTIONS.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? 'active' : ''}
              onClick={() => onSection(item.id)}
              title={item.title}
            >
              <item.icon size={17} />
              {leftOpen ? (
                <>
                  <span>{item.title}</span>
                  <small>{countVolumeSection(docs, volume, item.id)}</small>
                </>
              ) : (
                <span className="one-char">{item.short}</span>
              )}
            </button>
          ))}
        </div>
        {leftOpen && (
          <div className="volume-quick-list">
            <strong>段纲</strong>
            {arcs.map((arc) => (
              <button
                key={arc.data.id}
                className={selectedTarget?.id === arc.data.id ? 'active' : ''}
                onClick={() => onSelect({ type: 'outline', id: arc.data.id })}
              >
                {arc.data.title}
              </button>
            ))}
            <button className="sidebar-create" onClick={() => void createCurrent()}>
              <Plus size={14} /> 新增段纲
            </button>
          </div>
        )}
        <button className="outline-import" onClick={onImport} title="导入新的设定">
          <Upload size={17} />
          {leftOpen ? <span>导入新的设定</span> : <span className="one-char">导</span>}
        </button>
      </aside>
      <section
        ref={shellRef}
        className="outline-main"
        style={{ gridTemplateColumns: rightOpen ? `${middlePct}% 8px 1fr` : '1fr 8px 44px' }}
      >
        <div className="outline-collection">
          <div className="outline-collection-head">
            <div>
              <span className="badge ok">{volume.data.title}</span>
              <h2>{section.heading}</h2>
            </div>
            <div className="outline-actions">
              <button onClick={createCurrent} disabled={busy}>
                <Plus size={15} /> 新增
              </button>
              <button onClick={onDelete} disabled={!doc || busy}>
                <Trash2 size={15} /> 删除
              </button>
            </div>
          </div>
          <div className="overview-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="搜索本卷标题、字段或正文"
              />
            </label>
            <div className="icon-segment">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onViewMode('list')}
                title="列表"
              >
                <List size={16} />
              </button>
              <button
                className={viewMode === 'tile' ? 'active' : ''}
                onClick={() => onViewMode('tile')}
                title="平铺"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          {activeSection === 'timeline' ? (
            <VolumeTimeline
              docs={docs}
              volume={volume}
              arcs={arcs}
              items={items}
              onSelect={onSelect}
              selectedTarget={selectedTarget}
            />
          ) : (
            <div className={viewMode === 'tile' ? 'outline-tile-grid' : 'outline-list'}>
              {items.map((item) => (
                <button
                  key={item.data.id}
                  className={`outline-item ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                  onClick={() => onSelect({ type: item.data.type, id: item.data.id })}
                >
                  <span>
                    <b>{item.data.title}</b>
                    <small>
                      {docTypeLabel(item)} · {String(item.data.status ?? 'draft')}
                    </small>
                  </span>
                  {viewMode === 'list' && <em>{structuredLineForSection(item)}</em>}
                  {viewMode === 'tile' && <StructuredTile doc={item} />}
                </button>
              ))}
              {!items.length && <p className="empty-row">当前卷还没有匹配内容。</p>}
            </div>
          )}
        </div>
        <div className="resize-handle" onPointerDown={startDrag} />
        <aside className="outline-detail">
          {rightOpen ? (
            doc ? (
              <>
                <div className="detail-head">
                  <div>
                    <span className="badge ok">{selected ? docTypeLabel(selected) : '文档'}</span>
                    <h2>{String(doc.data.title ?? '未命名')}</h2>
                  </div>
                  <button className="icon-button" onClick={onToggleRight} title="收窄右栏">
                    <ChevronDown size={16} />
                  </button>
                </div>
                <MetadataEditor data={doc.data} onChange={(data) => onDocChange({ ...doc, data })} />
                <label className="detail-editor">
                  正文
                  <textarea
                    value={doc.content}
                    onChange={(event) => onDocChange({ ...doc, content: event.target.value })}
                  />
                </label>
                <div className="detail-actions">
                  <button onClick={onOpenExternal}>
                    <FileText size={15} /> 编辑
                  </button>
                  <button onClick={onReloadDoc}>
                    <RefreshCw size={15} /> 同步
                  </button>
                  <button onClick={onSave} disabled={!dirty}>
                    <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-editor">
                <h2>请选择内容</h2>
                <p>从中栏选择条目后，右侧会展开编辑。</p>
              </div>
            )
          ) : (
            <button className="detail-rail" onClick={onToggleRight} title="展开详情">
              详
            </button>
          )}
        </aside>
      </section>
    </main>
  )
}

function TopChrome({
  theme,
  density,
  language,
  aiStatus,
  onTheme,
  onDensity,
  onLanguage,
  onAIStatus,
  projectName,
  path,
  onBack,
  git,
  gitBusy,
  onGitCreateRemote,
  onGitSync,
  root,
  locationLabel,
  workspaceMode,
  onWorkspaceMode
}: {
  theme: ThemeName
  density: DensityName
  language: LanguageName
  aiStatus: AIStatus
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
  onLanguage: (language: LanguageName) => void
  onAIStatus: (status: AIStatus) => void
  projectName: string
  path: string
  onBack?: () => void
  git?: GitState | null
  gitBusy?: boolean
  onGitCreateRemote?: () => void
  onGitSync?: () => void
  root?: string
  locationLabel?: string
  workspaceMode?: WorkspaceMode
  onWorkspaceMode?: (mode: WorkspaceMode) => void
}) {
  const themes: ThemeName[] = ['paper', 'ink', 'mist', 'bamboo']
  const [showSettings, setShowSettings] = useState(false)
  const gitAction = gitActionFor(git)
  return (
    <header className="top-chrome">
      <button className="brand" onClick={onBack}>
        <span className="brand-feather">⌁</span> Quillarium
      </button>
      <div className="project-label">
        《{projectName}》{locationLabel ? ` / ${locationLabel}` : path ? ` / ${path}` : ''}
      </div>
      {workspaceMode && onWorkspaceMode && (
        <nav className="workspace-mode-nav" aria-label={language === 'zh' ? '工作区模式' : 'Workspace mode'}>
          <button
            className={workspaceMode === 'planning' ? 'active' : ''}
            onClick={() => onWorkspaceMode('planning')}
          >
            <BookOpen size={15} /> {language === 'zh' ? '规划' : 'Plan'}
          </button>
          <button
            className={workspaceMode === 'writing' ? 'active' : ''}
            onClick={() => onWorkspaceMode('writing')}
          >
            <PenLine size={15} /> {t(language, 'writing')}
          </button>
        </nav>
      )}
      <div className="top-spacer" />
      <button className="status-pill" onClick={() => setShowSettings(true)} title="配置 AI 服务">
        <Circle size={10} className={aiStatus.ready ? 'green' : 'amber'} />{' '}
        {aiStatus.ready ? t(language, 'aiReady') : t(language, 'aiNotConfigured')}
      </button>
      {git ? (
        <button
          className="status-pill"
          onClick={git.remote ? onGitSync : onGitCreateRemote}
          title={gitAction.title}
          disabled={gitBusy}
        >
          <GitBranch size={14} /> {gitBusy ? gitBusyLabel(git) : gitAction.label}
        </button>
      ) : (
        <button className="status-pill" onClick={() => setShowSettings(true)} title="配置 GitHub">
          <GitBranch size={14} /> {t(language, 'githubCredentials')}
        </button>
      )}
      <select
        className="theme-select"
        value={theme}
        onChange={async (e) => {
          const next = e.target.value as ThemeName
          onTheme(next)
          await window.quillarium.setTheme(next)
        }}
      >
        {themes.map((item) => (
          <option key={item} value={item}>
            {t(language, item)}
          </option>
        ))}
      </select>
      <select
        className="theme-select"
        value={density}
        onChange={async (e) => {
          const next = e.target.value as DensityName
          onDensity(next)
          await window.quillarium.setDensity(next)
        }}
      >
        <option value="comfortable">{t(language, 'comfortable')}</option>
        <option value="compact">{t(language, 'compact')}</option>
      </select>
      <select
        className="theme-select language-select"
        value={language}
        onChange={async (e) => {
          const next = e.target.value as LanguageName
          onLanguage(next)
          await window.quillarium.setLanguage(next)
        }}
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
      <button className="status-pill" onClick={() => setShowSettings(true)}>
        {t(language, 'settings')}
      </button>
      {showSettings && (
        <SettingsModal
          root={root}
          git={git ?? null}
          language={language}
          onAIStatus={onAIStatus}
          onClose={() => setShowSettings(false)}
        />
      )}
    </header>
  )
}

function gitActionFor(git?: GitState | null): { label: string; title: string } {
  if (!git) return { label: 'GitHub 凭证', title: '配置 GitHub 登录凭证' }
  if (!git.initialized)
    return { label: '创建 GitHub 仓库', title: '为当前小说创建私有 GitHub 仓库并初始化本地 Git' }
  if (!git.remote) return { label: '未绑定 GitHub', title: '为当前小说创建私有 GitHub 仓库' }
  if (git.dirty) return { label: '有修改，点击同步', title: '提交并推送当前小说修改' }
  return { label: 'GitHub 已同步', title: '无本地修改；点击可再次推送检查' }
}

function gitBusyLabel(git?: GitState | null): string {
  return git?.remote ? '同步中...' : '创建 GitHub 中...'
}

function WritingSidebar({
  docs,
  level,
  mode,
  selectedTarget,
  hierarchy,
  finalizedScenes,
  onMode,
  onSelect,
  onCreate,
  onImport,
  onUpdate,
  busy
}: {
  docs: DocEntry[]
  level: WorkLevel
  mode: LeftMode
  selectedTarget: TargetSelection | null
  hierarchy: OutlineHierarchy
  finalizedScenes: DocEntry[]
  onMode: (mode: LeftMode) => void
  onSelect: (target: TargetSelection) => void
  onCreate: (level: WorkLevel, parent?: string | null) => Promise<void>
  onImport: () => Promise<void>
  onUpdate: () => Promise<void>
  busy: boolean
}) {
  const childLevel = nextWorkLevel(level)
  const parent =
    selectedTarget?.type === 'outline'
      ? docs.find((item) => item.data.id === selectedTarget.id && item.data.type === 'outline')
      : null
  const childItems = childLevel
    ? (hierarchy.children.get(parent?.data.id ?? null)?.filter((item) => item.data.level === childLevel) ??
      [])
    : []
  const levelItems = outlineItemsForLevel(docs, level, parent ?? null, selectedTarget)
  return (
    <div className="writing-sidebar">
      <div className="segmented">
        <button className={mode === 'write' ? 'active' : ''} onClick={() => onMode('write')}>
          <PenLine size={15} /> 写作
        </button>
        <button className={mode === 'read' ? 'active' : ''} onClick={() => onMode('read')}>
          <Eye size={15} /> 阅读
        </button>
      </div>
      {mode === 'write' ? (
        <>
          <section className="sidebar-section">
            <strong>{childLevel ? `下一级：${outlineLevelLabel(childLevel)}` : '章节正文'}</strong>
            {childLevel ? (
              <>
                {childItems.map((item) => (
                  <button
                    key={item.data.id}
                    className={`tree-node ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                    onClick={() => onSelect({ type: 'outline', id: item.data.id })}
                  >
                    <FileText size={14} /> {item.data.title}
                  </button>
                ))}
                <button
                  className="sidebar-create"
                  onClick={() => onCreate(childLevel, parent?.data.id ?? null)}
                >
                  <Plus size={14} /> 新增{outlineLevelLabel(childLevel)}
                </button>
              </>
            ) : (
              <p className="muted">选择章纲后，在底部写作流程生成和定稿正文。</p>
            )}
          </section>
          <section className="sidebar-section">
            <strong>当前层级</strong>
            {levelItems.map((item) => (
              <button
                key={item.data.id}
                className={`tree-node ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                onClick={() => onSelect({ type: 'outline', id: item.data.id })}
              >
                <FileText size={14} /> {item.data.title}
              </button>
            ))}
            {level !== 'book' && (
              <button
                className="sidebar-create"
                onClick={() => onCreate(level, parentForNewLevel(docs, level, parent ?? null))}
              >
                <Plus size={14} /> 新增{outlineLevelLabel(level)}
              </button>
            )}
          </section>
        </>
      ) : (
        <section className="sidebar-section">
          <strong>已定稿章节</strong>
          {finalizedScenes.length ? (
            finalizedScenes.map((scene) => (
              <button
                key={scene.data.id}
                className={`tree-node scene ${selectedTarget?.id === scene.data.id ? 'active' : ''}`}
                onClick={() => onSelect({ type: 'scene', id: scene.data.id })}
              >
                <FileText size={14} /> {scene.data.title}
              </button>
            ))
          ) : (
            <p className="muted">还没有定稿章节。</p>
          )}
        </section>
      )}
      <div className="sidebar-bottom-actions">
        <button onClick={onImport} disabled={busy}>
          <Upload size={14} /> 导入
        </button>
        <button onClick={onUpdate} disabled={busy}>
          <RefreshCw size={14} /> 更新
        </button>
      </div>
    </div>
  )
}

function WritingWorkspace({
  docs,
  level,
  viewMode,
  search,
  selectedOutline,
  selectedScene,
  selectedTarget,
  doc,
  contextPacket,
  checkReport,
  dirty,
  busy,
  visibleItems,
  finalizedScenes,
  leftMode,
  onLevel,
  onSearch,
  onViewMode,
  onSelect,
  onCreate,
  onDocChange,
  onSave,
  onCheck,
  onGenerate,
  onDryRun,
  onRewrite,
  onImportPanel,
  language
}: {
  docs: DocEntry[]
  level: WorkLevel
  viewMode: ViewMode
  search: string
  selectedOutline: DocEntry | null
  selectedScene: DocEntry | null
  selectedTarget: TargetSelection | null
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  contextPacket: ContextPacketSummary | null
  checkReport: string
  dirty: boolean
  busy: boolean
  visibleItems: DocEntry[]
  finalizedScenes: DocEntry[]
  leftMode: LeftMode
  onLevel: (level: WorkLevel) => void
  onSearch: (value: string) => void
  onViewMode: (mode: ViewMode) => void
  onSelect: (target: TargetSelection) => void
  onCreate: (level: WorkLevel, parent?: string | null) => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onCheck: () => Promise<void>
  onGenerate: () => Promise<void>
  onDryRun: () => Promise<void>
  onRewrite: () => Promise<void>
  onImportPanel: () => void
  language: LanguageName
}) {
  const selected = selectedScene ?? selectedOutline
  const items = leftMode === 'read' ? finalizedScenes : visibleItems
  return (
    <section className="writing-workspace">
      <div className="level-tabs">
        {(['book', 'volume', 'arc', 'chapter'] as WorkLevel[]).map((item) => (
          <button key={item} className={level === item ? 'active' : ''} onClick={() => onLevel(item)}>
            {outlineLevelLabel(item)}
          </button>
        ))}
      </div>
      <div className="writing-grid">
        <div className="overview-pane">
          <div className="overview-head">
            <div>
              <span className="badge ok">{leftMode === 'read' ? '阅读' : outlineLevelLabel(level)}</span>
              <h2>{leftMode === 'read' ? '已定稿内容' : levelOverviewTitle(level, selectedOutline)}</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => onCreate(level, selectedOutline?.data.parent as string | null | undefined)}
              disabled={level === 'book'}
              title={`新增${outlineLevelLabel(level)}`}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="overview-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="在本部分检索"
              />
            </label>
            <div className="icon-segment">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onViewMode('list')}
                title="列表"
              >
                <List size={16} />
              </button>
              <button
                className={viewMode === 'tile' ? 'active' : ''}
                onClick={() => onViewMode('tile')}
                title="平铺"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          <OutlineSummary
            docs={docs}
            level={level}
            selected={selectedOutline}
            contextPacket={contextPacket}
          />
          <div className={viewMode === 'tile' ? 'outline-tile-grid' : 'outline-list'}>
            {items.map((item) => (
              <button
                key={item.data.id}
                className={`outline-item ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                onClick={() =>
                  onSelect({ type: item.data.type === 'scene' ? 'scene' : 'outline', id: item.data.id })
                }
              >
                <span>
                  <b>{item.data.title}</b>
                  <small>
                    {item.data.type === 'scene' ? '正文' : outlineLevelLabel(String(item.data.level))} ·{' '}
                    {String(item.data.status ?? 'draft')}
                  </small>
                </span>
                {viewMode === 'list' && <em>{structuredLine(item)}</em>}
                {viewMode === 'tile' && <p>{item.content.slice(0, 180) || '暂无正文'}</p>}
              </button>
            ))}
          </div>
        </div>
        <div className="detail-pane">
          {selected ? (
            <>
              <div className="detail-head">
                <div>
                  <span className="badge ok">
                    {selected.data.type === 'scene' ? '正文' : outlineLevelLabel(String(selected.data.level))}
                  </span>
                  <h2>{selected.data.title}</h2>
                </div>
                <button onClick={onSave} disabled={!dirty}>
                  <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                </button>
              </div>
              <MarkdownPreview content={doc?.content ?? selected.content} />
              <label className="detail-editor">
                Markdown
                <textarea
                  value={doc?.content ?? ''}
                  onChange={(event) => {
                    if (!doc) return
                    onDocChange({ ...doc, content: event.target.value })
                  }}
                  readOnly={leftMode === 'read'}
                />
              </label>
              <div className="detail-actions">
                <button onClick={onCheck} disabled={busy || !selectedTarget}>
                  <CheckCircle2 size={15} /> 检查
                </button>
                {level === 'chapter' && (
                  <>
                    <button onClick={onDryRun} disabled={busy || !selectedScene}>
                      <Sparkles size={15} /> 草稿记录
                    </button>
                    <button onClick={onGenerate} disabled={busy || !selectedTarget}>
                      <WandSparkles size={15} /> 章节撰写
                    </button>
                    <button onClick={onRewrite} disabled={busy || !selectedScene}>
                      <PenLine size={15} /> 改写
                    </button>
                  </>
                )}
                <button onClick={onImportPanel}>
                  <Upload size={15} /> 粘贴导入
                </button>
              </div>
            </>
          ) : (
            <div className="empty-editor">
              <h2>请选择内容</h2>
              <p>从左栏或中栏选择一个纲要后开始编辑。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function OutlineSummary({
  docs,
  level,
  selected,
  contextPacket
}: {
  docs: DocEntry[]
  level: WorkLevel
  selected: DocEntry | null
  contextPacket: ContextPacketSummary | null
}) {
  const tasks = levelTasks(level)
  const child = nextWorkLevel(level)
  const childCount = child
    ? docs.filter(
        (item) =>
          item.data.type === 'outline' && item.data.level === child && item.data.parent === selected?.data.id
      ).length
    : docs.filter((item) => item.data.type === 'scene' && item.data.section === selected?.data.id).length
  return (
    <article className="overview-summary">
      <p>{tasks.summary}</p>
      <div className="summary-metrics">
        <span>
          下级
          <b>{childCount}</b>
        </span>
        <span>
          Canon
          <b>{contextPacket?.canon.length ?? 0}</b>
        </span>
        <span>
          人物
          <b>{contextPacket?.characters.length ?? 0}</b>
        </span>
        <span>
          伏笔
          <b>{contextPacket?.foreshadowing.length ?? 0}</b>
        </span>
      </div>
    </article>
  )
}

function MarkdownPreview({ content }: { content: string }) {
  const html = renderMiniMarkdown(content)
  return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />
}

function WritingBottomPanel({
  root,
  docs,
  runs,
  level,
  sceneId,
  outline,
  scene,
  context,
  contextPacket,
  checkReport,
  busy,
  onCheck,
  onGenerate,
  onAccepted,
  language
}: {
  root: string
  docs: DocEntry[]
  runs: RunSummary[]
  level: WorkLevel
  sceneId: string | null
  outline: DocEntry | null
  scene: DocEntry | null
  context: string
  contextPacket: ContextPacketSummary | null
  checkReport: string
  busy: boolean
  onCheck: () => Promise<void>
  onGenerate: () => Promise<void>
  onAccepted: () => Promise<void>
  language: LanguageName
}) {
  const [chapterPanel, setChapterPanel] = useState<'context' | 'runs'>('context')

  if (level === 'chapter') {
    return (
      <footer className="writing-bottom chapter-flow">
        <div className="chapter-flow-steps">
          <article>
            <strong>要素</strong>
            <p>地点：{docTitle(docs, scene?.data.location) || '未绑定'}</p>
            <p>
              人物：
              {[scene?.data.pov, ...asStringList(scene?.data.characters)]
                .map((id) => docTitle(docs, id))
                .filter(Boolean)
                .join(' / ') || '未绑定'}
            </p>
            <p>
              时间：{docTitle(docs, scene?.data.timeline_node) || String(scene?.data.world_time ?? '未绑定')}
            </p>
          </article>
          <article>
            <strong>章纲</strong>
            <p>{outline?.content.slice(0, 180) || '先在右栏手写章纲。'}</p>
          </article>
          <article>
            <strong>伏笔</strong>
            <p>
              {[
                ...asStringList(outline?.data.foreshadowing_planted),
                ...asStringList(outline?.data.foreshadowing_resolved)
              ]
                .map((id) => docTitle(docs, id) || id)
                .join(' / ') || '未选择'}
            </p>
          </article>
          <article>
            <strong>动作</strong>
            <div className="flow-actions">
              <button
                onClick={async () => {
                  await onCheck()
                  setChapterPanel('context')
                }}
                disabled={busy}
              >
                <CheckCircle2 size={15} /> 检查
              </button>
              <button
                onClick={async () => {
                  await onGenerate()
                  setChapterPanel('runs')
                }}
                disabled={busy || !outline}
              >
                <WandSparkles size={15} /> 组合提示词并撰写
              </button>
            </div>
          </article>
        </div>
        <div className="chapter-flow-runs">
          <div className="chapter-panel-tabs">
            <button
              className={chapterPanel === 'context' ? 'active' : ''}
              onClick={() => setChapterPanel('context')}
            >
              {t(language, 'contextAndChecks')}
            </button>
            <button
              className={chapterPanel === 'runs' ? 'active' : ''}
              onClick={() => setChapterPanel('runs')}
            >
              {t(language, 'runs')}
            </button>
          </div>
          {chapterPanel === 'context' ? (
            <Inspector
              docs={docs}
              scene={scene}
              outline={outline}
              context={context}
              contextPacket={contextPacket}
              checkReport={checkReport}
              language={language}
            />
          ) : (
            <RunPanel root={root} runs={runs} sceneId={sceneId} onAccepted={onAccepted} language={language} />
          )}
        </div>
      </footer>
    )
  }
  return (
    <footer className="writing-bottom checks-bottom">
      <Inspector
        docs={docs}
        scene={scene}
        outline={outline}
        context={context}
        contextPacket={contextPacket}
        checkReport={checkReport}
        language={language}
      />
    </footer>
  )
}

function SettingsModal({
  root,
  git,
  language,
  onAIStatus,
  onClose
}: {
  root?: string
  git: GitState | null
  language: LanguageName
  onAIStatus: (status: AIStatus) => void
  onClose: () => void
}) {
  const [github, setGithub] = useState<GitHubSettings>({
    token: '',
    defaultOwner: '',
    defaultVisibility: 'private'
  })
  const [profiles, setProfiles] = useState<Record<AIProfileName, AIProfileForm>>({
    prose: defaultAIProfile('openai-compatible'),
    background: defaultAIProfile('openai-compatible'),
    check: defaultAIProfile('openai-compatible')
  })

  useEffect(() => {
    async function loadProfiles() {
      const config = await window.quillarium.getConfig()
      setGithub({
        token: config.github?.token ?? '',
        defaultOwner: config.github?.defaultOwner ?? '',
        defaultVisibility: config.github?.defaultVisibility ?? 'private'
      })
      setProfiles({
        prose: { ...defaultAIProfile('openai-compatible'), ...(config.aiProfiles?.prose ?? {}) },
        background: { ...defaultAIProfile('openai-compatible'), ...(config.aiProfiles?.background ?? {}) },
        check: { ...defaultAIProfile('openai-compatible'), ...(config.aiProfiles?.check ?? {}) }
      })
    }
    void loadProfiles()
  }, [])

  const saveAI = async () => {
    for (const profile of Object.keys(profiles) as AIProfileName[]) {
      await window.quillarium.saveAIProfile(profile, profiles[profile])
    }
    onAIStatus(await window.quillarium.aiStatus())
  }
  const saveGithub = async () => {
    await window.quillarium.saveGithub(github)
  }
  const updateProfile = (profile: AIProfileName, patch: Partial<AIProfileForm>) => {
    setProfiles((current) => {
      const next = { ...current[profile], ...patch }
      if (patch.provider) {
        next.baseUrl = defaultBaseUrl(patch.provider)
        next.model = defaultModel(patch.provider)
      }
      return { ...current, [profile]: next }
    })
  }
  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal">
        <h2>{t(language, 'settings')}</h2>
        <p>{t(language, 'privacyHint')}</p>
        <div className="settings-group">
          <h3>全局 GitHub 配置</h3>
          <div className="settings-grid two">
            <label>
              GitHub Token
              <input
                type="password"
                value={github.token}
                onChange={(e) => setGithub({ ...github, token: e.target.value })}
                placeholder="ghp_..."
              />
            </label>
            <label>
              默认 Owner
              <input
                value={github.defaultOwner}
                onChange={(e) => setGithub({ ...github, defaultOwner: e.target.value })}
                placeholder="user-or-org"
              />
            </label>
            <label>
              默认可见性
              <select
                value={github.defaultVisibility}
                onChange={(e) =>
                  setGithub({
                    ...github,
                    defaultVisibility: e.target.value as GitHubSettings['defaultVisibility']
                  })
                }
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>
        </div>
        {root && (
          <div className="settings-group">
            <h3>当前小说 Git 配置</h3>
            <p className="muted">这里显示的是当前小说项目的 remote；每部小说建议单独一个 Git 仓库。</p>
            <div className="settings-grid two">
              <label>
                当前小说 remote
                <input value={git?.remote ?? '未绑定'} readOnly />
              </label>
              <label>
                当前分支
                <input value={git?.branch ?? '未初始化'} readOnly />
              </label>
            </div>
          </div>
        )}
        <h3>{t(language, 'aiSettings')}</h3>
        <div className="ai-profile-grid">
          {(['prose', 'background', 'check'] as AIProfileName[]).map((profile) => (
            <article key={profile} className="ai-profile-card">
              <strong>{t(language, profile)}</strong>
              <label>
                {t(language, 'provider')}
                <select
                  value={profiles[profile].provider}
                  onChange={(e) => updateProfile(profile, { provider: e.target.value as AIProviderName })}
                >
                  <option value="openai-compatible">OpenAI Compatible</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="ollama">Ollama</option>
                </select>
              </label>
              <label>
                {t(language, 'baseUrl')}
                <input
                  value={profiles[profile].baseUrl}
                  onChange={(e) => updateProfile(profile, { baseUrl: e.target.value })}
                />
              </label>
              <label>
                {t(language, 'apiKey')}
                <input
                  type="password"
                  value={profiles[profile].apiKey}
                  onChange={(e) => updateProfile(profile, { apiKey: e.target.value })}
                />
              </label>
              <label>
                {t(language, 'model')}
                <input
                  value={profiles[profile].model}
                  onChange={(e) => updateProfile(profile, { model: e.target.value })}
                />
              </label>
            </article>
          ))}
        </div>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            {t(language, 'close')}
          </button>
          <button className="primary" onClick={saveGithub}>
            保存 GitHub
          </button>
          <button className="primary" onClick={saveAI}>
            {t(language, 'saveAI')}
          </button>
        </div>
      </section>
    </div>
  )
}

function defaultAIProfile(provider: AIProviderName): AIProfileForm {
  return {
    provider,
    baseUrl: defaultBaseUrl(provider),
    apiKey: '',
    model: defaultModel(provider),
    temperature: 0.7,
    maxTokens: 2000
  }
}

function defaultBaseUrl(provider: AIProviderName): string {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return 'https://api.openai.com/v1'
    case 'claude':
      return 'https://api.anthropic.com/v1'
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta'
    case 'deepseek':
      return 'https://api.deepseek.com/v1'
    case 'ollama':
      return 'http://localhost:11434/v1'
  }
}

function defaultModel(provider: AIProviderName): string {
  switch (provider) {
    case 'openai':
    case 'openai-compatible':
      return 'gpt-4o-mini'
    case 'claude':
      return 'claude-3-5-sonnet-latest'
    case 'gemini':
      return 'gemini-1.5-pro'
    case 'deepseek':
      return 'deepseek-chat'
    case 'ollama':
      return 'llama3.1'
  }
}

function StructureTree({
  docs,
  selectedTarget,
  onSelect,
  language
}: {
  docs: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  language: LanguageName
}) {
  const outlines = docs
    .filter((item) => item.data.type === 'outline')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const scenes = docs.filter((item) => item.data.type === 'scene')
  const children = new Map<string | null, DocEntry[]>()
  for (const outline of outlines) {
    const parent = (outline.data.parent as string | null | undefined) ?? null
    children.set(parent, [...(children.get(parent) ?? []), outline])
  }
  const renderOutline = (outline: DocEntry, depth: number): React.ReactNode => {
    const nestedOutlines = children.get(outline.data.id) ?? []
    const nestedScenes = scenes.filter((scene) => scene.data.section === outline.data.id)
    return (
      <React.Fragment key={outline.data.id}>
        <button
          className={`tree-node level-${String(outline.data.level ?? 'section')} ${
            selectedTarget?.type === 'outline' && selectedTarget.id === outline.data.id ? 'active' : ''
          }`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          onClick={() => onSelect({ type: 'outline', id: outline.data.id })}
        >
          <FileText size={14} /> {outlineLevelLabel(String(outline.data.level))} · {outline.data.title}
        </button>
        {nestedOutlines.map((child) => renderOutline(child, depth + 1))}
        {nestedScenes.map((scene) => (
          <button
            key={scene.data.id}
            className={`tree-node scene ${
              selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id ? 'active' : ''
            }`}
            style={{ paddingLeft: `${24 + depth * 14}px` }}
            onClick={() => onSelect({ type: 'scene', id: scene.data.id })}
          >
            <FileText size={14} /> {scene.data.title}
          </button>
        ))}
      </React.Fragment>
    )
  }
  const attachedSceneIds = new Set(scenes.filter((scene) => scene.data.section).map((scene) => scene.data.id))
  const rootOutlines = children.get(null) ?? []
  const looseScenes = scenes.filter((scene) => !attachedSceneIds.has(scene.data.id))
  return (
    <div className="tree">
      <div className="tree-node open">
        <BookOpen size={15} /> {t(language, 'book')}
      </div>
      {rootOutlines.map((outline) => renderOutline(outline, 0))}
      {looseScenes.map((scene) => (
        <button
          key={scene.data.id}
          className={`tree-node scene ${
            selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id ? 'active' : ''
          }`}
          onClick={() => onSelect({ type: 'scene', id: scene.data.id })}
        >
          <FileText size={14} /> {scene.data.title}
        </button>
      ))}
    </div>
  )
}

function ModuleNav({
  active,
  onSelect,
  docs,
  language
}: {
  active: ModuleName
  onSelect: (module: ModuleName) => void
  docs: DocEntry[]
  language: LanguageName
}) {
  const counts: Partial<Record<ModuleName, number>> = {
    canon: docs.filter((doc) => doc.data.type === 'canon').length,
    world: docs.filter((doc) => doc.data.type === 'world_entry').length,
    foreshadowing: docs.filter((doc) => doc.data.type === 'foreshadowing').length,
    issues: docs.filter((doc) => doc.data.type === 'issue').length,
    references: docs.filter((doc) => doc.data.type === 'reference').length,
    strategy: docs.filter((doc) => doc.data.type === 'strategy').length,
    patterns: docs.filter((doc) => doc.data.type === 'pattern').length
  }
  const items = [
    ['write', PenLine, t(language, 'writing')],
    ['canon', Library, 'Canon'],
    ['world', BookOpen, '世界书'],
    ['characters', UserRound, t(language, 'characters')],
    ['timeline', Clock3, t(language, 'timeline')],
    ['foreshadowing', GitBranch, '伏笔'],
    ['issues', CheckCircle2, '问题'],
    ['references', FileText, '参考'],
    ['strategy', Sparkles, '策略'],
    ['patterns', Circle, '模式'],
    ['locations', MapPin, t(language, 'locations')],
    ['runs', Sparkles, t(language, 'runs')]
  ] as const
  return (
    <div className="module-nav">
      {items.map(([id, Icon, label]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
          <Icon size={18} /> <span>{label}</span>
          {counts[id] !== undefined && <span className="nav-count">{counts[id]}</span>}
        </button>
      ))}
    </div>
  )
}

function ModuleView({
  root,
  module,
  docs,
  runs,
  onCreate,
  onReload,
  language
}: {
  root: string
  module: ModuleName
  docs: DocEntry[]
  runs: RunSummary[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  onReload: () => Promise<void>
  language: LanguageName
}) {
  const map: Record<string, string> = {
    canon: 'canon',
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    foreshadowing: 'foreshadowing',
    issues: 'issue',
    references: 'reference',
    strategy: 'strategy',
    patterns: 'pattern',
    locations: 'location',
    runs: 'scene',
    write: 'scene'
  }
  const filtered = docs.filter((doc) => doc.data.type === map[module])
  if (module === 'runs') {
    return (
      <section className="module-view">
        <h2>{t(language, 'runs')}</h2>
        <div className="cards-grid">
          {runs.map((run) => (
            <article key={run.id} className="info-card">
              <strong>{run.id}</strong>
              <small>{run.scene_id}</small>
              <p>
                {run.status} · {run.model} · {run.created_at}
              </p>
            </article>
          ))}
        </div>
      </section>
    )
  }
  if (module === 'canon') {
    return (
      <CanonWorkspace
        root={root}
        docs={docs.filter((doc) => doc.data.type === 'canon')}
        onCreate={onCreate}
        onReload={onReload}
        language={language}
      />
    )
  }
  return (
    <section className="module-view module-view-full">
      <ModuleCreateForm module={module} docs={docs} onCreate={onCreate} language={language} />
      <ModuleFilters module={module} docs={docs} language={language} />
      <div className="cards-grid">
        {filtered.map((doc) => (
          <article key={doc.data.id} className="info-card">
            <strong>{doc.data.title}</strong>
            <small>
              {doc.data.status} · {doc.data.id}
            </small>
            {doc.data.type === 'canon' && (
              <small>
                {String(doc.data.strength ?? '')} · {String(doc.data.source ?? '')}
              </small>
            )}
            {doc.data.type === 'timeline_event' && (
              <small>
                previous: {String(doc.data.previous ?? 'none')} · next: {String(doc.data.next ?? 'none')}
              </small>
            )}
            {doc.data.type === 'location' && <RouteTable docs={docs} locationId={doc.data.id} />}
            {doc.data.type === 'character' && (
              <small>
                {String(doc.data.speech_style ?? 'no speech style')} ·{' '}
                {String(doc.data.desire ?? 'no desire')}
              </small>
            )}
            {doc.data.type === 'pattern' && (
              <small>
                {String(doc.data.kind ?? 'story')} · {String(doc.data.scope ?? 'project')} ·{' '}
                {String(doc.data.source ?? 'user')}
              </small>
            )}
            <p>{doc.content.slice(0, 180) || t(language, 'emptyBody')}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function CanonWorkspace({
  root,
  docs,
  onCreate,
  onReload,
  language
}: {
  root: string
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  onReload: () => Promise<void>
  language: LanguageName
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.data.id ?? null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('draft')
  const [strength, setStrength] = useState('hard')
  const [source, setSource] = useState('user')
  const [message, setMessage] = useState('')
  const [transcript, setTranscript] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return docs
    return docs.filter((doc) =>
      [doc.data.title, doc.content, doc.data.status, doc.data.strength, doc.data.source]
        .map((part) => String(part ?? '').toLowerCase())
        .join('\n')
        .includes(needle)
    )
  }, [docs, query])

  const selected = docs.find((doc) => doc.data.id === selectedId) ?? docs[0] ?? null

  useEffect(() => {
    if (!selected) {
      setSelectedId(null)
      setTitle('')
      setContent('')
      setStatus('draft')
      setStrength('hard')
      setSource('user')
      return
    }
    setSelectedId(selected.data.id)
    setTitle(selected.data.title)
    setContent(selected.content)
    setStatus(String(selected.data.status ?? 'draft'))
    setStrength(String(selected.data.strength ?? 'hard'))
    setSource(String(selected.data.source ?? 'user'))
    setMessage('')
    setTranscript('')
    setError(null)
  }, [selected?.path])

  const createCanon = async () => {
    const count = docs.length + 1
    await onCreate('canon', {
      title: `${t(language, 'newCanon')} ${count}`,
      content: '',
      status: 'draft',
      strength: 'hard',
      source: 'user'
    })
  }

  const saveCanon = async () => {
    if (!selected || !title.trim()) return
    setSaving(true)
    try {
      await window.quillarium.saveDocBody(
        selected.path,
        {
          ...selected.data,
          title: title.trim(),
          status,
          strength,
          source
        },
        content
      )
      await onReload()
    } finally {
      setSaving(false)
    }
  }

  const discuss = async () => {
    if (!selected || !message.trim()) return
    setAiBusy(true)
    setError(null)
    try {
      const nextTranscript = [transcript, `\n\n### ${t(language, 'writer')}\n${message.trim()}`].join('')
      const reply = await window.quillarium.discussCanon(root, {
        mode: 'discuss',
        title,
        content,
        status,
        strength,
        source,
        transcript: nextTranscript,
        message
      })
      setTranscript(`${nextTranscript}\n\n### ${t(language, 'canonCurator')}\n${reply}`)
      setMessage('')
    } catch (err) {
      setError(formatCanonAIError(err, language))
    } finally {
      setAiBusy(false)
    }
  }

  const summarize = async () => {
    if (!selected) return
    setAiBusy(true)
    setError(null)
    try {
      const reply = await window.quillarium.discussCanon(root, {
        mode: 'summarize',
        title,
        content,
        status,
        strength,
        source,
        transcript
      })
      const parsed = parseCanonSummary(reply)
      setContent(parsed.content || reply)
      if (parsed.status) setStatus(parsed.status)
      if (parsed.strength) setStrength(parsed.strength)
      if (parsed.source) setSource(parsed.source)
      setTranscript(`${transcript}\n\n### ${t(language, 'canonCurator')}\n${reply}`)
    } catch (err) {
      setError(formatCanonAIError(err, language))
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <section className="module-view module-view-full canon-workspace">
      <div className="module-head">
        <div>
          <h2>Canon</h2>
          <small>{t(language, 'canonWorkspaceHint')}</small>
        </div>
        <div className="inline-create">
          <button onClick={createCanon}>{t(language, 'createCanonCard')}</button>
        </div>
      </div>
      <div className="canon-layout">
        <div className="canon-card-pane">
          <label className="search-box">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(language, 'searchCanon')}
            />
          </label>
          <div className="canon-card-list">
            {filtered.map((doc) => (
              <button
                key={doc.data.id}
                className={`canon-card ${selected?.data.id === doc.data.id ? 'active' : ''}`}
                onClick={() => setSelectedId(doc.data.id)}
              >
                <div className="canon-card-title">
                  <strong>{doc.data.title}</strong>
                  <span className={`badge ${doc.data.status === 'confirmed' ? 'ok' : 'warn'}`}>
                    {doc.data.status}
                  </span>
                </div>
                <small>
                  {String(doc.data.strength ?? 'hard')} · {String(doc.data.source ?? 'user')}
                </small>
                <p>{doc.content.slice(0, 140) || t(language, 'emptyBody')}</p>
              </button>
            ))}
            {filtered.length === 0 && <div className="empty-row">{t(language, 'noCanonFound')}</div>}
          </div>
        </div>
        <div className="canon-detail">
          {selected ? (
            <>
              <div className="canon-form-grid">
                <label>
                  {t(language, 'title')}
                  <input value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  {t(language, 'status')}
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="draft">draft</option>
                    <option value="confirmed">confirmed</option>
                    <option value="deprecated">deprecated</option>
                  </select>
                </label>
                <label>
                  {t(language, 'strength')}
                  <select value={strength} onChange={(e) => setStrength(e.target.value)}>
                    <option value="hard">hard</option>
                    <option value="soft">soft</option>
                  </select>
                </label>
                <label>
                  {t(language, 'source')}
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="user">user</option>
                    <option value="ai">ai</option>
                    <option value="imported">imported</option>
                    <option value="historical">historical</option>
                  </select>
                </label>
              </div>
              <label className="canon-body">
                {t(language, 'canonContent')}
                <textarea value={content} onChange={(e) => setContent(e.target.value)} />
              </label>
              <div className="canon-actions">
                <button onClick={saveCanon} disabled={saving || !title.trim()}>
                  {saving ? t(language, 'saving') : t(language, 'saveCanon')}
                </button>
              </div>
              <div className="discussion-panel">
                <div className="discussion-head">
                  <span>
                    <MessageSquareText size={16} /> {t(language, 'canonDiscussion')}
                  </span>
                  <small>{t(language, 'usesBackgroundAI')}</small>
                </div>
                <textarea
                  className="discussion-transcript"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={t(language, 'discussionPlaceholder')}
                />
                <div className="discussion-input">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t(language, 'canonMessagePlaceholder')}
                  />
                  <div className="canon-actions">
                    <button onClick={discuss} disabled={aiBusy || !message.trim()}>
                      {t(language, 'discussWithAI')}
                    </button>
                    <button onClick={summarize} disabled={aiBusy || (!transcript.trim() && !content.trim())}>
                      {t(language, 'summarizeToCanon')}
                    </button>
                  </div>
                </div>
                {error && <div className="error-box">{error}</div>}
              </div>
            </>
          ) : (
            <div className="empty-row">{t(language, 'noCanonCards')}</div>
          )}
        </div>
      </div>
    </section>
  )
}

function parseCanonSummary(text: string): {
  content: string
  status?: string
  strength?: string
  source?: string
} {
  const canonMatch = text.match(/##\s*Canon\s*\n([\s\S]*?)(?=\n##\s*Metadata|\s*$)/i)
  const content = canonMatch?.[1]?.trim() ?? ''
  const status = text.match(/status:\s*(draft|confirmed|deprecated)/i)?.[1]
  const strength = text.match(/strength:\s*(hard|soft)/i)?.[1]
  const source = text.match(/source:\s*(user|ai|imported|historical)/i)?.[1]
  return { content, status, strength, source }
}

function formatCanonAIError(err: unknown, language: LanguageName): string {
  const raw = err instanceof Error ? err.message : String(err)
  const message = raw.replace(/^Error invoking remote method 'canon:discuss':\s*/i, '')
  if (/fetch failed|AI connection failed/i.test(message)) {
    return language === 'zh'
      ? [
          'AI 连接失败：请检查背景 AI 的接口地址、API 密钥和网络/代理。',
          '如果上一轮输出很长，系统已在本次请求中自动裁剪旧讨论；仍失败时可以先点“归纳为 Canon”或手动删掉部分讨论记录后继续。'
        ].join('')
      : [
          'AI connection failed. Check the background AI endpoint, API key, and network/proxy.',
          'If the previous response was long, old discussion is now trimmed automatically; if it still fails, summarize to Canon or remove part of the transcript before continuing.'
        ].join(' ')
  }
  if (/context|maximum|too large|413|400/i.test(message)) {
    return language === 'zh'
      ? 'AI 请求过大：请先点“归纳为 Canon”，或删掉部分讨论记录后继续。'
      : 'AI request is too large. Summarize to Canon or remove part of the transcript before continuing.'
  }
  return message
}

function formatDesktopError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+':\s*/i, '').trim()
}

function ModuleFilters({
  module,
  docs,
  language
}: {
  module: ModuleName
  docs: DocEntry[]
  language: LanguageName
}) {
  if (module !== 'canon') return null
  const statuses = [...new Set(docs.filter((doc) => doc.data.type === 'canon').map((doc) => doc.data.status))]
  return (
    <div className="filter-row">
      <span>
        {t(language, 'status')}: {statuses.join(' / ') || t(language, 'none')}
      </span>
      <span>{t(language, 'strength')}: hard / soft</span>
      <span>{t(language, 'searchHint')}</span>
    </div>
  )
}

function RouteTable({ docs, locationId }: { docs: DocEntry[]; locationId: string }) {
  const routes = docs.filter(
    (doc) => doc.data.type === 'route' && (doc.data.from === locationId || doc.data.to === locationId)
  )
  if (!routes.length) return <small>routes: none</small>
  return (
    <small>
      routes: {routes.map((route) => `${String(route.data.from)} -> ${String(route.data.to)}`).join('; ')}
    </small>
  )
}

function ModuleCreateForm({
  module,
  docs,
  onCreate,
  language
}: {
  module: ModuleName
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  language: LanguageName
}) {
  const [title, setTitle] = useState('')
  const first = (type: string) => docs.find((doc) => doc.data.type === type)?.data.id ?? ''
  const kindMap: Partial<Record<ModuleName, string>> = {
    canon: 'canon',
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    foreshadowing: 'foreshadowing',
    issues: 'issue',
    references: 'reference',
    strategy: 'strategy',
    patterns: 'pattern',
    locations: 'location'
  }
  const submit = async () => {
    if (!title.trim()) return
    const kind = kindMap[module]
    if (!kind) return
    const base: Record<string, unknown> = { title, content: '' }
    if (kind === 'character') {
      base.role = 'supporting'
    }
    if (kind === 'timeline_event') {
      base.location = first('location') || null
      base.characters = first('character') ? [first('character')] : []
    }
    if (kind === 'world_entry') {
      base.role = 'both'
      base.entry_status = 'candidate'
    }
    if (kind === 'foreshadowing') {
      base.level = 'L4'
      base.state = 'planned'
    }
    if (kind === 'issue') {
      base.priority = 'medium'
      base.state = 'open'
    }
    if (kind === 'strategy') {
      base.category = 'narrative'
      base.scope = 'project'
    }
    if (kind === 'pattern') {
      base.kind = 'story'
      base.scope = 'project'
      base.source = 'user'
    }
    if (kind === 'outline') {
      base.level = 'section'
    }
    await onCreate(kind, base)
    setTitle('')
  }
  return (
    <div className="module-head">
      <h2>{moduleTitle(module, language)}</h2>
      {kindMap[module] && (
        <div className="inline-create">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(language, 'newTitle')}
          />
          <button onClick={submit}>{t(language, 'create')}</button>
        </div>
      )}
    </div>
  )
}

function moduleTitle(module: ModuleName, language: LanguageName): string {
  const map: Record<ModuleName, keyof typeof I18N.zh> = {
    write: 'writing',
    canon: 'canon',
    world: 'worldBook',
    characters: 'characters',
    timeline: 'timeline',
    foreshadowing: 'foreshadowing',
    issues: 'issues',
    references: 'references',
    strategy: 'strategy',
    patterns: 'patterns',
    locations: 'locations',
    runs: 'runs'
  }
  return t(language, map[module])
}

function OutlineWorkbench({
  docs,
  outline,
  doc,
  contextPacket,
  busy,
  dirty,
  onDocChange,
  onSave,
  onGenerate,
  onCheck,
  language
}: {
  docs: DocEntry[]
  outline: DocEntry
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  contextPacket: ContextPacketSummary | null
  busy: boolean
  dirty: boolean
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onGenerate: () => Promise<void>
  onCheck: () => Promise<void>
  language: LanguageName
}) {
  const level = String(outline.data.level ?? 'book')
  const tasks = levelTasks(level)
  const relatedTimeline = relatedDocs(docs, outline.data.related_timeline)
  const relatedCharacters = relatedDocs(docs, outline.data.related_characters)
  const relatedForeshadowing = relatedDocs(docs, [
    ...asStringList(outline.data.related_foreshadowing),
    ...asStringList(outline.data.foreshadowing_planted),
    ...asStringList(outline.data.foreshadowing_resolved)
  ])
  const relatedWorld = relatedDocs(docs, outline.data.world_entries_used)
  const relatedPatterns = relatedDocs(docs, outline.data.related_patterns)
  const packetCounts = [
    ['Canon', contextPacket?.canon.length ?? 0],
    ['策略', contextPacket?.strategies.length ?? 0],
    ['模式', contextPacket?.patterns.length ?? 0],
    ['时间线', contextPacket?.timeline.length ?? 0],
    ['人物', contextPacket?.characters.length ?? 0],
    ['人物状态', contextPacket?.character_states.length ?? 0],
    ['世界书', contextPacket?.world_entries.length ?? 0],
    ['伏笔', contextPacket?.foreshadowing.length ?? 0],
    ['问题', contextPacket?.issues.length ?? 0]
  ]
  return (
    <section className="editor-page outline-workbench">
      <div className="workbench-head">
        <div>
          <span className="badge ok">{outlineLevelLabel(level)}</span>
          <h2>{outline.data.title}</h2>
          <p>{tasks.summary}</p>
        </div>
        <div className="editor-actions">
          <button onClick={onSave} disabled={!dirty}>
            {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
          </button>
          <button onClick={onCheck} disabled={busy}>
            <CheckCircle2 size={16} /> {t(language, 'checkAction')}
          </button>
          <button onClick={onGenerate} disabled={busy || level !== 'chapter'}>
            <WandSparkles size={16} /> {level === 'chapter' ? '按章纲生成' : '章纲阶段生成'}
          </button>
        </div>
      </div>
      <div className="workbench-grid">
        <article className="info-card focus-card">
          <strong>本级核心工作</strong>
          {tasks.items.map((item) => (
            <p key={item}>• {item}</p>
          ))}
        </article>
        <article className="info-card">
          <strong>上下文包</strong>
          <div className="metric-grid">
            {packetCounts.map(([label, count]) => (
              <span key={label}>
                {label}
                <b>{count}</b>
              </span>
            ))}
          </div>
        </article>
        <article className="info-card">
          <strong>当前绑定</strong>
          <small>时间线：{relatedTimeline.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>人物：{relatedCharacters.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>伏笔：{relatedForeshadowing.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>世界书：{relatedWorld.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
          <small>模式：{relatedPatterns.map((item) => item.data.title).join(' / ') || '未绑定'}</small>
        </article>
        <article className="info-card">
          <strong>{tasks.fieldTitle}</strong>
          {tasks.fields.map(([label, value]) => (
            <small key={label}>
              {label}：{formatFieldValue(outline.data[value]) || '未填写'}
            </small>
          ))}
        </article>
        <article className="info-card">
          <strong>缺项提示</strong>
          {(contextPacket?.warnings ?? []).slice(0, 8).map((warning) => (
            <p key={warning}>• {warning}</p>
          ))}
          {!(contextPacket?.warnings ?? []).length && <p>当前层级没有确定性缺项。</p>}
        </article>
      </div>
      <label className="outline-editor">
        {level === 'chapter' ? '手写章纲' : `${outlineLevelLabel(level)}正文/说明`}
        <textarea
          value={doc?.content ?? ''}
          onChange={(event) => {
            if (!doc) return
            onDocChange({ ...doc, content: event.target.value })
          }}
          placeholder={
            level === 'chapter'
              ? '在这里写章纲：本章目标、开场、冲突、转折、结尾钩子、事实约束...'
              : '记录本层级目标、约束、事件安排和待讨论问题...'
          }
        />
      </label>
    </section>
  )
}

function levelTasks(level: string): {
  summary: string
  items: string[]
  fieldTitle: string
  fields: Array<[string, string]>
} {
  if (level === 'book') {
    return {
      summary: '总纲阶段处理全书约束和素材入口。',
      items: ['检查 Canon 硬约束', '导入和整理世界书', '检查时间线主链', '梳理伏笔台账', '拆出叙事策略'],
      fieldTitle: '总纲字段',
      fields: [
        ['读者承诺', 'reader_promise'],
        ['核心爽点', 'core_appeal'],
        ['核心悬念', 'core_suspense'],
        ['类型边界', 'genre_boundary']
      ]
    }
  }
  if (level === 'volume') {
    return {
      summary: '卷纲阶段聚焦本卷内容、人物阶段和事件边界。',
      items: ['明确本卷目标和卷末状态', '筛选本卷时间线', '聚焦本卷人物', '细化关键事件', '检查本卷伏笔'],
      fieldTitle: '卷纲字段',
      fields: [
        ['本卷目标', 'volume_goal'],
        ['读者收益', 'reader_payoff'],
        ['事件链', 'event_chain'],
        ['人物成长', 'character_growth'],
        ['五循环', 'writer_cycles']
      ]
    }
  }
  if (level === 'arc') {
    return {
      summary: '段纲阶段围绕 20-30 章事件链做谋篇布局。',
      items: ['编排事件顺序', '锁定出场人物', '安排冲突推进', '标记伏笔埋设/揭示/回收', '检查是否服务卷纲'],
      fieldTitle: '段纲字段',
      fields: [
        ['冲突递进', 'conflict_ladder'],
        ['固定出场', 'cast_lock'],
        ['固定揭示', 'fixed_reveals'],
        ['埋设伏笔', 'foreshadowing_planted'],
        ['回收伏笔', 'foreshadowing_resolved']
      ]
    }
  }
  if (level === 'chapter') {
    return {
      summary: '章纲阶段由作者手写章纲，再组装约束生成草稿。',
      items: ['手写章纲', '检查最小充分上下文', '生成正文草稿', '作者修改正文', '事实核查直到定稿'],
      fieldTitle: '章纲字段',
      fields: [
        ['本章目标', 'chapter_goal'],
        ['本章冲突', 'chapter_conflict'],
        ['本章变化', 'chapter_change'],
        ['读者收益', 'reader_benefit'],
        ['章末钩子', 'ending_hook']
      ]
    }
  }
  return {
    summary: '场景阶段处理具体正文段落。',
    items: ['明确 POV', '绑定时间地点', '检查人物状态', '写作或改写正文'],
    fieldTitle: '节纲字段',
    fields: [
      ['叙事功能', 'narrative_function'],
      ['读者收益', 'reader_benefit'],
      ['章末钩子', 'ending_hook']
    ]
  }
}

function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(' / ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function relatedDocs(docs: DocEntry[], ids: unknown): DocEntry[] {
  const set = new Set(asStringList(ids))
  return docs.filter((doc) => set.has(doc.data.id))
}

const OUTLINE_HOME_SECTIONS: Array<{
  id: OutlineHomeSection
  title: string
  short: string
  heading: string
  icon: typeof BookOpen
}> = [
  { id: 'volumes', title: '卷纲', short: '卷', heading: '全书卷纲', icon: BookOpen },
  { id: 'canon', title: '正设', short: '正', heading: 'Canon 正设', icon: CheckCircle2 },
  { id: 'world', title: '世界书', short: '世', heading: '世界书', icon: Library },
  { id: 'characters', title: '人物', short: '人', heading: '人物档案', icon: UserRound },
  { id: 'timeline', title: '时间线', short: '时', heading: '时间线', icon: Clock3 },
  { id: 'locations', title: '地点', short: '地', heading: '地点与空间', icon: MapPin },
  { id: 'foreshadowing', title: '伏笔', short: '伏', heading: '伏笔台账', icon: Sparkles },
  { id: 'style', title: '文风', short: '文', heading: '文笔与文风', icon: PenLine },
  { id: 'patterns', title: '模式', short: '模', heading: '故事与提示词模式', icon: WandSparkles },
  { id: 'issues', title: '问题', short: '问', heading: '待确认问题', icon: Circle },
  { id: 'references', title: '参考', short: '参', heading: '参考资料', icon: FileText }
]

const VOLUME_SECTIONS: Array<{
  id: VolumeSection
  title: string
  short: string
  heading: string
  icon: typeof BookOpen
}> = [
  { id: 'arcs', title: '段纲', short: '段', heading: '本卷段纲', icon: BookOpen },
  { id: 'canon', title: '正设', short: '正', heading: '本卷正设', icon: CheckCircle2 },
  { id: 'world', title: '世界书', short: '世', heading: '本卷世界书', icon: Library },
  { id: 'characters', title: '人物', short: '人', heading: '本卷人物', icon: UserRound },
  { id: 'timeline', title: '时间线', short: '时', heading: '本卷时间线', icon: Clock3 },
  { id: 'locations', title: '地点', short: '地', heading: '本卷地点', icon: MapPin },
  { id: 'foreshadowing', title: '伏笔', short: '伏', heading: '本卷伏笔', icon: Sparkles },
  { id: 'style', title: '文风', short: '文', heading: '本卷文笔与文风', icon: PenLine },
  { id: 'patterns', title: '模式', short: '模', heading: '本卷故事与提示词模式', icon: WandSparkles },
  { id: 'issues', title: '问题', short: '问', heading: '本卷待确认问题', icon: Circle },
  { id: 'references', title: '参考', short: '参', heading: '本卷参考资料', icon: FileText }
]

function outlineSectionDocs(docs: DocEntry[], section: OutlineHomeSection): DocEntry[] {
  const typeMap: Partial<Record<OutlineHomeSection, string>> = {
    canon: 'canon',
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    locations: 'location',
    foreshadowing: 'foreshadowing',
    patterns: 'pattern',
    issues: 'issue',
    references: 'reference'
  }
  if (section === 'volumes') {
    return docs
      .filter((doc) => doc.data.type === 'outline' && doc.data.level === 'volume')
      .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  }
  if (section === 'style') {
    return docs.filter(
      (doc) =>
        (doc.data.type === 'pattern' && doc.data.kind === 'writing') ||
        (doc.data.type === 'strategy' && doc.data.category === 'style')
    )
  }
  const type = typeMap[section]
  return docs.filter((doc) => doc.data.type === type)
}

function volumeSectionDocs(docs: DocEntry[], volume: DocEntry, section: VolumeSection): DocEntry[] {
  if (section === 'arcs') {
    return docs
      .filter(
        (doc) => doc.data.type === 'outline' && doc.data.level === 'arc' && doc.data.parent === volume.data.id
      )
      .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  }
  return outlineSectionDocs(docs, section).filter((doc) => isDocUsedByVolume(docs, volume, doc))
}

function countVolumeSection(docs: DocEntry[], volume: DocEntry, section: VolumeSection): number {
  return volumeSectionDocs(docs, volume, section).length
}

function applyVolumeScope(data: Record<string, unknown>, volume: DocEntry): Record<string, unknown> {
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
  return {
    ...data,
    scope: data.scope ?? 'volume',
    volume: data.volume ?? volume.data.id,
    tags: [...new Set([...tags, `volume:${volume.data.id}`])]
  }
}

function isDocUsedByVolume(docs: DocEntry[], volume: DocEntry, doc: DocEntry): boolean {
  if (doc.data.type === 'outline')
    return (
      doc.data.id === volume.data.id || findAncestorOfDoc(docs, doc, 'volume')?.data.id === volume.data.id
    )
  if (doc.data.volume === volume.data.id || doc.data.scope === volume.data.id) return true
  if (asStringList(doc.data.tags).includes(`volume:${volume.data.id}`)) return true
  const volumeRelated = collectVolumeRelatedIds(docs, volume)
  return volumeRelated.has(doc.data.id)
}

function collectVolumeRelatedIds(docs: DocEntry[], volume: DocEntry): Set<string> {
  const ids = new Set<string>()
  const outlines = docs.filter((item) => item.data.type === 'outline')
  const volumeTree = outlines.filter(
    (item) =>
      item.data.id === volume.data.id || findAncestor(outlines, item, 'volume')?.data.id === volume.data.id
  )
  const scenes = docs.filter(
    (item) =>
      item.data.type === 'scene' && volumeTree.some((outline) => outline.data.id === item.data.section)
  )
  for (const item of [...volumeTree, ...scenes]) {
    for (const key of [
      'related_timeline',
      'related_characters',
      'related_foreshadowing',
      'foreshadowing_planted',
      'foreshadowing_resolved',
      'world_entries_used',
      'related_patterns',
      'location',
      'timeline_node',
      'pov',
      'characters'
    ]) {
      const value = item.data[key]
      if (Array.isArray(value)) value.map(String).forEach((id) => ids.add(id))
      else if (value) ids.add(String(value))
    }
  }
  return ids
}

function findAncestorOfDoc(docs: DocEntry[], child: DocEntry, level: WorkLevel | null): DocEntry | null {
  return findAncestor(
    docs.filter((item) => item.data.type === 'outline'),
    child,
    level
  )
}

function VolumeTimeline({
  docs,
  volume,
  arcs,
  items,
  selectedTarget,
  onSelect
}: {
  docs: DocEntry[]
  volume: DocEntry
  arcs: DocEntry[]
  items: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
}) {
  const unassigned = items.filter((item) => !arcs.some((arc) => timelineBelongsToArc(docs, arc, item)))
  return (
    <div className="volume-timeline">
      <article className="timeline-lane volume-lane">
        <h3>{volume.data.title}</h3>
        <p>
          {formatFieldValue(volume.data.volume_goal) || volume.content.slice(0, 120) || '本卷目标尚未填写。'}
        </p>
      </article>
      {arcs.map((arc) => {
        const events = items.filter((item) => timelineBelongsToArc(docs, arc, item))
        return (
          <article key={arc.data.id} className="timeline-lane">
            <div>
              <span className="badge ok">段纲</span>
              <h3>{arc.data.title}</h3>
            </div>
            <div className="timeline-events">
              {events.map((event) => (
                <button
                  key={event.data.id}
                  className={selectedTarget?.id === event.data.id ? 'active' : ''}
                  onClick={() => onSelect({ type: event.data.type, id: event.data.id })}
                >
                  <strong>{String(event.data.date ?? '未定时间')}</strong>
                  <span>{event.data.title}</span>
                  <small>{structuredLineForSection(event) || event.content.slice(0, 80)}</small>
                </button>
              ))}
              {!events.length && <p className="empty-row">这个段纲还没有绑定时间线事件。</p>}
            </div>
          </article>
        )
      })}
      {unassigned.length > 0 && (
        <article className="timeline-lane">
          <div>
            <span className="badge">待分段</span>
            <h3>本卷未分配事件</h3>
          </div>
          <div className="timeline-events">
            {unassigned.map((event) => (
              <button
                key={event.data.id}
                className={selectedTarget?.id === event.data.id ? 'active' : ''}
                onClick={() => onSelect({ type: event.data.type, id: event.data.id })}
              >
                <strong>{String(event.data.date ?? '未定时间')}</strong>
                <span>{event.data.title}</span>
                <small>{structuredLineForSection(event) || event.content.slice(0, 80)}</small>
              </button>
            ))}
          </div>
        </article>
      )}
    </div>
  )
}

function timelineBelongsToArc(docs: DocEntry[], arc: DocEntry, timeline: DocEntry): boolean {
  if (asStringList(arc.data.related_timeline).includes(timeline.data.id)) return true
  const chapters = docs.filter(
    (item) =>
      item.data.type === 'outline' && item.data.level === 'chapter' && item.data.parent === arc.data.id
  )
  const scenes = docs.filter(
    (item) => item.data.type === 'scene' && chapters.some((chapter) => chapter.data.id === item.data.section)
  )
  return [...chapters, ...scenes].some((item) => {
    if (item.data.timeline_node === timeline.data.id) return true
    return asStringList(item.data.related_timeline).includes(timeline.data.id)
  })
}

function countSection(docs: DocEntry[], section: OutlineHomeSection): number {
  return outlineSectionDocs(docs, section).length
}

function createInputForOutlineSection(
  section: OutlineHomeSection,
  title: string,
  docs: DocEntry[],
  project: ProjectListItem
): { kind: string; data: Record<string, unknown> } {
  const content = `## ${title}\n`
  if (section === 'volumes') {
    const siblings = docs.filter((doc) => doc.data.type === 'outline' && doc.data.level === 'volume')
    const book = docs.find((doc) => doc.data.type === 'outline' && doc.data.level === 'book')
    return {
      kind: 'outline',
      data: {
        title,
        level: 'volume',
        parent: book?.data.id ?? null,
        order: siblings.length,
        target_words: Math.max(project.chapter_words * 20, 1),
        content
      }
    }
  }
  if (section === 'canon')
    return { kind: 'canon', data: { title, content, status: 'confirmed', strength: 'hard' } }
  if (section === 'world') return { kind: 'world_entry', data: { title, content, entry_status: 'candidate' } }
  if (section === 'characters') return { kind: 'character', data: { title, content } }
  if (section === 'timeline') return { kind: 'timeline_event', data: { title, content } }
  if (section === 'locations') return { kind: 'location', data: { title, content } }
  if (section === 'foreshadowing') return { kind: 'foreshadowing', data: { title, content } }
  if (section === 'style') {
    return {
      kind: 'pattern',
      data: { title, content, kind: 'writing', scope: 'project', source: 'user', applies_to: ['style'] }
    }
  }
  if (section === 'patterns') return { kind: 'pattern', data: { title, content, kind: 'story' } }
  if (section === 'issues') return { kind: 'issue', data: { title, content, priority: 'medium' } }
  return { kind: 'reference', data: { title, content } }
}

function docTypeLabel(doc: DocEntry): string {
  if (doc.data.type === 'outline') return outlineLevelLabel(String(doc.data.level))
  const labels: Record<string, string> = {
    canon: '正设',
    world_entry: '世界书',
    character: '人物',
    timeline_event: '时间线',
    location: '地点',
    foreshadowing: '伏笔',
    pattern: doc.data.kind === 'writing' ? '文风' : '模式',
    strategy: '策略',
    issue: '问题',
    reference: '参考',
    scene: '正文'
  }
  return labels[String(doc.data.type)] ?? String(doc.data.type)
}

function structuredLineForSection(doc: DocEntry): string {
  const keysByType: Record<string, string[]> = {
    canon: ['strength', 'source'],
    world_entry: ['triggers', 'role', 'valid_from', 'importance'],
    character: ['role', 'desire', 'fear'],
    timeline_event: ['date', 'location', 'characters'],
    location: ['parent_location', 'description'],
    foreshadowing: ['level', 'state', 'planned_plant', 'planned_resolve'],
    pattern: ['kind', 'scope', 'source', 'applies_to'],
    strategy: ['category', 'scope', 'principles'],
    issue: ['priority', 'state', 'decision_needed'],
    reference: ['material_type', 'reading_status', 'location'],
    outline: ['volume_goal', 'reader_payoff', 'event_chain']
  }
  const keys = keysByType[String(doc.data.type)] ?? ['status']
  return keys
    .map((key) => {
      const value = formatFieldValue(doc.data[key])
      return value ? `${fieldLabel(key)}: ${value}` : ''
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    title: '标题',
    status: '状态',
    tags: '标签',
    strength: '强度',
    source: '来源',
    triggers: '触发词',
    role: '作用',
    valid_from: '起',
    importance: '重要度',
    desire: '欲望',
    fear: '恐惧',
    date: '日期',
    location: '地点',
    characters: '人物',
    parent_location: '上级地点',
    description: '描述',
    level: '级别',
    state: '状态',
    planned_plant: '计划埋设',
    planned_resolve: '计划回收',
    kind: '类型',
    scope: '范围',
    applies_to: '适用',
    category: '分类',
    principles: '原则',
    priority: '优先级',
    decision_needed: '待确认',
    material_type: '资料类型',
    reading_status: '阅读状态',
    volume_goal: '本卷目标',
    reader_payoff: '兑现',
    event_chain: '事件链'
  }
  return labels[key] ?? key
}

function StructuredTile({ doc }: { doc: DocEntry }) {
  const line = structuredLineForSection(doc)
  return (
    <div className="structured-tile">
      {line ? (
        line.split(' · ').map((part) => <small key={part}>{part}</small>)
      ) : (
        <p>{doc.content.slice(0, 160) || '暂无结构化数据'}</p>
      )}
    </div>
  )
}

function MetadataEditor({
  data,
  onChange
}: {
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}) {
  const editableKeys = Object.keys(data).filter((key) => !['id', 'type', 'schema_version'].includes(key))
  const update = (key: string, value: string) => {
    const current = data[key]
    let next: unknown = value
    if (Array.isArray(current))
      next = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    else if (typeof current === 'number') next = Number(value)
    else if (typeof current === 'boolean') next = value === 'true'
    onChange({ ...data, [key]: next })
  }
  return (
    <div className="metadata-editor">
      {editableKeys.map((key) => {
        const value = data[key]
        if (value && typeof value === 'object' && !Array.isArray(value)) return null
        return (
          <label key={key}>
            {fieldLabel(key)}
            <input
              value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        )
      })}
    </div>
  )
}

interface OutlineHierarchy {
  outlines: DocEntry[]
  children: Map<string | null, DocEntry[]>
}

function buildOutlineHierarchy(docs: DocEntry[]): OutlineHierarchy {
  const outlines = docs
    .filter((item) => item.data.type === 'outline')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const children = new Map<string | null, DocEntry[]>()
  for (const outline of outlines) {
    const parent = (outline.data.parent as string | null | undefined) ?? null
    children.set(parent, [...(children.get(parent) ?? []), outline])
  }
  return { outlines, children }
}

function outlineItemsForLevel(
  docs: DocEntry[],
  level: WorkLevel,
  selectedOutline: DocEntry | null,
  selectedTarget: TargetSelection | null
): DocEntry[] {
  const outlines = docs
    .filter((item) => item.data.type === 'outline')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  if (level === 'book') return outlines.filter((item) => item.data.level === 'book')
  const selected =
    selectedTarget?.type === 'outline'
      ? outlines.find((item) => item.data.id === selectedTarget.id)
      : selectedOutline
  const parentLevel = previousWorkLevel(level)
  const parent =
    selected && selected.data.level === parentLevel
      ? selected
      : selected
        ? findAncestor(outlines, selected, parentLevel)
        : null
  if (!parent) return outlines.filter((item) => item.data.level === level)
  return outlines.filter((item) => item.data.level === level && item.data.parent === parent.data.id)
}

function firstSelectableForLevel(
  docs: DocEntry[],
  level: WorkLevel,
  current: DocEntry | null
): DocEntry | null {
  const items = outlineItemsForLevel(
    docs,
    level,
    current,
    current ? { type: 'outline', id: current.data.id } : null
  )
  return items[0] ?? docs.find((item) => item.data.type === 'outline' && item.data.level === level) ?? null
}

function findAncestor(outlines: DocEntry[], child: DocEntry, level: WorkLevel | null): DocEntry | null {
  if (!level) return null
  let parent = child.data.parent as string | null | undefined
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const doc = outlines.find((item) => item.data.id === parent)
    if (!doc) return null
    if (doc.data.level === level) return doc
    parent = doc.data.parent as string | null | undefined
  }
  return null
}

function filterDocs(items: DocEntry[], query: string): DocEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => {
    const haystack =
      `${item.data.title}\n${item.content}\n${Object.values(item.data).join('\n')}`.toLowerCase()
    return haystack.includes(needle)
  })
}

function isWorkLevel(value: string): value is WorkLevel {
  return value === 'book' || value === 'volume' || value === 'arc' || value === 'chapter'
}

function nextWorkLevel(level: WorkLevel): WorkLevel | null {
  if (level === 'book') return 'volume'
  if (level === 'volume') return 'arc'
  if (level === 'arc') return 'chapter'
  return null
}

function previousWorkLevel(level: WorkLevel): WorkLevel | null {
  if (level === 'volume') return 'book'
  if (level === 'arc') return 'volume'
  if (level === 'chapter') return 'arc'
  return null
}

function parentForNewLevel(docs: DocEntry[], level: WorkLevel, selected: DocEntry | null): string | null {
  const parentLevel = previousWorkLevel(level)
  if (!parentLevel) return null
  const outlines = docs.filter((item) => item.data.type === 'outline')
  if (selected?.data.level === parentLevel) return selected.data.id
  if (selected) return findAncestor(outlines, selected, parentLevel)?.data.id ?? null
  return docs.find((item) => item.data.type === 'outline' && item.data.level === parentLevel)?.data.id ?? null
}

function levelOverviewTitle(level: WorkLevel, selected: DocEntry | null): string {
  if (level === 'book') return selected?.data.title ?? '全书总览'
  return `${outlineLevelLabel(level)}总览`
}

function structuredLine(item: DocEntry): string {
  if (item.data.type === 'scene') {
    return [
      item.data.chapter_number && `章 ${String(item.data.chapter_number)}`,
      item.data.location && `地点 ${String(item.data.location)}`,
      item.data.pov && `POV ${String(item.data.pov)}`
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const level = String(item.data.level)
  const tasks = levelTasks(level)
  return tasks.fields
    .map(([label, key]) => {
      const value = formatFieldValue(item.data[key])
      return value ? `${label}: ${value}` : ''
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ')
}

function docTitle(docs: DocEntry[], id: unknown): string {
  if (!id) return ''
  return docs.find((item) => item.data.id === id)?.data.title ?? String(id)
}

function formatImportResult(result: unknown): string {
  if (!Array.isArray(result) || result.length === 0) return '没有发现可导入的 Markdown。'
  const counts = new Map<string, number>()
  for (const item of result as Array<{ imported_type?: string }>) {
    const key = item.imported_type ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return `已导入 ${result.length} 个文档：${[...counts.entries()].map(([key, count]) => `${key} ${count}`).join('，')}`
}

function renderMiniMarkdown(content: string): string {
  const escaped = escapeHtml(content || '暂无内容')
  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('### ')) return `<h4>${inlineMarkdown(trimmed.slice(4))}</h4>`
      if (trimmed.startsWith('## ')) return `<h3>${inlineMarkdown(trimmed.slice(3))}</h3>`
      if (trimmed.startsWith('# ')) return `<h2>${inlineMarkdown(trimmed.slice(2))}</h2>`
      if (/^[-*]\s+/m.test(trimmed)) {
        const items = trimmed
          .split('\n')
          .filter((line) => /^[-*]\s+/.test(line))
          .map((line) => `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`)
          .join('')
        return `<ul>${items}</ul>`
      }
      return `<p>${inlineMarkdown(trimmed).replace(/\n/g, '<br />')}</p>`
    })
    .join('')
}

function inlineMarkdown(value: string): string {
  return value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function OutlineBoard({
  docs,
  onCreate,
  language
}: {
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  language: LanguageName
}) {
  const outlines = docs
    .filter((doc) => doc.data.type === 'outline')
    .sort((a, b) => Number(a.data.order ?? 0) - Number(b.data.order ?? 0))
  const [title, setTitle] = useState('')
  const createSection = async () => {
    if (!title.trim()) return
    await onCreate('outline', {
      title,
      level: 'section',
      parent: outlines.at(-1)?.data.parent ?? null,
      order: outlines.length,
      target_words: 1000,
      chapter_hook: false,
      content: `## ${title}\n`
    })
    setTitle('')
  }
  return (
    <section className="module-view">
      <div className="module-head">
        <h2>{t(language, 'outline')}</h2>
        <div className="inline-create">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(language, 'newSectionOutline')}
          />
          <button onClick={createSection}>{t(language, 'newSectionOutline')}</button>
        </div>
      </div>
      <div className="cards-grid">
        {outlines.map((outline) => (
          <article key={outline.data.id} className="info-card">
            <strong>{outline.data.title}</strong>
            <small>
              {String(outline.data.level)} · hook: {outline.data.chapter_hook ? 'yes' : 'no'}
            </small>
            <p>{outline.content.slice(0, 220)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function BeatBoard({
  docs,
  onCreate,
  language
}: {
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<unknown>
  language: LanguageName
}) {
  const sections = docs.filter((doc) => doc.data.type === 'outline' && doc.data.level === 'section')
  const firstTimeline = docs.find((doc) => doc.data.type === 'timeline_event')?.data.id
  const firstLocation = docs.find((doc) => doc.data.type === 'location')?.data.id
  const firstCharacter = docs.find((doc) => doc.data.type === 'character')?.data.id
  const createSceneFromSection = async (section: DocEntry) => {
    if (!firstTimeline || !firstLocation || !firstCharacter) return
    await onCreate('scene', {
      title: `${section.data.title} prose`,
      section: section.data.id,
      timeline_node: firstTimeline,
      location: firstLocation,
      pov: firstCharacter,
      characters: [firstCharacter],
      target_words: Number(section.data.target_words ?? 1000),
      chapter_hook: Boolean(section.data.chapter_hook),
      tags: ['volume-01', 'chapter-001'],
      content: '## Draft\n'
    })
  }
  return (
    <section className="module-view">
      <h2>{t(language, 'beats')}</h2>
      <div className="cards-grid">
        {sections.map((section) => (
          <article key={section.data.id} className="info-card beat-card">
            <strong>{section.data.title}</strong>
            <small>{section.data.chapter_hook ? 'chapter hook' : 'section beat'}</small>
            <p>{section.content.slice(0, 180)}</p>
            <button onClick={() => createSceneFromSection(section)}>{t(language, 'createScene')}</button>
          </article>
        ))}
      </div>
    </section>
  )
}

function Inspector({
  docs,
  scene,
  outline,
  context,
  contextPacket,
  checkReport,
  language
}: {
  docs: DocEntry[]
  scene: DocEntry | null
  outline: DocEntry | null
  context: string
  contextPacket: ContextPacketSummary | null
  checkReport: string
  language: LanguageName
}) {
  const find = (id?: unknown) => docs.find((doc) => doc.data.id === id)
  const pov = find(scene?.data.pov)
  const timeline = find(scene?.data.timeline_node)
  const location = find(scene?.data.location)
  const issues = checkReport.split('\n').filter((line) => line.startsWith('- ['))
  const warnings = contextPacket?.warnings ?? []
  return (
    <div className="inspector-content">
      <h3>{t(language, 'contextAndChecks')}</h3>
      <InspectorCard title={t(language, 'assembledContext')} ok language={language}>
        <p>
          {context
            ? `${context.length.toLocaleString()} ${t(language, 'charsAssembled')}`
            : t(language, 'notAssembled')}
        </p>
        {contextPacket && (
          <p>
            {outlineLevelLabel(contextPacket.target.level)} · {contextPacket.included_ids.length} docs ·
            excluded {contextPacket.excluded_ids.length}
          </p>
        )}
      </InspectorCard>
      <InspectorCard title={t(language, 'canonConstraints')} ok language={language}>
        {(contextPacket?.canon ?? docs.filter((doc) => doc.data.type === 'canon').slice(0, 4)).map((item) => (
          <p key={item.data.id}>• {item.data.title}</p>
        ))}
      </InspectorCard>
      {outline && (
        <InspectorCard
          title={`${outlineLevelLabel(String(outline.data.level))}: ${outline.data.title}`}
          ok
          language={language}
        >
          <p>时间线：{contextPacket?.timeline.length ?? 0}</p>
          <p>人物：{contextPacket?.characters.length ?? 0}</p>
          <p>世界书：{contextPacket?.world_entries.length ?? 0}</p>
          <p>伏笔：{contextPacket?.foreshadowing.length ?? 0}</p>
        </InspectorCard>
      )}
      {warnings.length > 0 && (
        <InspectorCard title="缺项提示" ok={false} language={language}>
          {warnings.slice(0, 8).map((warning) => (
            <p key={warning}>• {warning}</p>
          ))}
        </InspectorCard>
      )}
      {!!contextPacket?.character_states.length && (
        <InspectorCard title="人物状态快照" ok language={language}>
          {contextPacket.character_states.slice(0, 6).map((state) => (
            <p key={state.data.id}>
              • {state.data.title}: {String(state.data.emotion ?? '')}
            </p>
          ))}
        </InspectorCard>
      )}
      {!!contextPacket?.foreshadowing.length && (
        <InspectorCard title="伏笔叠层" ok language={language}>
          {contextPacket.foreshadowing.slice(0, 8).map((item) => (
            <p key={item.data.id}>
              • {String(item.data.level ?? '')} {item.data.title}: {String(item.data.state ?? '')}
            </p>
          ))}
        </InspectorCard>
      )}
      {scene && (
        <>
          <InspectorCard
            title={`${t(language, 'characterState')}: ${pov?.data.title ?? t(language, 'notSelected')}`}
            ok
            language={language}
          >
            <p>
              {t(language, 'identity')}: {String(pov?.data.role ?? '')}
            </p>
            <p>
              {t(language, 'emotion')}:
              {String(
                (pov?.data.scene_state as Record<string, unknown> | undefined)?.emotional_state ?? '未记录'
              )}
            </p>
          </InspectorCard>
          <InspectorCard
            title={`${t(language, 'timelineNode')}: ${timeline?.data.title ?? t(language, 'notSelected')}`}
            ok
            language={language}
          >
            <p>
              {t(language, 'time')}: {String(timeline?.data.date ?? '')}
            </p>
            <p>
              {t(language, 'event')}: {timeline?.content.slice(0, 80)}
            </p>
          </InspectorCard>
          <InspectorCard
            title={`${t(language, 'location')}: ${location?.data.title ?? t(language, 'notSelected')}`}
            ok
            language={language}
          >
            <p>{String(location?.data.description ?? '')}</p>
          </InspectorCard>
        </>
      )}
      <InspectorCard title={t(language, 'consistencyResults')} ok={issues.length === 0} language={language}>
        {issues.length ? (
          issues.map((issue, i) => <p key={i}>{issue}</p>)
        ) : (
          <p>{language === 'zh' ? '未发现确定性问题' : 'No deterministic issues found'}</p>
        )}
      </InspectorCard>
    </div>
  )
}

function InspectorCard({
  title,
  ok,
  children,
  language
}: {
  title: string
  ok?: boolean
  children: React.ReactNode
  language: LanguageName
}) {
  return (
    <article className="inspector-card">
      <div className="card-head">
        <strong>{title}</strong>
        <span className={ok ? 'badge ok' : 'badge warn'}>{ok ? t(language, 'ok') : t(language, 'warn')}</span>
      </div>
      <div className="card-body">{children}</div>
    </article>
  )
}

function RunPanel({
  root,
  runs,
  sceneId,
  onAccepted,
  language
}: {
  root: string
  runs: RunSummary[]
  sceneId: string | null
  onAccepted: () => Promise<void>
  language: LanguageName
}) {
  const filtered = runs.filter((run) => !sceneId || run.scene_id === sceneId)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState('metadata.yaml')
  const [preview, setPreview] = useState('')
  const currentRun = filtered.some((run) => run.id === selectedRun) ? selectedRun : (filtered[0]?.id ?? null)
  const currentRunSummary = filtered.find((run) => run.id === currentRun) ?? null

  useEffect(() => {
    async function loadPreview() {
      if (!currentRun) {
        setPreview('')
        return
      }
      try {
        if (activeFile === 'diff') {
          const [raw, accepted] = await Promise.all([
            window.quillarium.readRunFile(root, currentRun, 'output-raw.md').catch(() => ''),
            window.quillarium.readRunFile(root, currentRun, 'output-accepted.md').catch(() => '')
          ])
          setPreview(buildSimpleDiff(raw, accepted))
        } else {
          setPreview(await window.quillarium.readRunFile(root, currentRun, activeFile))
        }
      } catch (err) {
        setPreview(String(err))
      }
    }
    void loadPreview()
  }, [root, currentRun, activeFile])

  const accept = async () => {
    if (!currentRun) return
    await window.quillarium.acceptRun(root, currentRun)
    await onAccepted()
  }

  return (
    <footer className="run-panel">
      <div className="run-tabs">
        {['metadata.yaml', 'prompt.md', 'output-raw.md', 'output-accepted.md', 'check-report.md'].map(
          (file) => (
            <button
              key={file}
              className={activeFile === file ? 'active' : ''}
              onClick={() => setActiveFile(file)}
            >
              {runFileLabel(file, language)}
            </button>
          )
        )}
        <span className="spacer" />
        <button onClick={accept} disabled={!currentRun || currentRunSummary?.status !== 'generated'}>
          {t(language, 'acceptRaw')}
        </button>
        <button onClick={() => setActiveFile('diff')} disabled={!currentRun}>
          {t(language, 'compare')}
        </button>
      </div>
      <div className="run-split">
        <div className="run-table">
          <div className="run-row header">
            <span>{t(language, 'type')}</span>
            <span>{t(language, 'model')}</span>
            <span>{t(language, 'time')}</span>
            <span>{t(language, 'status')}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-row">{t(language, 'noRuns')}</div>
          ) : (
            filtered.map((run) => (
              <button
                className={`run-row ${currentRun === run.id ? 'active' : ''}`}
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
              >
                <span>{run.id}</span>
                <span>{run.model}</span>
                <span>{run.created_at}</span>
                <span>{run.status}</span>
              </button>
            ))
          )}
        </div>
        <pre className="run-preview">{preview}</pre>
      </div>
    </footer>
  )
}

function runFileLabel(file: string, language: LanguageName): string {
  const labels: Record<string, keyof typeof I18N.zh> = {
    'metadata.yaml': 'runMetadata',
    'prompt.md': 'runPrompt',
    'output-raw.md': 'runRaw',
    'output-accepted.md': 'runAccepted',
    'check-report.md': 'runCheckReport'
  }
  return labels[file] ? t(language, labels[file]) : file
}

function buildSimpleDiff(raw: string, accepted: string): string {
  if (raw === accepted) return 'raw and accepted are identical.'
  return ['# Raw', raw || '(empty)', '', '# Accepted', accepted || '(empty)'].join('\n')
}

function WordProgress({ content, target }: { content: string; target: number }) {
  const count = content.replace(/\s+/g, '').length
  const pct = Math.min(100, Math.round((count / target) * 100))
  return (
    <div className="word-progress">
      <span>
        {count} / {target}
      </span>
      <div>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function buildScenePath(docs: DocEntry[], scene: DocEntry, language: LanguageName): string {
  const section = docs.find((doc) => doc.data.id === scene.data.section)
  return `${t(language, 'writing')} / ${section?.data.title ?? t(language, 'section')} / ${scene.data.title}`
}

function buildOutlinePath(docs: DocEntry[], outline: DocEntry): string {
  const chain: string[] = [outline.data.title]
  let parent = outline.data.parent as string | null | undefined
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const doc = docs.find((item) => item.data.id === parent && item.data.type === 'outline')
    if (!doc) break
    chain.unshift(doc.data.title)
    parent = doc.data.parent as string | null | undefined
  }
  return chain.join(' / ')
}

function outlineLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    book: '总纲',
    volume: '卷纲',
    act: '幕纲',
    arc: '段纲',
    chapter: '章纲',
    section: '场景'
  }
  return labels[level] ?? '大纲'
}

function outlineSortKey(outline: DocEntry): string {
  const rank: Record<string, number> = { book: 0, volume: 1, act: 2, arc: 3, chapter: 4, section: 5 }
  return `${rank[String(outline.data.level)] ?? 9}-${String(outline.data.parent ?? '')}-${String(
    outline.data.order ?? 0
  ).padStart(5, '0')}-${outline.data.title}`
}

const I18N = {
  zh: {
    welcomeSubtitle: '为长篇小说而建的 AI 写作书房。世界、人物、时间线与手稿一起生长。',
    changeVault: '更换 Obsidian 目录',
    chooseVault: '选择 Obsidian 目录',
    novelProjects: '小说项目',
    noProjects: '还没有项目。创建后会出现在 Obsidian 目录的 novels 文件夹下。',
    novelTitle: '小说名',
    openExistingProject: '打开已有项目',
    bookOutline: '全书大纲',
    book: '全书',
    writing: '写作',
    canon: 'Canon',
    worldBook: '世界书',
    characters: '人物',
    timeline: '时间线',
    foreshadowing: '伏笔',
    issues: '问题',
    references: '参考',
    strategy: '策略',
    patterns: '模式',
    locations: '地点',
    runs: '运行记录',
    collapse: '收起',
    outline: '大纲',
    beats: '节拍板',
    checks: '检查',
    noScene: '还没有场景',
    noSceneSelected: '未选择场景',
    scene: '场景',
    section: '节',
    save: '保存',
    saved: '已保存',
    startWriting: '开始写作...',
    noSceneHint: '先在 Outline 或 Beats 中创建节纲和场景，正文会显示在这里。',
    aiReady: 'AI 已配置',
    aiNotConfigured: 'AI 未配置',
    githubCredentials: 'GitHub 凭证',
    initLocalGit: '初始化本地 Git',
    privacyLocal: '隐私默认：无远端',
    settings: '设置',
    paper: '纸页',
    ink: '墨色',
    mist: '雾白',
    bamboo: '竹青',
    comfortable: '舒适',
    compact: '紧凑',
    dryRun: '试运行',
    generate: '生成',
    rewrite: '重写',
    checkAction: '检查',
    accept: '采纳',
    context: '上下文',
    provider: '服务商',
    baseUrl: '接口地址',
    apiKey: 'API 密钥',
    model: '模型',
    title: '标题',
    source: '来源',
    newTitle: '新建标题',
    create: '新建',
    emptyBody: '暂无正文。',
    status: '状态',
    strength: '强度',
    none: '无',
    searchHint: '搜索：标题和正文由 CLI 索引',
    acceptRaw: '采纳原文',
    compare: '对比',
    type: '类型',
    time: '时间',
    noRuns: '暂无运行记录。点击试运行或生成可创建记录。',
    runMetadata: '元数据',
    runPrompt: '提示词',
    runRaw: '原始输出',
    runAccepted: '已采纳输出',
    runCheckReport: '检查报告',
    newSectionOutline: '新建节纲',
    createScene: '生成场景',
    contextAndChecks: '上下文与检查',
    assembledContext: '已组装上下文',
    charsAssembled: '字符已组装',
    notAssembled: '未组装',
    canonConstraints: 'Canon 约束',
    characterState: '人物状态',
    notSelected: '未选择',
    identity: '身份',
    emotion: '情绪',
    timelineNode: '时间节点',
    event: '事件',
    location: '地点',
    consistencyResults: '一致性检查结果',
    ok: '符合',
    warn: '注意',
    privacyHint:
      'GitHub Token、默认 Owner 是全局配置；Git remote 属于当前小说项目。建议每部小说使用一个独立私有仓库。',
    aiSettings: 'AI 配置',
    prose: '正文',
    background: '背景',
    check: '检查',
    close: '关闭',
    saveRemote: '保存远端',
    saveAI: '保存 AI 配置',
    newCanon: '新 Canon',
    canonWorkspaceHint: '用卡片管理正设；每张卡片可和背景 AI 讨论后再归纳为约束。',
    createCanonCard: '新建 Canon 卡片',
    searchCanon: '搜索标题或内容',
    noCanonFound: '没有匹配的 Canon 卡片。',
    noCanonCards: '还没有 Canon 卡片。',
    canonContent: 'Canon 内容',
    saveCanon: '保存 Canon',
    saving: '保存中...',
    canonDiscussion: '内容整理',
    usesBackgroundAI: '使用背景 AI 设置',
    discussionPlaceholder: '这里会记录你和 AI 关于这张 Canon 卡片的讨论。',
    canonMessagePlaceholder: '输入要和 AI 讨论的问题、材料或改写要求...',
    discussWithAI: '与 AI 讨论',
    summarizeToCanon: '归纳为 Canon',
    writer: '作者',
    canonCurator: 'Canon 整理员'
  },
  en: {
    welcomeSubtitle:
      'An AI writing studio for long-form fiction, where worlds, characters, timelines, and drafts grow together.',
    changeVault: 'Change Obsidian Vault',
    chooseVault: 'Choose Obsidian Vault',
    novelProjects: 'Novel Projects',
    noProjects: 'No projects yet. New projects will appear under the novels folder in your Obsidian vault.',
    novelTitle: 'Novel title',
    openExistingProject: 'Open Existing Project',
    bookOutline: 'Book Outline',
    book: 'Book',
    writing: 'Writing',
    canon: 'Canon',
    worldBook: 'Worldbook',
    characters: 'Characters',
    timeline: 'Timeline',
    foreshadowing: 'Foreshadowing',
    issues: 'Issues',
    references: 'References',
    strategy: 'Strategy',
    patterns: 'Patterns',
    locations: 'Locations',
    runs: 'Runs',
    collapse: 'Collapse',
    outline: 'Outline',
    beats: 'Beats',
    checks: 'Checks',
    noScene: 'No scene yet',
    noSceneSelected: 'No scene selected',
    scene: 'Scene',
    section: 'Section',
    save: 'Save',
    saved: 'Saved',
    startWriting: 'Start writing...',
    noSceneHint: 'Create section outlines and scenes in Outline or Beats first. Prose will appear here.',
    aiReady: 'AI configured',
    aiNotConfigured: 'AI not configured',
    githubCredentials: 'GitHub Credentials',
    initLocalGit: 'Initialize Local Git',
    privacyLocal: 'Private default: no remote',
    settings: 'Settings',
    paper: 'Paper',
    ink: 'Ink',
    mist: 'Mist',
    bamboo: 'Bamboo',
    comfortable: 'Comfortable',
    compact: 'Compact',
    dryRun: 'Dry Run',
    generate: 'Generate',
    rewrite: 'Rewrite',
    checkAction: 'Check',
    accept: 'Accept',
    context: 'Context',
    provider: 'Provider',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    model: 'Model',
    title: 'Title',
    source: 'Source',
    newTitle: 'New title',
    create: 'Create',
    emptyBody: 'No body yet.',
    status: 'Status',
    strength: 'Strength',
    none: 'None',
    searchHint: 'Search: title and body are indexed by CLI',
    acceptRaw: 'Accept Raw',
    compare: 'Compare',
    type: 'Type',
    time: 'Time',
    noRuns: 'No runs yet. Click Dry Run or Generate to create one.',
    runMetadata: 'Metadata',
    runPrompt: 'Prompt',
    runRaw: 'Raw output',
    runAccepted: 'Accepted output',
    runCheckReport: 'Check report',
    newSectionOutline: 'New Section Outline',
    createScene: 'Create Scene',
    contextAndChecks: 'Context & Checks',
    assembledContext: 'Assembled context',
    charsAssembled: 'characters assembled',
    notAssembled: 'Not assembled',
    canonConstraints: 'Canon constraints',
    characterState: 'Character state',
    notSelected: 'Not selected',
    identity: 'Identity',
    emotion: 'Emotion',
    timelineNode: 'Timeline node',
    event: 'Event',
    location: 'Location',
    consistencyResults: 'Consistency check results',
    ok: 'OK',
    warn: 'Review',
    privacyHint:
      'GitHub token and default owner are global settings; Git remotes belong to the current novel project. A separate private repository per novel is recommended.',
    aiSettings: 'AI Settings',
    prose: 'Prose',
    background: 'Background',
    check: 'Checks',
    close: 'Close',
    saveRemote: 'Save Remote',
    saveAI: 'Save AI Settings',
    newCanon: 'New Canon',
    canonWorkspaceHint:
      'Manage canon as cards; discuss each card with background AI before summarizing it into constraints.',
    createCanonCard: 'New Canon Card',
    searchCanon: 'Search title or content',
    noCanonFound: 'No matching canon cards.',
    noCanonCards: 'No canon cards yet.',
    canonContent: 'Canon Content',
    saveCanon: 'Save Canon',
    saving: 'Saving...',
    canonDiscussion: 'Content Curation',
    usesBackgroundAI: 'Uses background AI profile',
    discussionPlaceholder: 'Your discussion with AI about this canon card is recorded here.',
    canonMessagePlaceholder: 'Ask a question, paste material, or request a revision...',
    discussWithAI: 'Discuss with AI',
    summarizeToCanon: 'Summarize to Canon',
    writer: 'Writer',
    canonCurator: 'Canon Curator'
  }
} as const

function t(language: LanguageName, key: keyof typeof I18N.zh): string {
  return I18N[language][key]
}

createRoot(document.getElementById('root')!).render(<App />)
