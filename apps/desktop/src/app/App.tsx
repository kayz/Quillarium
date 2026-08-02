import React, { Component, useEffect, useState } from 'react'
import { BookOpen, FolderOpen } from 'lucide-react'
import type { AIStatus, DensityName, LanguageName, ProjectListItem, ThemeName } from './types.js'
import { t } from './i18n.js'
import { bridge } from './bridge.js'
import { TopChrome } from '../features/settings/TopChrome.js'
import { Workspace } from '../features/workspace/Workspace.js'

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
      if (!bridge) {
        setError('Quillarium desktop bridge is not available. Please reload the Electron window.')
        return
      }
      const config = await bridge.getConfig()
      if (config.theme) setTheme(config.theme as ThemeName)
      if (config.density) setDensity(config.density as DensityName)
      if (config.language) setLanguage(config.language as LanguageName)
      const v = await bridge.getVault()
      setVault(v)
      setProjects(await bridge.listProjects())
      setAiStatus(await bridge.aiStatus())
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
    await bridge.chooseVault()
    await onRefresh()
  }

  const migrateVault = async () => {
    await bridge.migrateVault()
    await onRefresh()
  }

  const chooseProject = async () => {
    const project = await bridge.chooseProject()
    if (project) onOpen(project.root)
  }

  const create = async () => {
    if (!form.title.trim()) return
    const project = await bridge.createProject({ ...form, defaultTheme: theme })
    const config = await bridge.getConfig()
    if (config.github?.token && window.confirm('是否为这部小说创建私有 GitHub 仓库？')) {
      await bridge.githubCreateRepoForProject(project.root)
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
