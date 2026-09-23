import { useRef, useState } from 'react'
import type { OutlineOrganizeProposalSet, StoryStructureConfigV1 } from '@quillarium/core'
import {
  CheckCircle2,
  LayoutGrid,
  List,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  XCircle
} from 'lucide-react'
import type {
  ContextPacketSummary,
  DocEntry,
  LanguageName,
  LeftMode,
  TargetSelection,
  ViewMode,
  WorkLevel
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { formatDesktopError } from '../../shared/errors.js'
import {
  buildOutlineHierarchy,
  childWorkLevels,
  levelTasks,
  levelOverviewTitle,
  outlineLevelLabel,
  structuredLine
} from '../../shared/outline.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { enumChoiceLabel, outlineLevelDisplayLabel } from '../metadata/field-presentation.js'
import { EditableDocumentTitle } from '../outline/EditableDocumentTitle.js'

const ORGANIZE_OUTLINE_LEVELS = new Set(['book', 'volume', 'part', 'act'])

export function shouldShowOrganizeOutline(level: string | undefined): boolean {
  return Boolean(level && ORGANIZE_OUTLINE_LEVELS.has(level))
}

export function WritingWorkspace({
  docs,
  level,
  storyStructure,
  viewMode,
  search,
  selectedOutline,
  selectedScene,
  selectedTarget,
  doc,
  contextPacket,
  dirty,
  busy,
  visibleItems,
  finalizedScenes,
  leftMode,
  root,
  onLevel,
  onSearch,
  onViewMode,
  onSelect,
  onCreate,
  onDocChange,
  onSave,
  onDelete,
  onCheck,
  onAcceptScene,
  onImportPanel,
  onReload,
  language
}: {
  docs: DocEntry[]
  level: WorkLevel
  storyStructure: StoryStructureConfigV1
  viewMode: ViewMode
  search: string
  selectedOutline: DocEntry | null
  selectedScene: DocEntry | null
  selectedTarget: TargetSelection | null
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  contextPacket: ContextPacketSummary | null
  dirty: boolean
  busy: boolean
  visibleItems: DocEntry[]
  finalizedScenes: DocEntry[]
  leftMode: LeftMode
  root: string
  onLevel: (level: WorkLevel) => void
  onSearch: (value: string) => void
  onViewMode: (mode: ViewMode) => void
  onSelect: (target: TargetSelection) => void
  onCreate: (level: WorkLevel, parent?: string | null) => void
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onDelete: () => Promise<void>
  onCheck: () => Promise<void>
  onAcceptScene: (sceneId: string, content: string) => Promise<void>
  onImportPanel: () => void
  onReload: () => Promise<void>
  language: LanguageName
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [overviewWidth, setOverviewWidth] = useState(48)
  const [organizeProposals, setOrganizeProposals] = useState<OutlineOrganizeProposalSet | null>(null)
  const [organizeBusy, setOrganizeBusy] = useState(false)
  const [organizeError, setOrganizeError] = useState('')
  const [organizeNotice, setOrganizeNotice] = useState('')
  const [selectedCreates, setSelectedCreates] = useState<Record<string, boolean>>({})
  const zh = language === 'zh'
  const selected = selectedScene ?? selectedOutline
  const items = leftMode === 'read' ? finalizedScenes : visibleItems
  const childrenLevels = childWorkLevels(level, storyStructure)
  const childLabels = childrenLevels.map(outlineLevelLabel).join('或')
  const visibleLevels = (
    ['overview', 'book', 'volume', 'part', 'act', 'chapter', 'ai'] as WorkLevel[]
  ).filter(
    (item) =>
      (item !== 'part' || storyStructure.part_enabled) &&
      (item !== 'act' || storyStructure.act_enabled) &&
      (item !== 'ai' || storyStructure.scene_enabled)
  )
  const selectedLevel = String(selectedOutline?.data.level ?? '')
  const showOrganize = shouldShowOrganizeOutline(selectedLevel || undefined)
  const canDelete =
    selected?.data.type === 'scene' ||
    (selected?.data.type === 'outline' &&
      ['volume', 'part', 'arc', 'act', 'chapter', 'section'].includes(selectedLevel))

  const closeOrganizePanel = () => {
    setOrganizeProposals(null)
    setOrganizeError('')
    setOrganizeNotice('')
    setSelectedCreates({})
  }

  const runOrganizeAction = async (action: () => Promise<void>) => {
    setOrganizeBusy(true)
    setOrganizeError('')
    setOrganizeNotice('')
    try {
      await action()
    } catch (error) {
      setOrganizeError(formatDesktopError(error, language))
    } finally {
      setOrganizeBusy(false)
    }
  }

  const organizeOutline = async () => {
    if (!selectedOutline) return
    await runOrganizeAction(async () => {
      const proposals = await window.quillarium.organizeOutline(root, selectedOutline.data.id)
      setOrganizeProposals(proposals)
      setSelectedCreates(Object.fromEntries(proposals.creates.map((item) => [item.proposal_id, true])))
    })
  }

  const applyOrganize = async () => {
    if (!organizeProposals) return
    await runOrganizeAction(async () => {
      const result = await window.quillarium.applyOutlineOrganize(root, organizeProposals, {
        confirmed: true,
        creates: organizeProposals.creates
          .filter((item) => selectedCreates[item.proposal_id])
          .map((item) => item.proposal_id)
      })
      setOrganizeNotice(
        zh
          ? `已创建大纲节点 ${result.outline_ids.length} 个。`
          : `Created ${result.outline_ids.length} outline node(s).`
      )
      setOrganizeProposals(null)
      setSelectedCreates({})
      await onReload()
    })
  }

  return (
    <section className="writing-workspace">
      <div className="level-tabs">
        {visibleLevels.map((item) => (
          <button key={item} className={level === item ? 'active' : ''} onClick={() => onLevel(item)}>
            {outlineLevelLabel(item)}
          </button>
        ))}
      </div>
      <div
        ref={gridRef}
        className="writing-grid"
        style={{ gridTemplateColumns: `${overviewWidth}% 10px minmax(0, 1fr)` }}
      >
        <div className="overview-pane">
          <div className="overview-head">
            <div>
              <span className="badge ok">{leftMode === 'read' ? '阅读' : outlineLevelLabel(level)}</span>
              <h2>
                {leftMode === 'read'
                  ? '已定稿内容'
                  : childLabels
                    ? `规划${childLabels}`
                    : levelOverviewTitle(level, selectedOutline)}
              </h2>
            </div>
            <div className="outline-child-actions">
              {(level === 'overview' || level === 'book') && selectedOutline?.data.level !== level && (
                <button
                  className="icon-button"
                  onClick={() => void onCreate(level, null)}
                  title={`新建${outlineLevelLabel(level)}`}
                >
                  <Plus size={17} /> <span>新建{outlineLevelLabel(level)}</span>
                </button>
              )}
              {childrenLevels.map((child) => (
                <button
                  key={child}
                  className="icon-button"
                  onClick={() => void onCreate(child, selectedOutline?.data.id ?? null)}
                  disabled={!selectedOutline}
                  title={`规划${outlineLevelLabel(child)}`}
                >
                  <Plus size={17} /> <span>{outlineLevelLabel(child)}</span>
                </button>
              ))}
              {showOrganize && (
                <button
                  className="icon-button"
                  onClick={() => void organizeOutline()}
                  disabled={!selectedOutline || busy || organizeBusy}
                  title={zh ? '整理大纲' : 'Organize outline'}
                >
                  <Sparkles size={17} /> <span>{zh ? '整理大纲' : 'Organize outline'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="overview-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="在本部分检索"
              />
            </label>
            <div className="icon-segment">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onViewMode('list')}
                title="列表"
              >
                <List size={16} />
              </button>
              <button
                className={viewMode === 'tile' ? 'active' : ''}
                onClick={() => onViewMode('tile')}
                title="平铺"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          <OutlineSummary
            docs={docs}
            level={level}
            selected={selectedOutline}
            contextPacket={contextPacket}
            storyStructure={storyStructure}
          />
          {leftMode === 'write' && !items.length && childrenLevels.length > 0 && (
            <button
              className="outline-child-empty"
              onClick={() => onCreate(childrenLevels[0], selectedOutline?.data.id ?? null)}
              disabled={!selectedOutline}
            >
              <Plus size={18} />
              <strong>规划第一个{outlineLevelLabel(childrenLevels[0])}</strong>
              <span>它将作为“{selectedOutline?.data.title ?? outlineLevelLabel(level)}”的直属下一级。</span>
            </button>
          )}
          <div className={viewMode === 'tile' ? 'outline-tile-grid' : 'outline-list'}>
            {items.map((item) => (
              <button
                key={item.data.id}
                className={`outline-item ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                onClick={() =>
                  onSelect({ type: item.data.type === 'scene' ? 'scene' : 'outline', id: item.data.id })
                }
              >
                <span>
                  <b>{item.data.title}</b>
                  <small>
                    {item.data.type === 'scene'
                      ? language === 'zh'
                        ? '正文'
                        : 'Prose'
                      : outlineLevelDisplayLabel(String(item.data.level), language)}{' '}
                    ·{' '}
                    {enumChoiceLabel('status', String(item.data.status ?? 'draft'), language, {
                      documentType: String(item.data.type)
                    })}
                  </small>
                </span>
                {viewMode === 'list' && <em>{structuredLine(item)}</em>}
                {viewMode === 'tile' && <p>{item.content.slice(0, 180) || '暂无正文'}</p>}
              </button>
            ))}
          </div>
        </div>
        <SplitHandle
          orientation="vertical"
          className="writing-editor-handle"
          label={language === 'zh' ? '调整总览与编辑器宽度' : 'Resize overview and editor'}
          onResize={(delta) => {
            const width = gridRef.current?.clientWidth ?? 1
            setOverviewWidth((current) => clampPaneSize(current + (delta / width) * 100, 28, 72))
          }}
        />
        <div className="detail-pane">
          {selected ? (
            <>
              <div className="detail-head">
                <div>
                  <span className="badge ok">
                    {selected.data.type === 'scene'
                      ? language === 'zh'
                        ? '正文'
                        : 'Prose'
                      : outlineLevelDisplayLabel(String(selected.data.level), language)}
                  </span>
                  <EditableDocumentTitle
                    value={doc?.data.title ?? selected.data.title}
                    language={language}
                    disabled={leftMode === 'read'}
                    onChange={(title) => {
                      if (!doc) return
                      onDocChange({ ...doc, data: { ...doc.data, title } })
                    }}
                  />
                </div>
                <div className="detail-head-actions">
                  {canDelete && (
                    <button className="danger" onClick={onDelete} disabled={busy}>
                      <Trash2 size={15} /> 删除
                    </button>
                  )}
                  <button onClick={onSave} disabled={busy || !dirty || !String(doc?.data.title ?? '').trim()}>
                    <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                  </button>
                </div>
              </div>
              {selected.data.type === 'scene' ? (
                <label className="detail-editor prose-text-editor">
                  <span className="markdown-editor-label">
                    <span>节工作稿 · 纯文字</span>
                    <small>{[...(doc?.content ?? '').replace(/\s/gu, '')].length} 字</small>
                  </span>
                  <textarea
                    value={doc?.content ?? ''}
                    onChange={(event) => {
                      if (!doc) return
                      onDocChange({ ...doc, content: event.target.value })
                    }}
                    readOnly={leftMode === 'read' || Boolean(selected.data.accepted_at)}
                    spellCheck
                  />
                </label>
              ) : (
                <MarkdownBodyEditor
                  value={doc?.content ?? selected.content}
                  onChange={(content) => {
                    if (!doc) return
                    onDocChange({ ...doc, content })
                  }}
                  readOnly={leftMode === 'read'}
                  language={language}
                />
              )}
              <div className="detail-actions">
                {selected.data.type === 'scene' && !selected.data.accepted_at && (
                  <button
                    className="primary"
                    onClick={() => void onAcceptScene(selected.data.id, doc?.content ?? '')}
                    disabled={busy || !doc?.content.trim()}
                  >
                    <CheckCircle2 size={15} /> 接受并加入章正文
                  </button>
                )}
                <button onClick={onCheck} disabled={busy || !selectedTarget}>
                  <CheckCircle2 size={15} /> {t(language, 'checkAction')}
                </button>
                <button onClick={onImportPanel}>
                  <Upload size={15} /> {language === 'zh' ? 'AI 辅助导入' : 'AI-assisted import'}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-editor">
              <h2>请选择内容</h2>
              <p>从左栏或中栏选择一个纲要后开始编辑。</p>
            </div>
          )}
        </div>
      </div>
      {(organizeProposals || organizeBusy || organizeError || organizeNotice) && (
        <section
          className="chapter-eval-panel"
          aria-label={zh ? '大纲整理提案' : 'Outline organize proposals'}
        >
          <header>
            <strong>{zh ? '大纲整理提案' : 'Outline organize proposals'}</strong>
            <button
              onClick={closeOrganizePanel}
              disabled={organizeBusy}
              aria-label={zh ? '关闭整理提案' : 'Close organize'}
            >
              <XCircle size={15} />
            </button>
          </header>
          <div className="chapter-eval-body">
            {organizeBusy && <p className="finalization-message">{zh ? '正在整理…' : 'Organizing…'}</p>}
            {organizeError && <p className="finalization-message error">{organizeError}</p>}
            {organizeNotice && <p className="finalization-message ok">{organizeNotice}</p>}
            {organizeProposals?.creates.map((item) => (
              <label key={item.proposal_id}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedCreates[item.proposal_id])}
                  onChange={(event) =>
                    setSelectedCreates({ ...selectedCreates, [item.proposal_id]: event.target.checked })
                  }
                />
                <span>
                  <strong>
                    {item.title} ({outlineLevelDisplayLabel(item.level, language)})
                  </strong>
                </span>
              </label>
            ))}
          </div>
          {organizeProposals && (
            <div className="chapter-eval-footer">
              <button className="primary" onClick={() => void applyOrganize()} disabled={organizeBusy}>
                {zh ? '确认写入' : 'Confirm write'}
              </button>
            </div>
          )}
        </section>
      )}
    </section>
  )
}

export function OutlineSummary({
  docs,
  level,
  selected,
  contextPacket,
  storyStructure
}: {
  docs: DocEntry[]
  level: WorkLevel
  selected: DocEntry | null
  contextPacket: ContextPacketSummary | null
  storyStructure: StoryStructureConfigV1
}) {
  const tasks = levelTasks(level)
  const children = childWorkLevels(level, storyStructure)
  const hierarchy = buildOutlineHierarchy(docs, storyStructure)
  const childCount = children.length
    ? (hierarchy.children.get(selected?.data.id ?? '') ?? []).filter((item) =>
        children.includes((item.data.level === 'arc' ? 'part' : item.data.level) as WorkLevel)
      ).length
    : docs.filter(
        (item) =>
          item.data.type === 'scene' && (item.data.chapter_id ?? item.data.section) === selected?.data.id
      ).length
  return (
    <article className="overview-summary">
      <p>{tasks.summary}</p>
      <div className="summary-metrics">
        <span>
          下级
          <b>{childCount}</b>
        </span>
        <span>
          正设
          <b>{contextPacket?.canon.length ?? 0}</b>
        </span>
        <span>
          人物
          <b>{contextPacket?.characters.length ?? 0}</b>
        </span>
        <span>
          伏笔
          <b>{contextPacket?.foreshadowing.length ?? 0}</b>
        </span>
      </div>
    </article>
  )
}
