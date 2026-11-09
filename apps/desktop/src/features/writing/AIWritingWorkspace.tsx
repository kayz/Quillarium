import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  FileText,
  Layers3,
  Play,
  Plus,
  RotateCcw,
  ScanText,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import type { ChapterLifecycleSnapshot, PromptSourceBlock, PromptSourceSelection } from '@quillarium/core'
import type {
  CheckReport,
  ContextPacketSummary,
  DocEntry,
  LanguageName,
  RunSummary
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { Inspector, RunPanel } from './InspectorRun.js'
import { bridge } from '../../app/bridge.js'
import { formatDesktopError } from '../../shared/errors.js'
import { compareStoryEntries } from '../../shared/outline.js'
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { documentTypeLabel, enumChoiceLabel } from '../metadata/field-presentation.js'
import { PlanningCardSelector } from '../planning/PlanningCardSelector.js'
import { PromptEnvelopeViewer, type PromptViewerData } from './PromptEnvelopeViewer.js'

export function AIWritingWorkspace({
  root,
  docs,
  runs,
  outline,
  scene,
  context,
  contextPacket,
  checkReport,
  assembledPrompt,
  busy,
  onPromptChange,
  onCheck,
  onGenerate,
  onDelete,
  onAccepted,
  onScenePrepared,
  onSelectScene,
  onOpenProse,
  onContinuityReview = () => undefined,
  focus = 'scene',
  language
}: {
  root: string
  docs: DocEntry[]
  runs: RunSummary[]
  outline: DocEntry | null
  scene: DocEntry | null
  context: string
  contextPacket: ContextPacketSummary | null
  checkReport: CheckReport | null
  assembledPrompt: string
  busy: boolean
  onPromptChange: (prompt: string) => void
  onCheck: (contentOverride?: string) => Promise<void>
  onGenerate: (
    prompt: string,
    count?: number,
    parentRunId?: string,
    promptSources?: PromptSourceSelection[]
  ) => Promise<void>
  onDelete: () => Promise<void>
  onAccepted: () => Promise<void>
  onScenePrepared: (sceneId: string) => Promise<void>
  onSelectScene: (sceneId: string) => void
  onOpenProse: () => void
  onContinuityReview?: () => void
  focus?: 'scene' | 'prompt'
  language: LanguageName
}) {
  const zh = language === 'zh'
  const [activeTab, setActiveTab] = useState<'prompt' | 'context' | 'runs'>('prompt')
  const [sourceBlocks, setSourceBlocks] = useState<PromptSourceBlock[]>([])
  const [segmentEdits, setSegmentEdits] = useState<Record<string, string>>({})
  const [openSegmentId, setOpenSegmentId] = useState('')
  const [availableBlocks, setAvailableBlocks] = useState<PromptSourceBlock[]>([])
  const [lifecycle, setLifecycle] = useState<ChapterLifecycleSnapshot | null>(null)
  const [localError, setLocalError] = useState('')
  const [sourceToAdd, setSourceToAdd] = useState('')
  const [bundleTitle, setBundleTitle] = useState('')
  const [bundleNotice, setBundleNotice] = useState('')
  const [promptTemplates, setPromptTemplates] = useState<
    Array<{ id: string; title: string; current: boolean; segments: string[] }>
  >([])
  const promptGridRef = useRef<HTMLDivElement | null>(null)
  const [promptSourcePct, setPromptSourcePct] = useState(30)
  const [candidateDraft, setCandidateDraft] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [candidateCount, setCandidateCount] = useState(3)
  const [promptViewer, setPromptViewer] = useState<PromptViewerData | null>(null)
  const requestedSceneId = scene?.data.id
  const requestedScene = lifecycle?.scenes.find((item) => item.data.id === requestedSceneId)
  const currentScene = requestedScene ?? (scene?.data.id === requestedSceneId ? scene : null)
  const fallbackScenes = docs
    .filter(
      (item) => item.data.type === 'scene' && (item.data.chapter_id ?? item.data.section) === outline?.data.id
    )
    .sort(compareStoryEntries)
  const chapterScenes = lifecycle?.scenes ?? (fallbackScenes as unknown as ChapterLifecycleSnapshot['scenes'])
  const fallbackProse = docs.find(
    (item) => item.data.type === 'chapter_prose' && item.data.chapter_id === outline?.data.id
  )
  const proseStatus = lifecycle?.prose.data.status ?? String(fallbackProse?.data.status ?? 'draft')
  const proseContent = lifecycle?.prose.content ?? fallbackProse?.content ?? ''
  const chapterLocked = proseStatus !== 'draft'
  const sceneLocked = chapterLocked || Boolean(currentScene?.data.accepted_at)
  const sceneForInspector = currentScene
    ? ({
        path: currentScene.path,
        data: currentScene.data as unknown as DocEntry['data'],
        content: currentScene.content
      } satisfies DocEntry)
    : scene
  const chapterSceneIds = chapterScenes.map((item) => item.data.id)
  const proseSceneIds =
    lifecycle?.prose.data.scene_ids ??
    (Array.isArray(fallbackProse?.data.scene_ids) ? (fallbackProse.data.scene_ids as string[]) : [])

  const refreshChapter = async () => {
    if (!outline) return
    const next: ChapterLifecycleSnapshot = await bridge.loadChapterLifecycle(root, outline.data.id)
    setLifecycle(next)
    setAvailableBlocks([])
    setSourceToAdd('')
    setSegmentEdits({})
    setOpenSegmentId('')
    const active = next.scenes.find((item) => item.data.id === requestedSceneId && !item.data.accepted_at)
    if (active && next.prose.data.status === 'draft') {
      const plan = await bridge.buildScenePromptPlan(root, active.data.id)
      setSourceBlocks(plan.sources)
      setBundleTitle(`${outline.data.title} · ${active.data.title}`)
      onPromptChange(plan.prompt)
    } else {
      setSourceBlocks([])
      onPromptChange('')
    }
  }

  const loadPromptTemplates = async () => {
    setPromptTemplates(await bridge.listPromptTemplates(root))
  }

  useEffect(() => {
    if (focus === 'prompt') setActiveTab('prompt')
  }, [focus])

  useEffect(() => {
    void loadPromptTemplates().catch((error) => setLocalError(formatDesktopError(error, language)))
  }, [root])

  useEffect(() => {
    setActiveTab('prompt')
    setLocalError('')
    void refreshChapter().catch((error) => setLocalError(formatDesktopError(error, language)))
  }, [outline?.data.id, scene?.data.id])

  const compileSources = async (
    nextSources: PromptSourceBlock[],
    nextAvailable: PromptSourceBlock[],
    persistLayout = false
  ) => {
    if (!currentScene) return
    try {
      setLocalError('')
      setBundleNotice('')
      const plan = await bridge.compileScenePromptOverlay(
        root,
        currentScene.data.id,
        nextSources.map((source) => promptSourceSelection(source, segmentEdits))
      )
      setSourceBlocks(plan.sources)
      setAvailableBlocks(nextAvailable)
      onPromptChange(plan.prompt)
      if (persistLayout) {
        await bridge.saveScenePromptLayout(
          root,
          currentScene.data.id,
          plan.sources
            .filter((source) => source.source_type && source.source_id)
            .map((source) => ({
              kind: source.kind,
              source_type: source.source_type ?? '',
              source_id: source.source_id ?? ''
            }))
        )
      }
    } catch (error) {
      setLocalError(formatDesktopError(error, language))
    }
  }

  const moveSource = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= sourceBlocks.length) return
    const next = [...sourceBlocks]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(target, 0, item)
    void compileSources(next, availableBlocks, true)
  }

  const editSegment = (source: PromptSourceBlock, text: string) => {
    const nextEdits = { ...segmentEdits, [source.id]: text }
    setSegmentEdits(nextEdits)
    if (!currentScene) return
    void bridge
      .compileScenePromptOverlay(
        root,
        currentScene.data.id,
        sourceBlocks.map((item) => promptSourceSelection(item, nextEdits))
      )
      .then((plan) => {
        setSourceBlocks(plan.sources)
        onPromptChange(plan.prompt)
      })
      .catch((error) => setLocalError(formatDesktopError(error, language)))
  }

  const removeSource = (source: PromptSourceBlock) => {
    const nextSources = sourceBlocks.filter((item) => item.id !== source.id)
    void compileSources(nextSources, [...availableBlocks, source], true)
  }

  const addSource = (source: PromptSourceBlock) => {
    const nextAvailable = availableBlocks.filter((item) => item.id !== source.id)
    void compileSources([...sourceBlocks, source], nextAvailable, true)
  }

  const addDocumentSource = () => {
    const source = docs.find((item) => item.data.id === sourceToAdd)
    if (!source) return
    const nextSource: PromptSourceBlock = {
      id: `document:${source.data.type}:${source.data.id}`,
      kind: 'context',
      title: `${source.data.title} · ${documentTypeLabel(String(source.data.type), language)}`,
      content: source.content,
      required: false,
      source_type: String(source.data.type),
      source_id: source.data.id
    }
    void compileSources([...sourceBlocks, nextSource], availableBlocks, true)
    setSourceToAdd('')
  }

  const saveOrderAsTemplate = async () => {
    try {
      setLocalError('')
      const saved = await bridge.savePromptTemplate(
        root,
        bundleTitle,
        sourceBlocks.map((source) => source.kind)
      )
      await loadPromptTemplates()
      setBundleNotice(zh ? `已保存模板：${saved.title}` : `Template saved: ${saved.title}`)
    } catch (error) {
      setLocalError(formatDesktopError(error, language))
    }
  }

  const usePromptTemplate = async (templateId: string) => {
    try {
      setLocalError('')
      await bridge.setCurrentPromptTemplate(root, templateId)
      await loadPromptTemplates()
      await refreshChapter()
      setBundleNotice(
        zh
          ? '已换成当前模板。已经排过的节仍用自己的顺序。'
          : 'This is now the current template. A scene that was already arranged keeps its own order.'
      )
    } catch (error) {
      setLocalError(formatDesktopError(error, language))
    }
  }

  const saveAsContextBundle = async () => {
    try {
      setLocalError('')
      const saved = await bridge.savePromptSourcesAsBundle(
        root,
        bundleTitle,
        sourceBlocks.map((source) => promptSourceSelection(source, segmentEdits))
      )
      setBundleNotice(
        zh ? `已保存资料包：${saved.value.title}` : `Context bundle saved: ${saved.value.title}`
      )
    } catch (error) {
      setLocalError(formatDesktopError(error, language))
    }
  }

  const prepareNextScene = async () => {
    if (!outline) return
    try {
      setLocalError('')
      const prepared = await bridge.prepareScene(root, outline.data.id)
      await onScenePrepared(prepared.data.id)
    } catch (error) {
      setLocalError(formatDesktopError(error, language))
    }
  }

  const previewFullPrompt = async () => {
    if (!currentScene || !assembledPrompt.trim()) return
    try {
      setLocalError('')
      setPromptViewer(
        await bridge.previewFullGenerationPrompt(
          root,
          currentScene.data.id,
          assembledPrompt,
          sourceBlocks.map((source) => promptSourceSelection(source, segmentEdits))
        )
      )
    } catch (error) {
      setLocalError(formatDesktopError(error, language))
    }
  }

  if (!outline) {
    return (
      <section className="ai-writing-workspace empty-editor">
        <h2>{zh ? '先选择一章' : 'Select a chapter'}</h2>
        <p>
          {zh
            ? '每一节对应一次 AI 编写或润色。请在左侧树中选择一章。'
            : 'AI writing works one scene at a time.'}
        </p>
      </section>
    )
  }

  return (
    <section className={`ai-writing-workspace ${currentScene ? '' : 'chapter-overview-mode'}`}>
      <header className="ai-writing-head">
        <div>
          <span className="badge ok">{zh ? 'AI 编写' : 'AI writing'}</span>
          <h2>{currentScene ? `${outline.data.title} / ${currentScene.data.title}` : outline.data.title}</h2>
          <p>
            {currentScene
              ? zh
                ? '先组装本节上下文和提示词，调整后再开始生成。'
                : 'Assemble and revise this scene prompt before generation.'
              : zh
                ? '章总览用于管理各节；节与章正文是并列内容。'
                : 'Manage scenes and chapter prose side by side.'}
          </p>
          <div className="chapter-status-line">
            <span className={`chapter-status ${proseStatus}`}>
              {zh ? '正文：' : 'Prose: '}
              {statusLabel(proseStatus, language)}
            </span>
            <span>{zh ? `${countWords(proseContent)} 字` : `${countWords(proseContent)} chars`}</span>
          </div>
        </div>
        <div className="ai-writing-actions">
          <button onClick={onContinuityReview} disabled={busy}>
            <ShieldCheck size={15} /> {zh ? '连续性审阅' : 'Continuity review'}
          </button>
          {currentScene && (
            <button className="danger" onClick={onDelete} disabled={busy}>
              <Trash2 size={15} /> {zh ? '删除本节' : 'Delete scene'}
            </button>
          )}
          {currentScene && (
            <>
              <button onClick={() => void onCheck()} disabled={busy}>
                <CheckCircle2 size={15} /> {t(language, 'checkAction')}
              </button>
              <button
                onClick={() =>
                  void refreshChapter().catch((error) => setLocalError(formatDesktopError(error, language)))
                }
                disabled={busy || sceneLocked}
              >
                {assembledPrompt ? <RotateCcw size={15} /> : <Layers3 size={15} />}
                {assembledPrompt ? (zh ? '重新组装' : 'Reassemble') : zh ? '组装提示词' : 'Assemble prompt'}
              </button>
              <button onClick={() => void previewFullPrompt()} disabled={busy || !assembledPrompt.trim()}>
                <ScanText size={15} /> {zh ? '预览完整提示词' : 'Preview full prompt'}
              </button>
              <button
                className="primary"
                onClick={() =>
                  onGenerate(
                    assembledPrompt,
                    candidateCount,
                    undefined,
                    sourceBlocks.map((source) => promptSourceSelection(source, segmentEdits))
                  )
                }
                disabled={busy || sceneLocked || !assembledPrompt.trim()}
              >
                <Play size={15} />{' '}
                {busy
                  ? zh
                    ? '生成中…'
                    : 'Generating…'
                  : zh
                    ? `生成 ${candidateCount} 稿`
                    : `Generate ${candidateCount}`}
              </button>
              <label className="candidate-count-control">
                <span>{zh ? '候选数' : 'Candidates'}</span>
                <select
                  value={candidateCount}
                  onChange={(event) => setCandidateCount(Number(event.target.value))}
                  disabled={busy || sceneLocked}
                >
                  {[2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {!chapterLocked && (
            <button onClick={() => void prepareNextScene()} disabled={busy}>
              <Plus size={15} />{' '}
              {currentScene ? (zh ? '新增下一节' : 'Add next scene') : zh ? '增加节' : 'Add scene'}
            </button>
          )}
        </div>
      </header>

      {!currentScene ? (
        <ChapterSceneOverview
          scenes={chapterScenes}
          proseSceneIds={proseSceneIds}
          proseStatus={proseStatus}
          proseContent={proseContent}
          busy={busy}
          locked={chapterLocked}
          language={language}
          error={localError}
          onAdd={() => void prepareNextScene()}
          onSelectScene={onSelectScene}
          onOpenProse={onOpenProse}
        />
      ) : (
        <>
          <nav className="ai-writing-tabs" aria-label={zh ? 'AI 编写步骤' : 'AI writing steps'}>
            <button className={activeTab === 'prompt' ? 'active' : ''} onClick={() => setActiveTab('prompt')}>
              1 · {zh ? '提示词' : 'Prompt'}
            </button>
            <button
              className={activeTab === 'context' ? 'active' : ''}
              onClick={() => setActiveTab('context')}
            >
              2 · {zh ? '上下文与检查' : 'Context & checks'}
            </button>
            <button className={activeTab === 'runs' ? 'active' : ''} onClick={() => setActiveTab('runs')}>
              3 · {zh ? '候选稿与运行' : 'Candidates & runs'}
            </button>
          </nav>

          <div className="ai-writing-body">
            {localError && <div className="error-box">{localError}</div>}
            {activeTab === 'prompt' ? (
              <div className="prompt-composer">
                <div className="prompt-composer-note">
                  <strong>{zh ? '作者可调整' : 'Author editable'}</strong>
                  <span>
                    {zh
                      ? '组装结果不会写回正设或章；生成时会把此处实际文本保存到 run/prompt.md。'
                      : 'The exact edited prompt is snapshotted into the run.'}
                  </span>
                </div>
                {assembledPrompt ? (
                  <div
                    ref={promptGridRef}
                    className="prompt-builder-grid"
                    style={{ gridTemplateColumns: `${promptSourcePct}% 10px minmax(0, 1fr)` }}
                  >
                    <aside className="prompt-source-column">
                      <header>
                        <strong>{zh ? '提示词来源' : 'Prompt sources'}</strong>
                        <small>{zh ? '可增删来源卡片' : 'Add or remove cards'}</small>
                      </header>
                      {sourceBlocks.map((source, index) => (
                        <article
                          key={source.id}
                          className={`prompt-source-card kind-${source.kind}${dragIndex === index ? ' dragging' : ''}`}
                          draggable={!sceneLocked}
                          onDragStart={(event) => {
                            if (sceneLocked) return
                            setDragIndex(index)
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', String(index))
                          }}
                          onDragOver={(event) => {
                            if (sceneLocked) return
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'move'
                          }}
                          onDrop={(event) => {
                            if (sceneLocked) return
                            event.preventDefault()
                            const fromIndex =
                              dragIndex ?? Number.parseInt(event.dataTransfer.getData('text/plain'), 10)
                            setDragIndex(null)
                            if (Number.isNaN(fromIndex) || fromIndex === index) return
                            const next = [...sourceBlocks]
                            const [item] = next.splice(fromIndex, 1)
                            if (!item) return
                            next.splice(index, 0, item)
                            void compileSources(next, availableBlocks, true)
                          }}
                          onDragEnd={() => setDragIndex(null)}
                        >
                          <span>
                            {source.title} · {promptSourceKindLabel(source.kind, language)}
                          </span>
                          <small>
                            {zh ? '来源' : 'Source'} {source.source_type ?? source.kind}
                            {source.source_id ? `:${source.source_id}` : ''} · {countWords(source.content)}{' '}
                            {zh ? '字' : 'chars'}
                          </small>
                          <button
                            onClick={() => moveSource(index, -1)}
                            disabled={sceneLocked || index === 0}
                            title={zh ? '上移' : 'Move up'}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => moveSource(index, 1)}
                            disabled={sceneLocked || index === sourceBlocks.length - 1}
                            title={zh ? '下移' : 'Move down'}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            onClick={() =>
                              setOpenSegmentId((current) => (current === source.id ? '' : source.id))
                            }
                            disabled={sceneLocked}
                          >
                            {zh ? '展开' : 'Expand'}
                          </button>
                          <button
                            onClick={() => removeSource(source)}
                            disabled={sceneLocked}
                            title={
                              zh ? '移除来源（可从下方重新加入）' : 'Remove source; it can be added back'
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                          {openSegmentId === source.id && (
                            <textarea
                              value={segmentEdits[source.id] ?? source.content}
                              onChange={(event) => editSegment(source, event.target.value)}
                              aria-label={zh ? '这一次的段文字' : 'Segment text for this run'}
                              readOnly={sceneLocked}
                            />
                          )}
                        </article>
                      ))}
                      {availableBlocks.map((source) => (
                        <button
                          key={source.id}
                          className="prompt-source-add"
                          onClick={() => addSource(source)}
                        >
                          <Plus size={13} /> {source.title}
                        </button>
                      ))}
                      <div className="prompt-source-picker">
                        <PlanningCardSelector
                          docs={docs.filter(
                            (item) =>
                              !['scene', 'chapter_prose'].includes(String(item.data.type)) &&
                              !sourceBlocks.some((source) => source.id.endsWith(`:${item.data.id}`))
                          )}
                          value={sourceToAdd}
                          onChange={setSourceToAdd}
                          language={language}
                          ariaLabel={zh ? '选择提示词资料卡' : 'Choose prompt source card'}
                          placeholder={zh ? '搜索项目文档…' : 'Search project documents…'}
                        />
                        <button onClick={addDocumentSource} disabled={!sourceToAdd || sceneLocked}>
                          <Plus size={13} /> {zh ? '加入' : 'Add'}
                        </button>
                      </div>
                      <div className="prompt-bundle-save">
                        <label>
                          <span>{zh ? '保存为资料包' : 'Save as ContextBundle'}</span>
                          <input
                            value={bundleTitle}
                            onChange={(event) => setBundleTitle(event.target.value)}
                            placeholder={zh ? '资料包名称' : 'Bundle title'}
                            disabled={sceneLocked}
                          />
                        </label>
                        <button
                          onClick={() => void saveAsContextBundle()}
                          disabled={
                            sceneLocked || !bundleTitle.trim() || !hasStableBundleSource(sourceBlocks)
                          }
                        >
                          <Layers3 size={13} /> {zh ? '保存' : 'Save'}
                        </button>
                        <button
                          onClick={() => void saveOrderAsTemplate()}
                          disabled={sceneLocked || !bundleTitle.trim() || sourceBlocks.length === 0}
                        >
                          {zh ? '另存为模板' : 'Save as template'}
                        </button>
                        {promptTemplates.length > 0 && (
                          <ul className="prompt-template-list">
                            {promptTemplates.map((template) => (
                              <li key={template.id}>
                                <span>
                                  {template.title}
                                  {template.current ? (zh ? ' · 当前' : ' · current') : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void usePromptTemplate(template.id)}
                                  disabled={sceneLocked || template.current}
                                >
                                  {zh ? '设为当前' : 'Use as current'}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {bundleNotice && <small className="success-note">{bundleNotice}</small>}
                      </div>
                    </aside>
                    <SplitHandle
                      orientation="vertical"
                      className="prompt-source-handle"
                      label={zh ? '调整提示词来源与内容宽度' : 'Resize prompt sources and content'}
                      onResize={(delta) => {
                        const width = promptGridRef.current?.clientWidth ?? 1
                        setPromptSourcePct((current) =>
                          clampPaneSize(current + (delta / width) * 100, 20, 55)
                        )
                      }}
                    />
                    <label className="prompt-text-column">
                      <span>
                        {zh ? '本次提示词内容' : 'Prompt content'}
                        <small>
                          {assembledPrompt.length} {zh ? '字符' : 'chars'}
                        </small>
                      </span>
                      <textarea
                        value={assembledPrompt}
                        onChange={(event) => onPromptChange(event.target.value)}
                        spellCheck={false}
                        readOnly
                        aria-label={zh ? '本次生成提示词' : 'Generation prompt'}
                      />
                    </label>
                  </div>
                ) : (
                  <button
                    className="prompt-empty-state"
                    onClick={() =>
                      void refreshChapter().catch((error) =>
                        setLocalError(formatDesktopError(error, language))
                      )
                    }
                    disabled={!currentScene || sceneLocked}
                  >
                    <Layers3 size={24} />
                    <strong>{zh ? '组装本章提示词' : 'Assemble chapter prompt'}</strong>
                    <span>
                      {zh
                        ? '读取本章规划、正设、人物、时间线、世界书和伏笔。'
                        : 'Use current chapter context.'}
                    </span>
                  </button>
                )}
              </div>
            ) : activeTab === 'context' ? (
              <Inspector
                docs={docs}
                scene={sceneForInspector}
                outline={outline}
                context={context}
                contextPacket={contextPacket}
                checkReport={checkReport}
                busy={busy}
                onCheck={() => onCheck(candidateDraft.trim() ? candidateDraft : undefined)}
                language={language}
              />
            ) : (
              <RunPanel
                root={root}
                runs={runs}
                sceneId={currentScene?.data.id ?? null}
                sceneIds={chapterSceneIds}
                onCandidateChange={setCandidateDraft}
                onAccepted={async () => {
                  await onAccepted()
                  await refreshChapter()
                }}
                onBranch={(parentRunId) =>
                  onGenerate(
                    assembledPrompt,
                    candidateCount,
                    parentRunId,
                    sourceBlocks.map((source) => promptSourceSelection(source, segmentEdits))
                  )
                }
                language={language}
              />
            )}
          </div>
        </>
      )}
      {promptViewer && (
        <PromptEnvelopeViewer
          data={promptViewer}
          language={language}
          title={zh ? '生成前 · 完整提示词' : 'Before generation · Full prompt'}
          onClose={() => setPromptViewer(null)}
        />
      )}
    </section>
  )
}

function ChapterSceneOverview({
  scenes,
  proseSceneIds,
  proseStatus,
  proseContent,
  busy,
  locked,
  language,
  error,
  onAdd,
  onSelectScene,
  onOpenProse
}: {
  scenes: ChapterLifecycleSnapshot['scenes']
  proseSceneIds: string[]
  proseStatus: string
  proseContent: string
  busy: boolean
  locked: boolean
  language: LanguageName
  error: string
  onAdd: () => void
  onSelectScene: (sceneId: string) => void
  onOpenProse: () => void
}) {
  const zh = language === 'zh'
  return (
    <section className="chapter-scene-overview">
      {error && <div className="error-box">{error}</div>}
      <header>
        <div>
          <span className="planning-kicker">{zh ? '章内容' : 'Chapter contents'}</span>
          <h3>{zh ? '节与章正文' : 'Scenes and chapter prose'}</h3>
          <p>
            {zh
              ? '每节约一千字，可多次生成、选择和手改；确认后先留在本节。本章全部节确认后，才写入章正文。'
              : 'Each scene is a ~1000-word generation chunk. Confirm leaves prose on the scene; chapter prose updates after every scene is confirmed.'}
          </p>
        </div>
        {!locked ? (
          <button className="primary" onClick={onAdd} disabled={busy}>
            <Plus size={15} /> {zh ? '增加节' : 'Add scene'}
          </button>
        ) : (
          <span className="chapter-scene-lock-note">
            {proseStatus === 'published'
              ? zh
                ? '正文已发布，节已永久锁定'
                : 'Published prose permanently locks scenes'
              : zh
                ? '正文已定稿，不能新增或修改节'
                : 'Finalized prose prevents adding or editing scenes'}
          </span>
        )}
      </header>
      <div className="chapter-content-list">
        {scenes.map((item, index) => {
          const missing = [
            !item.data.timeline_node && (zh ? '时间线' : 'timeline'),
            !item.data.location && (zh ? '地点' : 'location'),
            !item.data.pov && (zh ? '视角' : 'POV')
          ].filter(Boolean)
          return (
            <button
              key={item.data.id}
              className="chapter-content-card scene"
              onClick={() => onSelectScene(item.data.id)}
            >
              <span className="chapter-content-icon">
                <FileText size={17} />
              </span>
              <span className="chapter-content-copy">
                <small>{zh ? `第 ${index + 1} 节` : `Scene ${index + 1}`}</small>
                <strong>{item.data.title}</strong>
                <span>
                  {item.data.accepted_at
                    ? proseSceneIds.includes(item.data.id)
                      ? zh
                        ? '已写入章正文'
                        : 'In chapter prose'
                      : zh
                        ? '已确认'
                        : 'Confirmed'
                    : zh
                      ? '工作中'
                      : 'In progress'}{' '}
                  · {countWords(item.content)} {zh ? '字' : 'chars'}
                </span>
                {missing.length > 0 && (
                  <em>
                    {zh ? `生成前补充：${missing.join('、')}` : `Before generation: ${missing.join(', ')}`}
                  </em>
                )}
              </span>
              <ArrowRight size={16} />
            </button>
          )
        })}
        {!scenes.length && (
          <button className="chapter-content-card empty" onClick={onAdd} disabled={locked || busy}>
            <Plus size={18} />
            <span>
              <strong>{zh ? '增加第一节' : 'Add the first scene'}</strong>
              <small>
                {zh
                  ? '先建立节，再补充写作重点与元数据。'
                  : 'Create it first, then complete its focus and metadata.'}
              </small>
            </span>
          </button>
        )}
        <button className="chapter-content-card prose" onClick={onOpenProse}>
          <span className="chapter-content-icon">
            <FileText size={17} />
          </span>
          <span className="chapter-content-copy">
            <small>{zh ? '章正文' : 'Chapter prose'}</small>
            <strong>
              {zh ? '正文' : 'Prose'} · {statusLabel(proseStatus, language)}
            </strong>
            <span>
              {countWords(proseContent)} {zh ? '字；仅由作者直接修改' : 'chars; author edits only'}
            </span>
          </span>
          <ArrowRight size={16} />
        </button>
      </div>
    </section>
  )
}

function countWords(value: string): number {
  return [...value.replace(/\s/gu, '')].length
}

function statusLabel(value: string, language: LanguageName): string {
  return enumChoiceLabel('status', value, language, { documentType: 'chapter_prose' })
}

function promptSourceSelection(
  source: PromptSourceBlock,
  edits: Record<string, string> = {}
): PromptSourceSelection {
  return {
    id: source.id,
    ...(source.source_type ? { source_type: source.source_type } : {}),
    ...(source.source_id ? { source_id: source.source_id } : {}),
    mode: source.required ? 'required' : 'preferred',
    usage: promptSourceUsage(source.kind),
    ...(edits[source.id] !== undefined ? { text: edits[source.id] } : {})
  }
}

function promptSourceUsage(kind: PromptSourceBlock['kind']): PromptSourceSelection['usage'] {
  if (['instruction', 'guidance', 'narrative'].includes(kind)) return 'style'
  if (['canon', 'outline', 'scene-outline', 'timeline', 'location'].includes(kind)) {
    return 'constraint'
  }
  if (['finalized-prose', 'continuation'].includes(kind)) return 'evidence'
  return 'subject'
}

const stableBundleDocumentTypes = new Set([
  'canon',
  'character',
  'character_relation',
  'timeline_node',
  'timeline_event',
  'location',
  'route',
  'foreshadowing',
  'world_entry',
  'reference',
  'issue',
  'strategy',
  'pattern',
  'narrative',
  'character_state',
  'resource',
  'causality',
  'outline',
  'chapter_prose',
  'scene',
  'prompt',
  'exploration'
])

function hasStableBundleSource(sources: PromptSourceBlock[]): boolean {
  return sources.some(
    (source) =>
      Boolean(source.source_id) &&
      Boolean(source.source_type) &&
      stableBundleDocumentTypes.has(source.source_type ?? '')
  )
}

function promptSourceKindLabel(kind: PromptSourceBlock['kind'], language: LanguageName): string {
  const labels: Record<PromptSourceBlock['kind'], { zh: string; en: string }> = {
    instruction: { zh: '写作要求', en: 'Instruction' },
    outline: { zh: '大纲', en: 'Outline' },
    'scene-outline': { zh: '本节细纲', en: 'Scene outline' },
    guidance: { zh: '共享指导', en: 'Shared guidance' },
    canon: { zh: '正设约束', en: 'Canon constraint' },
    timeline: { zh: '时间线', en: 'Timeline' },
    location: { zh: '地点', en: 'Location' },
    character: { zh: '人物', en: 'Character' },
    world: { zh: '世界书', en: 'World book' },
    reference: { zh: '参考资料', en: 'Reference' },
    foreshadowing: { zh: '伏笔', en: 'Foreshadowing' },
    narrative: { zh: '叙事规则', en: 'Narrative rule' },
    context: { zh: '连续性上下文', en: 'Continuity context' },
    'finalized-prose': { zh: '附近章节', en: 'Nearby chapters' },
    continuation: { zh: '前文续写', en: 'Continuation' }
  }
  return labels[kind][language]
}
