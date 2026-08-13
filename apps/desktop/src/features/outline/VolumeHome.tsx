import React, { useRef, type CSSProperties } from 'react'
import {
  Bot,
  ChevronDown,
  FileText,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload
} from 'lucide-react'
import type {
  DocEntry,
  LanguageName,
  ProjectListItem,
  TargetSelection,
  ViewMode,
  VolumeSection
} from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { filterDocs, outlineSortKey } from '../../shared/outline.js'
import {
  applyVolumeScope,
  countVolumeSection,
  createInputForOutlineSection,
  docTypeLabel,
  structuredLineForSection,
  VOLUME_SECTIONS,
  volumeSectionDocs
} from './outline-model.js'
import {
  AI_EDITABLE_CARD_TYPES,
  MetadataEditor,
  PlanningCardSupportPanel,
  StructuredTile
} from './OutlineShared.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { isAIPlanningContext } from '../planning/planning-model.js'
import { clampPaneSize, SplitHandle } from '../layout/SplitHandle.js'
import { OutlineCreateDialog } from './OutlineCreateDialog.js'
import { EditableDocumentTitle } from './EditableDocumentTitle.js'
import { enumChoiceLabel } from '../metadata/field-presentation.js'
import { CharacterRelationView, LocationExplorerView, TimelineChainView } from '../planning/PlanningViews.js'

export function VolumeHome({
  docs,
  doc,
  selectedTarget,
  volume,
  volumes,
  activeSection,
  leftOpen,
  rightOpen,
  middlePct,
  viewMode,
  search,
  dirty,
  busy,
  project,
  onBackOutline,
  onVolume,
  onSection,
  onToggleLeft,
  onToggleRight,
  onMiddlePct,
  onSearch,
  onViewMode,
  onSelect,
  onCreate,
  onAIPlanningCreate,
  onAIEditCard,
  onPlanningCheck,
  onDelete,
  onOpenExternal,
  onReloadDoc,
  onDocChange,
  onInspectTag,
  onSave,
  onImport,
  language
}: {
  docs: DocEntry[]
  doc: { data: Record<string, unknown>; content: string; path: string } | null
  selectedTarget: TargetSelection | null
  volume: DocEntry
  volumes: DocEntry[]
  activeSection: VolumeSection
  leftOpen: boolean
  rightOpen: boolean
  middlePct: number
  viewMode: ViewMode
  search: string
  dirty: boolean
  busy: boolean
  project: ProjectListItem
  onBackOutline: () => void
  onVolume: (volume: DocEntry) => void
  onSection: (section: VolumeSection) => void
  onToggleLeft: () => void
  onToggleRight: () => void
  onMiddlePct: (pct: number) => void
  onSearch: (value: string) => void
  onViewMode: (mode: ViewMode) => void
  onSelect: (target: TargetSelection) => void
  onCreate: (kind: string, input: Record<string, unknown>) => Promise<void>
  onAIPlanningCreate: (section: VolumeSection) => void
  onAIEditCard: (doc: DocEntry) => void
  onPlanningCheck: () => Promise<void>
  onDelete: () => Promise<void>
  onOpenExternal: () => Promise<void>
  onReloadDoc: () => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onInspectTag: (tag: string, displayValue?: string) => void
  onSave: () => Promise<void>
  onImport: () => void
  language: LanguageName
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const detailSplitRef = useRef<HTMLDivElement | null>(null)
  const [navigationWidth, setNavigationWidth] = React.useState(280)
  const [detailMetadataPct, setDetailMetadataPct] = React.useState(38)
  const [createSection, setCreateSection] = React.useState<VolumeSection | null>(null)
  const [creating, setCreating] = React.useState(false)
  const zh = language === 'zh'
  const section = VOLUME_SECTIONS.find((item) => item.id === activeSection) ?? VOLUME_SECTIONS[0]
  const sectionHeading = zh ? section.heading : section.enHeading
  const parts = docs
    .filter(
      (item) =>
        item.data.type === 'outline' &&
        (item.data.level === 'part' || item.data.level === 'arc') &&
        item.data.parent === volume.data.id
    )
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const items = filterDocs(volumeSectionDocs(docs, volume, activeSection), search)
  const selected = selectedTarget
    ? docs.find((item) => item.data.id === selectedTarget.id && item.data.type === selectedTarget.type)
    : null

  const createCurrent = (requestedSection: VolumeSection = activeSection) => {
    if (isAIPlanningContext(requestedSection)) {
      onAIPlanningCreate(requestedSection)
      return
    }
    setCreateSection(requestedSection)
  }

  return (
    <main
      className={`outline-home volume-home ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`}
      style={
        {
          '--outline-navigation-width': `${leftOpen ? navigationWidth : 58}px`
        } as CSSProperties
      }
    >
      <aside className="outline-nav">
        <div className="outline-nav-head">
          <button
            className="icon-button"
            onClick={onToggleLeft}
            title={leftOpen ? (zh ? '收窄左栏' : 'Collapse sidebar') : zh ? '展开左栏' : 'Expand sidebar'}
          >
            <ChevronDown size={16} />
          </button>
          {leftOpen && <strong>{zh ? '卷' : 'Volume'}</strong>}
          <button
            className="planning-check-button"
            type="button"
            onClick={() => void onPlanningCheck()}
            disabled={busy}
            title={zh ? '用 AI 检查所有已启用的规划卡片' : 'Check all enabled planning cards with AI'}
          >
            <ShieldCheck size={15} />
            {leftOpen && <span>{busy ? (zh ? '检查中…' : 'Checking…') : zh ? 'AI 检查' : 'AI check'}</span>}
          </button>
        </div>
        {leftOpen && (
          <div className="volume-switcher">
            <button onClick={onBackOutline}>{zh ? '返回规划' : 'Back to planning'}</button>
            <select
              value={volume.data.id}
              onChange={(event) => {
                const next = volumes.find((item) => item.data.id === event.target.value)
                if (next) onVolume(next)
              }}
            >
              {volumes.map((item, index) => (
                <option key={item.data.id} value={item.data.id}>
                  {index + 1}. {item.data.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="outline-nav-list">
          {VOLUME_SECTIONS.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? 'active' : ''}
              onClick={() => onSection(item.id)}
              title={zh ? item.title : item.enTitle}
            >
              <item.icon size={17} />
              {leftOpen ? (
                <>
                  <span>{zh ? item.title : item.enTitle}</span>
                  <small>{countVolumeSection(docs, volume, item.id)}</small>
                </>
              ) : (
                <span className="one-char">{zh ? item.short : item.enShort}</span>
              )}
            </button>
          ))}
        </div>
        {leftOpen && (
          <div className="volume-quick-list">
            <strong>{zh ? '篇' : 'Parts'}</strong>
            {parts.map((arc) => (
              <button
                key={arc.data.id}
                className={selectedTarget?.id === arc.data.id ? 'active' : ''}
                onClick={() => onSelect({ type: 'outline', id: arc.data.id })}
              >
                {arc.data.title}
              </button>
            ))}
            <button className="sidebar-create" onClick={() => createCurrent('parts')}>
              <Plus size={14} /> {zh ? '新增篇' : 'New part'}
            </button>
          </div>
        )}
        <button
          className="outline-import"
          onClick={onImport}
          title={zh ? 'AI 辅助导入资料' : 'AI-assisted source import'}
        >
          <Upload size={17} />
          {leftOpen ? (
            <span>{zh ? 'AI 辅助导入' : 'AI-assisted import'}</span>
          ) : (
            <span className="one-char">{zh ? '导' : 'I'}</span>
          )}
        </button>
      </aside>
      {leftOpen && (
        <SplitHandle
          orientation="vertical"
          className="outline-navigation-handle"
          label={zh ? '调整左侧栏目宽度' : 'Resize section navigation'}
          onResize={(delta) =>
            setNavigationWidth((current) => clampPaneSize(current + delta, 190, window.innerWidth - 720))
          }
        />
      )}
      <section
        ref={shellRef}
        className="outline-main"
        style={{ gridTemplateColumns: rightOpen ? `${middlePct}% 10px 1fr` : '1fr 10px 44px' }}
      >
        <div className="outline-collection">
          <div className="outline-collection-head">
            <div>
              <span className="badge ok">{volume.data.title}</span>
              <h2>{sectionHeading}</h2>
            </div>
            <div className="outline-actions">
              <button onClick={() => createCurrent()} disabled={busy}>
                <Plus size={15} /> {zh ? '新增' : 'New'}
              </button>
              <button onClick={onDelete} disabled={!doc || busy}>
                <Trash2 size={15} /> {zh ? '删除' : 'Delete'}
              </button>
            </div>
          </div>
          <div className="overview-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={zh ? '搜索本卷标题、字段或正文' : 'Search this volume'}
              />
            </label>
            <div className="icon-segment">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => onViewMode('list')}
                title={zh ? '列表' : 'List'}
              >
                <List size={16} />
              </button>
              <button
                className={viewMode === 'tile' ? 'active' : ''}
                onClick={() => onViewMode('tile')}
                title={zh ? '平铺' : 'Tiles'}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
          {activeSection === 'timeline' ? (
            <TimelineChainView
              items={items}
              selectedTarget={selectedTarget}
              onSelect={onSelect}
              language={language}
            />
          ) : activeSection === 'characters' ? (
            <CharacterRelationView
              items={items}
              timelineNodes={docs.filter((item) => item.data.type === 'timeline_node')}
              selectedTarget={selectedTarget}
              onSelect={onSelect}
              language={language}
            />
          ) : activeSection === 'locations' ? (
            <LocationExplorerView
              items={items}
              selectedTarget={selectedTarget}
              onSelect={onSelect}
              language={language}
            />
          ) : (
            <div className={viewMode === 'tile' ? 'outline-tile-grid' : 'outline-list'}>
              {items.map((item) => (
                <button
                  key={item.data.id}
                  className={`outline-item ${item.data.enabled === false ? 'disabled-card' : ''} ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                  onClick={() => onSelect({ type: item.data.type, id: item.data.id })}
                >
                  <span>
                    <b>{item.data.title}</b>
                    <small>
                      {docTypeLabel(item, language)}
                      {item.data.type === 'reference' ? (
                        <> · {zh ? '材料来源' : 'Source material'}</>
                      ) : (
                        <>
                          {' · '}
                          {enumChoiceLabel('status', String(item.data.status ?? 'draft'), language, {
                            documentType: String(item.data.type)
                          })}
                          {item.data.enabled === false ? (zh ? ' · 未启用' : ' · Disabled') : ''}
                        </>
                      )}
                    </small>
                  </span>
                  {viewMode === 'list' && <em>{structuredLineForSection(item, language)}</em>}
                  {viewMode === 'tile' && <StructuredTile doc={item} language={language} />}
                </button>
              ))}
              {!items.length && (
                <p className="empty-row">
                  {zh ? '当前卷还没有匹配内容。' : 'No matching records in this volume.'}
                </p>
              )}
            </div>
          )}
        </div>
        <SplitHandle
          orientation="vertical"
          className="outline-detail-handle"
          label={zh ? '调整内容列表与详情宽度' : 'Resize collection and details'}
          onResize={(delta) => {
            const width = shellRef.current?.clientWidth ?? 1
            onMiddlePct(clampPaneSize(middlePct + (delta / width) * 100, 32, rightOpen ? 78 : 92))
          }}
        />
        <aside className="outline-detail">
          {rightOpen ? (
            doc ? (
              <>
                <div className="detail-head">
                  <div>
                    <span className="badge ok">
                      {selected ? docTypeLabel(selected, language) : zh ? '文档' : 'Document'}
                    </span>
                    <EditableDocumentTitle
                      value={doc.data.title}
                      language={language}
                      onChange={(title) => onDocChange({ ...doc, data: { ...doc.data, title } })}
                    />
                  </div>
                  <button
                    className="icon-button"
                    onClick={onToggleRight}
                    title={zh ? '收窄右栏' : 'Collapse details'}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <div
                  ref={detailSplitRef}
                  className="detail-split-region"
                  style={{ gridTemplateRows: `${detailMetadataPct}% 10px minmax(0, 1fr)` }}
                >
                  <div className="detail-metadata-pane">
                    <PlanningCardSupportPanel
                      doc={{ path: doc.path, data: doc.data as DocEntry['data'], content: doc.content }}
                      docs={docs}
                      language={language}
                      onSelect={onSelect}
                      onAIEdit={onAIEditCard}
                    />
                    <MetadataEditor
                      data={doc.data}
                      docs={docs}
                      language={language}
                      onInspectTag={onInspectTag}
                      onChange={(data) => onDocChange({ ...doc, data })}
                    />
                  </div>
                  <SplitHandle
                    orientation="horizontal"
                    className="detail-body-handle"
                    label={zh ? '调整属性与正文高度' : 'Resize metadata and Markdown body'}
                    onResize={(delta) => {
                      const height = detailSplitRef.current?.clientHeight ?? 1
                      setDetailMetadataPct((current) =>
                        clampPaneSize(current + (delta / height) * 100, 22, 72)
                      )
                    }}
                  />
                  <div className="detail-markdown-pane">
                    <MarkdownBodyEditor
                      value={doc.content}
                      onChange={(content) => onDocChange({ ...doc, content })}
                      language={language}
                    />
                  </div>
                </div>
                <div className="detail-actions">
                  {AI_EDITABLE_CARD_TYPES.has(String(doc.data.type)) && (
                    <button
                      onClick={() =>
                        onAIEditCard({
                          path: doc.path,
                          data: doc.data as DocEntry['data'],
                          content: doc.content
                        })
                      }
                    >
                      <Bot size={15} /> {zh ? 'AI 协助调整' : 'Edit with AI'}
                    </button>
                  )}
                  <button onClick={onOpenExternal}>
                    <FileText size={15} /> {zh ? '编辑' : 'Edit'}
                  </button>
                  <button onClick={onReloadDoc}>
                    <RefreshCw size={15} /> {zh ? '同步' : 'Sync'}
                  </button>
                  <button onClick={onSave} disabled={!dirty || !String(doc.data.title ?? '').trim()}>
                    <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-editor">
                <h2>{zh ? '请选择内容' : 'Select a record'}</h2>
                <p>
                  {zh
                    ? '从中栏选择条目后，右侧会展开编辑。'
                    : 'Select an item to open it in the detail pane.'}
                </p>
              </div>
            )
          ) : (
            <button
              className="detail-rail"
              onClick={onToggleRight}
              title={zh ? '展开详情' : 'Expand details'}
            >
              {zh ? '详' : 'D'}
            </button>
          )}
        </aside>
      </section>
      {createSection && (
        <OutlineCreateDialog
          label={
            zh
              ? (VOLUME_SECTIONS.find((item) => item.id === createSection)?.title ?? section.title)
              : (VOLUME_SECTIONS.find((item) => item.id === createSection)?.enTitle ?? section.enTitle)
          }
          parentTitle={createSection === 'parts' ? volume.data.title : null}
          language={language}
          busy={creating}
          onClose={() => setCreateSection(null)}
          onConfirm={async (title) => {
            setCreating(true)
            try {
              if (createSection === 'parts') {
                await onCreate('outline', {
                  title,
                  level: 'part',
                  parent: volume.data.id,
                  order: parts.length,
                  target_words: Math.max(project.chapter_words * 10, 1),
                  content: `## ${title}\n`
                })
              } else {
                const input = createInputForOutlineSection(createSection, title, docs, project)
                await onCreate(input.kind, applyVolumeScope(input.data, volume))
              }
              setCreateSection(null)
            } finally {
              setCreating(false)
            }
          }}
        />
      )}
    </main>
  )
}
