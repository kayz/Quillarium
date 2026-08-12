import React from 'react'
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  GitBranch,
  Library,
  MapPin,
  PenLine,
  Sparkles,
  UserRound
} from 'lucide-react'
import type { DocEntry, LanguageName, ModuleName, TargetSelection } from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { outlineLevelLabel, outlineSortKey } from '../../shared/outline.js'

export function StructureTree({
  docs,
  selectedTarget,
  onSelect,
  language
}: {
  docs: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  language: LanguageName
}) {
  const outlines = docs
    .filter((item) => item.data.type === 'outline')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const scenes = docs.filter((item) => item.data.type === 'scene')
  const children = new Map<string | null, DocEntry[]>()
  for (const outline of outlines) {
    const parent = (outline.data.parent as string | null | undefined) ?? null
    children.set(parent, [...(children.get(parent) ?? []), outline])
  }
  const renderOutline = (outline: DocEntry, depth: number): React.ReactNode => {
    const nestedOutlines = children.get(outline.data.id) ?? []
    const nestedScenes = scenes.filter((scene) => scene.data.section === outline.data.id)
    return (
      <React.Fragment key={outline.data.id}>
        <button
          className={`tree-node level-${String(outline.data.level ?? 'section')} ${
            selectedTarget?.type === 'outline' && selectedTarget.id === outline.data.id ? 'active' : ''
          }`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          onClick={() => onSelect({ type: 'outline', id: outline.data.id })}
        >
          <FileText size={14} /> {outlineLevelLabel(String(outline.data.level))} · {outline.data.title}
        </button>
        {nestedOutlines.map((child) => renderOutline(child, depth + 1))}
        {nestedScenes.map((scene) => (
          <button
            key={scene.data.id}
            className={`tree-node scene ${
              selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id ? 'active' : ''
            }`}
            style={{ paddingLeft: `${24 + depth * 14}px` }}
            onClick={() => onSelect({ type: 'scene', id: scene.data.id })}
          >
            <FileText size={14} /> {scene.data.title}
          </button>
        ))}
      </React.Fragment>
    )
  }
  const attachedSceneIds = new Set(scenes.filter((scene) => scene.data.section).map((scene) => scene.data.id))
  const rootOutlines = children.get(null) ?? []
  const looseScenes = scenes.filter((scene) => !attachedSceneIds.has(scene.data.id))
  return (
    <div className="tree">
      <div className="tree-node open">
        <BookOpen size={15} /> {t(language, 'book')}
      </div>
      {rootOutlines.map((outline) => renderOutline(outline, 0))}
      {looseScenes.map((scene) => (
        <button
          key={scene.data.id}
          className={`tree-node scene ${
            selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id ? 'active' : ''
          }`}
          onClick={() => onSelect({ type: 'scene', id: scene.data.id })}
        >
          <FileText size={14} /> {scene.data.title}
        </button>
      ))}
    </div>
  )
}

export function ModuleNav({
  active,
  onSelect,
  docs,
  language
}: {
  active: ModuleName
  onSelect: (module: ModuleName) => void
  docs: DocEntry[]
  language: LanguageName
}) {
  const counts: Partial<Record<ModuleName, number>> = {
    canon: docs.filter((doc) => doc.data.type === 'canon').length,
    world: docs.filter((doc) => doc.data.type === 'world_entry').length,
    foreshadowing: docs.filter((doc) => doc.data.type === 'foreshadowing').length,
    issues: docs.filter((doc) => doc.data.type === 'issue').length,
    references: docs.filter((doc) => doc.data.type === 'reference').length,
    strategy: docs.filter((doc) => doc.data.type === 'strategy').length,
    patterns: docs.filter((doc) => doc.data.type === 'pattern').length
  }
  const items = [
    ['write', PenLine, t(language, 'writing')],
    ['canon', Library, 'Canon'],
    ['world', BookOpen, '世界书'],
    ['characters', UserRound, t(language, 'characters')],
    ['timeline', Clock3, t(language, 'timeline')],
    ['foreshadowing', GitBranch, '伏笔'],
    ['issues', CheckCircle2, '问题'],
    ['references', FileText, '参考'],
    ['strategy', Sparkles, '策略'],
    ['patterns', Circle, '模式'],
    ['locations', MapPin, t(language, 'locations')],
    ['runs', Sparkles, t(language, 'runs')]
  ] as const
  return (
    <div className="module-nav">
      {items.map(([id, Icon, label]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => onSelect(id)}>
          <Icon size={18} /> <span>{label}</span>
          {counts[id] !== undefined && <span className="nav-count">{counts[id]}</span>}
        </button>
      ))}
    </div>
  )
}
