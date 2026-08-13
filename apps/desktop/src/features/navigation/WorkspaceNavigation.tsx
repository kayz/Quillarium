import React from 'react'
import {
  BookOpen,
  CheckCircle2,
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
import { buildOutlineHierarchy } from '../../shared/outline.js'
import {
  documentTypeLabel,
  enumChoiceLabel,
  outlineLevelDisplayLabel
} from '../metadata/field-presentation.js'

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
  const { children } = buildOutlineHierarchy(docs)
  const scenes = docs.filter((item) => item.data.type === 'scene')
  const chapterProse = docs.filter((item) => item.data.type === 'chapter_prose')
  const renderOutline = (outline: DocEntry, depth: number): React.ReactNode => {
    const nestedOutlines = children.get(outline.data.id) ?? []
    const prose = chapterProse.find((item) => item.data.chapter_id === outline.data.id)
    const nestedScenes = scenes.filter(
      (scene) => (scene.data.chapter_id ?? scene.data.section) === outline.data.id
    )
    return (
      <React.Fragment key={outline.data.id}>
        <button
          className={`tree-node level-${String(outline.data.level ?? 'section')} ${
            selectedTarget?.type === 'outline' &&
            selectedTarget.id === outline.data.id &&
            !selectedTarget.view
              ? 'active'
              : ''
          }`}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          onClick={() => onSelect({ type: 'outline', id: outline.data.id })}
        >
          <FileText size={14} /> {outlineLevelDisplayLabel(String(outline.data.level), language)} ·{' '}
          {outline.data.title}
        </button>
        {nestedOutlines.map((child) => renderOutline(child, depth + 1))}
        {outline.data.level === 'chapter' && (
          <button
            className={`tree-node chapter-prose-state ${
              (prose && selectedTarget?.type === 'chapter_prose' && selectedTarget.id === prose.data.id) ||
              (selectedTarget?.id === outline.data.id && selectedTarget.view === 'prose')
                ? 'active'
                : ''
            }`}
            style={{ paddingLeft: `${24 + depth * 14}px` }}
            onClick={() => onSelect({ type: 'outline', id: outline.data.id, view: 'prose' })}
          >
            <FileText size={14} /> {language === 'zh' ? '章正文' : 'Chapter prose'} ·{' '}
            {proseStatusLabel(String(prose?.data.status ?? 'draft'), language)}
          </button>
        )}
        {nestedScenes.map((scene) => (
          <button
            key={scene.data.id}
            className={`tree-node scene ${
              selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id ? 'active' : ''
            }`}
            style={{ paddingLeft: `${24 + depth * 14}px` }}
            onClick={() => onSelect({ type: 'scene', id: scene.data.id, view: 'ai' })}
          >
            <FileText size={14} /> {language === 'zh' ? '节' : 'Scene'} · {scene.data.title}
          </button>
        ))}
        {outline.data.level === 'chapter' && (
          <button
            className={`tree-node level-ai ${
              selectedTarget?.id === outline.data.id && selectedTarget.view === 'ai' ? 'active' : ''
            }`}
            style={{ paddingLeft: `${24 + depth * 14}px` }}
            onClick={() => onSelect({ type: 'outline', id: outline.data.id, view: 'ai' })}
          >
            <Sparkles size={14} /> {language === 'zh' ? '节管理 / AI 编写' : 'Scenes / AI writing'}
          </button>
        )}
      </React.Fragment>
    )
  }
  const attachedSceneIds = new Set(
    scenes.filter((scene) => scene.data.chapter_id ?? scene.data.section).map((scene) => scene.data.id)
  )
  const rootOutlines = children.get(null) ?? []
  const overviewRoots = rootOutlines.filter((outline) => outline.data.level === 'overview')
  const bookRoots = rootOutlines.filter((outline) => outline.data.level === 'book')
  const otherRoots = rootOutlines.filter(
    (outline) => outline.data.level !== 'overview' && outline.data.level !== 'book'
  )
  const looseScenes = scenes.filter((scene) => !attachedSceneIds.has(scene.data.id))
  return (
    <div className="tree">
      <div className="tree-node open">
        <BookOpen size={15} /> {t(language, 'book')}
      </div>
      <div className="tree-group-label">{language === 'zh' ? '总览' : 'Overview'}</div>
      {overviewRoots.map((outline) => renderOutline(outline, 0))}
      <div className="tree-group-label">
        {language === 'zh' ? '总纲与故事树' : 'Book outline and story tree'}
      </div>
      {bookRoots.map((outline) => renderOutline(outline, 0))}
      {otherRoots.map((outline) => renderOutline(outline, 0))}
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

function proseStatusLabel(status: string, language: LanguageName): string {
  return enumChoiceLabel('status', status, language, { documentType: 'chapter_prose' })
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
    narrative: docs.filter((doc) => ['narrative', 'strategy', 'pattern'].includes(doc.data.type)).length
  }
  const items = [
    ['write', PenLine, t(language, 'writing')],
    ['canon', Library, documentTypeLabel('canon', language)],
    ['world', BookOpen, t(language, 'worldBook')],
    ['characters', UserRound, t(language, 'characters')],
    ['timeline', Clock3, t(language, 'timeline')],
    ['foreshadowing', GitBranch, t(language, 'foreshadowing')],
    ['issues', CheckCircle2, t(language, 'issues')],
    ['references', FileText, t(language, 'references')],
    ['narrative', Sparkles, language === 'zh' ? '叙事' : 'Narrative'],
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
