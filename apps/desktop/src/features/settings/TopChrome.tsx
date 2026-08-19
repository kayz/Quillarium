import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Circle,
  Download,
  GitBranch,
  PenLine,
  RefreshCw,
  Save,
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
  DocEntry,
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
import { gitActionFor } from './git-presentation.js'
import type {
  BookGenerationHeaderState,
  StoryStructureConfigV1,
  WritingPresetListItem
} from '@quillarium/core'

type CoverResult = NonNullable<Awaited<ReturnType<typeof bridge.getProjectCover>>>

interface Ccv3ExportChoice {
  id: string
  type: 'timeline_event' | 'character_state'
  title: string
}

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
  onWorkspaceMode,
  onProjectChanged
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
  onProjectChanged?: () => void | Promise<void>
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
          onClick={git.remote ? onGitSync : () => setShowSettings(true)}
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
          onGitCreateRemote={onGitCreateRemote}
          onProjectChanged={onProjectChanged}
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

function gitBusyLabel(language: LanguageName, git?: GitState | null): string {
  return git?.remote ? t(language, 'githubSyncing') : t(language, 'githubCreating')
}

type DesktopConfig = Awaited<ReturnType<typeof bridge.getConfig>>
type ModelCapability = Awaited<ReturnType<typeof bridge.getModelCapabilities>>[number]
type UpdateCheck = Awaited<ReturnType<typeof bridge.checkForUpdates>>
type StorageStatus = DesktopConfig['aiKeyStorage']
type CredentialState = 'available' | 'unavailable' | 'none'
type SettingsNotice = { tone: 'success' | 'danger'; message: string }

const AI_PROFILE_NAMES = ['prose', 'background', 'check'] as const satisfies readonly AIProfileName[]

function updateStatusMessage(language: LanguageName, result: UpdateCheck): string {
  if (result.status === 'available') {
    return language === 'zh'
      ? `发现新版本 ${result.latestVersion}；当前版本为 ${result.currentVersion}。`
      : `Version ${result.latestVersion} is available; the current version is ${result.currentVersion}.`
  }
  if (result.status === 'up-to-date') {
    return language === 'zh'
      ? `当前版本 ${result.currentVersion} 已是此通道的最新版本。`
      : `Version ${result.currentVersion} is current for this release channel.`
  }
  const messages: Record<NonNullable<UpdateCheck['reason']>, { zh: string; en: string }> = {
    network: {
      zh: '暂时无法连接 GitHub Releases，请检查网络后重试。',
      en: 'GitHub Releases could not be reached. Check the network and try again.'
    },
    'rate-limited': {
      zh: 'GitHub 暂时限制了匿名查询频率，请稍后再试。',
      en: 'GitHub temporarily rate-limited anonymous checks. Try again later.'
    },
    'service-error': {
      zh: 'GitHub Releases 暂时不可用，请稍后再试。',
      en: 'GitHub Releases is temporarily unavailable. Try again later.'
    },
    'invalid-response': {
      zh: '更新服务返回了无法识别的数据。',
      en: 'The update service returned an unrecognized response.'
    },
    'no-release': {
      zh: '官方发布页尚无适用于当前通道的版本。',
      en: 'The official release page has no version for this release channel yet.'
    },
    'current-version-invalid': {
      zh: '当前程序版本号无法用于更新比较。',
      en: 'The current app version cannot be used for update comparison.'
    }
  }
  return messages[result.reason ?? 'service-error'][language]
}

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
  onGitCreateRemote,
  onProjectChanged,
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
  onGitCreateRemote?: () => void
  onProjectChanged?: () => void | Promise<void>
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
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapability[]>([])
  const [profileCredentials, setProfileCredentials] = useState<Record<AIProfileName, CredentialState>>({
    prose: 'none',
    background: 'none',
    check: 'none'
  })
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [updateCheck, setUpdateCheck] = useState<UpdateCheck | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [writingPresets, setWritingPresets] = useState<WritingPresetListItem[]>([])
  const [selectedPreset, setSelectedPreset] = useState('')
  const [bookHeader, setBookHeader] = useState<BookGenerationHeaderState | null>(null)
  const [bookHeaderDraft, setBookHeaderDraft] = useState('')
  const [coverResult, setCoverResult] = useState<CoverResult | null>(null)
  const [coverFocus, setCoverFocus] = useState({ x: 0.5, y: 0.5 })
  const [ccv3Choices, setCcv3Choices] = useState<Ccv3ExportChoice[]>([])
  const [selectedCcv3Ids, setSelectedCcv3Ids] = useState<string[]>([])
  const [ccv3ExportPath, setCcv3ExportPath] = useState('')
  const [display, setDisplay] = useState({ theme, density, language })
  const [storyStructure, setStoryStructure] = useState<StoryStructureConfigV1>({
    part_enabled: true,
    act_enabled: true,
    scene_enabled: true
  })
  const [projectDocs, setProjectDocs] = useState<DocEntry[]>([])
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

  const hydrateForms = (config: DesktopConfig, capabilities: ModelCapability[]) => {
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
      const storedModel = stored?.model ?? defaultModel(provider)
      const defaults = defaultAIProfile(provider, capabilities, storedModel)
      nextProfiles[profile] = {
        provider,
        baseUrl: stored?.baseUrl ?? defaults.baseUrl,
        apiKey: '',
        model: storedModel,
        temperature: stored?.temperature ?? defaults.temperature,
        maxTokens: stored?.maxTokens ?? defaults.maxTokens,
        contextWindowTokens: stored?.contextWindowTokens ?? defaults.contextWindowTokens
      }
    }
    setProfiles(nextProfiles)
  }

  useEffect(() => {
    let cancelled = false
    async function loadProfiles() {
      try {
        const [
          config,
          loadedCapabilities,
          loadedPresets,
          loadedAppVersion,
          loadedHeader,
          loadedCover,
          loadedProject
        ] = await Promise.all([
          bridge.getConfig(),
          bridge.getModelCapabilities(),
          root ? bridge.listWritingPresets(root) : Promise.resolve([]),
          bridge.getAppVersion(),
          root ? bridge.getBookGenerationHeader(root) : Promise.resolve(null),
          root ? bridge.getProjectCover(root) : Promise.resolve(null),
          root ? bridge.loadProject(root) : Promise.resolve(null)
        ])
        const presets = loadedPresets as WritingPresetListItem[]
        if (!cancelled) {
          setModelCapabilities(loadedCapabilities)
          hydrateForms(config, loadedCapabilities)
          setAppVersion(loadedAppVersion)
          setWritingPresets(presets)
          setSelectedPreset(presets.find((preset) => preset.selected)?.id ?? '')
          setBookHeader(loadedHeader)
          setBookHeaderDraft(loadedHeader?.text ?? '')
          setCoverResult(loadedCover)
          if (loadedCover) {
            setCoverFocus({ x: loadedCover.cover.focus_x, y: loadedCover.cover.focus_y })
          }
          setCcv3Choices(
            (loadedProject?.docs ?? [])
              .filter((doc) => ['timeline_event', 'character_state'].includes(String(doc.data.type)))
              .map((doc) => ({
                id: doc.data.id,
                type: doc.data.type as Ccv3ExportChoice['type'],
                title: doc.data.title
              }))
          )
          setProjectDocs(loadedProject?.docs ?? [])
          if (loadedProject?.project.story_structure) {
            const partEnabled = loadedProject.project.story_structure.part_enabled
            setStoryStructure({
              part_enabled: partEnabled,
              act_enabled: partEnabled && loadedProject.project.story_structure.act_enabled,
              scene_enabled: loadedProject.project.story_structure.scene_enabled
            })
          }
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

  const saveStoryStructure = async () => {
    if (!root) return
    setBusyAction('save-story-structure')
    setNotice(null)
    try {
      const normalized = {
        ...storyStructure,
        act_enabled: storyStructure.part_enabled && storyStructure.act_enabled
      }
      await bridge.updateProjectStoryStructure(root, normalized)
      setStoryStructure(normalized)
      await onProjectChanged?.()
      setNotice({
        tone: 'success',
        message:
          language === 'zh'
            ? '章节树设置已保存。被停用层级的文件仍保留在项目中。'
            : 'Story tree settings saved. Files at disabled levels remain in the project.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const checkUpdates = async () => {
    setCheckingUpdate(true)
    setUpdateCheck(null)
    try {
      setUpdateCheck(await bridge.checkForUpdates())
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setCheckingUpdate(false)
    }
  }

  const openReleases = async () => {
    try {
      await bridge.openReleases()
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
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

  const saveBookHeader = async () => {
    if (!root) return
    setBusyAction('save-book-header')
    setNotice(null)
    try {
      const saved = await bridge.saveBookGenerationHeader(root, bookHeaderDraft)
      setBookHeader(saved)
      setBookHeaderDraft(saved.text)
      setNotice({
        tone: 'success',
        message:
          language === 'zh'
            ? '本书头部提示词已保存；只影响之后创建的生文 Run。'
            : 'Book generation header saved; only future generation runs are affected.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const clearBookHeader = async () => {
    if (!root) return
    setBusyAction('clear-book-header')
    setNotice(null)
    try {
      const cleared = await bridge.clearBookGenerationHeader(root)
      setBookHeader(cleared)
      setBookHeaderDraft('')
      setNotice({
        tone: 'success',
        message: language === 'zh' ? '本书头部提示词已清空。' : 'Book generation header cleared.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const chooseCover = async () => {
    if (!root) return
    setBusyAction('choose-cover')
    setNotice(null)
    try {
      const selected = await bridge.chooseProjectCover(root)
      if (!selected) return
      setCoverResult(selected)
      setCoverFocus({ x: selected.cover.focus_x, y: selected.cover.focus_y })
      setNotice({
        tone: selected.warning ? 'danger' : 'success',
        message:
          selected.warning ??
          (language === 'zh' ? '封面原图和 2:3 导出图已保存。' : 'Original cover and 2:3 export image saved.')
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const saveCoverFocus = async () => {
    if (!root || !coverResult) return
    setBusyAction('focus-cover')
    setNotice(null)
    try {
      const updated = await bridge.updateProjectCoverFocus(root, coverFocus.x, coverFocus.y)
      setCoverResult(updated)
      setNotice({
        tone: 'success',
        message: language === 'zh' ? '封面焦点和预览已更新。' : 'Cover focus and preview updated.'
      })
    } catch (error) {
      setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
    } finally {
      setBusyAction(null)
    }
  }

  const exportBookCard = async () => {
    if (!root) return
    setBusyAction('export-book-card')
    setNotice(null)
    try {
      const selected = new Set(selectedCcv3Ids)
      const result = await bridge.exportBookCharacterCard(root, {
        background_event_ids: ccv3Choices
          .filter((choice) => choice.type === 'timeline_event' && selected.has(choice.id))
          .map((choice) => choice.id),
        current_state_ids: ccv3Choices
          .filter((choice) => choice.type === 'character_state' && selected.has(choice.id))
          .map((choice) => choice.id)
      })
      setCcv3ExportPath(result.outputPath)
      setNotice({
        tone: 'success',
        message:
          language === 'zh'
            ? `已导出 CCv3 PNG，共 ${result.entryCount} 条设定。`
            : `CCv3 PNG exported with ${result.entryCount} setting entries.`
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
        const defaults = defaultAIProfile(patch.provider, modelCapabilities)
        next.baseUrl = defaults.baseUrl
        next.model = defaults.model
        next.maxTokens = defaults.maxTokens
        next.contextWindowTokens = defaults.contextWindowTokens
      } else if (patch.model) {
        const official = findModelCapability(modelCapabilities, next.provider, patch.model)
        if (official) {
          next.maxTokens = official.maxOutputTokens
          next.contextWindowTokens = official.contextWindowTokens
        }
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
  const disabledStructureDocs = projectDocs.filter((doc) => {
    if (doc.data.type === 'scene') return !storyStructure.scene_enabled
    if (doc.data.type !== 'outline') return false
    const level = String(doc.data.level ?? '')
    if (level === 'part' || level === 'arc') return !storyStructure.part_enabled
    if (level === 'act') return !storyStructure.act_enabled
    return false
  })

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
        {root && (
          <div className="settings-group story-structure-settings">
            <div className="settings-section-head">
              <div>
                <h3>{language === 'zh' ? '章节树' : 'Story tree'}</h3>
                <p className="muted">
                  {language === 'zh'
                    ? '只调整工作区的层级呈现。关闭层级不会删除或改写现有 Markdown 文件。'
                    : 'Controls the workspace hierarchy only. Disabling a level never deletes or rewrites existing Markdown files.'}
                </p>
              </div>
              <button
                className="secondary"
                type="button"
                onClick={() => void saveStoryStructure()}
                disabled={busyAction !== null}
              >
                {busyAction === 'save-story-structure'
                  ? t(language, 'saving')
                  : language === 'zh'
                    ? '保存章节树'
                    : 'Save story tree'}
              </button>
            </div>
            <div className="story-structure-options">
              <label className="story-structure-option">
                <input
                  type="checkbox"
                  checked={storyStructure.part_enabled}
                  onChange={(event) =>
                    setStoryStructure((current) => ({
                      ...current,
                      part_enabled: event.target.checked,
                      act_enabled: event.target.checked ? current.act_enabled : false
                    }))
                  }
                />
                <span>
                  <strong>{language === 'zh' ? '启用篇' : 'Enable parts'}</strong>
                  <small>
                    {language === 'zh' ? '关闭后，章直接挂在卷下。' : 'Chapters attach directly to volumes.'}
                  </small>
                </span>
              </label>
              <label className="story-structure-option">
                <input
                  type="checkbox"
                  checked={storyStructure.act_enabled}
                  disabled={!storyStructure.part_enabled}
                  onChange={(event) =>
                    setStoryStructure((current) => ({ ...current, act_enabled: event.target.checked }))
                  }
                />
                <span>
                  <strong>{language === 'zh' ? '启用幕' : 'Enable acts'}</strong>
                  <small>
                    {language === 'zh' ? '关闭后，章直接挂在篇下。' : 'Chapters attach directly to parts.'}
                  </small>
                </span>
              </label>
              <label className="story-structure-option">
                <input
                  type="checkbox"
                  checked={storyStructure.scene_enabled}
                  onChange={(event) =>
                    setStoryStructure((current) => ({ ...current, scene_enabled: event.target.checked }))
                  }
                />
                <span>
                  <strong>{language === 'zh' ? '启用节' : 'Enable scenes'}</strong>
                  <small>
                    {language === 'zh'
                      ? '关闭后隐藏节与绑定在节上的 AI 生文入口。'
                      : 'Hides scenes and the scene-bound AI writing entry.'}
                  </small>
                </span>
              </label>
            </div>
            {disabledStructureDocs.length > 0 && (
              <details className="disabled-structure-inspector">
                <summary>
                  {language === 'zh'
                    ? `查看停用层级中的内容（${disabledStructureDocs.length}）`
                    : `Inspect content in disabled levels (${disabledStructureDocs.length})`}
                </summary>
                <p className="muted">
                  {language === 'zh'
                    ? '这些文件仍在 Obsidian 项目目录中，可在外部编辑器中检查。'
                    : 'These files remain in the Obsidian project directory and can be inspected externally.'}
                </p>
                <div className="disabled-structure-list">
                  {disabledStructureDocs.map((item) => (
                    <button
                      key={`${item.data.type}:${item.data.id}`}
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void bridge
                          .openDocExternal(item.path)
                          .catch((error) =>
                            setNotice({ tone: 'danger', message: formatDesktopError(error, language) })
                          )
                      }
                    >
                      <span>{item.data.title}</span>
                      <small>{String(item.data.level ?? item.data.type)}</small>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
        <div className="settings-group update-settings">
          <div className="settings-section-head">
            <div>
              <h3>{t(language, 'softwareUpdate')}</h3>
              <p className="muted">{t(language, 'updateCheckHint')}</p>
            </div>
            <button
              className="secondary"
              type="button"
              onClick={checkUpdates}
              disabled={checkingUpdate || busyAction !== null}
            >
              <RefreshCw size={15} className={checkingUpdate ? 'spin' : ''} />
              {checkingUpdate ? t(language, 'checkingForUpdates') : t(language, 'checkForUpdates')}
            </button>
          </div>
          <div className="update-summary">
            <div className="update-version-row">
              <span className="settings-version">
                {t(language, 'currentVersion')} {appVersion || '…'}
              </span>
              <span className="settings-version">
                {appVersion.includes('-') ? t(language, 'prereleaseChannel') : t(language, 'stableChannel')}
              </span>
            </div>
            {updateCheck ? (
              <div className={`update-result ${updateCheck.status}`} aria-live="polite">
                <div>
                  <strong>
                    {updateCheck.status === 'available'
                      ? t(language, 'updateAvailable')
                      : updateCheck.status === 'up-to-date'
                        ? t(language, 'upToDate')
                        : t(language, 'updateUnavailable')}
                  </strong>
                  <p>{updateStatusMessage(language, updateCheck)}</p>
                  {updateCheck.status === 'available' && updateCheck.releaseName ? (
                    <small>{updateCheck.releaseName}</small>
                  ) : null}
                </div>
                {updateCheck.status === 'available' ? (
                  <button className="secondary" type="button" onClick={openReleases}>
                    <Download size={14} /> {t(language, 'openReleaseDownload')}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="update-manual-note">{t(language, 'updateManualOnly')}</p>
            )}
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
          <p className="muted">{t(language, 'githubOptionalHint')}</p>
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
            <div className="settings-section-head">
              <h3>{t(language, 'currentNovelGit')}</h3>
              {git?.repositoryScope === 'standalone' && !git.remote && onGitCreateRemote && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    onClose()
                    onGitCreateRemote()
                  }}
                  disabled={!githubHasToken || busyAction !== null}
                  title={githubHasToken ? t(language, 'connectGithubUpload') : t(language, 'saveGithubFirst')}
                >
                  <GitBranch size={14} />{' '}
                  {githubHasToken ? t(language, 'connectGithubUpload') : t(language, 'saveGithubFirst')}
                </button>
              )}
            </div>
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
        {root && (
          <div className="settings-group">
            <div className="settings-section-head">
              <div>
                <h3>
                  {language === 'zh' ? '写作 / 生文 · 本书头部提示词' : 'Writing · Book generation header'}
                </h3>
                <p className="muted">
                  {language === 'zh'
                    ? '只用于新节、重新生成、续写、正文改写和润色；检查、导入和创作助手不会加载它。'
                    : 'Used only for prose generation, regeneration, continuation, rewriting, and polishing—not checks, imports, or creator assistants.'}
                </p>
              </div>
              <div className="settings-section-actions">
                <button type="button" onClick={() => void clearBookHeader()} disabled={busyAction !== null}>
                  <Trash2 size={14} /> {language === 'zh' ? '清空' : 'Clear'}
                </button>
                <button
                  className="primary"
                  type="button"
                  onClick={() => void saveBookHeader()}
                  disabled={busyAction !== null}
                >
                  <Save size={14} /> {language === 'zh' ? '保存' : 'Save'}
                </button>
              </div>
            </div>
            <label className="book-header-editor">
              <span>{bookHeader?.relative_path ?? 'prompts/book-generation-header.md'}</span>
              <textarea
                value={bookHeaderDraft}
                onChange={(event) => setBookHeaderDraft(event.target.value)}
                spellCheck={false}
                placeholder={
                  language === 'zh'
                    ? '粘贴本书长期使用的生文头部提示词…'
                    : 'Paste this book’s persistent prose-generation header…'
                }
              />
              <small>
                {[...bookHeaderDraft].length.toLocaleString()} {language === 'zh' ? '字符' : 'characters'} ·{' '}
                {Math.ceil([...bookHeaderDraft].length / 4).toLocaleString()}{' '}
                {language === 'zh' ? '估算 token' : 'estimated tokens'}
                {bookHeader?.configured ? ` · SHA-256 ${bookHeader.sha256.slice(0, 12)}…` : ''}
              </small>
            </label>
            {/\{\{\s*[a-zA-Z][\w.-]*\s*\}\}/u.test(bookHeaderDraft) && (
              <div className="warning-box">
                {language === 'zh'
                  ? '检测到 {{char}} / {{user}} 一类外部宏；Quillarium 会将其按普通文本发送，不执行 SillyTavern 宏。'
                  : 'External macros such as {{char}} or {{user}} are sent as literal text; SillyTavern macro expansion is not implemented.'}
              </div>
            )}
            <details>
              <summary>{language === 'zh' ? '查看实际装配顺序' : 'View effective assembly order'}</summary>
              <pre className="settings-prompt-order-preview">
                {[
                  bookHeaderDraft ||
                    (language === 'zh' ? '（未配置本书头部提示词）' : '(No book header configured)'),
                  language === 'zh'
                    ? '【产品不可修改的任务与权限边界】'
                    : '[Immutable product task and permission boundary]',
                  language === 'zh'
                    ? '【WritingPreset 生文指令】'
                    : '[WritingPreset generation instructions]',
                  language === 'zh' ? '【本次 PromptBlock】' : '[Current PromptBlocks]',
                  language === 'zh' ? '【当前节写作目标】' : '[Current scene goal]'
                ].join('\n\n')}
              </pre>
              <small>
                {language === 'zh'
                  ? '生成时以当次编译的 PromptEnvelope 为准；Run 会保存全文、相对路径、SHA-256 和精确 token。'
                  : 'The compiled PromptEnvelope is authoritative; each run snapshots the text, relative path, SHA-256, and exact token count.'}
              </small>
            </details>
          </div>
        )}
        {root && (
          <div className="settings-group">
            <div className="settings-section-head">
              <div>
                <h3>
                  {language === 'zh' ? '小说封面与 CCv3 设定角色卡' : 'Book cover and CCv3 setting card'}
                </h3>
                <p className="muted">
                  {language === 'zh'
                    ? '封面使用 2:3 裁切，保存原图、界面缩略图和 PNG 导出图。设定导出不会包含故事计划、正文、Prompt、Run 或连接凭据。'
                    : 'Covers use a 2:3 crop and retain the original, UI thumbnail, and export PNG. Setting exports omit story plans, prose, prompts, runs, and credentials.'}
                </p>
              </div>
              <button type="button" onClick={() => void chooseCover()} disabled={busyAction !== null}>
                {language === 'zh' ? '上传 / 更换封面' : 'Upload / replace cover'}
              </button>
            </div>
            <div className="book-cover-settings">
              {coverResult ? (
                <img
                  src={coverResult.previewDataUrl}
                  alt={language === 'zh' ? '小说封面裁切预览' : 'Book cover crop preview'}
                />
              ) : (
                <div className="book-cover-placeholder">2:3</div>
              )}
              <div className="book-cover-controls">
                <label>
                  {language === 'zh' ? '水平焦点' : 'Horizontal focus'} · {Math.round(coverFocus.x * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={coverFocus.x}
                    onChange={(event) =>
                      setCoverFocus((current) => ({ ...current, x: Number(event.target.value) }))
                    }
                    disabled={!coverResult}
                  />
                </label>
                <label>
                  {language === 'zh' ? '垂直焦点' : 'Vertical focus'} · {Math.round(coverFocus.y * 100)}%
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={coverFocus.y}
                    onChange={(event) =>
                      setCoverFocus((current) => ({ ...current, y: Number(event.target.value) }))
                    }
                    disabled={!coverResult}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveCoverFocus()}
                  disabled={!coverResult || busyAction !== null}
                >
                  {language === 'zh' ? '更新裁切预览' : 'Update crop preview'}
                </button>
                {coverResult && (
                  <small>
                    {coverResult.cover.source_width}×{coverResult.cover.source_height} · assets/cover/
                  </small>
                )}
              </div>
            </div>
            <fieldset className="ccv3-export-options">
              <legend>
                {language === 'zh'
                  ? '明确加入的背景事件与当前状态'
                  : 'Explicit background events and current states'}
              </legend>
              {ccv3Choices.length ? (
                ccv3Choices.map((choice) => (
                  <label key={`${choice.type}:${choice.id}`}>
                    <input
                      type="checkbox"
                      checked={selectedCcv3Ids.includes(choice.id)}
                      onChange={() =>
                        setSelectedCcv3Ids((current) =>
                          current.includes(choice.id)
                            ? current.filter((id) => id !== choice.id)
                            : [...current, choice.id]
                        )
                      }
                    />
                    <span>{choice.title}</span>
                    <small>
                      {choice.type} · {choice.id}
                    </small>
                  </label>
                ))
              ) : (
                <small>
                  {language === 'zh'
                    ? '没有可选的背景事件或人物状态。'
                    : 'No background events or character states are available.'}
                </small>
              )}
            </fieldset>
            <button
              className="primary"
              type="button"
              onClick={() => void exportBookCard()}
              disabled={!coverResult || busyAction !== null}
            >
              <Download size={14} />{' '}
              {language === 'zh' ? '导出“书名.png”CCv3 设定卡' : 'Export “book title.png” CCv3 card'}
            </button>
            {ccv3ExportPath && (
              <input
                value={ccv3ExportPath}
                readOnly
                aria-label={language === 'zh' ? 'CCv3 导出路径' : 'CCv3 export path'}
              />
            )}
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
                  list={`official-models-${profile}`}
                />
                <datalist id={`official-models-${profile}`}>
                  {modelCapabilities
                    .filter((capability) => capability.provider === profiles[profile].provider)
                    .map((capability) => (
                      <option key={capability.model} value={capability.model}>
                        {capability.displayName}
                      </option>
                    ))}
                </datalist>
              </label>
              <div className="ai-limit-grid">
                <label>
                  {language === 'zh' ? '上下文上限' : 'Context window'}
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={profiles[profile].contextWindowTokens}
                    onChange={(event) =>
                      updateProfile(profile, { contextWindowTokens: Number(event.target.value) })
                    }
                  />
                  <small>
                    {language === 'zh' ? '输入与输出合计 token。' : 'Combined input and output tokens.'}
                  </small>
                </label>
                <label>
                  {language === 'zh' ? '输出上限' : 'Output limit'}
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={profiles[profile].maxTokens}
                    onChange={(event) => updateProfile(profile, { maxTokens: Number(event.target.value) })}
                  />
                  <small>{language === 'zh' ? '单次生成最大 token。' : 'Maximum tokens per response.'}</small>
                </label>
              </div>
              {findModelCapability(modelCapabilities, profiles[profile].provider, profiles[profile].model) ? (
                <div className="official-model-limits">
                  <span>
                    {language === 'zh'
                      ? '当前缺省值来自模型官网；可按实际接口自行修改。'
                      : 'Defaults come from the model vendor and remain editable.'}
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const official = findModelCapability(
                        modelCapabilities,
                        profiles[profile].provider,
                        profiles[profile].model
                      )
                      if (official) {
                        updateProfile(profile, {
                          contextWindowTokens: official.contextWindowTokens,
                          maxTokens: official.maxOutputTokens
                        })
                      }
                    }}
                  >
                    {language === 'zh' ? '恢复官网值' : 'Use vendor limits'}
                  </button>
                </div>
              ) : null}
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

function defaultAIProfile(
  provider: AIProviderName,
  capabilities: ModelCapability[] = [],
  model = defaultModel(provider)
): AIProfileForm {
  const official = findModelCapability(capabilities, provider, model)
  return {
    provider,
    baseUrl: defaultBaseUrl(provider),
    apiKey: '',
    model,
    temperature: 0.7,
    maxTokens: official?.maxOutputTokens ?? 2_000,
    contextWindowTokens: official?.contextWindowTokens ?? 128_000
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
      return 'deepseek-v4-flash'
    case 'ollama':
      return 'llama3.1'
  }
}

function findModelCapability(
  capabilities: ModelCapability[],
  provider: AIProviderName,
  model: string
): ModelCapability | undefined {
  return capabilities.find(
    (capability) => capability.provider === provider && capability.model === model.trim().toLowerCase()
  )
}
