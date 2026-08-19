import React from 'react'
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  GitBranch,
  GripVertical,
  Library,
  MapPin,
  PenLine,
  Sparkles,
  UserRound
} from 'lucide-react'
import type { ReorderStorySiblingsRequest, StoryNodeRef, StoryStructureConfigV1 } from '@quillarium/core'
import type { DocEntry, LanguageName, ModuleName, TargetSelection } from '../../app/types.js'
import { t } from '../../app/i18n.js'
import { buildOutlineHierarchy, compareStoryEntries, normalizeStoryStructure } from '../../shared/outline.js'
import {
  documentTypeLabel,
  enumChoiceLabel,
  outlineLevelDisplayLabel
} from '../metadata/field-presentation.js'

export function StructureTree({
  docs,
  storyStructure: storyStructureInput,
  selectedTarget,
  onSelect,
  onReorder,
  language
}: {
  docs: DocEntry[]
  storyStructure?: Partial<StoryStructureConfigV1>
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onReorder?: (request: ReorderStorySiblingsRequest) => void | Promise<void>
  language: LanguageName
}) {
  const storyStructure = normalizeStoryStructure(storyStructureInput)
  const [dragged, setDragged] = React.useState<StoryNodeRef | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    node: StoryNodeRef
    placement: 'before' | 'after'
  } | null>(null)
  const { children } = buildOutlineHierarchy(docs, storyStructure)
  const scenes = storyStructure.scene_enabled
    ? docs.filter((item) => item.data.type === 'scene').sort(compareStoryEntries)
    : []
  const chapterProse = docs.filter((item) => item.data.type === 'chapter_prose')
  const reorder = (request: ReorderStorySiblingsRequest | null) => {
    if (!request || !onReorder) return
    void Promise.resolve(onReorder(request)).finally(() => {
      setDragged(null)
      setDropTarget(null)
    })
  }
  const renderStoryButton = (
    entry: DocEntry,
    options: {
      depth: number
      className: string
      active: boolean
      label: React.ReactNode
      onClick: () => void
    }
  ) => {
    const ref = storyNodeRef(entry)
    const currentDrop =
      ref && dropTarget && dropTarget.node.kind === ref.kind && dropTarget.node.id === ref.id
        ? dropTarget.placement
        : null
    return (
      <div
        key={`${entry.data.type}:${entry.data.id}`}
        className={`story-tree-row ${dragged && ref?.id === dragged.id && ref.kind === dragged.kind ? 'dragging' : ''} ${
          currentDrop ? `drop-${currentDrop}` : ''
        }`}
        onDragOver={(event) => {
          if (!dragged || !ref || !canReorderTogether(docs, dragged, ref)) return
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          setDropTarget({
            node: ref,
            placement: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
          })
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (!dragged || !ref || (dragged.kind === ref.kind && dragged.id === ref.id)) return
          reorder(buildStoryDropRequest(docs, dragged, ref, dropTarget?.placement ?? 'before'))
        }}
      >
        <button
          className={`tree-node ${options.className} ${options.active ? 'active' : ''}`}
          style={{ paddingLeft: `${10 + options.depth * 14}px` }}
          onClick={options.onClick}
        >
          {options.label}
        </button>
        {ref && onReorder && (
          <button
            type="button"
            className="story-drag-handle"
            draggable
            aria-label={
              language === 'zh'
                ? `拖动“${entry.data.title}”排序；按上下方向键移动`
                : `Reorder “${entry.data.title}”; use Up or Down arrow to move`
            }
            title={language === 'zh' ? '拖动排序；也可按上下方向键' : 'Drag to reorder; arrow keys also work'}
            onClick={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', `${ref.kind}:${ref.id}`)
              setDragged(ref)
            }}
            onDragEnd={() => {
              setDragged(null)
              setDropTarget(null)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              reorder(buildStoryDirectionRequest(docs, ref, event.key === 'ArrowUp' ? 'up' : 'down'))
            }}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }
  const renderOutline = (outline: DocEntry, depth: number): React.ReactNode => {
    const nestedOutlines = children.get(outline.data.id) ?? []
    const prose = chapterProse.find((item) => item.data.chapter_id === outline.data.id)
    const nestedScenes = scenes.filter(
      (scene) => (scene.data.chapter_id ?? scene.data.section) === outline.data.id
    )
    return (
      <React.Fragment key={outline.data.id}>
        {renderStoryButton(outline, {
          depth,
          className: `level-${String(outline.data.level ?? 'section')}`,
          active:
            selectedTarget?.type === 'outline' &&
            selectedTarget.id === outline.data.id &&
            !selectedTarget.view,
          label: (
            <>
              <FileText size={14} /> {outlineLevelDisplayLabel(String(outline.data.level), language)} ·{' '}
              {outline.data.title}
            </>
          ),
          onClick: () => onSelect({ type: 'outline', id: outline.data.id })
        })}
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
        {nestedScenes.map((scene) =>
          renderStoryButton(scene, {
            depth: depth + 1,
            className: 'scene',
            active: selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id,
            label: (
              <>
                <FileText size={14} /> {language === 'zh' ? '节' : 'Scene'} · {scene.data.title}
              </>
            ),
            onClick: () => onSelect({ type: 'scene', id: scene.data.id, view: 'ai' })
          })
        )}
        {storyStructure.scene_enabled && outline.data.level === 'chapter' && (
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
      {looseScenes.map((scene) =>
        renderStoryButton(scene, {
          depth: 0,
          className: 'scene',
          active: selectedTarget?.type === 'scene' && selectedTarget.id === scene.data.id,
          label: (
            <>
              <FileText size={14} /> {scene.data.title}
            </>
          ),
          onClick: () => onSelect({ type: 'scene', id: scene.data.id })
        })
      )}
    </div>
  )
}

const REORDERABLE_LEVELS = new Set(['volume', 'part', 'arc', 'act', 'chapter'])

export function storyNodeRef(entry: DocEntry): StoryNodeRef | null {
  if (entry.data.type === 'scene') return { kind: 'scene', id: entry.data.id }
  if (entry.data.type === 'outline' && REORDERABLE_LEVELS.has(String(entry.data.level))) {
    return { kind: 'outline', id: entry.data.id }
  }
  return null
}

export function buildStoryDirectionRequest(
  docs: DocEntry[],
  node: StoryNodeRef,
  direction: 'up' | 'down'
): ReorderStorySiblingsRequest | null {
  const siblings = storySiblings(docs, node)
  return siblings ? { node, direction, expected_siblings: siblingExpectations(siblings) } : null
}

export function buildStoryDropRequest(
  docs: DocEntry[],
  node: StoryNodeRef,
  target: StoryNodeRef,
  placement: 'before' | 'after'
): ReorderStorySiblingsRequest | null {
  if (!canReorderTogether(docs, node, target)) return null
  const siblings = storySiblings(docs, node)
  return siblings ? { node, target, placement, expected_siblings: siblingExpectations(siblings) } : null
}

function canReorderTogether(docs: DocEntry[], left: StoryNodeRef, right: StoryNodeRef): boolean {
  const leftEntry = findStoryEntry(docs, left)
  const rightEntry = findStoryEntry(docs, right)
  return Boolean(leftEntry && rightEntry && storyParent(leftEntry) === storyParent(rightEntry))
}

function storySiblings(docs: DocEntry[], node: StoryNodeRef): DocEntry[] | null {
  const entry = findStoryEntry(docs, node)
  if (!entry) return null
  const parent = storyParent(entry)
  return docs
    .filter((candidate) => storyNodeRef(candidate) && storyParent(candidate) === parent)
    .sort(compareStoryEntries)
}

function findStoryEntry(docs: DocEntry[], ref: StoryNodeRef): DocEntry | undefined {
  return docs.find(
    (entry) =>
      entry.data.id === ref.id &&
      ((ref.kind === 'scene' && entry.data.type === 'scene') ||
        (ref.kind === 'outline' && entry.data.type === 'outline'))
  )
}

function storyParent(entry: DocEntry): string | null {
  if (entry.data.type === 'scene') {
    return String(entry.data.chapter_id ?? entry.data.section ?? '') || null
  }
  return typeof entry.data.parent === 'string' && entry.data.parent ? entry.data.parent : null
}

function siblingExpectations(entries: DocEntry[]) {
  return entries.flatMap((entry) => {
    const ref = storyNodeRef(entry)
    if (!ref) return []
    const value = Number(entry.data.order)
    return [{ ...ref, order: Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0 }]
  })
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
    factions: docs.filter((doc) =>
      ['faction', 'faction_relation', 'faction_membership'].includes(doc.data.type)
    ).length,
    foreshadowing: docs.filter((doc) => doc.data.type === 'foreshadowing').length,
    issues: docs.filter((doc) => doc.data.type === 'issue').length,
    references: docs.filter((doc) => doc.data.type === 'reference').length,
    narrative: docs.filter((doc) => ['narrative', 'strategy', 'pattern'].includes(doc.data.type)).length
  }
  const items = [
    ['write', PenLine, t(language, 'writing')],
    ['assistants', Sparkles, t(language, 'creatorAssistants')],
    ['canon', Library, documentTypeLabel('canon', language)],
    ['world', BookOpen, t(language, 'worldBook')],
    ['characters', UserRound, t(language, 'characters')],
    ['factions', Flag, t(language, 'factions')],
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
