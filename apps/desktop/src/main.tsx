import React, { Component, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  FileText,
  FolderOpen,
  GitBranch,
  Library,
  MapPin,
  MessageSquareText,
  PenLine,
  Search,
  Sparkles,
  UserRound,
  WandSparkles
} from 'lucide-react'
import './styles.css'

type ThemeName = 'paper' | 'ink' | 'mist' | 'bamboo'
type ModuleName = 'write' | 'canon' | 'characters' | 'timeline' | 'locations' | 'runs'
type CenterTab = 'editor' | 'outline' | 'beats'
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

  const chooseProject = async () => {
    const project = await window.quillarium.chooseProject()
    if (project) onOpen(project.root)
  }

  const create = async () => {
    if (!form.title.trim()) return
    const project = await window.quillarium.createProject({ ...form, defaultTheme: theme })
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
          <div className="brand-mark">Q</div>
          <h1>Quillarium</h1>
          <p>{t(language, 'welcomeSubtitle')}</p>
          <button className="primary" onClick={chooseVault}>
            <FolderOpen size={16} /> {vault ? t(language, 'changeVault') : t(language, 'chooseVault')}
          </button>
          {vault && <code>{vault}</code>}
          {error && <div className="error-box">{error}</div>}
        </section>
        <section className="welcome-panel">
          <div className="panel-title">
            <BookOpen size={17} /> {t(language, 'novelProjects')}
          </div>
          {projects.length === 0 ? (
            <div className="empty">{t(language, 'noProjects')}</div>
          ) : (
            <div className="project-list">
              {projects.map((project) => (
                <button key={project.root} className="project-row" onClick={() => onOpen(project.root)}>
                  <span>{project.title}</span>
                  <small>{project.genre}</small>
                </button>
              ))}
            </div>
          )}
          <div className="create-form">
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
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState<ModuleName>('write')
  const [doc, setDoc] = useState<{ data: Record<string, unknown>; content: string; path: string } | null>(
    null
  )
  const [context, setContext] = useState('')
  const [checkReport, setCheckReport] = useState('')
  const [dirty, setDirty] = useState(false)
  const [git, setGit] = useState<GitState | null>(null)
  const [busy, setBusy] = useState(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [centerTab, setCenterTab] = useState<CenterTab>('editor')

  const load = async () => {
    const loaded = await window.quillarium.loadProject(root)
    setData(loaded)
    if (loaded.project.default_theme) onTheme(loaded.project.default_theme)
    setGit(await window.quillarium.gitStatus(root))
    const scenes = loaded.docs.filter((item: DocEntry) => item.data.type === 'scene')
    if (!selectedSceneId && scenes[0]) setSelectedSceneId(scenes[0].data.id)
  }

  useEffect(() => {
    void load()
  }, [root])

  const selectedScene = useMemo(
    () => data?.docs.find((item) => item.data.id === selectedSceneId && item.data.type === 'scene') ?? null,
    [data, selectedSceneId]
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
  }, [doc, selectedScene?.data.id])

  useEffect(() => {
    async function openScene() {
      if (!selectedScene) return
      const parsed = await window.quillarium.readDoc(selectedScene.path)
      setDoc({ ...parsed, path: selectedScene.path })
      setDirty(false)
      setContext(await window.quillarium.assembleContext(root, selectedScene.data.id))
      const result = await window.quillarium.checkScene(root, selectedScene.data.id)
      setCheckReport(result.markdown)
    }
    void openScene()
  }, [root, selectedScene?.path, selectedScene?.data.id])

  if (!data) return <div className="loading">加载中...</div>

  const docs = data.docs
  const projectPath = selectedScene
    ? buildScenePath(docs, selectedScene, language)
    : t(language, 'noSceneSelected')

  const save = async () => {
    if (!doc) return
    await window.quillarium.saveDocBody(doc.path, doc.data, doc.content)
    setDirty(false)
    await load()
  }

  const runCheck = async () => {
    if (!selectedScene) return
    setBusy(true)
    const result = await window.quillarium.checkSceneIntoRun(root, selectedScene.data.id)
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
    if (!selectedScene) return
    setBusy(true)
    await window.quillarium.generate(root, selectedScene.data.id)
    await load()
    setBusy(false)
  }

  const rewrite = async () => {
    await generate()
  }

  const initGit = async () => {
    setGit(await window.quillarium.gitInit(root))
  }

  const commitGit = async () => {
    setGit(await window.quillarium.gitCommit(root, `Update ${data.project.title}`))
  }

  const createDoc = async (kind: string, input: Record<string, unknown>) => {
    const created = await window.quillarium.createDoc(root, kind, input)
    await load()
    return created
  }

  return (
    <div className={`app-shell ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`}>
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
        onGitInit={initGit}
        onGitCommit={commitGit}
        root={root}
      />
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>{t(language, 'bookOutline')}</span>
            <button onClick={() => setLeftOpen(false)}>{t(language, 'collapse')}</button>
          </div>
          <StructureTree
            docs={docs}
            selectedSceneId={selectedSceneId}
            onSelect={setSelectedSceneId}
            language={language}
          />
          <ModuleNav active={activeModule} onSelect={setActiveModule} docs={docs} language={language} />
        </aside>
        <main className="center">
          {!leftOpen && (
            <button className="panel-toggle left" onClick={() => setLeftOpen(true)}>
              {t(language, 'outline')}
            </button>
          )}
          {!rightOpen && (
            <button className="panel-toggle right" onClick={() => setRightOpen(true)}>
              {t(language, 'checks')}
            </button>
          )}
          {activeModule === 'write' ? (
            <>
              <div className="editor-tabs">
                <button
                  className={`tab ${centerTab === 'editor' ? 'active' : ''}`}
                  onClick={() => setCenterTab('editor')}
                >
                  {selectedScene?.data.title ?? t(language, 'scene')}
                </button>
                <button
                  className={`tab ${centerTab === 'outline' ? 'active' : ''}`}
                  onClick={() => setCenterTab('outline')}
                >
                  {t(language, 'outline')}
                </button>
                <button
                  className={`tab ${centerTab === 'beats' ? 'active' : ''}`}
                  onClick={() => setCenterTab('beats')}
                >
                  {t(language, 'beats')}
                </button>
              </div>
              <div className="toolbar">
                <select>
                  <option>正文</option>
                </select>
                <select>
                  <option>宋体</option>
                </select>
                <select>
                  <option>16</option>
                </select>
                <button>B</button>
                <button>I</button>
                <button>U</button>
                <span className="spacer" />
                <button onClick={save} disabled={!dirty}>
                  {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                </button>
              </div>
              {!selectedScene && centerTab === 'editor' ? (
                <section className="editor-page empty-editor">
                  <h2>{t(language, 'noScene')}</h2>
                  <p>{t(language, 'noSceneHint')}</p>
                </section>
              ) : centerTab === 'editor' ? (
                <section className="editor-page">
                  <input className="scene-title" value={(doc?.data.title as string) ?? ''} readOnly />
                  <textarea
                    className="prose-editor"
                    value={doc?.content ?? ''}
                    onChange={(e) => {
                      if (!doc) return
                      setDoc({ ...doc, content: e.target.value })
                      setDirty(true)
                    }}
                    placeholder={t(language, 'startWriting')}
                  />
                  <div className="editor-actions">
                    <WordProgress
                      content={doc?.content ?? ''}
                      target={Number(selectedScene?.data.target_words ?? 1000)}
                    />
                    <span className="badge ok">{String(selectedScene?.data.status ?? 'draft')}</span>
                    <button onClick={dryRun} disabled={busy || !selectedScene}>
                      <Sparkles size={16} /> {t(language, 'dryRun')}
                    </button>
                    <button onClick={generate} disabled={busy || !selectedScene}>
                      <WandSparkles size={16} /> {t(language, 'generate')}
                    </button>
                    <button onClick={rewrite} disabled={busy || !selectedScene}>
                      <PenLine size={16} /> {t(language, 'rewrite')}
                    </button>
                    <button onClick={runCheck} disabled={busy || !selectedScene}>
                      <CheckCircle2 size={16} /> {t(language, 'checkAction')}
                    </button>
                    <button className="accept" disabled>
                      <CheckCircle2 size={16} /> {t(language, 'accept')}
                    </button>
                  </div>
                </section>
              ) : null}
              {centerTab === 'outline' && (
                <OutlineBoard docs={docs} onCreate={createDoc} language={language} />
              )}
              {centerTab === 'beats' && <BeatBoard docs={docs} onCreate={createDoc} language={language} />}
            </>
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
        <aside className="inspector">
          <div className="sidebar-header">
            <span>{t(language, 'context')}</span>
            <button onClick={() => setRightOpen(false)}>{t(language, 'collapse')}</button>
          </div>
          <Inspector
            docs={docs}
            scene={selectedScene}
            context={context}
            checkReport={checkReport}
            language={language}
          />
        </aside>
      </div>
      <RunPanel
        root={root}
        runs={data.runs}
        sceneId={selectedSceneId}
        onAccepted={load}
        language={language}
      />
    </div>
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
  onGitInit,
  onGitCommit,
  root
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
  onGitInit?: () => void
  onGitCommit?: () => void
  root?: string
}) {
  const themes: ThemeName[] = ['paper', 'ink', 'mist', 'bamboo']
  const [showSettings, setShowSettings] = useState(false)
  return (
    <header className="top-chrome">
      <button className="brand" onClick={onBack}>
        <span className="brand-feather">⌁</span> Quillarium
      </button>
      <div className="project-pill">
        {projectName} <ChevronDown size={14} />
      </div>
      <div className="path-label">{path}</div>
      <div className="top-spacer" />
      <div className="status-pill">
        <Circle size={10} className={aiStatus.ready ? 'green' : 'amber'} />{' '}
        {aiStatus.ready ? t(language, 'aiReady') : t(language, 'aiNotConfigured')}
      </div>
      {git ? (
        git.initialized ? (
          <button className="status-pill" onClick={onGitCommit} title="提交当前小说项目修改">
            <GitBranch size={14} /> {git.summary}
          </button>
        ) : (
          <button className="status-pill" onClick={onGitInit} title="只初始化本地 Git，不配置远端">
            <GitBranch size={14} /> {t(language, 'initLocalGit')}
          </button>
        )
      ) : (
        <div className="status-pill">
          <GitBranch size={14} /> {t(language, 'privacyLocal')}
        </div>
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
  const [remote, setRemote] = useState(git?.remote ?? '')
  const [profiles, setProfiles] = useState<Record<AIProfileName, AIProfileForm>>({
    prose: defaultAIProfile('openai-compatible'),
    background: defaultAIProfile('openai-compatible'),
    check: defaultAIProfile('openai-compatible')
  })

  useEffect(() => {
    async function loadProfiles() {
      const config = await window.quillarium.getConfig()
      setProfiles({
        prose: { ...defaultAIProfile('openai-compatible'), ...(config.aiProfiles?.prose ?? {}) },
        background: { ...defaultAIProfile('openai-compatible'), ...(config.aiProfiles?.background ?? {}) },
        check: { ...defaultAIProfile('openai-compatible'), ...(config.aiProfiles?.check ?? {}) }
      })
    }
    void loadProfiles()
  }, [])

  const saveRemote = async () => {
    if (!root || !remote.trim()) return
    await window.quillarium.gitSetRemote(root, remote.trim())
    onClose()
  }
  const saveAI = async () => {
    for (const profile of Object.keys(profiles) as AIProfileName[]) {
      await window.quillarium.saveAIProfile(profile, profiles[profile])
    }
    onAIStatus(await window.quillarium.aiStatus())
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
        <label>
          Git remote origin
          <input
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
            placeholder="git@github.com:user/private-repo.git"
          />
        </label>
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
          <button className="primary" onClick={saveRemote} disabled={!root || !remote.trim()}>
            {t(language, 'saveRemote')}
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
  selectedSceneId,
  onSelect,
  language
}: {
  docs: DocEntry[]
  selectedSceneId: string | null
  onSelect: (id: string) => void
  language: LanguageName
}) {
  const outlines = docs.filter((item) => item.data.type === 'outline')
  const scenes = docs.filter((item) => item.data.type === 'scene')
  return (
    <div className="tree">
      <div className="tree-node open">
        <BookOpen size={15} /> {t(language, 'book')}
      </div>
      {outlines.map((outline) => (
        <div key={outline.data.id} className={`tree-node level-${outline.data.level ?? 'section'}`}>
          <FileText size={14} /> {outline.data.title}
        </div>
      ))}
      {scenes.map((scene) => (
        <button
          key={scene.data.id}
          className={`tree-node scene ${selectedSceneId === scene.data.id ? 'active' : ''}`}
          onClick={() => onSelect(scene.data.id)}
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
    canon: docs.filter((doc) => doc.data.type === 'canon').length
  }
  const items = [
    ['write', PenLine, t(language, 'writing')],
    ['canon', Library, 'Canon'],
    ['characters', UserRound, t(language, 'characters')],
    ['timeline', Clock3, t(language, 'timeline')],
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
    characters: 'character',
    timeline: 'timeline_event',
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
    characters: 'character',
    timeline: 'timeline_event',
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
    characters: 'characters',
    timeline: 'timeline',
    locations: 'locations',
    runs: 'runs'
  }
  return t(language, map[module])
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
  context,
  checkReport,
  language
}: {
  docs: DocEntry[]
  scene: DocEntry | null
  context: string
  checkReport: string
  language: LanguageName
}) {
  const find = (id?: unknown) => docs.find((doc) => doc.data.id === id)
  const pov = find(scene?.data.pov)
  const timeline = find(scene?.data.timeline_node)
  const location = find(scene?.data.location)
  const canon = docs.filter((doc) => doc.data.type === 'canon').slice(0, 4)
  const issues = checkReport.split('\n').filter((line) => line.startsWith('- ['))
  return (
    <div className="inspector-content">
      <h3>{t(language, 'contextAndChecks')}</h3>
      <InspectorCard title={t(language, 'assembledContext')} ok language={language}>
        <p>
          {context
            ? `${context.length.toLocaleString()} ${t(language, 'charsAssembled')}`
            : t(language, 'notAssembled')}
        </p>
      </InspectorCard>
      <InspectorCard title={t(language, 'canonConstraints')} ok language={language}>
        {canon.map((item) => (
          <p key={item.data.id}>• {item.data.title}</p>
        ))}
      </InspectorCard>
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
  const currentRun = selectedRun ?? filtered[0]?.id ?? null

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
        <button onClick={accept} disabled={!currentRun}>
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
    characters: '人物',
    timeline: '时间线',
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
    privacyHint: '小说项目默认只保存在本地 Obsidian 目录。远端仓库必须手动配置，建议使用私有仓库。',
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
    characters: 'Characters',
    timeline: 'Timeline',
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
      'Novel projects stay in your local Obsidian vault by default. Remotes must be configured explicitly; private repositories are recommended.',
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
