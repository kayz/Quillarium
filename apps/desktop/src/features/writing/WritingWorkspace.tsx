import {
  BrainCircuit,
  CheckCircle2,
  LayoutGrid,
  List,
  PenLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Upload,
  WandSparkles
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
import {
  levelTasks,
  levelOverviewTitle,
  nextWorkLevel,
  outlineLevelLabel,
  structuredLine
} from '../../shared/outline.js'
import { renderMiniMarkdown } from '../../shared/text.js'

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
  onCheck,
  onSemanticCheck,
  onGenerate,
  onDryRun,
  onRewrite,
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
  onCreate: (level: WorkLevel, parent?: string | null) => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onCheck: () => Promise<void>
  onSemanticCheck: () => Promise<void>
  onGenerate: () => Promise<void>
  onDryRun: () => Promise<void>
  onRewrite: () => Promise<void>
  onImportPanel: () => void
  language: LanguageName
}) {
  const selected = selectedScene ?? selectedOutline
  const items = leftMode === 'read' ? finalizedScenes : visibleItems
  return (
    <section className="writing-workspace">
      <div className="level-tabs">
        {(['book', 'volume', 'arc', 'chapter'] as WorkLevel[]).map((item) => (
          <button key={item} className={level === item ? 'active' : ''} onClick={() => onLevel(item)}>
            {outlineLevelLabel(item)}
          </button>
        ))}
      </div>
      <div className="writing-grid">
        <div className="overview-pane">
          <div className="overview-head">
            <div>
              <span className="badge ok">{leftMode === 'read' ? '阅读' : outlineLevelLabel(level)}</span>
              <h2>{leftMode === 'read' ? '已定稿内容' : levelOverviewTitle(level, selectedOutline)}</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => onCreate(level, selectedOutline?.data.parent as string | null | undefined)}
              disabled={level === 'book'}
              title={`新增${outlineLevelLabel(level)}`}
            >
              <Plus size={17} />
            </button>
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
                    {item.data.type === 'scene' ? '正文' : outlineLevelLabel(String(item.data.level))} ·{' '}
                    {String(item.data.status ?? 'draft')}
                  </small>
                </span>
                {viewMode === 'list' && <em>{structuredLine(item)}</em>}
                {viewMode === 'tile' && <p>{item.content.slice(0, 180) || '暂无正文'}</p>}
              </button>
            ))}
          </div>
        </div>
        <div className="detail-pane">
          {selected ? (
            <>
              <div className="detail-head">
                <div>
                  <span className="badge ok">
                    {selected.data.type === 'scene' ? '正文' : outlineLevelLabel(String(selected.data.level))}
                  </span>
                  <h2>{selected.data.title}</h2>
                </div>
                <button onClick={onSave} disabled={busy || !dirty}>
                  <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                </button>
              </div>
              <MarkdownPreview content={doc?.content ?? selected.content} />
              <label className="detail-editor">
                Markdown
                <textarea
                  value={doc?.content ?? ''}
                  onChange={(event) => {
                    if (!doc) return
                    onDocChange({ ...doc, content: event.target.value })
                  }}
                  readOnly={leftMode === 'read'}
                />
              </label>
              <div className="detail-actions">
                <button onClick={onCheck} disabled={busy || !selectedTarget}>
                  <CheckCircle2 size={15} /> {t(language, 'checkAction')}
                </button>
                <button
                  onClick={onSemanticCheck}
                  disabled={busy || !selectedScene}
                  title={
                    selectedScene ? t(language, 'semanticCheckHint') : t(language, 'semanticCheckNeedsScene')
                  }
                >
                  <BrainCircuit size={15} /> {t(language, 'semanticCheckAction')}
                </button>
                {level === 'chapter' && (
                  <>
                    <button onClick={onDryRun} disabled={busy || !selectedScene}>
                      <Sparkles size={15} /> 草稿记录
                    </button>
                    <button onClick={onGenerate} disabled={busy || !selectedTarget}>
                      <WandSparkles size={15} /> 章节撰写
                    </button>
                    <button onClick={onRewrite} disabled={busy || !selectedScene}>
                      <PenLine size={15} /> 改写
                    </button>
                  </>
                )}
                <button onClick={onImportPanel}>
                  <Upload size={15} /> 粘贴导入
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
  const child = nextWorkLevel(level)
  const childCount = child
    ? docs.filter(
        (item) =>
          item.data.type === 'outline' && item.data.level === child && item.data.parent === selected?.data.id
      ).length
    : docs.filter((item) => item.data.type === 'scene' && item.data.section === selected?.data.id).length
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

export function MarkdownPreview({ content }: { content: string }) {
  const html = renderMiniMarkdown(content)
  return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />
}
