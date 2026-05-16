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
  PenLine,
  Sparkles,
  UserRound,
  WandSparkles
} from 'lucide-react'
import './styles.css'

type ThemeName = 'paper' | 'ink' | 'mist' | 'bamboo'
type ModuleName = 'write' | 'canon' | 'characters' | 'timeline' | 'locations' | 'runs'
type CenterTab = 'editor' | 'outline' | 'beats'
type DensityName = 'compact' | 'comfortable'

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
      const config = await window.quillarium.getConfig()
      if (config.theme) setTheme(config.theme as ThemeName)
      if (config.density) setDensity(config.density as DensityName)
      const v = await window.quillarium.getVault()
      setVault(v)
      setProjects(await window.quillarium.listProjects())
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
        error={error}
        onTheme={setTheme}
        onDensity={setDensity}
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
        onTheme={setTheme}
        onDensity={setDensity}
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
  error,
  onTheme,
  onDensity,
  onRefresh,
  onOpen
}: {
  vault: string | null
  projects: ProjectListItem[]
  theme: ThemeName
  density: DensityName
  error: string | null
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
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
        onTheme={onTheme}
        onDensity={onDensity}
        projectName="Quillarium"
        path="羽笔馆"
      />
      <main className="welcome-main">
        <section className="welcome-hero">
          <div className="brand-mark">Q</div>
          <h1>Quillarium</h1>
          <p>为长篇小说而建的 AI 写作书房。世界、人物、时间线与手稿一起生长。</p>
          <button className="primary" onClick={chooseVault}>
            <FolderOpen size={16} /> {vault ? '更换 Obsidian 目录' : '选择 Obsidian 目录'}
          </button>
          {vault && <code>{vault}</code>}
          {error && <div className="error-box">{error}</div>}
        </section>
        <section className="welcome-panel">
          <div className="panel-title">
            <BookOpen size={17} /> 小说项目
          </div>
          {projects.length === 0 ? (
            <div className="empty">还没有项目。创建后会出现在 Obsidian 目录的 novels 文件夹下。</div>
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
              placeholder="小说名"
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
              <FolderOpen size={16} /> 打开已有项目
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
  onTheme,
  onDensity,
  onBack
}: {
  root: string
  theme: ThemeName
  density: DensityName
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
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
  const projectPath = selectedScene ? buildScenePath(docs, selectedScene) : '未选择场景'

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
    await window.quillarium.createDoc(root, kind, input)
    await load()
  }

  return (
    <div className={`app-shell ${leftOpen ? '' : 'left-collapsed'} ${rightOpen ? '' : 'right-collapsed'}`}>
      <TopChrome
        theme={theme}
        density={density}
        onTheme={onTheme}
        onDensity={onDensity}
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
            <span>全书大纲</span>
            <button onClick={() => setLeftOpen(false)}>收起</button>
          </div>
          <StructureTree docs={docs} selectedSceneId={selectedSceneId} onSelect={setSelectedSceneId} />
          <ModuleNav active={activeModule} onSelect={setActiveModule} />
        </aside>
        <main className="center">
          {!leftOpen && (
            <button className="panel-toggle left" onClick={() => setLeftOpen(true)}>
              大纲
            </button>
          )}
          {!rightOpen && (
            <button className="panel-toggle right" onClick={() => setRightOpen(true)}>
              检查
            </button>
          )}
          {activeModule === 'write' ? (
            <>
              <div className="editor-tabs">
                <button
                  className={`tab ${centerTab === 'editor' ? 'active' : ''}`}
                  onClick={() => setCenterTab('editor')}
                >
                  {selectedScene?.data.title ?? '场景'}
                </button>
                <button
                  className={`tab ${centerTab === 'outline' ? 'active' : ''}`}
                  onClick={() => setCenterTab('outline')}
                >
                  Outline
                </button>
                <button
                  className={`tab ${centerTab === 'beats' ? 'active' : ''}`}
                  onClick={() => setCenterTab('beats')}
                >
                  Beats
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
                  {dirty ? '保存 *' : '已保存'}
                </button>
              </div>
              {centerTab === 'editor' && (
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
                    placeholder="开始写作..."
                  />
                  <div className="editor-actions">
                    <WordProgress
                      content={doc?.content ?? ''}
                      target={Number(selectedScene?.data.target_words ?? 1000)}
                    />
                    <span className="badge ok">{String(selectedScene?.data.status ?? 'draft')}</span>
                    <button onClick={dryRun} disabled={busy || !selectedScene}>
                      <Sparkles size={16} /> Dry Run
                    </button>
                    <button onClick={generate} disabled={busy || !selectedScene}>
                      <WandSparkles size={16} /> Generate
                    </button>
                    <button onClick={rewrite} disabled={busy || !selectedScene}>
                      <PenLine size={16} /> Rewrite
                    </button>
                    <button onClick={runCheck} disabled={busy || !selectedScene}>
                      <CheckCircle2 size={16} /> Check
                    </button>
                    <button className="accept" disabled>
                      <CheckCircle2 size={16} /> Accept
                    </button>
                  </div>
                </section>
              )}
              {centerTab === 'outline' && <OutlineBoard docs={docs} onCreate={createDoc} />}
              {centerTab === 'beats' && <BeatBoard docs={docs} onCreate={createDoc} />}
            </>
          ) : (
            <ModuleView module={activeModule} docs={docs} runs={data.runs} onCreate={createDoc} />
          )}
        </main>
        <aside className="inspector">
          <div className="sidebar-header">
            <span>上下文</span>
            <button onClick={() => setRightOpen(false)}>收起</button>
          </div>
          <Inspector docs={docs} scene={selectedScene} context={context} checkReport={checkReport} />
        </aside>
      </div>
      <RunPanel root={root} runs={data.runs} sceneId={selectedSceneId} onAccepted={load} />
    </div>
  )
}

function TopChrome({
  theme,
  density,
  onTheme,
  onDensity,
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
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
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
        <Circle size={10} className="green" /> AI 就绪
      </div>
      {git ? (
        git.initialized ? (
          <button className="status-pill" onClick={onGitCommit} title="提交当前小说项目修改">
            <GitBranch size={14} /> {git.summary}
          </button>
        ) : (
          <button className="status-pill" onClick={onGitInit} title="只初始化本地 Git，不配置远端">
            <GitBranch size={14} /> 初始化本地 Git
          </button>
        )
      ) : (
        <div className="status-pill">
          <GitBranch size={14} /> 隐私默认：无远端
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
          <option key={item}>{item}</option>
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
        <option value="comfortable">comfortable</option>
        <option value="compact">compact</option>
      </select>
      <button className="status-pill" onClick={() => setShowSettings(true)}>
        设置
      </button>
      {showSettings && <SettingsModal root={root} git={git ?? null} onClose={() => setShowSettings(false)} />}
    </header>
  )
}

function SettingsModal({ root, git, onClose }: { root?: string; git: GitState | null; onClose: () => void }) {
  const [remote, setRemote] = useState(git?.remote ?? '')
  const saveRemote = async () => {
    if (!root || !remote.trim()) return
    await window.quillarium.gitSetRemote(root, remote.trim())
    onClose()
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <h2>设置</h2>
        <p>小说项目默认只保存在本地 Obsidian 目录。远端仓库必须手动配置，建议使用私有仓库。</p>
        <label>
          Git remote origin
          <input
            value={remote}
            onChange={(e) => setRemote(e.target.value)}
            placeholder="git@github.com:user/private-repo.git"
          />
        </label>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            关闭
          </button>
          <button className="primary" onClick={saveRemote} disabled={!root || !remote.trim()}>
            保存远端
          </button>
        </div>
      </section>
    </div>
  )
}

function StructureTree({
  docs,
  selectedSceneId,
  onSelect
}: {
  docs: DocEntry[]
  selectedSceneId: string | null
  onSelect: (id: string) => void
}) {
  const outlines = docs.filter((item) => item.data.type === 'outline')
  const scenes = docs.filter((item) => item.data.type === 'scene')
  return (
    <div className="tree">
      <div className="tree-node open">
        <BookOpen size={15} /> 全书
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

function ModuleNav({ active, onSelect }: { active: ModuleName; onSelect: (module: ModuleName) => void }) {
  const items = [
    ['write', PenLine, 'Writing'],
    ['canon', Library, 'Canon'],
    ['characters', UserRound, 'Characters'],
    ['timeline', Clock3, 'Timeline'],
    ['locations', MapPin, 'Locations'],
    ['runs', Sparkles, 'Runs']
  ] as const
  return (
    <div className="module-nav">
      {items.map(([id, Icon, label]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
          <Icon size={18} /> {label}
        </button>
      ))}
    </div>
  )
}

function ModuleView({
  module,
  docs,
  runs,
  onCreate
}: {
  module: ModuleName
  docs: DocEntry[]
  runs: RunSummary[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
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
        <h2>Runs</h2>
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
  return (
    <section className="module-view">
      <ModuleCreateForm module={module} docs={docs} onCreate={onCreate} />
      <ModuleFilters module={module} docs={docs} />
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
            <p>{doc.content.slice(0, 180) || 'No body yet.'}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ModuleFilters({ module, docs }: { module: ModuleName; docs: DocEntry[] }) {
  if (module !== 'canon') return null
  const statuses = [...new Set(docs.filter((doc) => doc.data.type === 'canon').map((doc) => doc.data.status))]
  return (
    <div className="filter-row">
      <span>status: {statuses.join(' / ') || 'none'}</span>
      <span>strength: hard / soft</span>
      <span>search: title and body indexed by CLI</span>
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
  onCreate
}: {
  module: ModuleName
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
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
      <h2>{module}</h2>
      {kindMap[module] && (
        <div className="inline-create">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新建标题" />
          <button onClick={submit}>新建</button>
        </div>
      )}
    </div>
  )
}

function OutlineBoard({
  docs,
  onCreate
}: {
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
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
        <h2>Outline</h2>
        <div className="inline-create">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新建节纲" />
          <button onClick={createSection}>新建节纲</button>
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
  onCreate
}: {
  docs: DocEntry[]
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
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
      <h2>Beat Board</h2>
      <div className="cards-grid">
        {sections.map((section) => (
          <article key={section.data.id} className="info-card beat-card">
            <strong>{section.data.title}</strong>
            <small>{section.data.chapter_hook ? 'chapter hook' : 'section beat'}</small>
            <p>{section.content.slice(0, 180)}</p>
            <button onClick={() => createSceneFromSection(section)}>生成场景</button>
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
  checkReport
}: {
  docs: DocEntry[]
  scene: DocEntry | null
  context: string
  checkReport: string
}) {
  const find = (id?: unknown) => docs.find((doc) => doc.data.id === id)
  const pov = find(scene?.data.pov)
  const timeline = find(scene?.data.timeline_node)
  const location = find(scene?.data.location)
  const canon = docs.filter((doc) => doc.data.type === 'canon').slice(0, 4)
  const issues = checkReport.split('\n').filter((line) => line.startsWith('- ['))
  return (
    <div className="inspector-content">
      <h3>Context & Checks</h3>
      <InspectorCard title="Assembled context" ok>
        <p>{context ? `${context.length.toLocaleString()} 字符已组装` : '未组装'}</p>
      </InspectorCard>
      <InspectorCard title="Canon constraints" ok>
        {canon.map((item) => (
          <p key={item.data.id}>• {item.data.title}</p>
        ))}
      </InspectorCard>
      <InspectorCard title={`Character state: ${pov?.data.title ?? '未选择'}`} ok>
        <p>身份：{String(pov?.data.role ?? '')}</p>
        <p>
          情绪：
          {String(
            (pov?.data.scene_state as Record<string, unknown> | undefined)?.emotional_state ?? '未记录'
          )}
        </p>
      </InspectorCard>
      <InspectorCard title={`Timeline node: ${timeline?.data.title ?? '未选择'}`} ok>
        <p>时间：{String(timeline?.data.date ?? '')}</p>
        <p>事件：{timeline?.content.slice(0, 80)}</p>
      </InspectorCard>
      <InspectorCard title={`Location: ${location?.data.title ?? '未选择'}`} ok>
        <p>{String(location?.data.description ?? '')}</p>
      </InspectorCard>
      <InspectorCard title="Consistency check results" ok={issues.length === 0}>
        {issues.length ? issues.map((issue, i) => <p key={i}>{issue}</p>) : <p>未发现确定性问题</p>}
      </InspectorCard>
    </div>
  )
}

function InspectorCard({ title, ok, children }: { title: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <article className="inspector-card">
      <div className="card-head">
        <strong>{title}</strong>
        <span className={ok ? 'badge ok' : 'badge warn'}>{ok ? '符合' : '注意'}</span>
      </div>
      <div className="card-body">{children}</div>
    </article>
  )
}

function RunPanel({
  root,
  runs,
  sceneId,
  onAccepted
}: {
  root: string
  runs: RunSummary[]
  sceneId: string | null
  onAccepted: () => Promise<void>
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
              {file}
            </button>
          )
        )}
        <span className="spacer" />
        <button onClick={accept} disabled={!currentRun}>
          Accept Raw
        </button>
        <button onClick={() => setActiveFile('diff')} disabled={!currentRun}>
          Compare
        </button>
      </div>
      <div className="run-split">
        <div className="run-table">
          <div className="run-row header">
            <span>类型</span>
            <span>模型</span>
            <span>时间</span>
            <span>状态</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-row">暂无 run。点击 Dry Run 或 Generate 可创建记录。</div>
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

function buildScenePath(docs: DocEntry[], scene: DocEntry): string {
  const section = docs.find((doc) => doc.data.id === scene.data.section)
  return `写作 / ${section?.data.title ?? '节'} / ${scene.data.title}`
}

createRoot(document.getElementById('root')!).render(<App />)
