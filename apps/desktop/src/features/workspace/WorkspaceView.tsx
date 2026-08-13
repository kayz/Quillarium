import { useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react'
import type { DocumentOriginResolution } from '@quillarium/core'
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
  TargetSelection,
  ThemeName,
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
import { ModuleNav, StructureTree } from '../navigation/WorkspaceNavigation.js'
import { ModuleView } from '../modules/ModuleView.js'
import { OutlineHome } from '../outline/OutlineHome.js'
import { OutlineCreateDialog } from '../outline/OutlineCreateDialog.js'
import { VolumeHome } from '../outline/VolumeHome.js'
import { TopChrome } from '../settings/TopChrome.js'
import { AIWritingWorkspace } from '../writing/AIWritingWorkspace.js'
import { ChapterProseWorkspace } from '../writing/ChapterProseWorkspace.js'
import { WritingWorkspace } from '../writing/WritingWorkspace.js'
import { PlanningCreationDialog } from '../planning/PlanningCreationDialog.js'
import { CardOriginDialog } from '../import/CardOriginDialog.js'
import { AIImportDialog } from '../import/AIImportDialog.js'
import { TagIndexDrawer } from '../metadata/TagIndexDrawer.js'
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { outlineLevelLabel } from '../../shared/outline.js'
import { ToastNotice } from '../feedback/ToastNotice.js'

type EditableDoc = { data: Record<string, unknown>; content: string; path: string }

interface WorkspaceViewProps {
  app: {
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
  }
  actions: {
    createGitHubRepo: () => Promise<void>
    syncGitHub: () => Promise<void>
    setWorkspaceMode: Dispatch<SetStateAction<WorkspaceMode>>
    setActiveModule: Dispatch<SetStateAction<ModuleName>>
    selectWritingTarget: (target: TargetSelection) => void
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
    runProjectPlanningCheck: () => Promise<void>
    setAssembledPrompt: Dispatch<SetStateAction<string>>
    generateFromPrompt: (prompt: string, count?: number, parentRunId?: string) => Promise<void>
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
  const { root, theme, density, language, aiStatus, onTheme, onDensity, onLanguage, onAIStatus, onBack } = app
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
    assembledPrompt
  } = state
  const {
    createGitHubRepo,
    syncGitHub,
    setWorkspaceMode,
    setActiveModule,
    selectWritingTarget,
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
              ? `${language === 'zh' ? '规划' : 'Planning'} / ${activeVolume.data.title}`
              : language === 'zh'
                ? '规划'
                : 'Planning'
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
            {leftOpen && (
              <SplitHandle
                orientation="vertical"
                className="writing-sidebar-handle"
                label={language === 'zh' ? '调整左侧栏宽度' : 'Resize navigation sidebar'}
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
              {activeModule === 'write' ? (
                selectedTarget?.type === 'chapter_prose' && doc && writingOutline ? (
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
                    onFinalize={() => finalizeChapterProse(writingOutline.data.id)}
                    onPublish={(confirmation) => publishChapterProse(writingOutline.data.id, confirmation)}
                    onContinuityApplied={load}
                    language={language}
                  />
                ) : workLevel === 'ai' ? (
                  <AIWritingWorkspace
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
                    language={language}
                  />
                ) : (
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
                    dirty={dirty}
                    busy={busy}
                    visibleItems={filteredItems}
                    finalizedScenes={finalizedScenes}
                    leftMode={leftMode}
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
                    onImportPanel={() => setImportOpen(true)}
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
                  onAIPlanningCreate={(module) => setPlanningDialog({ module })}
                  selectedTarget={selectedTarget}
                  onSelect={setSelectedTarget}
                  onOpenCard={(card) => {
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
                  onReload={load}
                  language={language}
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
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onInspectTag={(value, displayValue) => setActiveTag({ value, displayValue })}
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
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onInspectTag={(value, displayValue) => setActiveTag({ value, displayValue })}
          onSave={save}
          onImport={() => setImportOpen(true)}
          language={language}
        />
      )}
      {importOpen && (
        <AIImportDialog
          root={root}
          docs={docs}
          language={language}
          onClose={() => setImportOpen(false)}
          onImported={load}
        />
      )}
      {planningDialog && (
        <PlanningCreationDialog
          root={root}
          module={planningDialog.module}
          sessionId={planningDialog.sessionId}
          documentId={planningDialog.documentId}
          language={language}
          onClose={() => setPlanningDialog(null)}
          onCreated={async ({ path: createdPath, document }) => {
            await load()
            setDoc({ ...document, path: createdPath })
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
          if (section) {
            setWorkspaceMode('planning')
            setWorkspacePage('outline')
            setOutlineSection(section)
          }
          setSelectedTarget(target)
          setRightOpen(true)
        }}
      />
      {(actionError || gitMessage) && (
        <ToastNotice
          message={actionError || gitMessage}
          kind={actionError ? 'error' : 'status'}
          language={language}
          onDismiss={clearNotice}
        />
      )}
    </div>
  )
}

function outlineSectionForDocument(doc: DocEntry): OutlineHomeSection | null {
  if (doc.data.type === 'outline') {
    const level = String(doc.data.level ?? '')
    if (level === 'overview') return 'overview'
    if (level === 'book') return 'book'
    if (level === 'volume') return 'volumes'
    return null
  }
  const sections: Partial<Record<string, OutlineHomeSection>> = {
    canon: 'canon',
    world_entry: 'world',
    character: 'characters',
    timeline_node: 'timeline',
    timeline_event: 'timeline',
    location: 'locations',
    foreshadowing: 'foreshadowing',
    pattern: 'narrative',
    strategy: 'narrative',
    narrative: 'narrative',
    issue: 'issues',
    reference: 'references'
  }
  return sections[doc.data.type] ?? null
}
