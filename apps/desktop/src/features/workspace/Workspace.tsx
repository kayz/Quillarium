import { useEffect, useMemo, useRef, useState } from 'react'
import type { PromptSourceSelection, ReorderStorySiblingsRequest } from '@quillarium/core'
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
  childWorkLevels,
  compareStoryEntries,
  filterDocs,
  findAncestor,
  firstSelectableForLevel,
  isWorkLevel,
  nextWorkLevel,
  normalizeStoryStructure,
  parentForNewLevel,
  outlineItemsForLevel
} from '../../shared/outline.js'
import { WorkspaceView } from './WorkspaceView.js'
import type {
  PlanningCheckApplyPanelOutcome,
  PlanningCheckPanelOutcome
} from '../agents/PlanningCheckPanel.js'
import { AILongTaskProgressDialog, useAIStreamPreview } from '../ai/AIStreamPreview.js'

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
  const [planningCheck, setPlanningCheck] = useState<PlanningCheckPanelOutcome | null>(null)
  const planningStream = useAIStreamPreview('planning-check')
  const planningCancelRequested = useRef(false)

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
  const storyStructure = normalizeStoryStructure(data?.project.story_structure)

  useEffect(() => {
    if (!data) return
    const partHidden = !storyStructure.part_enabled && (workLevel === 'part' || workLevel === 'act')
    const actHidden = !storyStructure.act_enabled && workLevel === 'act'
    const sceneHidden = !storyStructure.scene_enabled && workLevel === 'ai'
    if (!partHidden && !actHidden && !sceneHidden) return

    const nextLevel: WorkLevel = sceneHidden || partHidden || actHidden ? 'chapter' : workLevel
    const currentOutline =
      data.docs.find((item) => item.data.type === 'outline' && item.data.id === selectedTarget?.id) ?? null
    const next = firstSelectableForLevel(data.docs, nextLevel, currentOutline, storyStructure)
    setWorkLevel(nextLevel)
    setSelectedTarget(next ? { type: 'outline', id: next.data.id } : null)
  }, [
    data,
    selectedTarget?.id,
    storyStructure.act_enabled,
    storyStructure.part_enabled,
    storyStructure.scene_enabled,
    workLevel
  ])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
      if (event.key.toLowerCase() === 'g') {
        event.preventDefault()
        if (storyStructure.scene_enabled && workLevel === 'ai' && assembledPrompt.trim()) {
          void generateFromPrompt(assembledPrompt)
        }
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        void runCheck()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    doc,
    selectedScene?.data.id,
    selectedOutline?.data.id,
    workLevel,
    assembledPrompt,
    storyStructure.scene_enabled
  ])

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
    .sort(compareStoryEntries)
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
  const hierarchy = buildOutlineHierarchy(docs, storyStructure)
  const childLevel = nextWorkLevel(workLevel, storyStructure)
  const visibleChildLevels = childWorkLevels(workLevel, storyStructure)
  const visibleItems =
    selectedOutline && childLevel && childLevel !== 'ai'
      ? (hierarchy.children.get(selectedOutline.data.id) ?? []).filter(
          (item) =>
            visibleChildLevels.includes(String(item.data.level) as WorkLevel) ||
            (visibleChildLevels.includes('part') && item.data.level === 'arc')
        )
      : (workLevel === 'overview' || workLevel === 'book') && !selectedOutline
        ? outlineItemsForLevel(docs, workLevel, null, null, storyStructure)
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

  const runProjectPlanningCheck = async (scope: PlanningCheckScope = 'project') => {
    setBusy(true)
    setActionError('')
    planningCancelRequested.current = false
    const clientRequestId = planningStream.begin()
    try {
      if (dirty) await persistCurrentDoc()
      setPlanningCheck(
        (await bridge.checkPlanningCards(root, language, clientRequestId, scope)) as PlanningCheckPanelOutcome
      )
    } catch (error) {
      if (!planningCancelRequested.current) setPlanningCheck(localPlanningCheckFailure(error, language))
    } finally {
      planningStream.clear()
      planningCancelRequested.current = false
      setBusy(false)
    }
  }

  const retryProjectPlanningCheck = async (executionId: string) => {
    setBusy(true)
    planningCancelRequested.current = false
    const clientRequestId = planningStream.begin()
    try {
      setPlanningCheck(
        (await bridge.retryPlanningCheck(
          root,
          executionId,
          language,
          clientRequestId
        )) as PlanningCheckPanelOutcome
      )
    } catch (error) {
      if (!planningCancelRequested.current) setPlanningCheck(localPlanningCheckFailure(error, language))
    } finally {
      planningStream.clear()
      planningCancelRequested.current = false
      setBusy(false)
    }
  }

  const cancelPlanningCheck = async () => {
    planningCancelRequested.current = true
    const cancelled = await planningStream.cancel()
    if (!cancelled) {
      planningCancelRequested.current = false
      setActionError(
        language === 'zh'
          ? '当前模型请求尚未建立可取消通道，请稍候再试。'
          : 'The provider request is not cancellable yet. Please try again shortly.'
      )
    }
  }

  const applyProjectPlanningCheck = async (
    executionId: string,
    selectedResultIds: string[]
  ): Promise<PlanningCheckApplyPanelOutcome> => {
    setBusy(true)
    try {
      const decisionOutcome = await bridge.decidePlanningCheck(root, {
        executionId,
        selectedResultIds,
        decision: 'approved',
        createdBy: 'desktop-author'
      })
      if (decisionOutcome.status === 'failed') return decisionOutcome
      const applicationOutcome = await bridge.applyPlanningCheck(
        root,
        executionId,
        decisionOutcome.decision.id
      )
      if (applicationOutcome.status === 'failed') return applicationOutcome
      const applied = applicationOutcome.result
      await load()
      setWorkspaceMode('planning')
      setWorkspacePage('outline')
      setOutlineSection('issues')
      const issueId = applied.created_issue_ids[0] ?? applied.updated_issue_ids[0]
      if (issueId) {
        setSelectedTarget({ type: 'issue', id: issueId })
        setRightOpen(true)
      }
      return { status: 'applied', result: applied }
    } finally {
      setBusy(false)
    }
  }

  const generateFromPrompt = async (
    prompt: string,
    count = 3,
    parentRunId?: string,
    promptSources?: PromptSourceSelection[]
  ) => {
    if (
      !storyStructure.scene_enabled ||
      !writingOutline ||
      writingOutline.data.level !== 'chapter' ||
      !prompt.trim()
    )
      return
    await runWorkspaceAction(async () => {
      try {
        await bridge.generateOutlineCandidates(
          root,
          writingOutline.data.id,
          prompt,
          selectedScene?.data.id,
          count,
          parentRunId,
          promptSources
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
    if (
      (level === 'part' && !storyStructure.part_enabled) ||
      (level === 'act' && !storyStructure.act_enabled) ||
      (level === 'ai' && !storyStructure.scene_enabled)
    )
      return
    setWorkLevel(level)
    setLeftMode('write')
    const next = firstSelectableForLevel(
      docs,
      level === 'ai' ? 'chapter' : level,
      selectedOutline,
      storyStructure
    )
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
    if (!storyStructure.scene_enabled && (target.view === 'ai' || target.type === 'scene')) {
      const selected = docs.find((item) => item.data.id === target.id)
      const chapterId =
        target.type === 'scene'
          ? String(selected?.data.chapter_id ?? selected?.data.section ?? '')
          : target.id
      if (chapterId) setSelectedTarget({ type: 'outline', id: chapterId })
      setWorkLevel('chapter')
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
    if (
      level === 'ai' ||
      !title.trim() ||
      (level === 'part' && !storyStructure.part_enabled) ||
      (level === 'act' && !storyStructure.act_enabled)
    )
      return
    const requestedParent = parent
      ? (docs.find((item) => item.data.type === 'outline' && item.data.id === parent) ?? null)
      : selectedOutline
    const effectiveParent =
      level === 'overview' || level === 'book'
        ? null
        : parentForNewLevel(docs, level, requestedParent, storyStructure)
    const created = await createDoc('outline', {
      title: title.trim(),
      level,
      parent: effectiveParent,
      target_words: level === 'chapter' ? data.project.chapter_words : undefined,
      content: `## ${title.trim()}\n`
    })
    const loaded = await bridge.readDoc(String(created))
    setDoc({ ...loaded, path: String(created) })
    setSelectedTarget({ type: 'outline', id: String(loaded.data.id) })
    setWorkLevel(level)
  }

  const reorderStory = async (request: ReorderStorySiblingsRequest) => {
    await runWorkspaceAction(async () => {
      await bridge.reorderStorySiblings(root, request)
      await load()
    })
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
    <>
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
          assembledPrompt,
          planningCheck
        }}
        actions={{
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
          closePlanningCheck: () => setPlanningCheck(null),
          inspectPlanningCheck: async (executionId: string) => {
            await bridge.openPlanningCheckRun(root, executionId)
          },
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
      <AILongTaskProgressDialog
        state={planningStream.state}
        language={language}
        title={language === 'zh' ? '项目 AI 检查进行中' : 'Project AI check in progress'}
        onCancel={cancelPlanningCheck}
      />
    </>
  )
}

function localPlanningCheckFailure(error: unknown, language: LanguageName): PlanningCheckPanelOutcome {
  const executionId = `agent-local-${Date.now()}`
  return {
    status: 'failed',
    execution_id: executionId,
    task_id: 'planning-integrity-review',
    run_path: `runs/agents/${executionId}`,
    error: {
      schema_version: 1,
      code: 'AGENT_PROVIDER_TRANSPORT_FAILED',
      phase: 'provider',
      task_id: 'planning-integrity-review',
      execution_id: executionId,
      retry_safe: true,
      message_key: 'agent.error.agent_provider_transport_failed',
      technical_detail: error instanceof Error ? error.message : formatDesktopError(error, language),
      validation_paths: [],
      artifacts: {}
    }
  }
}
