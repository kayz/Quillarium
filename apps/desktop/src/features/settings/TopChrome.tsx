import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Circle,
  Download,
  GitBranch,
  PenLine,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import type {
  AIProfileForm,
  AIProfileName,
  AIProviderName,
  AIStatus,
  DensityName,
  GitHubSettings,
  GitState,
  LanguageName,
  ThemeName,
  WorkspaceMode
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { bridge } from '../../app/bridge.js'
import { BrandWordmark } from '../../app/BrandWordmark.js'
import { formatDesktopError } from '../../shared/errors.js'
import { ExportModal } from './ExportModal.js'
import type { WritingPresetListItem } from '@quillarium/core'

export function TopChrome({
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
  projectName?: string
  path?: string
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
  const [showSettings, setShowSettings] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const gitAction = gitActionFor(language, git)
  return (
    <header className="top-chrome">
      <button className="brand" onClick={onBack} aria-label="Quillarium" title="Quillarium">
        <BrandWordmark className="top-brand-wordmark" decorative />
      </button>
      {projectName && (
        <div className="project-label">
          {projectName}
          {locationLabel ? ` / ${locationLabel}` : path ? ` / ${path}` : ''}
        </div>
      )}
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
      {root && (
        <button className="status-pill" onClick={() => setShowExport(true)} title={t(language, 'exportHint')}>
          <Download size={14} /> {t(language, 'exportAction')}
        </button>
      )}
      <button
        className={`status-pill ai-status ${aiStatusTone(aiStatus)}`}
        onClick={() => setShowSettings(true)}
        title={t(language, 'configureAI')}
      >
        <Circle size={10} aria-hidden="true" />{' '}
        {root ? (
          aiStatus.ready ? (
            t(language, 'aiReady')
          ) : aiStatus.prose || aiStatus.background || aiStatus.check ? (
            language === 'zh' ? (
              'AI 部分配置'
            ) : (
              'AI partly configured'
            )
          ) : (
            t(language, 'aiNotConfigured')
          )
        ) : (
          <span className="sr-only">
            {aiStatus.ready
              ? t(language, 'aiReady')
              : aiStatus.prose || aiStatus.background || aiStatus.check
                ? language === 'zh'
                  ? 'AI 部分配置'
                  : 'AI partly configured'
                : t(language, 'aiNotConfigured')}
          </span>
        )}
      </button>
      {root && git ? (
        <button
          className="status-pill"
          onClick={
            git.remote
              ? onGitSync
              : git.repositoryScope === 'workspace'
                ? () => setShowSettings(true)
                : onGitCreateRemote
          }
          title={gitAction.title}
          disabled={gitBusy}
        >
          <GitBranch size={14} /> {gitBusy ? gitBusyLabel(language, git) : gitAction.label}
        </button>
      ) : null}
      <button className="status-pill" onClick={() => setShowSettings(true)}>
        {t(language, 'settings')}
      </button>
      {showSettings && (
        <SettingsModal
          root={root}
          git={git ?? null}
          theme={theme}
          density={density}
          language={language}
          onTheme={onTheme}
          onDensity={onDensity}
          onLanguage={onLanguage}
          onAIStatus={onAIStatus}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showExport && root && (
        <ExportModal root={root} language={language} onClose={() => setShowExport(false)} />
      )}
    </header>
  )
}

function aiStatusTone(status: AIStatus): 'green' | 'amber' | 'red' {
  if (status.ready) return 'green'
  if (status.prose || status.background || status.check) return 'amber'
  return 'red'
}

function gitActionFor(language: LanguageName, git?: GitState | null): { label: string; title: string } {
  if (!git)
    return {
      label: t(language, 'githubCredentials'),
      title: t(language, 'configureGithub')
    }
  if (!git.initialized)
    return {
      label: t(language, 'createGithubRepo'),
      title: t(language, 'createGithubRepoHint')
    }
  if (!git.remote)
    return {
      label:
        git.repositoryScope === 'workspace'
          ? language === 'zh'
            ? '工作区 Git'
            : 'Workspace Git'
          : t(language, 'githubNotLinked'),
      title:
        git.repositoryScope === 'workspace'
          ? language === 'zh'
            ? '请在写作工作区仓库根目录配置 remote。'
            : 'Configure the remote at the writing workspace repository root.'
          : t(language, 'linkGithubRepoHint')
    }
  if (git.dirty)
    return {
      label: t(language, 'githubChangesPending'),
      title: t(language, 'syncGithubChangesHint')
    }
  return {
    label: t(language, 'githubSynced'),
    title: t(language, 'githubSyncedHint')
  }
}

function gitBusyLabel(language: LanguageName, git?: GitState | null): string {
  return git?.remote ? t(language, 'githubSyncing') : t(language, 'githubCreating')
}

type DesktopConfig = Awaited<ReturnType<typeof bridge.getConfig>>
type StorageStatus = DesktopConfig['aiKeyStorage']
type CredentialState = 'available' | 'unavailable' | 'none'
type SettingsNotice = { tone: 'success' | 'danger'; message: string }

const AI_PROFILE_NAMES = ['prose', 'background', 'check'] as const satisfies readonly AIProfileName[]

function SettingsModal({
  root,
  git,
  theme,
  density,
  language,
  onTheme,
  onDensity,
  onLanguage,
  onAIStatus,
  onClose
}: {
  root?: string
  git: GitState | null
  theme: ThemeName
  density: DensityName
  language: LanguageName
  onTheme: (theme: ThemeName) => void
  onDensity: (density: DensityName) => void
  onLanguage: (language: LanguageName) => void
  onAIStatus: (status: AIStatus) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const [github, setGithub] = useState<GitHubSettings>({
    token: '',
    defaultOwner: '',
    defaultVisibility: 'private'
  })
  const [githubHasToken, setGithubHasToken] = useState(false)
  const [profiles, setProfiles] = useState<Record<AIProfileName, AIProfileForm>>({
    prose: defaultAIProfile('openai-compatible'),
    background: defaultAIProfile('openai-compatible'),
    check: defaultAIProfile('openai-compatible')
  })
  const [profileCredentials, setProfileCredentials] = useState<Record<AIProfileName, CredentialState>>({
    prose: 'none',
    background: 'none',
    check: 'none'
  })
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [writingPresets, setWritingPresets] = useState<WritingPresetListItem[]>([])
  const [selectedPreset, setSelectedPreset] = useState('')
  const [display, setDisplay] = useState({ theme, density, language })
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<SettingsNotice | null>(null)

  useEffect(() => {
    setDisplay({ theme, density, language })
  }, [theme, density, language])

  const updateCredentialMetadata = (config: DesktopConfig) => {
    const profileState = (profile: AIProfileName): CredentialState => {
      const credential = config.aiProfiles?.[profile]
      if (!credential?.hasKey) return 'none'
      return credential.keyStatus === 'unavailable' ? 'unavailable' : 'available'
    }
    setStorage(config.aiKeyStorage)
    setGithubHasToken(config.github?.hasToken ?? false)
    setProfileCredentials({
      prose: profileState('prose'),
      background: profileState('background'),
      check: profileState('check')
    })
  }

  const hydrateForms = (config: DesktopConfig) => {
    updateCredentialMetadata(config)
    setGithub({
      // Never hydrate secret masks or stored values back into renderer form state.
      token: '',
      defaultOwner: config.github?.defaultOwner ?? '',
      defaultVisibility: config.github?.defaultVisibility ?? 'private'
    })
    const nextProfiles = {} as Record<AIProfileName, AIProfileForm>
    for (const profile of AI_PROFILE_NAMES) {
      const stored = config.aiProfiles?.[profile]
      const provider = stored?.provider ?? 'openai-compatible'
      const defaults = defaultAIProfile(provider)
      nextProfiles[profile] = {
        provider,
        baseUrl: stored?.baseUrl ?? defaults.baseUrl,
        apiKey: '',
        model: stored?.model ?? defaults.model,
        temperature: stored?.temperature ?? defaults.temperature,
        maxTokens: stored?.maxTokens ?? defaults.maxTokens
      }
    }
    setProfiles(nextProfiles)
  }

  useEffect(() => {
    let cancelled = false
    async function loadProfiles() {
      try {
        const [config, loadedPresets, loadedAppVersion] = await Promise.all([
          bridge.getConfig(),
          root ? bridge.listWritingPresets(root) : Promise.resolve([]),
          bridge.getAppVersion()
        ])
        const presets = loadedPresets as WritingPresetListItem[]
        if (!cancelled) {
          hydrateForms(config)
          setAppVersion(loadedAppVersion)
          setWritingPresets(presets)
          setSelectedPreset(presets.find((preset) => preset.selected)?.id ?? '')
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            tone: 'danger',
            message: `${t(language, 'credentialActionFailed')} ${formatDesktopError(error, language)}`
          })
        }
      }
    }
    void loadProfiles()
    return () => {
      cancelled = true
    }
  }, [language, root])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busyAction === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busyAction, onClose])

  const saveAI = async (profile: AIProfileName) => {
    setBusyAction(`save-ai-${profile}`)
    setNotice(null)
    try {
      const config = await bridge.saveAIProfile(profile, profiles[profile])
      updateCredentialMetadata(config)
      setProfiles((current) => ({
        ...current,
        [profile]: { ...current[profile], apiKey: '' }
      }))
      onAIStatus(await bridge.aiStatus())
      setNotice({ tone: 'success', message: `${t(language, profile)}：${t(language, 'aiSettingsSaved')}` })
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: `${t(language, 'credentialActionFailed')} ${formatDesktopError(error, language)}`
      })
    } finally {
      setBusyAction(null)
    }
  }

  const saveDisplay = async () => {
    setBusyAction('save-display')
    setNotice(null)
    try {
      await bridge.setTheme(display.theme)
      await bridge.setDensity(display.density)
      await bridge.setLanguage(display.language)
      onTheme(display.theme)
      onDensity(display.density)
      onLanguage(display.language)
      setNotice({
        tone: 'success',
        message: display.language === 'zh' ? '显示设置已保存。' : 'Display settings saved.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const saveGithub = async () => {
    setBusyAction('save-github')
    setNotice(null)
    try {
      const config = await bridge.saveGithub(github)
      updateCredentialMetadata(config)
      setGithub((current) => ({ ...current, token: '' }))
      setNotice({ tone: 'success', message: t(language, 'githubSettingsSaved') })
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: `${t(language, 'credentialActionFailed')} ${formatDesktopError(error, language)}`
      })
    } finally {
      setBusyAction(null)
    }
  }

  const saveWritingPreset = async () => {
    if (!root || !selectedPreset) return
    setBusyAction('save-writing-preset')
    setNotice(null)
    try {
      await bridge.selectWritingPreset(root, selectedPreset)
      const presets = (await bridge.listWritingPresets(root)) as WritingPresetListItem[]
      setWritingPresets(presets)
      setSelectedPreset(presets.find((preset) => preset.selected)?.id ?? selectedPreset)
      setNotice({
        tone: 'success',
        message:
          language === 'zh'
            ? '写作预设已选择；只影响之后创建的运行记录。'
            : 'Writing preset selected; only future runs are affected.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const initializeWritingPreset = async () => {
    if (!root) return
    setBusyAction('initialize-writing-preset')
    setNotice(null)
    try {
      await bridge.initializeDefaultWritingPreset(root)
      const presets = (await bridge.listWritingPresets(root)) as WritingPresetListItem[]
      setWritingPresets(presets)
      setSelectedPreset(presets.find((preset) => preset.selected)?.id ?? 'default')
      setNotice({
        tone: 'success',
        message:
          language === 'zh'
            ? '默认写作预设已创建并选中；项目现在可以生成新的运行记录。'
            : 'The default writing preset was created and selected; the project can now create generation runs.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const clearAIKey = async (profile: AIProfileName) => {
    setBusyAction(`clear-ai-${profile}`)
    setNotice(null)
    try {
      const config = await bridge.saveAIProfile(profile, {
        ...profiles[profile],
        apiKey: '',
        clearApiKey: true
      })
      updateCredentialMetadata(config)
      setProfiles((current) => ({
        ...current,
        [profile]: { ...current[profile], apiKey: '' }
      }))
      onAIStatus(await bridge.aiStatus())
      setNotice({
        tone: 'success',
        message: `${t(language, profile)}: ${t(language, 'apiKeyCleared')}`
      })
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: `${t(language, 'credentialActionFailed')} ${formatDesktopError(error, language)}`
      })
    } finally {
      setBusyAction(null)
    }
  }

  const clearGithubToken = async () => {
    setBusyAction('clear-github')
    setNotice(null)
    try {
      const config = await bridge.saveGithub({
        ...github,
        token: '',
        clearToken: true
      })
      updateCredentialMetadata(config)
      setGithub((current) => ({ ...current, token: '' }))
      setNotice({ tone: 'success', message: t(language, 'githubTokenCleared') })
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: `${t(language, 'credentialActionFailed')} ${formatDesktopError(error, language)}`
      })
    } finally {
      setBusyAction(null)
    }
  }

  const refreshCredentials = async () => {
    setBusyAction('refresh-credentials')
    setNotice(null)
    try {
      // getConfig performs the backend's automatic plaintext-to-encrypted migration.
      const config = await bridge.getConfig()
      updateCredentialMetadata(config)
      onAIStatus(await bridge.aiStatus())
      setNotice({ tone: 'success', message: t(language, 'credentialsChecked') })
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: `${t(language, 'credentialActionFailed')} ${formatDesktopError(error, language)}`
      })
    } finally {
      setBusyAction(null)
    }
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

  const githubCredentialState: CredentialState = githubHasToken
    ? githubCredentialUnavailable(storage)
      ? 'unavailable'
      : 'available'
    : 'none'
  const storageEncrypted = storage?.mode === 'encrypted'
  const storageHealthy = storageEncrypted && !storage.warning

  return (
    <div className="modal-backdrop">
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-modal-head">
          <div>
            <h2 id="settings-title">{t(language, 'settings')}</h2>
            <p>{t(language, 'privacyHint')}</p>
            <span className="settings-version">
              Quillarium · {language === 'zh' ? '版本' : 'Version'} {appVersion || '…'}
            </span>
          </div>
          <button
            ref={closeRef}
            className="secondary"
            type="button"
            onClick={onClose}
            disabled={busyAction !== null}
          >
            {t(language, 'close')}
          </button>
        </header>
        <section
          className={`credential-security-band ${storageHealthy ? 'is-encrypted' : 'is-warning'}`}
          aria-live="polite"
        >
          <div className="credential-security-icon" aria-hidden="true">
            {storageHealthy ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
          </div>
          <div className="credential-security-copy">
            <span>{t(language, 'credentialSecurity')}</span>
            <strong>
              {storage
                ? storageEncrypted
                  ? t(language, 'encryptedStorage')
                  : t(language, 'plaintextFallback')
                : t(language, 'checkingCredentials')}
            </strong>
            <p title={storage?.warning ?? undefined}>{storageStatusMessage(language, storage)}</p>
          </div>
          <button
            className="secondary credential-refresh"
            type="button"
            onClick={refreshCredentials}
            disabled={busyAction !== null}
          >
            <RefreshCw size={15} className={busyAction === 'refresh-credentials' ? 'spin' : ''} />
            {busyAction === 'refresh-credentials'
              ? t(language, 'checkingCredentials')
              : t(language, 'checkMigrateCredentials')}
          </button>
        </section>
        {notice && (
          <p
            className={`settings-notice ${notice.tone}`}
            role={notice.tone === 'danger' ? 'alert' : 'status'}
          >
            {notice.message}
          </p>
        )}
        <div className="settings-group">
          <div className="settings-section-head">
            <h3>{language === 'zh' ? '显示' : 'Display'}</h3>
            <button className="secondary" type="button" onClick={saveDisplay} disabled={busyAction !== null}>
              {busyAction === 'save-display'
                ? t(language, 'saving')
                : language === 'zh'
                  ? '保存显示'
                  : 'Save display'}
            </button>
          </div>
          <div className="settings-grid three display-settings-grid">
            <label>
              {language === 'zh' ? '主题' : 'Theme'}
              <select
                value={display.theme}
                onChange={(event) => setDisplay({ ...display, theme: event.target.value as ThemeName })}
              >
                {(['paper', 'ink', 'mist', 'bamboo'] as ThemeName[]).map((item) => (
                  <option key={item} value={item}>
                    {t(language, item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {language === 'zh' ? '密度' : 'Density'}
              <select
                value={display.density}
                onChange={(event) => setDisplay({ ...display, density: event.target.value as DensityName })}
              >
                <option value="comfortable">{t(language, 'comfortable')}</option>
                <option value="compact">{t(language, 'compact')}</option>
              </select>
            </label>
            <label>
              {language === 'zh' ? '语言' : 'Language'}
              <select
                value={display.language}
                onChange={(event) => setDisplay({ ...display, language: event.target.value as LanguageName })}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </div>
        <div className="settings-group">
          <div className="settings-section-head">
            <h3>{t(language, 'globalGithubSettings')}</h3>
            <div className="settings-section-actions">
              <CredentialBadge state={githubCredentialState} language={language} />
              <button className="secondary" type="button" onClick={saveGithub} disabled={busyAction !== null}>
                {busyAction === 'save-github' ? t(language, 'saving') : t(language, 'saveGithub')}
              </button>
            </div>
          </div>
          <div className="settings-grid two">
            <div className="credential-field">
              <span>{t(language, 'githubToken')}</span>
              <div className="credential-input-row">
                <input
                  type="password"
                  value={github.token}
                  onChange={(e) => setGithub({ ...github, token: e.target.value })}
                  placeholder={credentialPlaceholder(language, githubCredentialState, 'github')}
                  aria-label={t(language, 'githubToken')}
                  autoComplete="new-password"
                  spellCheck={false}
                />
                <button
                  className="credential-clear"
                  type="button"
                  onClick={clearGithubToken}
                  disabled={!githubHasToken || busyAction !== null}
                  title={t(language, 'clearGithubToken')}
                >
                  <Trash2 size={14} /> {t(language, 'clear')}
                </button>
              </div>
              <small>{t(language, 'blankKeepsCredential')}</small>
            </div>
            <label>
              {t(language, 'defaultOwner')}
              <input
                value={github.defaultOwner}
                onChange={(e) => setGithub({ ...github, defaultOwner: e.target.value })}
                placeholder="user-or-org"
              />
            </label>
            <label>
              {t(language, 'defaultVisibility')}
              <select
                value={github.defaultVisibility}
                onChange={(e) =>
                  setGithub({
                    ...github,
                    defaultVisibility: e.target.value as GitHubSettings['defaultVisibility']
                  })
                }
              >
                <option value="private">{language === 'zh' ? '私有' : 'Private'}</option>
                <option value="public">{language === 'zh' ? '公开' : 'Public'}</option>
              </select>
            </label>
          </div>
        </div>
        {root && (
          <div className="settings-group">
            <h3>{t(language, 'currentNovelGit')}</h3>
            <p className="muted">
              {git?.repositoryScope === 'workspace'
                ? language === 'zh'
                  ? '当前作品属于写作工作区仓库；remote 与同步在工作区根生效，作品提交仍只包含当前项目。'
                  : 'This project belongs to the writing workspace repository. Remote and sync apply at the workspace root, while project commits remain scoped to this project.'
                : t(language, 'currentNovelGitHint')}
            </p>
            <div className="settings-grid two">
              <label>
                {t(language, 'currentRemote')}
                <input value={git?.remote ?? t(language, 'notLinked')} readOnly />
              </label>
              <label>
                {t(language, 'currentBranch')}
                <input value={git?.branch ?? t(language, 'notInitialized')} readOnly />
              </label>
            </div>
          </div>
        )}
        {root && (
          <div className="settings-group">
            <div className="settings-section-head">
              <div>
                <h3>{language === 'zh' ? '写作预设' : 'Writing preset'}</h3>
                <p className="muted">
                  {language === 'zh'
                    ? '组合模型参数、提示词栈、上下文预算和检查策略。每次生成都会保存无密钥快照。'
                    : 'Combines model parameters, prompt stack, context budget, and check policy. Every generation saves a credential-free snapshot.'}
                </p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={writingPresets.length ? saveWritingPreset : initializeWritingPreset}
                disabled={(writingPresets.length > 0 && !selectedPreset) || busyAction !== null}
              >
                {busyAction === 'save-writing-preset' || busyAction === 'initialize-writing-preset'
                  ? t(language, 'saving')
                  : writingPresets.length === 0
                    ? language === 'zh'
                      ? '创建默认预设'
                      : 'Create default preset'
                    : language === 'zh'
                      ? '选择预设'
                      : 'Select preset'}
              </button>
            </div>
            <div className="settings-grid two">
              <label>
                {language === 'zh' ? '当前预设' : 'Current preset'}
                <select value={selectedPreset} onChange={(event) => setSelectedPreset(event.target.value)}>
                  {writingPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.title} · v{preset.version}
                    </option>
                  ))}
                </select>
                <small>
                  {writingPresets.find((preset) => preset.id === selectedPreset)?.description ||
                    (language === 'zh' ? '项目中没有可用预设。' : 'No project presets are available.')}
                </small>
              </label>
              <label>
                {language === 'zh' ? '预设文件' : 'Preset file'}
                <input
                  value={writingPresets.find((preset) => preset.id === selectedPreset)?.source_path ?? ''}
                  readOnly
                />
                <small>
                  {language === 'zh'
                    ? '预设是项目内可版本控制的纯 YAML 数据，不含连接地址或密钥。'
                    : 'Presets are versioned project YAML data and contain no endpoint or credentials.'}
                </small>
              </label>
            </div>
          </div>
        )}
        <h3>{t(language, 'aiSettings')}</h3>
        <div className="ai-profile-grid">
          {AI_PROFILE_NAMES.map((profile) => (
            <article key={profile} className="ai-profile-card">
              <div className="ai-profile-card-head">
                <strong>{t(language, profile)}</strong>
                <div className="settings-section-actions">
                  <CredentialBadge state={profileCredentials[profile]} language={language} />
                  <button
                    className="secondary compact-save"
                    type="button"
                    onClick={() => void saveAI(profile)}
                    disabled={busyAction !== null}
                  >
                    {busyAction === `save-ai-${profile}` ? t(language, 'saving') : t(language, 'save')}
                  </button>
                </div>
              </div>
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
              <div className="credential-field ai-credential-field">
                <span>{t(language, 'apiKey')}</span>
                <div className="credential-input-row">
                  <input
                    type="password"
                    value={profiles[profile].apiKey}
                    onChange={(e) => updateProfile(profile, { apiKey: e.target.value })}
                    placeholder={credentialPlaceholder(language, profileCredentials[profile], 'ai')}
                    aria-label={`${t(language, profile)} ${t(language, 'apiKey')}`}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <button
                    className="credential-clear"
                    type="button"
                    onClick={() => clearAIKey(profile)}
                    disabled={profileCredentials[profile] === 'none' || busyAction !== null}
                    title={t(language, 'clearApiKey')}
                  >
                    <Trash2 size={14} /> {t(language, 'clear')}
                  </button>
                </div>
                <small>{t(language, 'blankKeepsCredential')}</small>
              </div>
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
        </div>
      </section>
    </div>
  )
}

function CredentialBadge({ state, language }: { state: CredentialState; language: LanguageName }) {
  const label =
    state === 'available'
      ? t(language, 'credentialStored')
      : state === 'unavailable'
        ? t(language, 'credentialUnavailable')
        : t(language, 'credentialNotSet')
  return (
    <span className={`credential-status ${state}`}>
      <Circle size={8} aria-hidden="true" /> {label}
    </span>
  )
}

function credentialPlaceholder(
  language: LanguageName,
  state: CredentialState,
  kind: 'ai' | 'github'
): string {
  if (state === 'unavailable') {
    return kind === 'ai' ? t(language, 'reenterApiKey') : t(language, 'reenterGithubToken')
  }
  if (state === 'available') return t(language, 'leaveBlankToKeep')
  return kind === 'ai' ? t(language, 'enterApiKey') : t(language, 'enterGithubToken')
}

function githubCredentialUnavailable(storage: StorageStatus | null): boolean {
  const warning = storage?.warning?.toLowerCase() ?? ''
  return warning.includes('github') && warning.includes('decrypt')
}

function storageStatusMessage(language: LanguageName, storage: StorageStatus | null): string {
  if (!storage) return t(language, 'checkingCredentialsHint')
  if (!storage.warning) return t(language, 'encryptedStorageHint')
  const warning = storage.warning.toLowerCase()
  if (!storage.encryptionAvailable) return t(language, 'plaintextFallbackWarning')
  if (warning.includes('github') && warning.includes('decrypt')) {
    return t(language, 'githubTokenDecryptWarning')
  }
  if (warning.includes('ai api key') && warning.includes('decrypt')) {
    return t(language, 'aiKeyDecryptWarning')
  }
  if (warning.includes('migrate') || warning.includes('plaintext value remains')) {
    return t(language, 'credentialMigrationWarning')
  }
  return t(language, 'credentialStorageWarning')
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
