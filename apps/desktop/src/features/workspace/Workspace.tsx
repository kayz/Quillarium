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
  buildOutlineHierarchy,
  buildScenePath,
  filterDocs,
  findAncestor,
  firstSelectableForLevel,
  isWorkLevel,
  nextWorkLevel,
  outlineItemsForLevel,
  outlineSortKey
} from '../../shared/outline.js'
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
  const [outlineSection, setOutlineSection] = useState<OutlineHomeSection>('overview')
  const [volumeSection, setVolumeSection] = useState<VolumeSection>('parts')
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null)
  const [workLevel, setWorkLevel] = useState<WorkLevel>('book')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [leftMode, setLeftMode] = useState<LeftMode>('write')
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [gitMessage, setGitMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [assembledPrompt, setAssembledPrompt] = useState('')

  const load = async () => {
    const loaded = await bridge.loadProject(root)
    setData({ ...loaded, project: { ...loaded.project, root } })
    if (loaded.project.default_theme) onTheme(loaded.project.default_theme)
    setGit(await bridge.gitStatus(root))
    const scenes = loaded.docs.filter((item: DocEntry) => item.data.type === 'scene')
    const outlines = loaded.docs.filter((item: DocEntry) => item.data.type === 'outline')
    const initialOutline =
      outlines.find((item: DocEntry) => item.data.level === 'overview') ??
      outlines.find((item: DocEntry) => item.data.level === 'book') ??
      outlines[0]
    if (!selectedTarget && initialOutline) {
      setSelectedTarget({ type: 'outline', id: initialOutline.data.id })
      const level = String(initialOutline.data.level)
      if (isWorkLevel(level)) setWorkLevel(level)
    } else if (!selectedTarget && scenes[0]) setSelectedTarget({ type: 'scene', id: scenes[0].data.id })
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
  const selectedProse = useMemo(
    () =>
      selectedTarget?.type === 'chapter_prose'
        ? (data?.docs.find(
            (item) => item.data.id === selectedTarget.id && item.data.type === 'chapter_prose'
          ) ?? null)
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
        if (workLevel === 'ai' && assembledPrompt.trim()) void generateFromPrompt(assembledPrompt)
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        void runCheck()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, selectedScene?.data.id, selectedOutline?.data.id, workLevel, assembledPrompt])

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
  const proseChapter = selectedProse
    ? (docs.find((item) => item.data.type === 'outline' && item.data.id === selectedProse.data.chapter_id) ??
      null)
    : null
  const projectPath = selectedScene
    ? buildScenePath(docs, selectedScene, language)
    : proseChapter
      ? `${buildOutlinePath(docs, proseChapter)} / ${language === 'zh' ? '章正文' : 'Chapter prose'}`
      : selectedOutline
        ? buildOutlinePath(docs, selectedOutline)
        : language === 'zh'
          ? '规划'
          : 'Planning'
  const writingOutline =
    selectedOutline ??
    (selectedScene
      ? (docs.find(
          (item) =>
            item.data.type === 'outline' &&
            item.data.id === (selectedScene.data.chapter_id ?? selectedScene.data.section)
        ) ?? null)
      : null) ??
    proseChapter
  const hierarchy = buildOutlineHierarchy(docs)
  const childLevel = nextWorkLevel(workLevel)
  const visibleItems =
    selectedOutline && workLevel === 'part'
      ? (hierarchy.children.get(selectedOutline.data.id) ?? []).filter((item) =>
          ['act', 'chapter'].includes(String(item.data.level))
        )
      : selectedOutline && childLevel && childLevel !== 'ai'
        ? (hierarchy.children.get(selectedOutline.data.id) ?? []).filter(
            (item) => item.data.level === childLevel || (childLevel === 'part' && item.data.level === 'arc')
          )
        : (workLevel === 'overview' || workLevel === 'book') && !selectedOutline
          ? outlineItemsForLevel(docs, workLevel, null, null)
          : []
  const filteredItems = filterDocs(visibleItems, search)
  const finalizedScenes = docs.filter((item) => item.data.type === 'scene' && item.data.status === 'final')

  const runWorkspaceAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setActionError('')
    try {
      await action()
    } catch (error) {
      setActionError(formatDesktopError(error, language))
    } finally {
      setBusy(false)
    }
  }

  const persistCurrentDoc = async () => {
    if (!doc) return
    if (!String(doc.data.title ?? '').trim()) {
      throw new Error(language === 'zh' ? '名称不能为空。' : 'Name cannot be empty.')
    }
    const nextData = { ...doc.data, title: String(doc.data.title).trim() }
    await bridge.saveDocBody(doc.path, nextData, doc.content)
    setDoc({ ...doc, data: nextData })
    setDirty(false)
  }

  const reloadCurrentDoc = async () => {
    if (!doc) return
    const parsed = await bridge.readDoc(doc.path)
    setDoc({ ...parsed, path: doc.path })
    setDirty(false)
  }

  const save = async () => {
    await runWorkspaceAction(async () => {
      await persistCurrentDoc()
      await load()
    })
  }

  const finalizeChapterProse = async (chapterId: string) => {
    await runWorkspaceAction(async () => {
      await persistCurrentDoc()
      await bridge.finalizeChapter(root, chapterId)
      await load()
      await reloadCurrentDoc()
    })
  }

  const publishChapterProse = async (chapterId: string, confirmation: string) => {
    await runWorkspaceAction(async () => {
      await persistCurrentDoc()
      await bridge.publishChapter(root, chapterId, confirmation)
      await load()
      await reloadCurrentDoc()
    })
  }

  const runCheck = async (contentOverride?: string) => {
    if (!selectedTarget) return
    await runWorkspaceAction(async () => {
      if (selectedTarget.type === 'scene' && contentOverride === undefined && dirty) {
        await persistCurrentDoc()
      }
      const result =
        selectedTarget.type === 'scene'
          ? await bridge.checkSceneIntoRun(root, selectedTarget.id, contentOverride)
          : await bridge.checkTarget(root, selectedTarget)
      setCheckReport(result.report)
      await load()
    })
  }

  const runProjectPlanningCheck = async () => {
    await runWorkspaceAction(async () => {
      if (dirty) await persistCurrentDoc()
      const summary = await bridge.checkPlanningCards(root, language)
      await load()
      setWorkspaceMode('planning')
      setWorkspacePage('outline')
      setOutlineSection('issues')
      setDoc(null)
      const issueId = summary.created_issue_ids[0] ?? summary.updated_issue_ids[0]
      setSelectedTarget(issueId ? { type: 'issue', id: issueId } : null)
      setRightOpen(Boolean(issueId))
      const findings = summary.rule_findings + summary.ai_findings
      setGitMessage(
        language === 'zh'
          ? `AI 检查完成：检查 ${summary.checked_cards} 项，发现 ${findings} 个问题；新建 ${summary.created_issue_ids.length} 张问题卡，更新 ${summary.updated_issue_ids.length} 张，跳过 ${summary.skipped_disabled} 张未启用卡片。`
          : `AI check complete: checked ${summary.checked_cards}, found ${findings}; created ${summary.created_issue_ids.length} issue cards, updated ${summary.updated_issue_ids.length}, and skipped ${summary.skipped_disabled} disabled cards.`
      )
    })
  }

  const generateFromPrompt = async (prompt: string, count = 3, parentRunId?: string) => {
    if (!writingOutline || writingOutline.data.level !== 'chapter' || !prompt.trim()) return
    await runWorkspaceAction(async () => {
      try {
        await bridge.generateOutlineCandidates(
          root,
          writingOutline.data.id,
          prompt,
          selectedScene?.data.id,
          count,
          parentRunId
        )
      } finally {
        // A provider can fail after earlier candidates completed; always reveal retained Runs.
        await load()
      }
    })
  }

  const createGitHubRepo = async () => {
    setGitBusy(true)
    setGitMessage('')
    try {
      setGit(await bridge.githubCreateRepoForProject(root))
      setGitMessage('已创建私有 GitHub 仓库，并完成初次同步。')
    } catch (err) {
      setGitMessage(formatDesktopError(err, language))
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
      setGitMessage(formatDesktopError(err, language))
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
    const next = firstSelectableForLevel(docs, level === 'ai' ? 'chapter' : level, selectedOutline)
    if (next) setSelectedTarget({ type: 'outline', id: next.data.id })
    else setSelectedTarget(null)
  }

  const selectWritingTarget = (target: TargetSelection) => {
    setActiveModule('write')
    if (target.view === 'prose') {
      setSelectedTarget(target)
      setWorkLevel('chapter')
      const existing = data.docs.find(
        (item) => item.data.type === 'chapter_prose' && item.data.chapter_id === target.id
      )
      if (existing) {
        setSelectedTarget({ type: 'chapter_prose', id: existing.data.id })
        return
      }
      void (async () => {
        setBusy(true)
        setActionError('')
        try {
          const lifecycle = await bridge.loadChapterLifecycle(root, target.id)
          const loaded = await bridge.loadProject(root)
          setData({ ...loaded, project: { ...loaded.project, root } })
          setDoc({
            path: lifecycle.prose.path,
            data: lifecycle.prose.data as unknown as Record<string, unknown>,
            content: lifecycle.prose.content
          })
          setSelectedTarget({ type: 'chapter_prose', id: lifecycle.prose.data.id })
          setDirty(false)
        } catch (error) {
          setActionError(formatDesktopError(error, language))
        } finally {
          setBusy(false)
        }
      })()
      return
    }
    setSelectedTarget(target)
    if (target.view === 'ai' || target.type === 'scene') {
      setWorkLevel('ai')
      return
    }
    const targetOutline = docs.find((item) => item.data.type === 'outline' && item.data.id === target.id)
    const level = String(targetOutline?.data.level ?? '')
    if (level === 'section') setWorkLevel('chapter')
    else if (level === 'arc') setWorkLevel('part')
    else if (isWorkLevel(level)) setWorkLevel(level)
  }

  const createOutlineAtLevel = async (level: WorkLevel, title: string, parent?: string | null) => {
    if (level === 'ai' || !title.trim()) return
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

  const deleteSelectedDoc = async () => {
    if (!doc) return
    const type = String(doc.data.type ?? '')
    const level = String(doc.data.level ?? '')
    const isBranch =
      type === 'outline' && ['volume', 'part', 'arc', 'act', 'chapter', 'section'].includes(level)
    const acceptedScene = type === 'scene' && Boolean(doc.data.accepted_at)
    const title = String(doc.data.title ?? '当前文档')
    const ok = window.confirm(
      isBranch
        ? `删除「${title}」及其全部下级内容？只要其中没有已发布正文，卷、篇、幕、章、节及相关运行记录都会一并删除。`
        : acceptedScene
          ? `删除节「${title}」？它的节文件和运行记录会删除；已经写入章正文的文字会保留，供你在章正文中手工调整。`
          : `删除「${title}」？此操作会删除对应文件和相关运行记录。`
    )
    if (!ok) return
    const parentId =
      type === 'scene'
        ? String(doc.data.chapter_id ?? doc.data.section ?? '')
        : typeof doc.data.parent === 'string'
          ? doc.data.parent
          : ''
    const parent = docs.find((item) => item.data.type === 'outline' && item.data.id === parentId)
    await runWorkspaceAction(async () => {
      await bridge.deleteDoc(doc.path)
      setDoc(null)
      setSelectedTarget(parent ? { type: 'outline', id: parent.data.id } : null)
      const parentLevel = String(parent?.data.level ?? '')
      if (isWorkLevel(parentLevel)) setWorkLevel(parentLevel)
      setRightOpen(false)
      await load()
    })
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
        gitMessage,
        actionError,
        assembledPrompt
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
        clearNotice: () => {
          setActionError('')
          setGitMessage('')
        }
      }}
    />
  )
}
