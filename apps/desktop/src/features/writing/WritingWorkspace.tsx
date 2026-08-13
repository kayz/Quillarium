import { useRef, useState } from 'react'
import { CheckCircle2, LayoutGrid, List, Plus, Save, Search, Trash2, Upload } from 'lucide-react'
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

export function WritingWorkspace({
  docs,
  level,
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
  language
}: {
  docs: DocEntry[]
  level: WorkLevel
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
  language: LanguageName
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [overviewWidth, setOverviewWidth] = useState(48)
  const selected = selectedScene ?? selectedOutline
  const items = leftMode === 'read' ? finalizedScenes : visibleItems
  const childLabels = childWorkLevels(level).map(outlineLevelLabel).join('或')
  const selectedLevel = String(selectedOutline?.data.level ?? '')
  const canDelete =
    selected?.data.type === 'scene' ||
    (selected?.data.type === 'outline' &&
      ['volume', 'part', 'arc', 'act', 'chapter', 'section'].includes(selectedLevel))
  return (
    <section className="writing-workspace">
      <div className="level-tabs">
        {(['overview', 'book', 'volume', 'part', 'act', 'chapter', 'ai'] as WorkLevel[]).map((item) => (
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
              {childWorkLevels(level).map((child) => (
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
          />
          {leftMode === 'write' && !items.length && childWorkLevels(level).length > 0 && (
            <button
              className="outline-child-empty"
              onClick={() => onCreate(childWorkLevels(level)[0], selectedOutline?.data.id ?? null)}
              disabled={!selectedOutline}
            >
              <Plus size={18} />
              <strong>规划第一个{outlineLevelLabel(childWorkLevels(level)[0])}</strong>
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
    </section>
  )
}

export function OutlineSummary({
  docs,
  level,
  selected,
  contextPacket
}: {
  docs: DocEntry[]
  level: WorkLevel
  selected: DocEntry | null
  contextPacket: ContextPacketSummary | null
}) {
  const tasks = levelTasks(level)
  const children = childWorkLevels(level)
  const hierarchy = buildOutlineHierarchy(docs)
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
          Canon
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
