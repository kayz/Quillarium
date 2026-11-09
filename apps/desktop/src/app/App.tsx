import React, { Component, useEffect, useMemo, useState } from 'react'
import { resolveUISkin } from '@quillarium/core/ui-skins'
import type {
  AIStatus,
  DensityName,
  LanguageName,
  ProjectListItem,
  ThemeName,
  UISkinPreferencesV1
} from './types.js'
import { t } from './i18n.js'
import { bridge } from './bridge.js'
import { TopChrome } from '../features/settings/TopChrome.js'
import { Workspace } from '../features/workspace/Workspace.js'
import { formatDesktopError } from '../shared/errors.js'
import { applyUISkin } from './ui-skin.js'
import type { WorkRole } from './work-role.js'

export function App() {
  const [theme, setTheme] = useState<ThemeName>('paper')
  const [density, setDensity] = useState<DensityName>('comfortable')
  const [language, setLanguage] = useState<LanguageName>('zh')
  const [skinPreferences, setSkinPreferences] = useState<UISkinPreferencesV1 | undefined>()
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

  const activeSkin = useMemo(() => resolveUISkin(theme, skinPreferences), [theme, skinPreferences])

  useEffect(() => {
    applyUISkin(document.documentElement, activeSkin)
  }, [activeSkin])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  const refresh = async () => {
    let selectedLanguage = language
    try {
      if (!bridge) {
        setError(
          selectedLanguage === 'zh'
            ? '琢磨桌面接口不可用，请重新启动客户端。'
            : 'The 琢磨 desktop bridge is unavailable. Restart the client.'
        )
        return
      }
      const config = await bridge.getConfig()
      if (config.theme) setTheme(config.theme as ThemeName)
      if (config.density) setDensity(config.density as DensityName)
      setSkinPreferences(config.uiSkins)
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
        skinPreferences={skinPreferences}
        aiStatus={aiStatus}
        error={error}
        onTheme={setTheme}
        onDensity={setDensity}
        onLanguage={setLanguage}
        onSkinPreferences={setSkinPreferences}
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
        skinPreferences={skinPreferences}
        aiStatus={aiStatus}
        onTheme={setTheme}
        onDensity={setDensity}
        onLanguage={setLanguage}
        onSkinPreferences={setSkinPreferences}
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
  skinPreferences,
  aiStatus,
  error,
  onTheme,
  onDensity,
  onLanguage,
  onSkinPreferences,
  onAIStatus,
  onRefresh,
  onOpen
}: {
  writingWorkspace: string | null
  projects: ProjectListItem[]
  theme: ThemeName
  density: DensityName
  language: LanguageName
  skinPreferences?: UISkinPreferencesV1
  aiStatus: AIStatus
  error: string | null
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
  onLanguage: (language: LanguageName) => void
  onSkinPreferences: (preferences: UISkinPreferencesV1 | undefined) => void
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
  const [wizard, setWizard] = useState<'audience' | 'writer' | 'form' | 'oc' | null>(null)
  const [pendingCardImport, setPendingCardImport] = useState<{ sourcePath: string; title: string } | null>(
    null
  )

  const chooseWritingWorkspace = async () => {
    await bridge.chooseWorkspace()
    await onRefresh()
  }

  const chooseProject = async () => {
    const project = await bridge.chooseProject()
    if (project) onOpen(project.root)
  }

  const create = async (role: WorkRole) => {
    if (pendingCardImport) {
      try {
        const result = await bridge.importBookCharacterCardProject(
          pendingCardImport.sourcePath,
          pendingCardImport.title,
          role
        )
        setWizard(null)
        setPendingCardImport(null)
        await onRefresh()
        onOpen(result.project.root)
      } catch (cause) {
        window.alert(formatDesktopError(cause, language))
      }
      return
    }
    if (!form.title.trim()) return
    try {
      const project = await bridge.createProject({ ...form, defaultTheme: theme, role })
      setWizard(null)
      await onRefresh()
      onOpen(project.root)
    } catch (cause) {
      window.alert(formatDesktopError(cause, language))
    }
  }

  const importBookCard = async () => {
    if (!writingWorkspace) return
    try {
      const inspection = await bridge.chooseBookCharacterCard()
      if (!inspection) return
      const title = window.prompt(
        zh ? '确认或修改新作品名' : 'Confirm or edit the new work title',
        inspection.name
      )
      if (title === null || !title.trim()) return
      setPendingCardImport({ sourcePath: inspection.sourcePath, title: title.trim() })
      setWizard('audience')
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
        skinPreferences={skinPreferences}
        aiStatus={aiStatus}
        onTheme={onTheme}
        onDensity={onDensity}
        onLanguage={onLanguage}
        onSkinPreferences={onSkinPreferences}
        onAIStatus={onAIStatus}
      />
      <div className="library">
        <aside className="library-side">
          <div>
            <span className="library-label">{t(language, 'localWritingLibrary')}</span>
            <code>{writingWorkspace ?? t(language, 'workspaceNotSet')}</code>
            <button className="secondary" onClick={chooseWritingWorkspace}>
              {writingWorkspace ? t(language, 'changeLocalWorkspace') : t(language, 'chooseLocalWorkspace')}
            </button>
          </div>
          <p className="library-hint">{t(language, 'localWritingLibraryHint')}</p>
          <div className="library-side-actions">
            <button className="secondary" onClick={chooseProject}>
              {t(language, 'openExistingProject')}
            </button>
            <button className="secondary" onClick={importBookCard} disabled={!writingWorkspace}>
              {zh ? '从角色卡导入' : 'Import a character card'}
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
          <p className="library-colophon">{t(language, 'welcomeSubtitle')}</p>
        </aside>
        <section className="library-main" aria-label={t(language, 'novelProjects')}>
          <form
            className="library-toolbar"
            onSubmit={(event) => {
              event.preventDefault()
              if (!form.title.trim()) return
              setPendingCardImport(null)
              setWizard('audience')
            }}
          >
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t(language, 'novelTitle')}
              aria-label={t(language, 'novelTitle')}
            />
            <button className="secondary" type="submit" disabled={!writingWorkspace || !form.title.trim()}>
              {zh ? '新建' : 'New'}
            </button>
          </form>
          {wizard && (
            <section className="library-wizard" aria-label={zh ? '新建作品问卷' : 'New work questionnaire'}>
              {wizard === 'audience' && (
                <>
                  <p>
                    {zh
                      ? '这部作品里，你是作家，还是 OC 人？'
                      : 'In this work, are you a writer or an OC keeper?'}
                  </p>
                  <div className="wizard-actions">
                    <button type="button" onClick={() => setWizard('writer')}>
                      {zh ? '作家' : 'Writer'}
                    </button>
                    <button type="button" onClick={() => setWizard('oc')}>
                      {zh ? 'OC 人' : 'OC keeper'}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setWizard(null)
                        setPendingCardImport(null)
                      }}
                    >
                      {zh ? '取消' : 'Cancel'}
                    </button>
                  </div>
                </>
              )}
              {wizard === 'writer' && (
                <>
                  <p>{zh ? '正文谁来写？' : 'Who writes the prose?'}</p>
                  <div className="wizard-actions">
                    <button type="button" onClick={() => void create('traditional_writer')}>
                      {zh ? '自己写' : 'I write it'}
                    </button>
                    <button type="button" onClick={() => setWizard('form')}>
                      {zh ? 'AI 帮我写' : 'AI helps me write'}
                    </button>
                    <button type="button" className="secondary" onClick={() => setWizard('audience')}>
                      {zh ? '返回' : 'Back'}
                    </button>
                  </div>
                </>
              )}
              {wizard === 'form' && (
                <>
                  <p>{zh ? '写小说，还是写短剧？' : 'A novel, or a short drama?'}</p>
                  <div className="wizard-actions">
                    <button type="button" onClick={() => void create('ai_writer')}>
                      {zh ? '写小说' : 'Novel'}
                    </button>
                    <button type="button" onClick={() => void create('ai_screenwriter')}>
                      {zh ? '写短剧' : 'Short drama'}
                    </button>
                    <button type="button" className="secondary" onClick={() => setWizard('writer')}>
                      {zh ? '返回' : 'Back'}
                    </button>
                  </div>
                </>
              )}
              {wizard === 'oc' && (
                <>
                  <p>
                    {zh
                      ? '接受生成式 AI 吗？接受会同时打开节与生文、展示层与生图、短剧导出。'
                      : 'Accept generative AI? Accepting also turns on scene prose, the display layer and image generation, and short-drama export.'}
                  </p>
                  <div className="wizard-actions">
                    <button type="button" onClick={() => void create('oc_person')}>
                      {zh ? '不接受' : 'No'}
                    </button>
                    <button type="button" onClick={() => void create('ai_native')}>
                      {zh ? '接受' : 'Yes'}
                    </button>
                    <button type="button" className="secondary" onClick={() => setWizard('audience')}>
                      {zh ? '返回' : 'Back'}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          <details className="library-measures">
            <summary>{zh ? '类型与篇幅' : 'Genre and length'}</summary>
            <div className="library-measures-body">
              <label className="zhuomo-field">
                <span>{zh ? '类型' : 'Genre'}</span>
                <input value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value })} />
              </label>
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
            </div>
          </details>
          {!writingWorkspace && <p className="library-note">{t(language, 'selectLocalBeforeCreate')}</p>}
          <div className="library-list">
            {projects.length === 0 ? (
              <div className="empty">{t(language, 'noProjects')}</div>
            ) : (
              <div className="project-list">
                {projects.map((project) => (
                  <button key={project.root} className="project-row" onClick={() => onOpen(project.root)}>
                    <span>
                      <strong>{project.title}</strong>
                      <small>{project.genre}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
