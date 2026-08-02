import { useEffect, useState } from 'react'
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
import { ExportModal } from './ExportModal.js'

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
  const [showExport, setShowExport] = useState(false)
  const gitAction = gitActionFor(language, git)
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
      {root && (
        <button className="status-pill" onClick={() => setShowExport(true)} title={t(language, 'exportHint')}>
          <Download size={14} /> {t(language, 'exportAction')}
        </button>
      )}
      <button
        className="status-pill"
        onClick={() => setShowSettings(true)}
        title={t(language, 'configureAI')}
      >
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
          <GitBranch size={14} /> {gitBusy ? gitBusyLabel(language, git) : gitAction.label}
        </button>
      ) : (
        <button
          className="status-pill"
          onClick={() => setShowSettings(true)}
          title={t(language, 'configureGithub')}
        >
          <GitBranch size={14} /> {t(language, 'githubCredentials')}
        </button>
      )}
      <select
        className="theme-select"
        value={theme}
        onChange={async (e) => {
          const next = e.target.value as ThemeName
          onTheme(next)
          await bridge.setTheme(next)
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
          await bridge.setDensity(next)
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
          await bridge.setLanguage(next)
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
      {showExport && root && (
        <ExportModal root={root} language={language} onClose={() => setShowExport(false)} />
      )}
    </header>
  )
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
      label: t(language, 'githubNotLinked'),
      title: t(language, 'linkGithubRepoHint')
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
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<SettingsNotice | null>(null)

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
        const config = await bridge.getConfig()
        if (!cancelled) hydrateForms(config)
      } catch (error) {
        if (!cancelled) {
          setNotice({
            tone: 'danger',
            message: `${t(language, 'credentialActionFailed')} ${formatSettingsError(error)}`
          })
        }
      }
    }
    void loadProfiles()
    return () => {
      cancelled = true
    }
  }, [language])

  const saveAI = async () => {
    setBusyAction('save-ai')
    setNotice(null)
    try {
      let config: DesktopConfig | null = null
      for (const profile of AI_PROFILE_NAMES) {
        config = await bridge.saveAIProfile(profile, profiles[profile])
      }
      if (config) updateCredentialMetadata(config)
      setProfiles((current) => ({
        prose: { ...current.prose, apiKey: '' },
        background: { ...current.background, apiKey: '' },
        check: { ...current.check, apiKey: '' }
      }))
      onAIStatus(await bridge.aiStatus())
      setNotice({ tone: 'success', message: t(language, 'aiSettingsSaved') })
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: `${t(language, 'credentialActionFailed')} ${formatSettingsError(error)}`
      })
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
        message: `${t(language, 'credentialActionFailed')} ${formatSettingsError(error)}`
      })
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
        message: `${t(language, 'credentialActionFailed')} ${formatSettingsError(error)}`
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
        message: `${t(language, 'credentialActionFailed')} ${formatSettingsError(error)}`
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
        message: `${t(language, 'credentialActionFailed')} ${formatSettingsError(error)}`
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
      <section className="modal settings-modal">
        <h2>{t(language, 'settings')}</h2>
        <p>{t(language, 'privacyHint')}</p>
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
            <h3>{t(language, 'globalGithubSettings')}</h3>
            <CredentialBadge state={githubCredentialState} language={language} />
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
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
          </div>
        </div>
        {root && (
          <div className="settings-group">
            <h3>{t(language, 'currentNovelGit')}</h3>
            <p className="muted">{t(language, 'currentNovelGitHint')}</p>
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
        <h3>{t(language, 'aiSettings')}</h3>
        <div className="ai-profile-grid">
          {AI_PROFILE_NAMES.map((profile) => (
            <article key={profile} className="ai-profile-card">
              <div className="ai-profile-card-head">
                <strong>{t(language, profile)}</strong>
                <CredentialBadge state={profileCredentials[profile]} language={language} />
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
          <button className="primary" onClick={saveGithub} disabled={busyAction !== null}>
            {busyAction === 'save-github' ? t(language, 'saving') : t(language, 'saveGithub')}
          </button>
          <button className="primary" onClick={saveAI} disabled={busyAction !== null}>
            {busyAction === 'save-ai' ? t(language, 'saving') : t(language, 'saveAI')}
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

function formatSettingsError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
