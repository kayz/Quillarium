import { Eye, FileText, PenLine, Plus, RefreshCw, Upload } from 'lucide-react'
import type { DocEntry, LeftMode, TargetSelection, WorkLevel } from '../../app/types.js'
import type { OutlineHierarchy } from '../../shared/outline.js'
import {
  nextWorkLevel,
  outlineItemsForLevel,
  outlineLevelLabel,
  parentForNewLevel
} from '../../shared/outline.js'

export function WritingSidebar({
  docs,
  level,
  mode,
  selectedTarget,
  hierarchy,
  finalizedScenes,
  onMode,
  onSelect,
  onCreate,
  onImport,
  onUpdate,
  busy
}: {
  docs: DocEntry[]
  level: WorkLevel
  mode: LeftMode
  selectedTarget: TargetSelection | null
  hierarchy: OutlineHierarchy
  finalizedScenes: DocEntry[]
  onMode: (mode: LeftMode) => void
  onSelect: (target: TargetSelection) => void
  onCreate: (level: WorkLevel, parent?: string | null) => Promise<void>
  onImport: () => Promise<void>
  onUpdate: () => Promise<void>
  busy: boolean
}) {
  const childLevel = nextWorkLevel(level)
  const parent =
    selectedTarget?.type === 'outline'
      ? docs.find((item) => item.data.id === selectedTarget.id && item.data.type === 'outline')
      : null
  const childItems = childLevel
    ? (hierarchy.children.get(parent?.data.id ?? null)?.filter((item) => item.data.level === childLevel) ??
      [])
    : []
  const levelItems = outlineItemsForLevel(docs, level, parent ?? null, selectedTarget)
  return (
    <div className="writing-sidebar">
      <div className="segmented">
        <button className={mode === 'write' ? 'active' : ''} onClick={() => onMode('write')}>
          <PenLine size={15} /> 写作
        </button>
        <button className={mode === 'read' ? 'active' : ''} onClick={() => onMode('read')}>
          <Eye size={15} /> 阅读
        </button>
      </div>
      {mode === 'write' ? (
        <>
          <section className="sidebar-section">
            <strong>{childLevel ? `下一级：${outlineLevelLabel(childLevel)}` : '章节正文'}</strong>
            {childLevel ? (
              <>
                {childItems.map((item) => (
                  <button
                    key={item.data.id}
                    className={`tree-node ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                    onClick={() => onSelect({ type: 'outline', id: item.data.id })}
                  >
                    <FileText size={14} /> {item.data.title}
                  </button>
                ))}
                <button
                  className="sidebar-create"
                  onClick={() => onCreate(childLevel, parent?.data.id ?? null)}
                >
                  <Plus size={14} /> 新增{outlineLevelLabel(childLevel)}
                </button>
              </>
            ) : (
              <p className="muted">选择章后，可新增节进行 AI 编写，也可直接手写章正文。</p>
            )}
          </section>
          <section className="sidebar-section">
            <strong>当前层级</strong>
            {levelItems.map((item) => (
              <button
                key={item.data.id}
                className={`tree-node ${selectedTarget?.id === item.data.id ? 'active' : ''}`}
                onClick={() => onSelect({ type: 'outline', id: item.data.id })}
              >
                <FileText size={14} /> {item.data.title}
              </button>
            ))}
            {level !== 'book' && (
              <button
                className="sidebar-create"
                onClick={() => onCreate(level, parentForNewLevel(docs, level, parent ?? null))}
              >
                <Plus size={14} /> 新增{outlineLevelLabel(level)}
              </button>
            )}
          </section>
        </>
      ) : (
        <section className="sidebar-section">
          <strong>已定稿章节</strong>
          {finalizedScenes.length ? (
            finalizedScenes.map((scene) => (
              <button
                key={scene.data.id}
                className={`tree-node scene ${selectedTarget?.id === scene.data.id ? 'active' : ''}`}
                onClick={() => onSelect({ type: 'scene', id: scene.data.id })}
              >
                <FileText size={14} /> {scene.data.title}
              </button>
            ))
          ) : (
            <p className="muted">还没有定稿章节。</p>
          )}
        </section>
      )}
      <div className="sidebar-bottom-actions">
        <button onClick={onImport} disabled={busy}>
          <Upload size={14} /> 导入
        </button>
        <button onClick={onUpdate} disabled={busy}>
          <RefreshCw size={14} /> 更新
        </button>
      </div>
    </div>
  )
}
