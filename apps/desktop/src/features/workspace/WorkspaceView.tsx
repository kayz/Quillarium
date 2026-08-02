import type { Dispatch, SetStateAction } from 'react'
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
import { VolumeHome } from '../outline/VolumeHome.js'
import { TopChrome } from '../settings/TopChrome.js'
import { WritingBottomPanel } from '../writing/WritingBottomPanel.js'
import { WritingWorkspace } from '../writing/WritingWorkspace.js'

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
    importTitle: string
    importText: string
    importMessage: string
    gitMessage: string
    actionError: string
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
    createOutlineAtLevel: (level: WorkLevel, parent?: string | null) => Promise<void>
    setDoc: Dispatch<SetStateAction<EditableDoc | null>>
    setDirty: Dispatch<SetStateAction<boolean>>
    save: () => Promise<void>
    runCheck: () => Promise<void>
    runSemanticCheck: () => Promise<void>
    generate: () => Promise<void>
    dryRun: () => Promise<void>
    rewrite: () => Promise<void>
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
    setImportTitle: Dispatch<SetStateAction<string>>
    setImportText: Dispatch<SetStateAction<string>>
    importMarkdownFromText: () => Promise<void>
  }
}

export function WorkspaceView({ app, state, actions }: WorkspaceViewProps) {
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
    importTitle,
    importText,
    importMessage,
    gitMessage,
    actionError
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
    runCheck,
    runSemanticCheck,
    generate,
    dryRun,
    rewrite,
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
    setImportTitle,
    setImportText,
    importMarkdownFromText
  } = actions

  return (
    <div
      className={
        workspaceMode === 'writing'
          ? `app-shell writing-shell level-${workLevel} ${leftOpen ? '' : 'left-collapsed'}`
          : `app-shell outline-shell ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`
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
              ? `大纲 / ${activeVolume.data.title}`
              : '大纲'
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
            <main className="center">
              {!leftOpen && (
                <button className="panel-toggle left" onClick={() => setLeftOpen(true)}>
                  {t(language, 'bookOutline')}
                </button>
              )}
              {activeModule === 'write' ? (
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
                  onCreate={createOutlineAtLevel}
                  onDocChange={(next) => {
                    setDoc(next)
                    setDirty(true)
                  }}
                  onSave={save}
                  onCheck={runCheck}
                  onSemanticCheck={runSemanticCheck}
                  onGenerate={generate}
                  onDryRun={dryRun}
                  onRewrite={rewrite}
                  onImportPanel={() => setImportOpen(true)}
                  language={language}
                />
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
          </div>
          <WritingBottomPanel
            root={root}
            docs={docs}
            runs={data.runs}
            level={workLevel}
            sceneId={selectedScene?.data.id ?? null}
            outline={writingOutline}
            scene={selectedScene}
            context={context}
            contextPacket={contextPacket}
            checkReport={checkReport}
            busy={busy}
            onCheck={runCheck}
            onGenerate={generate}
            onAccepted={load}
            language={language}
          />
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
            setVolumeSection('arcs')
            setSelectedTarget({ type: 'outline', id: volume.data.id })
            setRightOpen(true)
          }}
          onSection={(section) => {
            setVolumeSection(section)
            setSelectedTarget(section === 'arcs' ? { type: 'outline', id: activeVolume.data.id } : null)
            setDoc(null)
            setRightOpen(section === 'arcs')
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
          onDelete={deleteSelectedDoc}
          onOpenExternal={async () => {
            if (!doc) return
            await bridge.openDocExternal(doc.path)
          }}
          onReloadDoc={async () => {
            if (!doc) return
            if (dirty && !window.confirm('当前有未保存修改。同步外部文件会覆盖右栏内容，继续吗？')) return
            const parsed = await bridge.readDoc(doc.path)
            setDoc({ ...parsed, path: doc.path })
            setDirty(false)
          }}
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
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
            setVolumeSection('arcs')
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
          onDelete={deleteSelectedDoc}
          onOpenExternal={async () => {
            if (!doc) return
            await bridge.openDocExternal(doc.path)
          }}
          onReloadDoc={async () => {
            if (!doc) return
            if (dirty && !window.confirm('当前有未保存修改。同步外部文件会覆盖右栏内容，继续吗？')) return
            const parsed = await bridge.readDoc(doc.path)
            setDoc({ ...parsed, path: doc.path })
            setDirty(false)
          }}
          onDocChange={(next) => {
            setDoc(next)
            setDirty(true)
          }}
          onSave={save}
          onImport={() => setImportOpen(true)}
          language={language}
        />
      )}
      {importOpen && (
        <div className="modal-backdrop">
          <section className="modal import-modal">
            <h2>粘贴 Markdown 导入</h2>
            <p>
              后台会先走现有 Markdown 结构判断；接入背景 AI 后会在这里完成分类、pattern 标注和低置信 issue。
            </p>
            <label>
              标题
              <input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} />
            </label>
            <label>
              Markdown
              <textarea value={importText} onChange={(event) => setImportText(event.target.value)} />
            </label>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setImportOpen(false)}>
                取消
              </button>
              <button
                className="primary"
                onClick={importMarkdownFromText}
                disabled={busy || !importText.trim()}
              >
                导入
              </button>
            </div>
          </section>
        </div>
      )}
      {(actionError || importMessage || gitMessage) && (
        <div className={`toast ${actionError ? 'error' : ''}`} role={actionError ? 'alert' : 'status'}>
          {actionError || gitMessage || importMessage}
        </div>
      )}
    </div>
  )
}
