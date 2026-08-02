import { useEffect, useMemo, useState } from 'react'
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
import { formatDesktopError } from '../../shared/errors.js'
import { bridge } from '../../app/bridge.js'
import {
  buildOutlinePath,
  buildScenePath,
  filterDocs,
  findAncestor,
  firstSelectableForLevel,
  isWorkLevel,
  outlineItemsForLevel,
  outlineLevelLabel,
  outlineSortKey
} from '../../shared/outline.js'
import { formatImportResult } from '../../shared/text.js'
import { WorkspaceView } from './WorkspaceView.js'

export function Workspace({
  root,
  theme,
  density,
  language,
  aiStatus,
  onTheme,
  onDensity,
  onLanguage,
  onAIStatus,
  onBack
}: {
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
}) {
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<TargetSelection | null>(null)
  const [activeModule, setActiveModule] = useState<ModuleName>('write')
  const [doc, setDoc] = useState<{ data: Record<string, unknown>; content: string; path: string } | null>(
    null
  )
  const [context, setContext] = useState('')
  const [contextPacket, setContextPacket] = useState<ContextPacketSummary | null>(null)
  const [checkReport, setCheckReport] = useState<CheckReport | null>(null)
  const [dirty, setDirty] = useState(false)
  const [git, setGit] = useState<GitState | null>(null)
  const [busy, setBusy] = useState(false)
  const [gitBusy, setGitBusy] = useState(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(false)
  const [middlePct, setMiddlePct] = useState(58)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('planning')
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>('outline')
  const [outlineSection, setOutlineSection] = useState<OutlineHomeSection>('volumes')
  const [volumeSection, setVolumeSection] = useState<VolumeSection>('arcs')
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null)
  const [workLevel, setWorkLevel] = useState<WorkLevel>('book')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [leftMode, setLeftMode] = useState<LeftMode>('write')
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importTitle, setImportTitle] = useState('')
  const [importText, setImportText] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [gitMessage, setGitMessage] = useState('')
  const [actionError, setActionError] = useState('')

  const load = async () => {
    const loaded = await bridge.loadProject(root)
    setData({ ...loaded, project: { ...loaded.project, root } })
    if (loaded.project.default_theme) onTheme(loaded.project.default_theme)
    setGit(await bridge.gitStatus(root))
    const scenes = loaded.docs.filter((item: DocEntry) => item.data.type === 'scene')
    const outlines = loaded.docs.filter((item: DocEntry) => item.data.type === 'outline')
    if (!selectedTarget && outlines[0]) setSelectedTarget({ type: 'outline', id: outlines[0].data.id })
    else if (!selectedTarget && scenes[0]) setSelectedTarget({ type: 'scene', id: scenes[0].data.id })
  }

  useEffect(() => {
    void load()
  }, [root])

  const selectedScene = useMemo(
    () =>
      selectedTarget?.type === 'scene'
        ? (data?.docs.find((item) => item.data.id === selectedTarget.id && item.data.type === 'scene') ??
          null)
        : null,
    [data, selectedTarget?.type, selectedTarget?.id]
  )
  const selectedOutline = useMemo(
    () =>
      selectedTarget?.type === 'outline'
        ? (data?.docs.find((item) => item.data.id === selectedTarget.id && item.data.type === 'outline') ??
          null)
        : null,
    [data, selectedTarget?.type, selectedTarget?.id]
  )
  const selectedEntry = useMemo(
    () =>
      data?.docs.find(
        (item) => item.data.id === selectedTarget?.id && item.data.type === selectedTarget?.type
      ) ?? null,
    [data, selectedTarget?.type, selectedTarget?.id]
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
  }, [doc, selectedScene?.data.id, selectedOutline?.data.id])

  useEffect(() => {
    async function openTarget() {
      const selected = selectedEntry
      if (!selected || !selectedTarget) return
      const parsed = await bridge.readDoc(selected.path)
      setDoc({ ...parsed, path: selected.path })
      setDirty(false)
      if (selectedTarget.type === 'outline' || selectedTarget.type === 'scene') {
        const target = selectedTarget as { type: 'outline' | 'scene'; id: string }
        const contextResult = await bridge.assembleTargetContext(root, target)
        setContext(contextResult.markdown)
        setContextPacket(contextResult.packet)
        const result = await bridge.checkTarget(root, target)
        setCheckReport(result.report)
      } else {
        setContext('')
        setContextPacket(null)
        setCheckReport(null)
      }
    }
    void openTarget()
  }, [root, selectedTarget?.type, selectedTarget?.id, selectedEntry?.path])

  if (!data) return <div className="loading">加载中...</div>

  const docs = data.docs
  const volumes = docs
    .filter((item) => item.data.type === 'outline' && item.data.level === 'volume')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const activeVolume =
    volumes.find((item) => item.data.id === activeVolumeId) ??
    (selectedOutline?.data.level === 'volume'
      ? selectedOutline
      : selectedOutline
        ? findAncestor(
            docs.filter((item) => item.data.type === 'outline'),
            selectedOutline,
            'volume'
          )
        : null) ??
    volumes[0] ??
    null
  const projectPath = selectedScene
    ? buildScenePath(docs, selectedScene, language)
    : selectedOutline
      ? buildOutlinePath(docs, selectedOutline)
      : '大纲'
  const writingOutline =
    selectedOutline ??
    (selectedScene
      ? (docs.find((item) => item.data.type === 'outline' && item.data.id === selectedScene.data.section) ??
        null)
      : null)
  const visibleItems = outlineItemsForLevel(docs, workLevel, selectedOutline, selectedTarget)
  const filteredItems = filterDocs(visibleItems, search)
  const finalizedScenes = docs.filter((item) => item.data.type === 'scene' && item.data.status === 'final')

  const runWorkspaceAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setActionError('')
    try {
      await action()
    } catch (error) {
      setActionError(formatDesktopError(error))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!doc) return
    await runWorkspaceAction(async () => {
      await bridge.saveDocBody(doc.path, doc.data, doc.content)
      setDirty(false)
      await load()
    })
  }

  const runCheck = async () => {
    if (!selectedTarget) return
    await runWorkspaceAction(async () => {
      const result =
        selectedTarget.type === 'scene'
          ? await bridge.checkSceneIntoRun(root, selectedTarget.id)
          : await bridge.checkTarget(root, selectedTarget)
      setCheckReport(result.report)
      await load()
    })
  }

  const runSemanticCheck = async () => {
    if (!selectedScene) return
    await runWorkspaceAction(async () => {
      setCheckReport(await bridge.semanticCheckScene(root, selectedScene.data.id))
    })
  }

  const dryRun = async () => {
    if (!selectedScene) return
    await runWorkspaceAction(async () => {
      await bridge.generateDryRun(root, selectedScene.data.id)
      await load()
    })
  }

  const generate = async () => {
    if (!selectedTarget) return
    await runWorkspaceAction(async () => {
      if (selectedTarget.type === 'outline') await bridge.generateOutline(root, selectedTarget.id)
      else await bridge.generate(root, selectedTarget.id)
      await load()
    })
  }

  const rewrite = async () => {
    await generate()
  }

  const createGitHubRepo = async () => {
    setGitBusy(true)
    setGitMessage('')
    try {
      setGit(await bridge.githubCreateRepoForProject(root))
      setGitMessage('已创建私有 GitHub 仓库，并完成初次同步。')
    } catch (err) {
      setGitMessage(formatDesktopError(err))
      setGit(await bridge.gitStatus(root))
    } finally {
      setGitBusy(false)
    }
  }

  const syncGitHub = async () => {
    setGitBusy(true)
    setGitMessage('')
    try {
      setGit(await bridge.gitSync(root, `Update ${data.project.title}`))
      setGitMessage('GitHub 同步完成。')
    } catch (err) {
      setGitMessage(formatDesktopError(err))
      setGit(await bridge.gitStatus(root))
    } finally {
      setGitBusy(false)
    }
  }

  const createDoc = async (kind: string, input: Record<string, unknown>) => {
    const created = await bridge.createDoc(root, kind, input)
    await load()
    return created
  }

  const selectWorkLevel = (level: WorkLevel) => {
    setWorkLevel(level)
    setLeftMode('write')
    const next = firstSelectableForLevel(docs, level, selectedOutline)
    if (next) setSelectedTarget({ type: 'outline', id: next.data.id })
  }

  const selectWritingTarget = (target: TargetSelection) => {
    setSelectedTarget(target)
    setActiveModule('write')
    if (target.type === 'scene') {
      setWorkLevel('chapter')
      return
    }
    const targetOutline = docs.find((item) => item.data.type === 'outline' && item.data.id === target.id)
    const level = String(targetOutline?.data.level ?? '')
    if (level === 'section') setWorkLevel('chapter')
    else if (isWorkLevel(level)) setWorkLevel(level)
  }

  const createOutlineAtLevel = async (level: WorkLevel, parent?: string | null) => {
    const title = window.prompt(`新建${outlineLevelLabel(level)}名称`)
    if (!title?.trim()) return
    const siblings = docs.filter(
      (item) =>
        item.data.type === 'outline' && item.data.level === level && item.data.parent === (parent ?? null)
    )
    const created = await createDoc('outline', {
      title: title.trim(),
      level,
      parent: parent ?? null,
      order: siblings.length,
      target_words: level === 'chapter' ? data.project.chapter_words : undefined,
      content: `## ${title.trim()}\n`
    })
    const loaded = await bridge.readDoc(String(created))
    setDoc({ ...loaded, path: String(created) })
    setSelectedTarget({ type: 'outline', id: String(loaded.data.id) })
    setWorkLevel(level)
  }

  const importMarkdownFromText = async () => {
    if (!importText.trim()) return
    setBusy(true)
    try {
      const result = await bridge.importMarkdownText(root, importText, importTitle)
      setImportMessage(formatImportResult(result))
      setImportText('')
      setImportTitle('')
      setImportOpen(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const deleteSelectedDoc = async () => {
    if (!doc) return
    const ok = window.confirm(`删除「${String(doc.data.title ?? '当前文档')}」？此操作会删除 Markdown 文件。`)
    if (!ok) return
    await bridge.deleteDoc(doc.path)
    setDoc(null)
    setSelectedTarget(null)
    setRightOpen(false)
    await load()
  }

  return (
    <WorkspaceView
      app={{ root, theme, density, language, aiStatus, onTheme, onDensity, onLanguage, onAIStatus, onBack }}
      state={{
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
      }}
      actions={{
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
      }}
    />
  )
}
