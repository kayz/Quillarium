import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CheckCircle2, FileText, Layers3, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { ChapterLifecycleSnapshot, PromptSourceBlock } from '@quillarium/core'
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
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { documentTypeLabel, enumChoiceLabel } from '../metadata/field-presentation.js'

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
  onGenerate: (prompt: string) => Promise<void>
  onDelete: () => Promise<void>
  onAccepted: () => Promise<void>
  onScenePrepared: (sceneId: string) => Promise<void>
  onSelectScene: (sceneId: string) => void
  onOpenProse: () => void
  language: LanguageName
}) {
  const zh = language === 'zh'
  const [activeTab, setActiveTab] = useState<'prompt' | 'context' | 'runs'>('prompt')
  const [sourceBlocks, setSourceBlocks] = useState<PromptSourceBlock[]>([])
  const [availableBlocks, setAvailableBlocks] = useState<PromptSourceBlock[]>([])
  const [lifecycle, setLifecycle] = useState<ChapterLifecycleSnapshot | null>(null)
  const [localError, setLocalError] = useState('')
  const [sourceToAdd, setSourceToAdd] = useState('')
  const promptGridRef = useRef<HTMLDivElement | null>(null)
  const [promptSourcePct, setPromptSourcePct] = useState(30)
  const [candidateDraft, setCandidateDraft] = useState('')
  const requestedSceneId = scene?.data.id
  const requestedScene = lifecycle?.scenes.find((item) => item.data.id === requestedSceneId)
  const currentScene = requestedScene ?? (scene?.data.id === requestedSceneId ? scene : null)
  const fallbackScenes = docs
    .filter(
      (item) => item.data.type === 'scene' && (item.data.chapter_id ?? item.data.section) === outline?.data.id
    )
    .sort((left, right) => Number(left.data.order ?? 0) - Number(right.data.order ?? 0))
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

  const refreshChapter = async () => {
    if (!outline) return
    const next: ChapterLifecycleSnapshot = await bridge.loadChapterLifecycle(root, outline.data.id)
    setLifecycle(next)
    setAvailableBlocks([])
    setSourceToAdd('')
    const active = next.scenes.find((item) => item.data.id === requestedSceneId && !item.data.accepted_at)
    if (active && next.prose.data.status === 'draft') {
      const plan = await bridge.buildScenePromptPlan(root, active.data.id)
      setSourceBlocks(plan.sources)
      onPromptChange(plan.prompt)
    } else {
      setSourceBlocks([])
      onPromptChange('')
    }
  }

  useEffect(() => {
    setActiveTab('prompt')
    setLocalError('')
    void refreshChapter().catch((error) => setLocalError(formatDesktopError(error, language)))
  }, [outline?.data.id, scene?.data.id])

  const sourcePrompt = useMemo(
    () =>
      sourceBlocks.length
        ? `${sourceBlocks
            .map((block) => `【${block.title}】\n${block.content.trim()}`)
            .join(
              '\n\n'
            )}\n\n【输出要求】\n只输出当前节的纯文字正文，不得输出标题、解释或任何 Markdown 语法。`
        : '',
    [sourceBlocks]
  )

  const removeSource = (source: PromptSourceBlock) => {
    setSourceBlocks((items) => items.filter((item) => item.id !== source.id))
    setAvailableBlocks((items) => [...items, source])
  }

  const addSource = (source: PromptSourceBlock) => {
    setAvailableBlocks((items) => items.filter((item) => item.id !== source.id))
    setSourceBlocks((items) => [...items, source])
  }

  const addDocumentSource = () => {
    const source = docs.find((item) => item.data.id === sourceToAdd)
    if (!source) return
    setSourceBlocks((items) => [
      ...items,
      {
        id: `document:${source.data.type}:${source.data.id}`,
        kind: 'context',
        title: `${source.data.title} · ${documentTypeLabel(String(source.data.type), language)}`,
        content: source.content,
        required: false
      }
    ])
    setSourceToAdd('')
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

  useEffect(() => {
    onPromptChange(sourcePrompt)
  }, [sourcePrompt])

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
              <button
                className="primary"
                onClick={() => onGenerate(assembledPrompt)}
                disabled={busy || sceneLocked || !assembledPrompt.trim()}
              >
                <Play size={15} />{' '}
                {busy ? (zh ? '生成中…' : 'Generating…') : zh ? '使用此提示词生成' : 'Generate'}
              </button>
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
                      ? '组装结果不会写回 Canon 或章；生成时会把此处实际文本保存到 run/prompt.md。'
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
                      {sourceBlocks.map((source) => (
                        <article key={source.id} className={`prompt-source-card kind-${source.kind}`}>
                          <span>{source.title}</span>
                          <small>
                            {promptSourceKindLabel(source.kind, language)}
                            {source.required ? (zh ? ' · 默认' : ' · default') : ''}
                          </small>
                          <button
                            onClick={() => removeSource(source)}
                            disabled={sceneLocked}
                            title={
                              zh ? '移除来源（可从下方重新加入）' : 'Remove source; it can be added back'
                            }
                          >
                            <Trash2 size={13} />
                          </button>
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
                        <select value={sourceToAdd} onChange={(event) => setSourceToAdd(event.target.value)}>
                          <option value="">{zh ? '选择项目文档…' : 'Choose a project document…'}</option>
                          {docs
                            .filter(
                              (item) =>
                                !['scene', 'chapter_prose'].includes(String(item.data.type)) &&
                                !sourceBlocks.some((source) => source.id.endsWith(`:${item.data.id}`))
                            )
                            .map((item) => (
                              <option key={`${item.data.type}:${item.data.id}`} value={item.data.id}>
                                {item.data.title} · {documentTypeLabel(String(item.data.type), language)}
                              </option>
                            ))}
                        </select>
                        <button onClick={addDocumentSource} disabled={!sourceToAdd || sceneLocked}>
                          <Plus size={13} /> {zh ? '加入' : 'Add'}
                        </button>
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
                        readOnly={sceneLocked}
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
                        ? '读取本章规划、Canon、人物、时间线、世界书和伏笔。'
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
                language={language}
              />
            )}
          </div>
        </>
      )}
    </section>
  )
}

function ChapterSceneOverview({
  scenes,
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
              ? '每节可以独立生成、重写和检查；接受后按顺序写入章正文。'
              : 'Generate and check each scene independently, then accept it into chapter prose in order.'}
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
                    ? zh
                      ? '已写入章正文'
                      : 'Accepted into prose'
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

function promptSourceKindLabel(kind: PromptSourceBlock['kind'], language: LanguageName): string {
  const labels: Record<PromptSourceBlock['kind'], { zh: string; en: string }> = {
    instruction: { zh: '写作要求', en: 'Instruction' },
    outline: { zh: '章规划', en: 'Chapter outline' },
    'scene-outline': { zh: '节规划', en: 'Scene outline' },
    guidance: { zh: '共享指导', en: 'Shared guidance' },
    canon: { zh: 'Canon 约束', en: 'Canon constraint' },
    timeline: { zh: '时间线', en: 'Timeline' },
    location: { zh: '地点', en: 'Location' },
    character: { zh: '人物', en: 'Character' },
    world: { zh: '世界书触发', en: 'World entry trigger' },
    foreshadowing: { zh: '伏笔提醒', en: 'Foreshadowing reminder' },
    narrative: { zh: '叙事规则', en: 'Narrative rule' },
    context: { zh: '连续性上下文', en: 'Continuity context' },
    'finalized-prose': { zh: '已定稿正文', en: 'Finalized prose' },
    continuation: { zh: '前文续写', en: 'Continuation' }
  }
  return labels[kind][language]
}
