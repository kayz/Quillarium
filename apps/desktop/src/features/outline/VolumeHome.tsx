import React, { useRef } from 'react'
import {
  ChevronDown,
  FileText,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Save,
  Search,
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
import { MetadataEditor, StructuredTile, VolumeTimeline } from './OutlineShared.js'
import { MarkdownBodyEditor } from '../markdown/MarkdownBodyEditor.js'
import { isAIPlanningContext } from '../planning/planning-model.js'

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
  onDelete,
  onOpenExternal,
  onReloadDoc,
  onDocChange,
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
  onDelete: () => Promise<void>
  onOpenExternal: () => Promise<void>
  onReloadDoc: () => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onImport: () => void
  language: LanguageName
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const zh = language === 'zh'
  const section = VOLUME_SECTIONS.find((item) => item.id === activeSection) ?? VOLUME_SECTIONS[0]
  const sectionHeading = zh ? section.heading : section.enHeading
  const arcs = docs
    .filter(
      (item) =>
        item.data.type === 'outline' && item.data.level === 'arc' && item.data.parent === volume.data.id
    )
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const items = filterDocs(volumeSectionDocs(docs, volume, activeSection), search)
  const selected = selectedTarget
    ? docs.find((item) => item.data.id === selectedTarget.id && item.data.type === selectedTarget.type)
    : null

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = shellRef.current?.getBoundingClientRect()
    if (!box) return
    const move = (moveEvent: PointerEvent) => {
      const next = ((moveEvent.clientX - box.left) / box.width) * 100
      onMiddlePct(Math.min(72, Math.max(36, Math.round(next))))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    event.preventDefault()
  }

  const createCurrent = async () => {
    if (isAIPlanningContext(activeSection)) {
      onAIPlanningCreate(activeSection)
      return
    }
    const title = window.prompt(zh ? `新建${section.title}` : `New ${section.enTitle}`)
    if (!title?.trim()) return
    if (activeSection === 'arcs') {
      await onCreate('outline', {
        title: title.trim(),
        level: 'arc',
        parent: volume.data.id,
        order: arcs.length,
        target_words: Math.max(project.chapter_words * 10, 1),
        content: `## ${title.trim()}\n`
      })
      return
    }
    const input = createInputForOutlineSection(activeSection, title.trim(), docs, project)
    await onCreate(input.kind, applyVolumeScope(input.data, volume))
  }

  return (
    <main
      className={`outline-home volume-home ${leftOpen ? '' : 'left-narrow'} ${rightOpen ? '' : 'right-narrow'}`}
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
          {leftOpen && <strong>{zh ? '卷纲' : 'Volume'}</strong>}
        </div>
        {leftOpen && (
          <div className="volume-switcher">
            <button onClick={onBackOutline}>{zh ? '返回大纲' : 'Back to outline'}</button>
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
            <strong>{zh ? '段纲' : 'Arcs'}</strong>
            {arcs.map((arc) => (
              <button
                key={arc.data.id}
                className={selectedTarget?.id === arc.data.id ? 'active' : ''}
                onClick={() => onSelect({ type: 'outline', id: arc.data.id })}
              >
                {arc.data.title}
              </button>
            ))}
            <button className="sidebar-create" onClick={() => void createCurrent()}>
              <Plus size={14} /> {zh ? '新增段纲' : 'New arc'}
            </button>
          </div>
        )}
        <button
          className="outline-import"
          onClick={onImport}
          title={zh ? '导入新的设定' : 'Import planning records'}
        >
          <Upload size={17} />
          {leftOpen ? (
            <span>{zh ? '导入新的设定' : 'Import records'}</span>
          ) : (
            <span className="one-char">{zh ? '导' : 'I'}</span>
          )}
        </button>
      </aside>
      <section
        ref={shellRef}
        className="outline-main"
        style={{ gridTemplateColumns: rightOpen ? `${middlePct}% 8px 1fr` : '1fr 8px 44px' }}
      >
        <div className="outline-collection">
          <div className="outline-collection-head">
            <div>
              <span className="badge ok">{volume.data.title}</span>
              <h2>{sectionHeading}</h2>
            </div>
            <div className="outline-actions">
              <button onClick={createCurrent} disabled={busy}>
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
            <VolumeTimeline
              docs={docs}
              volume={volume}
              arcs={arcs}
              items={items}
              onSelect={onSelect}
              selectedTarget={selectedTarget}
            />
          ) : (
            <div className={viewMode === 'tile' ? 'outline-tile-grid' : 'outline-list'}>
              {items.map((item) => (
                <button
                  key={item.data.id}
                  className={`outline-item ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                  onClick={() => onSelect({ type: item.data.type, id: item.data.id })}
                >
                  <span>
                    <b>{item.data.title}</b>
                    <small>
                      {docTypeLabel(item)} · {String(item.data.status ?? 'draft')}
                    </small>
                  </span>
                  {viewMode === 'list' && <em>{structuredLineForSection(item)}</em>}
                  {viewMode === 'tile' && <StructuredTile doc={item} />}
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
        <div className="resize-handle" onPointerDown={startDrag} />
        <aside className="outline-detail">
          {rightOpen ? (
            doc ? (
              <>
                <div className="detail-head">
                  <div>
                    <span className="badge ok">
                      {selected ? docTypeLabel(selected) : zh ? '文档' : 'Document'}
                    </span>
                    <h2>{String(doc.data.title ?? (zh ? '未命名' : 'Untitled'))}</h2>
                  </div>
                  <button
                    className="icon-button"
                    onClick={onToggleRight}
                    title={zh ? '收窄右栏' : 'Collapse details'}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
                <MetadataEditor
                  data={doc.data}
                  language={language}
                  onChange={(data) => onDocChange({ ...doc, data })}
                />
                <MarkdownBodyEditor
                  value={doc.content}
                  onChange={(content) => onDocChange({ ...doc, content })}
                  language={language}
                />
                <div className="detail-actions">
                  <button onClick={onOpenExternal}>
                    <FileText size={15} /> {zh ? '编辑' : 'Edit'}
                  </button>
                  <button onClick={onReloadDoc}>
                    <RefreshCw size={15} /> {zh ? '同步' : 'Sync'}
                  </button>
                  <button onClick={onSave} disabled={!dirty}>
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
    </main>
  )
}
