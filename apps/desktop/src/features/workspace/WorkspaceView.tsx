import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import { Upload } from 'lucide-react'
import type {
  DocumentOriginResolution,
  PromptSourceSelection,
  ReorderStorySiblingsRequest
} from '@quillarium/core'
import type {
  AIStatus,
  CheckReport,
  ContextPacketSummary,
  DensityName,
  DocEntry,
  GitState,
  LanguageName,
  ModuleName,
  OutlineHomeSection,
  PlanningCheckScope,
  TargetSelection,
  ThemeName,
  UISkinPreferencesV1,
  ViewMode,
  VolumeSection,
  WorkLevel,
  WorkspaceData,
  WorkspaceMode,
  WorkspacePage,
  LeftMode
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { bridge } from '../../app/bridge.js'
import { StructureTree } from '../navigation/WorkspaceNavigation.js'
import { ModuleView } from '../modules/ModuleView.js'
import { OutlineHome } from '../outline/OutlineHome.js'
import { OutlineCreateDialog } from '../outline/OutlineCreateDialog.js'
import { VolumeHome } from '../outline/VolumeHome.js'
import { TopChrome } from '../settings/TopChrome.js'
import { AIWritingWorkspace } from '../writing/AIWritingWorkspace.js'
import { ChapterProseWorkspace } from '../writing/ChapterProseWorkspace.js'
import { ForeshadowingWorkspace } from '../writing/ForeshadowingWorkspace.js'
import { ShortPlayWorkspace } from '../writing/ShortPlayWorkspace.js'
import { WritingReferenceWorkspace } from '../writing/WritingReferenceWorkspace.js'
import { WritingWorkspace } from '../writing/WritingWorkspace.js'
import { PlanningCreationDialog } from '../planning/PlanningCreationDialog.js'
import { CardOriginDialog } from '../import/CardOriginDialog.js'
import { AIImportDialog } from '../import/AIImportDialog.js'
import { BookBreakdownDialog } from '../import/BookBreakdownDialog.js'
import { FileDropIntentDialog, pathsFromDroppedFiles } from '../import/FileDropIntentDialog.js'
import { TagIndexDrawer } from '../metadata/TagIndexDrawer.js'
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { compareStoryEntries, normalizeStoryStructure, outlineLevelLabel } from '../../shared/outline.js'
import { ToastNotice } from '../feedback/ToastNotice.js'
import { formatDesktopError } from '../../shared/errors.js'
import { CreatorAssistantWorkspace } from '../assistants/CreatorAssistantWorkspace.js'
import { resolveUISkin } from '@quillarium/core/ui-skins'
import {
  PlanningCheckPanel,
  type PlanningCheckApplyPanelOutcome,
  type PlanningCheckPanelOutcome
} from '../agents/PlanningCheckPanel.js'
import { selectionAfterSpecialize } from './selection-after-specialize.js'
import type { DisplayLayerChrome } from '../planning/display-chrome.js'

type EditableDoc = { data: Record<string, unknown>; content: string; path: string }

interface WorkspaceViewProps {
  app: {
    root: string
    theme: ThemeName
    density: DensityName
    language: LanguageName
    skinPreferences?: UISkinPreferencesV1
    aiStatus: AIStatus
    onTheme: (theme: ThemeName) => void
    onDensity: (density: DensityName) => void
    onLanguage: (language: LanguageName) => void
    onSkinPreferences: (preferences: UISkinPreferencesV1 | undefined) => void
    onAIStatus: (status: AIStatus) => void
    onBack: () => void
  }
  state: {
    data: WorkspaceData
    workspaceMode: WorkspaceMode
    workLevel: WorkLevel
    leftOpen: boolean
    rightOpen: boolean
    git: GitState | null
    gitBusy: boolean
    projectPath: string
    activeVolume: DocEntry | null
    workspacePage: WorkspacePage
    docs: DocEntry[]
    selectedTarget: TargetSelection | null
    activeModule: ModuleName
    viewMode: ViewMode
    search: string
    writingOutline: DocEntry | null
    selectedScene: DocEntry | null
    doc: EditableDoc | null
    context: string
    contextPacket: ContextPacketSummary | null
    checkReport: CheckReport | null
    dirty: boolean
    busy: boolean
    filteredItems: DocEntry[]
    finalizedScenes: DocEntry[]
    leftMode: LeftMode
    volumes: DocEntry[]
    volumeSection: VolumeSection
    middlePct: number
    outlineSection: OutlineHomeSection
    importOpen: boolean
    gitMessage: string
    actionError: string
    assembledPrompt: string
    planningCheck: PlanningCheckPanelOutcome | null
    displayLayer: DisplayLayerChrome
  }
  actions: {
    createGitHubRepo: () => Promise<void>
    syncGitHub: () => Promise<void>
    setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>
    setActiveModule: Dispatch<SetStateAction<ModuleName>>
    selectWritingTarget: (target: TargetSelection) => void
    reorderStory: (request: ReorderStorySiblingsRequest) => Promise<void>
    setLeftOpen: Dispatch<SetStateAction<boolean>>
    selectWorkLevel: (level: WorkLevel) => void
    setSearch: Dispatch<SetStateAction<string>>
    setViewMode: Dispatch<SetStateAction<ViewMode>>
    createOutlineAtLevel: (level: WorkLevel, title: string, parent?: string | null) => Promise<void>
    setDoc: Dispatch<SetStateAction<EditableDoc | null>>
    setDirty: Dispatch<SetStateAction<boolean>>
    save: () => Promise<void>
    finalizeChapterProse: (chapterId: string) => Promise<void>
    publishChapterProse: (chapterId: string, confirmation: string) => Promise<void>
    runCheck: (contentOverride?: string) => Promise<void>
    runProjectPlanningCheck: (scope?: PlanningCheckScope) => Promise<void>
    retryProjectPlanningCheck: (executionId: string) => Promise<void>
    applyProjectPlanningCheck: (
      executionId: string,
      selectedResultIds: string[]
    ) => Promise<PlanningCheckApplyPanelOutcome>
    closePlanningCheck: () => void
    inspectPlanningCheck: (executionId: string) => Promise<void>
    setAssembledPrompt: Dispatch<SetStateAction<string>>
    generateFromPrompt: (
      prompt: string,
      count?: number,
      parentRunId?: string,
      promptSources?: PromptSourceSelection[]
    ) => Promise<void>
    setImportOpen: Dispatch<SetStateAction<boolean>>
    createDoc: (kind: string, input: Record<string, unknown>) => Promise<unknown>
    load: () => Promise<void>
    setWorkspacePage: Dispatch<SetStateAction<WorkspacePage>>
    setOutlineSection: Dispatch<SetStateAction<OutlineHomeSection>>
    setSelectedTarget: Dispatch<SetStateAction<TargetSelection | null>>
    setActiveVolumeId: Dispatch<SetStateAction<string | null>>
    setVolumeSection: Dispatch<SetStateAction<VolumeSection>>
    setRightOpen: Dispatch<SetStateAction<boolean>>
    setMiddlePct: Dispatch<SetStateAction<number>>
    deleteSelectedDoc: () => Promise<void>
    clearNotice: () => void
  }
}

export function WorkspaceView({ app, state, actions }: WorkspaceViewProps) {
  const [planningDialog, setPlanningDialog] = useState<{
    module: string
    sessionId?: string
    documentId?: string
  } | null>(null)
  const [importOriginDoc, setImportOriginDoc] = useState<DocEntry | null>(null)
  const [activeTag, setActiveTag] = useState<{ value: string; displayValue?: string } | null>(null)
  const [outlineCreate, setOutlineCreate] = useState<{
    level: Exclude<WorkLevel, 'ai'>
    parent: string | null
    parentTitle: string | null
  } | null>(null)
  const [outlineCreating, setOutlineCreating] = useState(false)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [writingSidebarWidth, setWritingSidebarWidth] = useState(380)
  const [assistantRoleHint, setAssistantRoleHint] = useState<string | undefined>()
  const [assistantInitialMessage, setAssistantInitialMessage] = useState<string | undefined>()
  const [referenceUploadError, setReferenceUploadError] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [droppedSourcePaths, setDroppedSourcePaths] = useState<string[] | null>(null)
  const [importSourcePaths, setImportSourcePaths] = useState<string[]>([])
  const fileDragDepth = useRef(0)
  const {
    root,
    theme,
    density,
    language,
    skinPreferences,
    aiStatus,
    onTheme,
    onDensity,
    onLanguage,
    onSkinPreferences,
    onAIStatus,
    onBack
  } = app
  const skinLayout = resolveUISkin(theme, skinPreferences).layout
  const [bookBreakdownOpen, setBookBreakdownOpen] = useState(false)
  const [writingTag, setWritingTag] = useState<
    'tree' | 'foreshadowing' | 'scenes' | 'references' | 'prompts' | 'short_play'
  >('tree')
  const {
    data,
    workspaceMode,
    workLevel,
    leftOpen,
    rightOpen,
    git,
    gitBusy,
    projectPath,
    activeVolume,
    workspacePage,
    docs,
    selectedTarget,
    activeModule,
    viewMode,
    search,
    writingOutline,
    selectedScene,
    doc,
    context,
    contextPacket,
    checkReport,
    dirty,
    busy,
    filteredItems,
    finalizedScenes,
    leftMode,
    volumes,
    volumeSection,
    middlePct,
    outlineSection,
    importOpen,
    gitMessage,
    actionError,
    assembledPrompt,
    planningCheck,
    displayLayer
  } = state
  const {
    createGitHubRepo,
    syncGitHub,
    setWorkspaceMode,
    setActiveModule,
    selectWritingTarget,
    reorderStory,
    setLeftOpen,
    selectWorkLevel,
    setSearch,
    setViewMode,
    createOutlineAtLevel,
    setDoc,
    setDirty,
    save,
    finalizeChapterProse,
    publishChapterProse,
    runCheck,
    runProjectPlanningCheck,
    retryProjectPlanningCheck,
    applyProjectPlanningCheck,
    closePlanningCheck,
    inspectPlanningCheck,
    setAssembledPrompt,
    generateFromPrompt,
    setImportOpen,
    createDoc,
    load,
    setWorkspacePage,
    setOutlineSection,
    setSelectedTarget,
    setActiveVolumeId,
    setVolumeSection,
    setRightOpen,
    setMiddlePct,
    deleteSelectedDoc,
    clearNotice
  } = actions
  const openPlanningCardEditor = async (card: DocEntry, module: string) => {
    const inlineOrigin = card.data.quillarium_origin
    if (inlineOrigin && typeof inlineOrigin === 'object') {
      const record = inlineOrigin as Record<string, unknown>
      if (record.kind === 'ai-conversation' && typeof record.session_id === 'string') {
        setPlanningDialog({ module, sessionId: record.session_id })
        return
      }
    }
    const resolved = await bridge.resolveDocumentOrigin(root, card.path).catch(() => null)
    if (resolved?.origin.kind === 'ai-conversation') {
      setPlanningDialog({ module, sessionId: resolved.origin.session_id })
      return
    }
    setPlanningDialog({ module, documentId: card.data.id })
  }
  const uploadReferences = async (sourcePaths?: string[], promptMaterial = false) => {
    setReferenceUploadError('')
    try {
      const result = await bridge.uploadReferenceDocuments(
        root,
        sourcePaths,
        promptMaterial ? { prompt_material: true } : undefined
      )
      const latest = result.items.at(-1)
      if (!latest) return
      await load()
      setDoc({ ...latest.document, path: latest.path })
      setSelectedTarget({
        type: String(latest.document.data.type),
        id: String(latest.document.data.id)
      })
      setRightOpen(true)
      setDirty(false)
    } catch (cause) {
      setReferenceUploadError(formatDesktopError(cause, language))
      if (sourcePaths !== undefined) throw cause
    }
  }
  const openAIImport = (sourcePaths: string[] = []) => {
    setImportSourcePaths(sourcePaths)
    setImportOpen(true)
  }
  const extractCardsFromReference = (card: DocEntry) => {
    setPlanningDialog({ module: 'reference-extraction', documentId: card.data.id })
  }
  const convertPlanningCard = (card: DocEntry) => {
    setPlanningDialog({ module: 'card-conversion', documentId: card.data.id })
  }
  const specializePlanningCard = async (
    card: DocEntry,
    targetType: string,
    fields: Record<string, unknown>
  ) => {
    const result = await bridge.specializePlanningCard(root, card.data.id, targetType, fields)
    const { selectedTarget: nextTarget, doc: nextDoc } = selectionAfterSpecialize(result)
    setSelectedTarget(nextTarget)
    setDoc(nextDoc)
    setDirty(false)
    await load()
  }
  const storyStructure = normalizeStoryStructure(data.project.story_structure)
  const shortDramaEnabled = data.project.capabilities?.short_drama_export === true
  const visibleWritingTag =
    writingTag === 'short_play'
      ? shortDramaEnabled
        ? 'short_play'
        : 'tree'
      : storyStructure.scene_enabled || writingTag === 'tree' || writingTag === 'foreshadowing'
        ? writingTag
        : 'tree'

  return (
    <div
      ref={shellRef}
      className={
        workspaceMode === 'writing'
          ? `app-shell writing-shell work-level-${workLevel} ${leftOpen ? '' : 'left-collapsed'}`
          : `app-shell outline-shell ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`
      }
      style={
        workspaceMode === 'writing'
          ? ({
              '--writing-sidebar-width': `${leftOpen ? writingSidebarWidth : 0}px`
            } as CSSProperties)
          : undefined
      }
      onDragEnter={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        fileDragDepth.current += 1
        setDropActive(true)
      }}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        event.preventDefault()
        fileDragDepth.current = Math.max(0, fileDragDepth.current - 1)
        if (!fileDragDepth.current) setDropActive(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        event.stopPropagation()
        fileDragDepth.current = 0
        setDropActive(false)
        setReferenceUploadError('')
        try {
          setDroppedSourcePaths(pathsFromDroppedFiles(event.dataTransfer.files, bridge.getDroppedFilePath))
        } catch (cause) {
          setReferenceUploadError(formatDesktopError(cause, language))
        }
      }}
    >
      {dropActive && (
        <div className="file-drop-overlay" role="status">
          <Upload size={34} />
          <strong>{language === 'zh' ? '松开以选择文件用途' : 'Drop to choose how to use the files'}</strong>
          <small>
            {language === 'zh'
              ? '可作为参考文档，或交给 AI 拆分设定'
              : 'Archive as references or import settings with AI'}
          </small>
        </div>
      )}
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
              ? `${language === 'zh' ? '世界书' : 'World book'} / ${activeVolume.data.title}`
              : language === 'zh'
                ? '世界书'
                : 'World book'
        }
        workspaceMode={workspaceMode}
        onWorkspaceMode={(mode) => {
          setWorkspaceMode(mode)
          if (mode === 'writing') setActiveModule('write')
        }}
        onProjectChanged={load}
      />
      {workspaceMode === 'writing' ? (
        <>
          <div className="workspace writing-route">
            <aside className="sidebar writing-route-sidebar">
              <div className="sidebar-header">
                <span>
                  {visibleWritingTag === 'tree'
                    ? t(language, 'bookOutline')
                    : language === 'zh'
                      ? '选章'
                      : 'Chapters'}
                </span>
                <button onClick={() => setLeftOpen(false)}>{t(language, 'collapse')}</button>
              </div>
              {visibleWritingTag === 'tree' ? (
                <StructureTree
                  docs={docs}
                  storyStructure={storyStructure}
                  selectedTarget={selectedTarget}
                  onSelect={selectWritingTarget}
                  onReorder={reorderStory}
                  language={language}
                />
              ) : (
                <div
                  className="chapter-picker-list"
                  role="navigation"
                  aria-label={language === 'zh' ? '选章' : 'Select chapter'}
                >
                  <div className="chapter-picker-head">
                    <small className="muted">{language === 'zh' ? '章节列表' : 'Chapters'}</small>
                  </div>
                  {docs
                    .filter((item) => item.data.type === 'outline' && item.data.level === 'chapter')
                    .sort(compareStoryEntries)
                    .map((ch) => {
                      const isSelected = writingOutline?.data.id === ch.data.id
                      return (
                        <button
                          key={ch.data.id}
                          type="button"
                          className={`chapter-picker-item ${isSelected ? 'active' : ''}`}
                          onClick={() => {
                            if (visibleWritingTag === 'foreshadowing' || visibleWritingTag === 'references') {
                              setWritingTag(storyStructure.scene_enabled ? 'scenes' : 'tree')
                            }
                            selectWritingTarget({
                              type: 'outline',
                              id: ch.data.id,
                              view: storyStructure.scene_enabled ? 'ai' : undefined
                            })
                          }}
                        >
                          <span>{ch.data.title}</span>
                        </button>
                      )
                    })}
                  {!docs.some((item) => item.data.type === 'outline' && item.data.level === 'chapter') && (
                    <p className="empty-row muted">{language === 'zh' ? '暂无章节' : 'No chapters yet'}</p>
                  )}
                </div>
              )}
              <div className="module-nav">
                {(
                  [
                    ['tree', language === 'zh' ? '结构树' : 'Structure'],
                    ['foreshadowing', language === 'zh' ? '伏笔' : 'Foreshadowing'],
                    ...(storyStructure.scene_enabled
                      ? ([
                          ['scenes', language === 'zh' ? '节' : 'Scenes'],
                          ['references', language === 'zh' ? 'AI 参考资料' : 'References'],
                          ['prompts', language === 'zh' ? '提示词' : 'Prompts']
                        ] as const)
                      : []),
                    ...(shortDramaEnabled
                      ? ([['short_play', language === 'zh' ? '剧本与分镜' : 'Short Play']] as const)
                      : [])
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={visibleWritingTag === id ? 'active' : ''}
                    onClick={() => {
                      setWritingTag(id)
                      setActiveModule('write')
                      if ((id === 'scenes' || id === 'prompts') && !writingOutline) {
                        const firstChapter = docs
                          .filter((item) => item.data.type === 'outline' && item.data.level === 'chapter')
                          .sort(compareStoryEntries)[0]
                        if (firstChapter) {
                          selectWritingTarget({ type: 'outline', id: firstChapter.data.id, view: 'ai' })
                        }
                      }
                    }}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </aside>
            {leftOpen && (
              <SplitHandle
                orientation="vertical"
                className="writing-sidebar-handle"
                reverse={skinLayout.navigation === 'right'}
                label={
                  language === 'zh'
                    ? `调整${skinLayout.navigation === 'right' ? '右' : '左'}侧栏宽度`
                    : 'Resize navigation sidebar'
                }
                onResize={(delta) => {
                  const width = shellRef.current?.clientWidth ?? window.innerWidth
                  setWritingSidebarWidth((current) =>
                    clampPaneSize(current + delta, 300, Math.min(480, width - 560))
                  )
                }}
              />
            )}
            <main className="center">
              {!leftOpen && (
                <button className="panel-toggle left" onClick={() => setLeftOpen(true)}>
                  {t(language, 'bookOutline')}
                </button>
              )}
              {visibleWritingTag === 'short_play' ? (
                <ShortPlayWorkspace
                  root={root}
                  data={data}
                  language={language}
                  activeSceneId={selectedScene?.data.id ?? null}
                  onSelectScene={(sceneId) => selectWritingTarget({ type: 'scene', id: sceneId, view: 'ai' })}
                />
              ) : visibleWritingTag === 'foreshadowing' ? (
                <ForeshadowingWorkspace
                  docs={docs}
                  doc={doc}
                  dirty={dirty}
                  busy={busy}
                  language={language}
                  projectRoot={root}
                  onSelect={(card) => {
                    setDoc(card)
                    setSelectedTarget({ type: 'foreshadowing', id: card.data.id })
                    setDirty(false)
                  }}
                  onCreate={async (input) => {
                    const createdPath = await createDoc('foreshadowing', input)
                    const created = await bridge.readDoc(String(createdPath))
                    const createdDoc = { ...created, path: String(createdPath) }
                    setDoc(createdDoc)
                    setSelectedTarget({ type: 'foreshadowing', id: String(created.data.id) })
                    setDirty(false)
                  }}
                  onDocChange={(next) => {
                    setDoc(next)
                    setDirty(true)
                  }}
                  onSave={save}
                  onReloadProject={load}
                />
              ) : visibleWritingTag === 'references' ? (
                <WritingReferenceWorkspace
                  docs={docs}
                  doc={doc}
                  dirty={dirty}
                  busy={busy}
                  language={language}
                  onSelect={(card) => {
                    setDoc(card)
                    setSelectedTarget({ type: 'reference', id: card.data.id })
                    setDirty(false)
                  }}
                  onCreate={async (input) => {
                    const createdPath = await createDoc('reference', input)
                    const created = await bridge.readDoc(String(createdPath))
                    setDoc({ ...created, path: String(createdPath) })
                    setSelectedTarget({ type: 'reference', id: String(created.data.id) })
                    setDirty(false)
                  }}
                  onImport={() => uploadReferences(undefined, true)}
                  onDraft={(request) => bridge.draftWritingReference(root, request)}
                  onDocChange={(next) => {
                    setDoc(next)
                    setDirty(true)
                  }}
                  onSave={save}
                />
              ) : activeModule === 'assistants' ? (
                <CreatorAssistantWorkspace
                  root={root}
                  projectId={data.project.id}
                  docs={docs}
                  selectedTarget={selectedTarget}
                  preferredRoleId={assistantRoleHint}
                  initialMessage={assistantInitialMessage}
                  onProjectChanged={load}
                  language={language}
                />
              ) : activeModule === 'write' ? (
                selectedTarget?.type === 'chapter_prose' &&
                doc &&
                writingOutline &&
                visibleWritingTag === 'tree' ? (
                  <ChapterProseWorkspace
                    key={writingOutline.data.id}
                    chapterTitle={writingOutline.data.title}
                    chapterId={writingOutline.data.id}
                    root={root}
                    doc={doc}
                    targetWords={data.project.chapter_words}
                    dirty={dirty}
                    busy={busy}
                    onDocChange={(next) => {
                      setDoc(next)
                      setDirty(true)
                    }}
                    onSave={save}
                    onExtractSettings={async () => {
                      setPlanningDialog({ module: 'prose-extraction', documentId: String(doc.data.id) })
                    }}
                    onFinalize={() => finalizeChapterProse(writingOutline.data.id)}
                    onPublish={(confirmation) => publishChapterProse(writingOutline.data.id, confirmation)}
                    onContinuityApplied={load}
                    language={language}
                  />
                ) : (visibleWritingTag === 'scenes' || visibleWritingTag === 'prompts') &&
                  storyStructure.scene_enabled ? (
                  <AIWritingWorkspace
                    focus={visibleWritingTag === 'prompts' ? 'prompt' : 'scene'}
                    root={root}
                    docs={docs}
                    runs={data.runs}
                    outline={writingOutline?.data.level === 'chapter' ? writingOutline : null}
                    scene={selectedScene}
                    context={context}
                    contextPacket={contextPacket}
                    checkReport={checkReport}
                    assembledPrompt={assembledPrompt}
                    busy={busy}
                    onPromptChange={setAssembledPrompt}
                    onCheck={runCheck}
                    onGenerate={generateFromPrompt}
                    onDelete={deleteSelectedDoc}
                    onAccepted={load}
                    onScenePrepared={async (sceneId) => {
                      await load()
                      selectWritingTarget({ type: 'scene', id: sceneId, view: 'ai' })
                    }}
                    onSelectScene={(sceneId) =>
                      selectWritingTarget({ type: 'scene', id: sceneId, view: 'ai' })
                    }
                    onOpenProse={() =>
                      selectWritingTarget({
                        type: 'outline',
                        id: writingOutline?.data.id ?? '',
                        view: 'prose'
                      })
                    }
                    onContinuityReview={() => {
                      setAssistantRoleHint('continuity-review')
                      setActiveModule('assistants')
                    }}
                    language={language}
                  />
                ) : (
                  <WritingWorkspace
                    docs={docs}
                    level={workLevel === 'ai' ? 'chapter' : workLevel}
                    storyStructure={storyStructure}
                    viewMode={viewMode}
                    search={search}
                    selectedOutline={writingOutline}
                    selectedScene={selectedScene}
                    selectedTarget={selectedTarget}
                    doc={doc}
                    contextPacket={contextPacket}
                    dirty={dirty}
                    busy={busy}
                    visibleItems={filteredItems}
                    finalizedScenes={finalizedScenes}
                    leftMode={leftMode}
                    root={root}
                    onLevel={selectWorkLevel}
                    onSearch={setSearch}
                    onViewMode={setViewMode}
                    onSelect={selectWritingTarget}
                    onCreate={(level, parent) => {
                      if (level === 'ai') return
                      const parentDoc = docs.find(
                        (item) => item.data.type === 'outline' && item.data.id === parent
                      )
                      setOutlineCreate({
                        level,
                        parent: parent ?? null,
                        parentTitle: parentDoc?.data.title ?? null
                      })
                    }}
                    onDocChange={(next) => {
                      setDoc(next)
                      setDirty(true)
                    }}
                    onSave={save}
                    onDelete={deleteSelectedDoc}
                    onCheck={runCheck}
                    onAcceptScene={async (sceneId, content) => {
                      await bridge.acceptManualScene(root, sceneId, content)
                      await load()
                    }}
                    onMergeChapter={async (chapterId) => {
                      await bridge.mergeChapterSnapshot(root, chapterId)
                      await load()
                    }}
                    onImportPanel={() => openAIImport()}
                    onReload={load}
                    language={language}
                  />
                )
              ) : (
                <ModuleView
                  root={root}
                  module={activeModule}
                  docs={docs}
                  runs={data.runs}
                  onCreate={createDoc}
                  onCreateBlank={async (kind, input) => {
                    const createdPath = await createDoc(kind, input)
                    const created = await bridge.readDoc(String(createdPath))
                    const createdDoc = { ...created, path: String(createdPath) } as DocEntry
                    const nextSection = outlineSectionForDocument(createdDoc)
                    setWorkspaceMode('planning')
                    setWorkspacePage('outline')
                    if (nextSection) setOutlineSection(nextSection)
                    setDoc(createdDoc)
                    setSelectedTarget({ type: String(created.data.type), id: String(created.data.id) })
                    setRightOpen(true)
                    setDirty(false)
                  }}
                  onAIPlanningCreate={(module) => setPlanningDialog({ module })}
                  onAIConvertCard={convertPlanningCard}
                  onSpecializeCard={specializePlanningCard}
                  onUploadReferences={uploadReferences}
                  onAIExtractReference={extractCardsFromReference}
                  selectedTarget={selectedTarget}
                  onSelect={setSelectedTarget}
                  onOpenCard={(card) => {
                    if (card.data.type === 'reference') return
                    const origin = card.data.quillarium_origin
                    if (!origin || typeof origin !== 'object') {
                      void bridge
                        .resolveDocumentOrigin(root, card.path)
                        .then((resolved: DocumentOriginResolution | null) => {
                          if (
                            resolved?.origin.kind === 'ai-import' ||
                            resolved?.origin.kind === 'document-import'
                          ) {
                            setImportOriginDoc(card)
                          }
                        })
                        .catch(() => undefined)
                      return
                    }
                    const record = origin as Record<string, unknown>
                    if (record.kind === 'ai-conversation' && typeof record.session_id === 'string') {
                      setPlanningDialog({ module: activeModule, sessionId: record.session_id })
                    } else if (record.kind === 'ai-import' || record.kind === 'document-import') {
                      setImportOriginDoc(card)
                    }
                  }}
                  onOpenAssistant={(roleId, target) => {
                    setSelectedTarget(target)
                    setAssistantRoleHint(roleId)
                    setActiveModule('assistants')
                  }}
                  onReload={load}
                  language={language}
                  displayLayer={displayLayer}
                />
              )}
            </main>
          </div>
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
          navigationPosition={skinLayout.navigation}
          detailPosition={skinLayout.detail}
          onBackOutline={() => {
            setWorkspacePage('outline')
            setOutlineSection('volumes')
            setSelectedTarget({ type: 'outline', id: activeVolume.data.id })
          }}
          onVolume={(volume) => {
            setActiveVolumeId(volume.data.id)
            setVolumeSection('parts')
            setSelectedTarget({ type: 'outline', id: volume.data.id })
            setRightOpen(true)
          }}
          onSection={(section) => {
            setVolumeSection(section)
            setSelectedTarget(section === 'parts' ? { type: 'outline', id: activeVolume.data.id } : null)
            setDoc(null)
            setRightOpen(section === 'parts')
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
            const loaded = await bridge.readDoc(String(created))
            setDoc({ ...loaded, path: String(created) })
            setSelectedTarget({ type: String(loaded.data.type), id: String(loaded.data.id) })
            setRightOpen(true)
          }}
          onAIPlanningCreate={(module) => setPlanningDialog({ module })}
          onAIEditCard={(card) => void openPlanningCardEditor(card, volumeSection)}
          onAIConvertCard={convertPlanningCard}
          onUploadReferences={uploadReferences}
          onAIExtractReference={extractCardsFromReference}
          onPlanningCheck={runProjectPlanningCheck}
          onDelete={deleteSelectedDoc}
          onOpenExternal={async () => {
            if (!doc) return
            await bridge.openDocExternal(doc.path)
          }}
          onReloadDoc={async () => {
            if (!doc) return
            if (
              dirty &&
              !window.confirm(
                language === 'zh'
                  ? '当前有未保存修改。同步外部文件会覆盖右栏内容，继续吗？'
                  : 'You have unsaved changes. Syncing the external file will replace the detail pane. Continue?'
              )
            )
              return
            const parsed = await bridge.readDoc(doc.path)
            setDoc({ ...parsed, path: doc.path })
            setDirty(false)
          }}
          onReloadProject={load}
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onInspectTag={(value, displayValue) => setActiveTag({ value, displayValue })}
          onSave={save}
          onImport={() => openAIImport()}
          onBookBreakdown={() => setBookBreakdownOpen(true)}
          language={language}
          displayLayer={displayLayer}
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
          navigationPosition={skinLayout.navigation}
          detailPosition={skinLayout.detail}
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
            setVolumeSection('parts')
            setSelectedTarget({ type: 'outline', id: volume.data.id })
            setRightOpen(true)
          }}
          onCreate={async (kind, input) => {
            const created = await createDoc(kind, input)
            const loaded = await bridge.readDoc(String(created))
            setDoc({ ...loaded, path: String(created) })
            setSelectedTarget({ type: String(loaded.data.type), id: String(loaded.data.id) })
            setRightOpen(true)
          }}
          onAIPlanningCreate={(module) => setPlanningDialog({ module })}
          onAIEditCard={(card) => void openPlanningCardEditor(card, outlineSection)}
          onAIConvertCard={convertPlanningCard}
          onUploadReferences={uploadReferences}
          onAIExtractReference={extractCardsFromReference}
          onPlanningCheck={runProjectPlanningCheck}
          onDelete={deleteSelectedDoc}
          onOpenExternal={async () => {
            if (!doc) return
            await bridge.openDocExternal(doc.path)
          }}
          onReloadDoc={async () => {
            if (!doc) return
            if (
              dirty &&
              !window.confirm(
                language === 'zh'
                  ? '当前有未保存修改。同步外部文件会覆盖右栏内容，继续吗？'
                  : 'You have unsaved changes. Syncing the external file will replace the detail pane. Continue?'
              )
            )
              return
            const parsed = await bridge.readDoc(doc.path)
            setDoc({ ...parsed, path: doc.path })
            setDirty(false)
          }}
          onReloadProject={load}
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onInspectTag={(value, displayValue) => setActiveTag({ value, displayValue })}
          onSave={save}
          onImport={() => openAIImport()}
          onBookBreakdown={() => setBookBreakdownOpen(true)}
          onTransferToForeshadowing={async (card) => {
            await specializePlanningCard(card, 'foreshadowing', {})
            setWritingTag('foreshadowing')
            setActiveModule('write')
            setWorkspaceMode('writing')
          }}
          language={language}
          displayLayer={displayLayer}
        />
      )}
      {bookBreakdownOpen && (
        <BookBreakdownDialog
          root={root}
          language={language}
          onClose={() => setBookBreakdownOpen(false)}
          onImported={load}
        />
      )}
      {importOpen && (
        <AIImportDialog
          root={root}
          docs={docs}
          language={language}
          initialSourcePaths={importSourcePaths}
          onClose={() => {
            setImportOpen(false)
            setImportSourcePaths([])
          }}
          onImported={load}
          onOpenAssistant={(sourceText) => {
            setImportOpen(false)
            setImportSourcePaths([])
            setAssistantRoleHint('setting-organizer')
            setAssistantInitialMessage(sourceText)
            setWorkspaceMode('writing')
            setActiveModule('assistants')
          }}
        />
      )}
      {droppedSourcePaths && (
        <FileDropIntentDialog
          sourcePaths={droppedSourcePaths}
          language={language}
          onClose={() => setDroppedSourcePaths(null)}
          onReference={async (sourcePaths) => {
            await uploadReferences(sourcePaths)
            setDroppedSourcePaths(null)
          }}
          onSettingImport={(sourcePaths) => {
            setDroppedSourcePaths(null)
            openAIImport(sourcePaths)
          }}
        />
      )}
      {planningDialog && (
        <PlanningCreationDialog
          root={root}
          docs={docs}
          module={planningDialog.module}
          sessionId={planningDialog.sessionId}
          documentId={planningDialog.documentId}
          language={language}
          onClose={() => setPlanningDialog(null)}
          onCreated={async ({ path: createdPath, document }) => {
            await load()
            const createdDoc = { ...document, path: createdPath } as DocEntry
            const nextSection = outlineSectionForDocument(createdDoc)
            if (createdDoc.data.type === 'foreshadowing') {
              setWorkspaceMode('writing')
              setWritingTag('foreshadowing')
              setActiveModule('write')
            } else if (createdDoc.data.type === 'reference' && storyStructure.scene_enabled) {
              setWorkspaceMode('writing')
              setWritingTag('references')
              setActiveModule('write')
            } else if (nextSection && planningDialog.module === 'prose-extraction') {
              setWorkspaceMode('planning')
              setWorkspacePage('outline')
              setOutlineSection(nextSection)
            } else if (nextSection && planningDialog.module === 'card-conversion') {
              if (workspaceMode === 'planning') {
                if (workspacePage === 'volume') setVolumeSection(nextSection)
                else setOutlineSection(nextSection)
              } else {
                const nextModule = moduleForDocument(createdDoc)
                if (nextModule) setActiveModule(nextModule)
              }
            }
            setDoc(createdDoc)
            setSelectedTarget({ type: String(document.data.type), id: String(document.data.id) })
            setRightOpen(true)
            setDirty(false)
            setPlanningDialog(null)
          }}
        />
      )}
      {importOriginDoc && (
        <CardOriginDialog
          root={root}
          doc={importOriginDoc}
          language={language}
          onClose={() => setImportOriginDoc(null)}
          onReimported={async ({ path: reimportedPath, document }) => {
            await load()
            setDoc({ ...document, path: reimportedPath })
            setSelectedTarget({ type: String(document.data.type), id: String(document.data.id) })
            setDirty(false)
            setImportOriginDoc(null)
          }}
        />
      )}
      {outlineCreate && (
        <OutlineCreateDialog
          label={outlineLevelLabel(outlineCreate.level)}
          parentTitle={outlineCreate.parentTitle}
          language={language}
          busy={outlineCreating}
          onClose={() => setOutlineCreate(null)}
          onConfirm={async (title) => {
            setOutlineCreating(true)
            try {
              await createOutlineAtLevel(outlineCreate.level, title, outlineCreate.parent)
              setOutlineCreate(null)
            } finally {
              setOutlineCreating(false)
            }
          }}
        />
      )}
      <TagIndexDrawer
        tag={activeTag?.value ?? null}
        displayValue={activeTag?.displayValue}
        docs={docs}
        language={language}
        onClose={() => setActiveTag(null)}
        onSelect={(target, matchedDoc) => {
          const section = outlineSectionForDocument(matchedDoc)
          if (matchedDoc.data.type === 'foreshadowing') {
            setWorkspaceMode('writing')
            setWritingTag('foreshadowing')
            setActiveModule('write')
            setDoc(matchedDoc)
          } else if (matchedDoc.data.type === 'reference' && storyStructure.scene_enabled) {
            setWorkspaceMode('writing')
            setWritingTag('references')
            setActiveModule('write')
            setDoc(matchedDoc)
          } else if (matchedDoc.data.type === 'outline') {
            setWorkspaceMode('writing')
            setWritingTag('tree')
            setActiveModule('write')
          } else if (section) {
            setWorkspaceMode('planning')
            setWorkspacePage('outline')
            setOutlineSection(section)
          }
          setSelectedTarget(target)
          setRightOpen(true)
        }}
      />
      {planningCheck && (
        <PlanningCheckPanel
          outcome={planningCheck}
          language={language}
          busy={busy}
          onClose={closePlanningCheck}
          onRetry={retryProjectPlanningCheck}
          onApply={applyProjectPlanningCheck}
          onInspect={inspectPlanningCheck}
        />
      )}
      {(referenceUploadError || actionError || gitMessage) && (
        <ToastNotice
          message={referenceUploadError || actionError || gitMessage}
          kind={referenceUploadError || actionError ? 'error' : 'status'}
          language={language}
          onDismiss={() => {
            setReferenceUploadError('')
            clearNotice()
          }}
        />
      )}
    </div>
  )
}

function outlineSectionForDocument(doc: DocEntry): OutlineHomeSection | null {
  const sections: Partial<Record<string, OutlineHomeSection>> = {
    world_entry: 'world',
    character: 'characters',
    character_relation: 'characters',
    faction: 'factions',
    faction_relation: 'factions',
    faction_membership: 'factions',
    timeline_node: 'timeline',
    timeline_event: 'timeline',
    location: 'locations',
    item: 'items',
    rank_ladder: 'ranks',
    rank_holding: 'ranks'
  }
  return sections[doc.data.type] ?? null
}

function moduleForDocument(doc: DocEntry): ModuleName | null {
  const modules: Partial<Record<string, ModuleName>> = {
    canon: 'canon',
    world_entry: 'world',
    character: 'characters',
    character_relation: 'characters',
    faction: 'factions',
    faction_relation: 'factions',
    faction_membership: 'factions',
    timeline_node: 'timeline',
    timeline_event: 'timeline',
    location: 'locations',
    foreshadowing: 'foreshadowing',
    narrative: 'narrative'
  }
  return modules[doc.data.type] ?? null
}
