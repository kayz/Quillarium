import React, { Component, useEffect, useState } from 'react'
import { BookOpen, FileInput, FolderOpen } from 'lucide-react'
import type { AIStatus, DensityName, LanguageName, ProjectListItem, ThemeName } from './types.js'
import { t } from './i18n.js'
import { bridge } from './bridge.js'
import { BrandWordmark } from './BrandWordmark.js'
import { TopChrome } from '../features/settings/TopChrome.js'
import { Workspace } from '../features/workspace/Workspace.js'
import { formatDesktopError } from '../shared/errors.js'

export function App() {
  const [theme, setTheme] = useState<ThemeName>('paper')
  const [density, setDensity] = useState<DensityName>('comfortable')
  const [language, setLanguage] = useState<LanguageName>('zh')
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    prose: false,
    background: false,
    check: false,
    ready: false
  })
  const [writingWorkspace, setWritingWorkspace] = useState<string | null>(null)
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
    let selectedLanguage = language
    try {
      if (!bridge) {
        setError(
          selectedLanguage === 'zh'
            ? 'Quillarium 桌面接口不可用，请重新启动客户端。'
            : 'The Quillarium desktop bridge is unavailable. Restart the client.'
        )
        return
      }
      const config = await bridge.getConfig()
      if (config.theme) setTheme(config.theme as ThemeName)
      if (config.density) setDensity(config.density as DensityName)
      if (config.language) {
        selectedLanguage = config.language as LanguageName
        setLanguage(selectedLanguage)
      }
      setWritingWorkspace(await bridge.getWorkspace())
      setProjects(await bridge.listProjects())
      setAiStatus(await bridge.aiStatus())
      setError(null)
    } catch (err) {
      setError(formatDesktopError(err, selectedLanguage))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!workspaceRoot) {
    return (
      <Welcome
        writingWorkspace={writingWorkspace}
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
    <ErrorBoundary language={language}>
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

class ErrorBoundary extends Component<
  { children: React.ReactNode; language: LanguageName },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="loading error-box">{formatDesktopError(this.state.error, this.props.language)}</div>
      )
    }
    return this.props.children
  }
}

function Welcome({
  writingWorkspace,
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
  writingWorkspace: string | null
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
  const zh = language === 'zh'
  const [form, setForm] = useState({
    title: '',
    genre: 'general',
    targetWords: 100000,
    chapterWords: 3200,
    sectionWords: 1000,
    defaultTheme: theme
  })

  const chooseWritingWorkspace = async () => {
    await bridge.chooseWorkspace()
    await onRefresh()
  }

  const chooseProject = async () => {
    const project = await bridge.chooseProject()
    if (project) onOpen(project.root)
  }

  const create = async () => {
    if (!form.title.trim()) return
    const project = await bridge.createProject({ ...form, defaultTheme: theme })
    await onRefresh()
    onOpen(project.root)
  }

  const importBookCard = async () => {
    if (!writingWorkspace) return
    try {
      const inspection = await bridge.chooseBookCharacterCard()
      if (!inspection) return
      const title = window.prompt(
        zh ? '确认或修改新小说书名' : 'Confirm or edit the new novel title',
        inspection.name
      )
      if (title === null || !title.trim()) return
      const result = await bridge.importBookCharacterCardProject(inspection.sourcePath, title.trim())
      await onRefresh()
      onOpen(result.project.root)
    } catch (cause) {
      window.alert(formatDesktopError(cause, language))
    }
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
      />
      <main className="welcome-main">
        <section className="welcome-hero">
          <span className="welcome-kicker">STRUCTURED FICTION WORKSPACE</span>
          <h1 className="welcome-brand" aria-label="Quillarium">
            <BrandWordmark className="welcome-brand-wordmark" decorative />
          </h1>
          <p>{t(language, 'welcomeSubtitle')}</p>
          <div className="vault-card">
            <div>
              <strong>{t(language, 'localWritingLibrary')}</strong>
              <code>{writingWorkspace ?? t(language, 'workspaceNotSet')}</code>
              <small>{t(language, 'localWritingLibraryHint')}</small>
            </div>
            <div className="vault-actions">
              <button className="primary" onClick={chooseWritingWorkspace}>
                <FolderOpen size={16} />{' '}
                {writingWorkspace ? t(language, 'changeLocalWorkspace') : t(language, 'chooseLocalWorkspace')}
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
            <h3>{zh ? '已有小说' : 'Existing novels'}</h3>
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
                      {zh ? '进入' : 'Open'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="create-form">
            <h3>{zh ? '创建小说' : 'Create a novel'}</h3>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t(language, 'novelTitle')}
            />
            <input
              value={form.genre}
              onChange={(e) => setForm({ ...form, genre: e.target.value })}
              placeholder={zh ? '类型' : 'Genre'}
            />
            <div className="number-grid">
              <label>
                {zh ? '全书字数' : 'Book words'}
                <input
                  type="number"
                  value={form.targetWords}
                  onChange={(e) => setForm({ ...form, targetWords: Number(e.target.value) })}
                />
              </label>
              <label>
                {zh ? '章字数' : 'Chapter words'}
                <input
                  type="number"
                  value={form.chapterWords}
                  onChange={(e) => setForm({ ...form, chapterWords: Number(e.target.value) })}
                />
              </label>
              <label>
                {zh ? '节字数' : 'Scene words'}
                <input
                  type="number"
                  value={form.sectionWords}
                  onChange={(e) => setForm({ ...form, sectionWords: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="create-project-actions">
              <button className="primary" onClick={create} disabled={!writingWorkspace || !form.title.trim()}>
                {zh ? '新建小说' : 'New novel'}
              </button>
              <button className="secondary" onClick={importBookCard} disabled={!writingWorkspace}>
                <FileInput size={16} /> {zh ? '从角色卡导入' : 'Import character card'}
              </button>
            </div>
            {!writingWorkspace && <small>{t(language, 'selectLocalBeforeCreate')}</small>}
            <button className="secondary" onClick={chooseProject}>
              <FolderOpen size={16} /> {t(language, 'openExistingProject')}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
