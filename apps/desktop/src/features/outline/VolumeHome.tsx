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
  onDelete: () => Promise<void>
  onOpenExternal: () => Promise<void>
  onReloadDoc: () => Promise<void>
  onDocChange: (doc: { data: Record<string, unknown>; content: string; path: string }) => void
  onSave: () => Promise<void>
  onImport: () => void
  language: LanguageName
}) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const section = VOLUME_SECTIONS.find((item) => item.id === activeSection) ?? VOLUME_SECTIONS[0]
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
    const title = window.prompt(`新建${section.title}`)
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
          <button className="icon-button" onClick={onToggleLeft} title={leftOpen ? '收窄左栏' : '展开左栏'}>
            <ChevronDown size={16} />
          </button>
          {leftOpen && <strong>卷纲</strong>}
        </div>
        {leftOpen && (
          <div className="volume-switcher">
            <button onClick={onBackOutline}>返回大纲</button>
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
              title={item.title}
            >
              <item.icon size={17} />
              {leftOpen ? (
                <>
                  <span>{item.title}</span>
                  <small>{countVolumeSection(docs, volume, item.id)}</small>
                </>
              ) : (
                <span className="one-char">{item.short}</span>
              )}
            </button>
          ))}
        </div>
        {leftOpen && (
          <div className="volume-quick-list">
            <strong>段纲</strong>
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
              <Plus size={14} /> 新增段纲
            </button>
          </div>
        )}
        <button className="outline-import" onClick={onImport} title="导入新的设定">
          <Upload size={17} />
          {leftOpen ? <span>导入新的设定</span> : <span className="one-char">导</span>}
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
              <h2>{section.heading}</h2>
            </div>
            <div className="outline-actions">
              <button onClick={createCurrent} disabled={busy}>
                <Plus size={15} /> 新增
              </button>
              <button onClick={onDelete} disabled={!doc || busy}>
                <Trash2 size={15} /> 删除
              </button>
            </div>
          </div>
          <div className="overview-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="搜索本卷标题、字段或正文"
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
              {!items.length && <p className="empty-row">当前卷还没有匹配内容。</p>}
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
                    <span className="badge ok">{selected ? docTypeLabel(selected) : '文档'}</span>
                    <h2>{String(doc.data.title ?? '未命名')}</h2>
                  </div>
                  <button className="icon-button" onClick={onToggleRight} title="收窄右栏">
                    <ChevronDown size={16} />
                  </button>
                </div>
                <MetadataEditor data={doc.data} onChange={(data) => onDocChange({ ...doc, data })} />
                <label className="detail-editor">
                  正文
                  <textarea
                    value={doc.content}
                    onChange={(event) => onDocChange({ ...doc, content: event.target.value })}
                  />
                </label>
                <div className="detail-actions">
                  <button onClick={onOpenExternal}>
                    <FileText size={15} /> 编辑
                  </button>
                  <button onClick={onReloadDoc}>
                    <RefreshCw size={15} /> 同步
                  </button>
                  <button onClick={onSave} disabled={!dirty}>
                    <Save size={15} /> {dirty ? `${t(language, 'save')} *` : t(language, 'saved')}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-editor">
                <h2>请选择内容</h2>
                <p>从中栏选择条目后，右侧会展开编辑。</p>
              </div>
            )
          ) : (
            <button className="detail-rail" onClick={onToggleRight} title="展开详情">
              详
            </button>
          )}
        </aside>
      </section>
    </main>
  )
}
