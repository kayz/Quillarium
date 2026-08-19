import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus2,
  CheckCircle2,
  GripVertical,
  History,
  Layers3,
  Link2,
  Map as MapIcon,
  Plus,
  Users
} from 'lucide-react'
import type { StoryTimeImportPlanV1, TimelineCatalogV1, TimelineDeterministicIssueV1 } from '@quillarium/core'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import { documentTypeLabel, enumChoiceLabel } from '../metadata/field-presentation.js'
import { TimelineRailBoard } from './TimelineRailBoard.js'
import { buildTimelineBoard, inferTimelineTracks } from './timeline-board-model.js'
import {
  buildCharacterRelationEgoGraph,
  layoutCharacterRelationEgoGraph,
  nextGraphPaneSize,
  personPointerAction,
  resolveEgoCharacterId
} from './character-relation-graph.js'
import { SETTING_IMAGE_TYPES, SettingThumbnail } from './SettingThumbnail.js'

export interface TimelineLane {
  node: DocEntry
  events: DocEntry[]
}

export interface CharacterRelationSnapshot {
  node: DocEntry | null
  characters: DocEntry[]
  relations: DocEntry[]
  outsideCharacters: Array<{ item: DocEntry; reason: CharacterOutsideReason }>
  outsideRelations: Array<{ item: DocEntry; reason: RelationOutsideReason }>
  hiddenCharacters: number
  hiddenRelations: number
}

export interface CharacterRelationCreateRequest {
  fromCharacterId?: string
  toCharacterId?: string
  relationType?: string
  startsAt?: string
}

export interface ActiveFactionMembership {
  membership: DocEntry
  faction: DocEntry
  untimed: boolean
}

export type CharacterOutsideReason =
  'no-timeline' | 'missing-introduction' | 'not-introduced' | 'not-born' | 'exited' | 'died'

export type RelationOutsideReason =
  'no-timeline' | 'missing-character' | 'missing-start' | 'not-started' | 'ended' | 'character-outside'

export type LocationOutsideReason = 'other-root' | 'broken-parent' | 'other-branch'
export type LayoutOutsideReason = 'missing-location' | 'other-location'

export interface LocationExplorerModel {
  current: DocEntry | null
  ancestors: DocEntry[]
  peers: DocEntry[]
  children: DocEntry[]
  layouts: DocEntry[]
  outsidePositions: Array<{ item: DocEntry; reason: LocationOutsideReason }>
  outsideLayouts: Array<{ item: DocEntry; reason: LayoutOutsideReason }>
}

const LOCATION_SCALE_ORDER = ['global', 'region', 'city', 'district', 'estate', 'interior'] as const

export function buildTimelineLanes(
  items: DocEntry[],
  trackId = 'main'
): {
  lanes: TimelineLane[]
  unattached: DocEntry[]
} {
  const nodes = items
    .filter((item) => item.data.type === 'timeline_node')
    .filter((item) => timelineNodeBelongsToTrack(item, trackId))
    .slice()
    .sort((left, right) => compareTimelineEntriesForTrack(left, right, trackId))
  const events = items.filter((item) => item.data.type === 'timeline_event')
  const nodeIds = new Set(nodes.map((node) => node.data.id))
  return {
    lanes: nodes.map((node) => ({
      node,
      events: events
        .filter((event) => timelineEventStartNode(event, trackId) === node.data.id)
        .sort((left, right) => compareTimelineEventsForTrack(left, right, trackId))
    })),
    unattached: events.filter((event) => {
      const start = timelineEventStartNode(event, trackId)
      return !start || !nodeIds.has(start)
    })
  }
}

function timelineNodeBelongsToTrack(node: DocEntry, trackId: string): boolean {
  const placements = Array.isArray(node.data.timeline_tracks) ? node.data.timeline_tracks : []
  if (!placements.length) return trackId === 'main'
  return placements.some(
    (placement) => isRecordValue(placement) && String(placement.timeline_id ?? '') === trackId
  )
}

function timelineNodePlacement(node: DocEntry, trackId: string): Record<string, unknown> | undefined {
  return (Array.isArray(node.data.timeline_tracks) ? node.data.timeline_tracks : []).find(
    (placement) => isRecordValue(placement) && String(placement.timeline_id ?? '') === trackId
  ) as Record<string, unknown> | undefined
}

function timelineEventPlacement(event: DocEntry, trackId: string): Record<string, unknown> | undefined {
  return (Array.isArray(event.data.placements) ? event.data.placements : []).find(
    (placement) => isRecordValue(placement) && String(placement.timeline_id ?? '') === trackId
  ) as Record<string, unknown> | undefined
}

function timelineEventStartNode(event: DocEntry, trackId: string): string | null {
  const placement = timelineEventPlacement(event, trackId)
  if (placement) return String(placement.start_node_id ?? '') || null
  if (trackId === 'main' && !(Array.isArray(event.data.placements) && event.data.placements.length)) {
    return typeof event.data.timeline_node === 'string' ? event.data.timeline_node : null
  }
  return null
}

function compareTimelineEntriesForTrack(left: DocEntry, right: DocEntry, trackId: string): number {
  const leftPlacement = timelineNodePlacement(left, trackId)
  const rightPlacement = timelineNodePlacement(right, trackId)
  if (leftPlacement || rightPlacement) {
    return (
      Number(leftPlacement?.order ?? Number.MAX_SAFE_INTEGER) -
        Number(rightPlacement?.order ?? Number.MAX_SAFE_INTEGER) ||
      Number(leftPlacement?.narrative_order ?? Number.MAX_SAFE_INTEGER) -
        Number(rightPlacement?.narrative_order ?? Number.MAX_SAFE_INTEGER) ||
      left.data.id.localeCompare(right.data.id, 'en')
    )
  }
  return compareTimelineEntries(left, right)
}

function compareTimelineEventsForTrack(left: DocEntry, right: DocEntry, trackId: string): number {
  const leftPlacement = timelineEventPlacement(left, trackId)
  const rightPlacement = timelineEventPlacement(right, trackId)
  return (
    Number(leftPlacement?.order ?? 0) - Number(rightPlacement?.order ?? 0) ||
    Number(leftPlacement?.narrative_order ?? 0) - Number(rightPlacement?.narrative_order ?? 0) ||
    left.data.id.localeCompare(right.data.id, 'en')
  )
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function characterRelationSnapshot(
  items: DocEntry[],
  timelineNodes: DocEntry[],
  selectedNodeId: string | null
): CharacterRelationSnapshot {
  const nodes = timelineNodes
    .filter((item) => item.data.type === 'timeline_node')
    .slice()
    .sort(compareTimelineEntries)
  const node = nodes.find((item) => item.data.id === selectedNodeId) ?? nodes.at(-1) ?? null
  const index = new Map(nodes.map((item, position) => [item.data.id, position] as const))
  const current = node ? (index.get(node.data.id) ?? -1) : -1
  const characters = items.filter((item) => item.data.type === 'character')
  const outsideCharacters: CharacterRelationSnapshot['outsideCharacters'] = []
  const visibleCharacters = characters.filter((character) => {
    const introduced = timelinePosition(index, character.data.introduced_at)
    const exited = timelinePosition(index, character.data.exited_at)
    const born = timelinePosition(index, character.data.born_at)
    const died = timelinePosition(index, character.data.died_at)
    let reason: CharacterOutsideReason | null = null
    if (current < 0) reason = 'no-timeline'
    else if (introduced === null) reason = 'missing-introduction'
    else if (introduced > current) reason = 'not-introduced'
    else if (born !== null && born > current) reason = 'not-born'
    else if (died !== null && died < current) reason = 'died'
    else if (exited !== null && exited < current) reason = 'exited'
    if (reason) outsideCharacters.push({ item: character, reason })
    return reason === null
  })
  const visibleIds = new Set(visibleCharacters.map((character) => character.data.id))
  const characterIds = new Set(characters.map((character) => character.data.id))
  const relations = items.filter((item) => item.data.type === 'character_relation')
  const outsideRelations: CharacterRelationSnapshot['outsideRelations'] = []
  const visibleRelations = relations.filter((relation) => {
    const starts = timelinePosition(index, relation.data.starts_at)
    const ends = timelinePosition(index, relation.data.ends_at)
    const from = String(relation.data.from_character)
    const to = String(relation.data.to_character)
    let reason: RelationOutsideReason | null = null
    if (!characterIds.has(from) || !characterIds.has(to)) reason = 'missing-character'
    else if (current < 0) reason = 'no-timeline'
    else if (starts === null) reason = 'missing-start'
    else if (starts > current) reason = 'not-started'
    else if (ends !== null && ends <= current) reason = 'ended'
    else if (!visibleIds.has(from) || !visibleIds.has(to)) reason = 'character-outside'
    if (reason) outsideRelations.push({ item: relation, reason })
    return reason === null
  })
  return {
    node,
    characters: visibleCharacters,
    relations: visibleRelations,
    outsideCharacters,
    outsideRelations,
    hiddenCharacters: outsideCharacters.length,
    hiddenRelations: outsideRelations.length
  }
}

export function activeFactionMembershipsAtNode(
  docs: DocEntry[],
  timelineNodes: DocEntry[],
  selectedNodeId: string | null
): Map<string, ActiveFactionMembership[]> {
  const nodes = timelineNodes
    .filter((item) => item.data.type === 'timeline_node')
    .slice()
    .sort(compareTimelineEntries)
  const node = nodes.find((item) => item.data.id === selectedNodeId) ?? nodes.at(-1) ?? null
  const index = new Map(nodes.map((item, position) => [item.data.id, position] as const))
  const current = node ? (index.get(node.data.id) ?? -1) : -1
  const factions = new Map(
    docs.filter((item) => item.data.type === 'faction').map((item) => [item.data.id, item] as const)
  )
  const result = new Map<string, ActiveFactionMembership[]>()
  for (const membership of docs.filter((item) => item.data.type === 'faction_membership')) {
    const faction = factions.get(String(membership.data.faction_id))
    const characterId = String(membership.data.character_id ?? '')
    if (!faction || !characterId) continue
    const starts = timelinePosition(index, membership.data.starts_at)
    const ends = timelinePosition(index, membership.data.ends_at)
    const untimed = starts === null && ends === null
    if (
      !untimed &&
      (current < 0 || (starts !== null && starts > current) || (ends !== null && ends <= current))
    ) {
      continue
    }
    result.set(characterId, [...(result.get(characterId) ?? []), { membership, faction, untimed }])
  }
  for (const memberships of result.values()) {
    memberships.sort(
      (left, right) =>
        Number(Boolean(right.membership.data.primary)) - Number(Boolean(left.membership.data.primary)) ||
        left.faction.data.title.localeCompare(right.faction.data.title)
    )
  }
  return result
}

export function locationExplorerModel(items: DocEntry[], selectedId: string | null): LocationExplorerModel {
  const locations = items.filter((item) => item.data.type === 'location')
  const positions = locations.filter((item) => item.data.kind !== 'layout')
  const allLayouts = locations.filter((item) => item.data.kind === 'layout')
  const selected = locations.find((item) => item.data.id === selectedId) ?? null
  const selectedPosition =
    selected?.data.kind === 'layout'
      ? positions.find((item) => item.data.id === selected.data.layout_of)
      : selected
  const current =
    selectedPosition ??
    positions
      .slice()
      .sort(
        (left, right) =>
          locationScaleIndex(String(left.data.scale)) - locationScaleIndex(String(right.data.scale)) ||
          left.data.title.localeCompare(right.data.title)
      )[0] ??
    null
  if (!current) {
    return {
      current: null,
      ancestors: [],
      peers: [],
      children: [],
      layouts: [],
      outsidePositions: [],
      outsideLayouts: allLayouts.map((item) => ({ item, reason: 'missing-location' }))
    }
  }

  const byId = new Map(positions.map((item) => [item.data.id, item]))
  const ancestors: DocEntry[] = []
  const seen = new Set<string>([current.data.id])
  let parent = typeof current.data.parent_location === 'string' ? current.data.parent_location : null
  while (parent && byId.has(parent) && !seen.has(parent)) {
    const item = byId.get(parent)!
    ancestors.unshift(item)
    seen.add(parent)
    parent = typeof item.data.parent_location === 'string' ? item.data.parent_location : null
  }
  const peers = positions
    .filter(
      (item) =>
        item.data.id !== current.data.id &&
        (item.data.parent_location ?? null) === (current.data.parent_location ?? null)
    )
    .sort((left, right) => left.data.title.localeCompare(right.data.title))
  const children = positions
    .filter((item) => item.data.parent_location === current.data.id)
    .sort((left, right) => left.data.title.localeCompare(right.data.title))
  const layouts = allLayouts
    .filter((item) => item.data.layout_of === current.data.id)
    .sort((left, right) => left.data.title.localeCompare(right.data.title))
  const visibleIds = new Set([
    current.data.id,
    ...ancestors.map((item) => item.data.id),
    ...peers.map((item) => item.data.id),
    ...children.map((item) => item.data.id),
    ...layouts.map((item) => item.data.id)
  ])
  const outsidePositions = positions
    .filter((item) => !visibleIds.has(item.data.id))
    .map((item) => {
      const parentId = typeof item.data.parent_location === 'string' ? item.data.parent_location : null
      const reason: LocationOutsideReason = !parentId
        ? 'other-root'
        : byId.has(parentId)
          ? 'other-branch'
          : 'broken-parent'
      return { item, reason }
    })
    .sort(
      (left, right) =>
        locationScaleIndex(String(left.item.data.scale)) -
          locationScaleIndex(String(right.item.data.scale)) ||
        left.item.data.title.localeCompare(right.item.data.title)
    )
  const outsideLayouts = allLayouts
    .filter((item) => !visibleIds.has(item.data.id))
    .map((item) => ({
      item,
      reason: byId.has(String(item.data.layout_of))
        ? ('other-location' as const)
        : ('missing-location' as const)
    }))
    .sort((left, right) => left.item.data.title.localeCompare(right.item.data.title))
  return {
    current,
    ancestors,
    peers,
    children,
    layouts,
    outsidePositions,
    outsideLayouts
  }
}

export function TimelineChainView({
  items,
  selectedTarget,
  onSelect,
  onCreateCoordinate,
  onCreateCoordinateFromEvent,
  projectRoot,
  onReloadProject,
  onPlanningCheck,
  language
}: {
  items: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onCreateCoordinate?: () => void
  onCreateCoordinateFromEvent?: (event: DocEntry) => void
  projectRoot?: string
  onReloadProject?: () => Promise<void>
  onPlanningCheck?: () => Promise<void>
  language: LanguageName
}) {
  const zh = language === 'zh'
  const [catalog, setCatalog] = useState<TimelineCatalogV1>()
  const [selectedTrackId, setSelectedTrackId] = useState('main')
  const [dragged, setDragged] = useState<{ kind: 'track'; id: string } | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storyPlan, setStoryPlan] = useState<StoryTimeImportPlanV1>()
  const [approvedStorySuggestions, setApprovedStorySuggestions] = useState<Set<string>>(new Set())
  const [ambiguityAnswers, setAmbiguityAnswers] = useState<Record<string, string>>({})
  const [checkIssues, setCheckIssues] = useState<TimelineDeterministicIssueV1[]>()
  const tracks = catalog?.tracks ?? []
  const selectedTrack = tracks.find((track) => track.value.id === selectedTrackId) ?? tracks[0]
  const effectiveTrackId = selectedTrack?.value.id ?? selectedTrackId
  const boardTracks = useMemo(() => {
    const catalogTracks = (catalog?.tracks ?? []).map((track) => ({
      id: track.value.id,
      title: track.value.title
    }))
    if (catalogTracks.length) return catalogTracks
    const inferred = inferTimelineTracks(items)
    if (inferred.length) return inferred
    return [{ id: 'main', title: zh ? '主时间线' : 'Main timeline' }]
  }, [catalog, items, zh])
  const board = useMemo(() => buildTimelineBoard(items, boardTracks), [boardTracks, items])
  const unattached = useMemo(() => {
    const attachedIds = new Set<string>()
    for (const station of board.stations) {
      for (const event of station.pointEvents) attachedIds.add(event.eventId)
    }
    for (const overlay of board.overlays) attachedIds.add(overlay.eventId)
    return items.filter((item) => item.data.type === 'timeline_event' && !attachedIds.has(item.data.id))
  }, [board, items])

  useEffect(() => {
    let active = true
    if (!projectRoot) return () => undefined
    void window.quillarium
      .loadTimelineCatalog(projectRoot)
      .then((loaded) => {
        if (!active) return
        setCatalog(loaded)
        if (!loaded.tracks.some((track) => track.value.id === selectedTrackId)) {
          setSelectedTrackId(loaded.tracks[0]?.value.id ?? 'main')
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      active = false
    }
  }, [projectRoot, items.length])

  const afterMutation = async () => {
    if (!projectRoot) return
    await onReloadProject?.()
    setCatalog(await window.quillarium.loadTimelineCatalog(projectRoot))
  }

  const runMutation = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await afterMutation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
      setDragged(undefined)
    }
  }

  return (
    <section className="timeline-chain-workbench">
      <header className="planning-view-intro">
        <Layers3 size={18} />
        <div>
          <strong>{zh ? '时间体系与叙事轨道' : 'Time systems and narrative tracks'}</strong>
          <small>
            {zh
              ? '画板同时显示各条轨道。点选站点或事件卡片即可编辑；尚未挂到节点上的事件列在下方。'
              : 'The board shows every track at once. Select a station or event card to edit. Unattached events stay in the list below.'}
          </small>
        </div>
        <div className="timeline-toolbar">
          {projectRoot && (
            <button
              type="button"
              onClick={() => {
                setBusy(true)
                setError('')
                void window.quillarium
                  .checkTimelineDeterministically(projectRoot)
                  .then(setCheckIssues)
                  .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
                  .finally(() => setBusy(false))
              }}
            >
              <CheckCircle2 size={14} /> {zh ? '规则检查' : 'Rule check'}
            </button>
          )}
          {onPlanningCheck && (
            <button type="button" onClick={() => void onPlanningCheck()}>
              {zh ? 'AI 语义检查' : 'AI semantic check'}
            </button>
          )}
        </div>
      </header>

      {!!tracks.length && (
        <div
          className="timeline-track-tabs"
          role="tablist"
          aria-label={zh ? '时间线轨道' : 'Timeline tracks'}
        >
          {tracks.map((track, index) => (
            <div
              key={track.value.id}
              className={`timeline-track-tab ${effectiveTrackId === track.value.id ? 'active' : ''}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!projectRoot || !dragged || dragged.id === track.value.id) return
                const persistedTracks = tracks.filter((item) => !item.virtual)
                if (persistedTracks.length !== tracks.length) {
                  setError(
                    zh
                      ? '请先完成旧时间线迁移，再调整轨道顺序。'
                      : 'Migrate the legacy timeline before reordering tracks.'
                  )
                  return
                }
                const ordered = moveIdentifier(
                  tracks.map((item) => item.value.id),
                  dragged.id,
                  track.value.id
                )
                void runMutation(() =>
                  window.quillarium.reorderTimelineTracks(
                    projectRoot,
                    ordered,
                    Object.fromEntries(tracks.map((item) => [item.value.id, item.source_sha256]))
                  )
                )
              }}
            >
              <button
                type="button"
                draggable={!track.virtual}
                className="timeline-drag-handle"
                aria-label={zh ? `拖动轨道 ${track.value.title}` : `Drag track ${track.value.title}`}
                onDragStart={() => setDragged({ kind: 'track', id: track.value.id })}
                onKeyDown={(event) => {
                  if (!projectRoot || track.virtual || !['ArrowUp', 'ArrowDown'].includes(event.key)) return
                  event.preventDefault()
                  const target = tracks[index + (event.key === 'ArrowUp' ? -1 : 1)]
                  if (!target || target.virtual) return
                  const ordered = moveIdentifier(
                    tracks.map((item) => item.value.id),
                    track.value.id,
                    target.value.id
                  )
                  void runMutation(() =>
                    window.quillarium.reorderTimelineTracks(
                      projectRoot,
                      ordered,
                      Object.fromEntries(tracks.map((item) => [item.value.id, item.source_sha256]))
                    )
                  )
                }}
              >
                <GripVertical size={14} />
              </button>
              <button type="button" role="tab" onClick={() => setSelectedTrackId(track.value.id)}>
                <strong>{track.value.title}</strong>
                <small>{track.value.purpose}</small>
              </button>
            </div>
          ))}
        </div>
      )}

      {projectRoot && catalog && (
        <TimelineConfigurationPanel
          projectRoot={projectRoot}
          catalog={catalog}
          language={language}
          busy={busy}
          runMutation={runMutation}
        />
      )}

      <TimelineRailBoard
        model={board}
        selectedTarget={selectedTarget}
        onSelect={onSelect}
        language={language}
      />

      {!board.stations.length && onCreateCoordinate && (
        <button className="timeline-empty-callout" type="button" onClick={onCreateCoordinate}>
          <CalendarClock size={21} />
          <div>
            <strong>{zh ? '建立第一个时间节点' : 'Create the first timeline node'}</strong>
            <small>
              {zh
                ? '点击建立坐标；也可以直接使用下方事件已有的“故事时间”。'
                : 'Create a coordinate, or reuse Story time from an existing event below.'}
            </small>
          </div>
          <CalendarPlus2 size={17} />
        </button>
      )}
      {!!unattached.length && (
        <section className="timeline-unattached">
          <strong>{zh ? '待挂载事件' : 'Unattached events'}</strong>
          <small>
            {zh
              ? '这些事件尚未挂到时间节点上，不会出现在画板里。'
              : 'These events are not placed on a timeline node yet, so they stay off the board.'}
          </small>
          <div className="timeline-unattached-list">
            {unattached.map((event) => (
              <div className="timeline-unattached-item" key={event.data.id}>
                <button
                  className={`timeline-unattached-event ${selectedTarget?.id === event.data.id ? 'active' : ''}`}
                  onClick={() => onSelect({ type: 'timeline_event', id: event.data.id })}
                >
                  <strong>{event.data.title}</strong>
                  <small>
                    {event.data.date
                      ? `${zh ? '故事时间' : 'Story time'} · ${String(event.data.date)}`
                      : zh
                        ? '尚未填写故事时间'
                        : 'Story time not set'}
                  </small>
                </button>
                {Boolean(event.data.date) && onCreateCoordinateFromEvent && (
                  <button
                    className="timeline-coordinate-from-event"
                    type="button"
                    onClick={() => onCreateCoordinateFromEvent(event)}
                  >
                    <CalendarPlus2 size={14} /> {zh ? '使用此时间建立坐标' : 'Create from this time'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {projectRoot && (
        <StoryTimeImportPreview
          projectRoot={projectRoot}
          language={language}
          plan={storyPlan}
          setPlan={(plan) => {
            setStoryPlan(plan)
            setApprovedStorySuggestions(new Set(plan?.suggestions.map((item) => item.suggestion_id) ?? []))
            setAmbiguityAnswers({})
          }}
          approved={approvedStorySuggestions}
          setApproved={setApprovedStorySuggestions}
          ambiguityAnswers={ambiguityAnswers}
          setAmbiguityAnswers={setAmbiguityAnswers}
          busy={busy}
          runMutation={runMutation}
        />
      )}
      {checkIssues && (
        <section className="timeline-check-results" aria-live="polite">
          <strong>
            {zh
              ? `确定性时间轴检查：${checkIssues.length} 项`
              : `Deterministic timeline check: ${checkIssues.length}`}
          </strong>
          {checkIssues.length ? (
            <ul>
              {checkIssues.map((issue, index) => (
                <li key={`${issue.code}:${index}`} className={issue.severity}>
                  <b>{issue.code}</b> · {issue.summary}
                  <small>{issue.evidence.join('；')}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{zh ? '没有发现确定性时间轴问题。' : 'No deterministic timeline issues found.'}</p>
          )}
        </section>
      )}
      {error && (
        <p className="timeline-local-error" role="alert">
          {error}
        </p>
      )}
      {busy && <p className="timeline-busy">{zh ? '正在处理并验证…' : 'Working and verifying…'}</p>}
    </section>
  )
}

function TimelineConfigurationPanel({
  projectRoot,
  catalog,
  language,
  busy,
  runMutation
}: {
  projectRoot: string
  catalog: TimelineCatalogV1
  language: LanguageName
  busy: boolean
  runMutation: (action: () => Promise<unknown>) => Promise<void>
}) {
  const zh = language === 'zh'
  const [systemTitle, setSystemTitle] = useState('')
  const [systemKind, setSystemKind] = useState<'gregorian' | 'fictional' | 'relative' | 'cyclic'>('fictional')
  const [unitText, setUnitText] = useState('年,月,日,时辰,分钟')
  const [trackTitle, setTrackTitle] = useState('')
  const [trackSystemId, setTrackSystemId] = useState(catalog.time_systems[0]?.value.id ?? 'legacy-story')
  const [trackPurpose, setTrackPurpose] = useState('')
  useEffect(() => {
    if (!catalog.time_systems.some((item) => item.value.id === trackSystemId)) {
      setTrackSystemId(catalog.time_systems[0]?.value.id ?? 'legacy-story')
    }
  }, [catalog.time_systems, trackSystemId])
  return (
    <details className="timeline-configuration-panel">
      <summary>{zh ? '管理时间体系与轨道' : 'Manage time systems and tracks'}</summary>
      <div className="timeline-system-list">
        {catalog.time_systems.map((system) => (
          <span key={system.value.id}>
            <b>{system.value.title}</b>
            <small>
              {system.value.kind} · {system.value.units.map((unit) => unit.label).join(' / ')}
              {system.virtual ? (zh ? ' · 兼容虚拟项' : ' · virtual fallback') : ''}
            </small>
          </span>
        ))}
      </div>
      <div className="timeline-config-grid">
        <section>
          <strong>{zh ? '新增版本化时间体系' : 'New versioned time system'}</strong>
          <label>
            <span>{zh ? '名称' : 'Title'}</span>
            <input value={systemTitle} onChange={(event) => setSystemTitle(event.target.value)} />
          </label>
          <label>
            <span>{zh ? '类型' : 'Kind'}</span>
            <select
              value={systemKind}
              onChange={(event) =>
                setSystemKind(event.target.value as 'gregorian' | 'fictional' | 'relative' | 'cyclic')
              }
            >
              <option value="gregorian">{zh ? '公历' : 'Gregorian'}</option>
              <option value="fictional">{zh ? '架空历法' : 'Fictional'}</option>
              <option value="relative">{zh ? '相对时间' : 'Relative'}</option>
              <option value="cyclic">{zh ? '循环时间' : 'Cyclic'}</option>
            </select>
          </label>
          <label>
            <span>{zh ? '时间单位（逗号分隔）' : 'Units (comma-separated)'}</span>
            <input value={unitText} onChange={(event) => setUnitText(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || !systemTitle.trim() || !parseUnitLabels(unitText).length}
            onClick={() => {
              const id = uniqueTimelineConfigId(
                systemTitle,
                new Set(catalog.time_systems.map((item) => item.value.id))
              )
              const labels = parseUnitLabels(unitText)
              void runMutation(async () => {
                await window.quillarium.createTimeSystem(projectRoot, {
                  schema_version: 1,
                  id,
                  version: 1,
                  title: systemTitle.trim(),
                  kind: systemKind,
                  units: labels.map((label, order) => ({
                    id: uniqueUnitId(label, order),
                    label,
                    order,
                    radix: null,
                    aliases: []
                  })),
                  conversion: null
                })
                setSystemTitle('')
              })
            }}
          >
            <Plus size={14} /> {zh ? '建立时间体系' : 'Create time system'}
          </button>
        </section>
        <section>
          <strong>{zh ? '新增叙事轨道' : 'New narrative track'}</strong>
          <label>
            <span>{zh ? '名称' : 'Title'}</span>
            <input value={trackTitle} onChange={(event) => setTrackTitle(event.target.value)} />
          </label>
          <label>
            <span>{zh ? '时间体系' : 'Time system'}</span>
            <select value={trackSystemId} onChange={(event) => setTrackSystemId(event.target.value)}>
              {catalog.time_systems.map((system) => (
                <option key={system.value.id} value={system.value.id}>
                  {system.value.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{zh ? '用途' : 'Purpose'}</span>
            <input value={trackPurpose} onChange={(event) => setTrackPurpose(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={busy || !trackTitle.trim() || !trackSystemId}
            onClick={() => {
              const id = uniqueTimelineConfigId(
                trackTitle,
                new Set(catalog.tracks.map((item) => item.value.id))
              )
              void runMutation(async () => {
                await window.quillarium.createTimelineTrack(projectRoot, {
                  schema_version: 1,
                  id,
                  version: 1,
                  title: trackTitle.trim(),
                  time_system_id: trackSystemId,
                  display_order: catalog.tracks.filter((item) => !item.virtual).length,
                  purpose: trackPurpose.trim()
                })
                setTrackTitle('')
                setTrackPurpose('')
              })
            }}
          >
            <Plus size={14} /> {zh ? '建立轨道' : 'Create track'}
          </button>
        </section>
      </div>
      <p>
        {zh
          ? '未配置换算关系时，系统只使用作者明确的顺序值，不会猜测不同历法之间的先后。'
          : 'Without conversion rules, only explicit author order is used; cross-calendar order is never guessed.'}
      </p>
    </details>
  )
}

function parseUnitLabels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，]/u)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ]
}

function uniqueTimelineConfigId(title: string, existing: Set<string>): string {
  const base =
    title
      .normalize('NFKD')
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || `timeline-${Date.now().toString(36)}`
  let id = base.slice(0, 72)
  let suffix = 2
  while (existing.has(id)) id = `${base.slice(0, 66)}-${suffix++}`
  return id
}

function uniqueUnitId(label: string, order: number): string {
  const normalized = label
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  return normalized || `unit-${order + 1}`
}

function StoryTimeImportPreview({
  projectRoot,
  language,
  plan,
  setPlan,
  approved,
  setApproved,
  ambiguityAnswers,
  setAmbiguityAnswers,
  busy,
  runMutation
}: {
  projectRoot: string
  language: LanguageName
  plan: StoryTimeImportPlanV1 | undefined
  setPlan: (plan: StoryTimeImportPlanV1 | undefined) => void
  approved: Set<string>
  setApproved: (value: Set<string>) => void
  ambiguityAnswers: Record<string, string>
  setAmbiguityAnswers: (value: Record<string, string>) => void
  busy: boolean
  runMutation: (action: () => Promise<unknown>) => Promise<void>
}) {
  const zh = language === 'zh'
  return (
    <details className="story-time-import-panel">
      <summary>{zh ? '从现有“故事时间”建立时间轴' : 'Build timeline from Story time'}</summary>
      {!plan ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void window.quillarium.planStoryTimeTimelineImport(projectRoot).then(setPlan)}
        >
          {zh ? '扫描并预览' : 'Scan and preview'}
        </button>
      ) : (
        <div className="story-time-import-preview">
          <p>
            {zh
              ? `${plan.suggestions.length} 组可解析建议，${plan.ambiguities.length} 个待确认项，${plan.skipped_event_ids.length} 个已挂载事件跳过。`
              : `${plan.suggestions.length} parsed groups, ${plan.ambiguities.length} ambiguities, ${plan.skipped_event_ids.length} already placed events skipped.`}
          </p>
          {plan.suggestions.map((suggestion) => (
            <label key={suggestion.suggestion_id}>
              <input
                type="checkbox"
                checked={approved.has(suggestion.suggestion_id)}
                onChange={(event) => {
                  const next = new Set(approved)
                  if (event.target.checked) next.add(suggestion.suggestion_id)
                  else next.delete(suggestion.suggestion_id)
                  setApproved(next)
                }}
              />
              <span>
                {suggestion.raw_story_time} · {suggestion.event_ids.length} {zh ? '个事件' : 'events'}
              </span>
            </label>
          ))}
          {plan.ambiguities.map((ambiguity) => (
            <label key={ambiguity.event_id}>
              <span>
                {ambiguity.event_title} · {ambiguity.reason}
              </span>
              <input
                value={ambiguityAnswers[ambiguity.event_id] ?? ''}
                placeholder={
                  zh
                    ? '留空则暂不处理，或填写可解析的故事时间'
                    : 'Leave blank, or enter a parseable Story time'
                }
                onChange={(event) =>
                  setAmbiguityAnswers({ ...ambiguityAnswers, [ambiguity.event_id]: event.target.value })
                }
              />
            </label>
          ))}
          <div>
            <button type="button" onClick={() => setPlan(undefined)} disabled={busy}>
              {zh ? '关闭预览' : 'Close preview'}
            </button>
            <button
              type="button"
              disabled={busy || (approved.size === 0 && !Object.values(ambiguityAnswers).some(Boolean))}
              onClick={() =>
                void runMutation(async () => {
                  await window.quillarium.applyStoryTimeTimelineImport(projectRoot, plan, {
                    approved_suggestion_ids: [...approved],
                    ambiguity_resolutions: Object.entries(ambiguityAnswers)
                      .filter(([, value]) => value.trim())
                      .map(([event_id, story_time]) => ({ event_id, story_time: story_time.trim() }))
                  })
                  setPlan(undefined)
                })
              }
            >
              {zh ? '确认并原子写入' : 'Confirm and apply atomically'}
            </button>
          </div>
        </div>
      )}
    </details>
  )
}

function moveIdentifier(ids: string[], sourceId: string, targetId: string): string[] {
  const sourceIndex = ids.indexOf(sourceId)
  const targetIndex = ids.indexOf(targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return ids
  const next = [...ids]
  const [source] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, source)
  return next
}

export function CharacterRelationView({
  items,
  allDocs = items,
  projectRoot,
  timelineNodes,
  selectedTarget,
  onSelect,
  onCreateRelation,
  onCreateTimelineNode,
  language
}: {
  items: DocEntry[]
  allDocs?: DocEntry[]
  projectRoot?: string
  timelineNodes: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onCreateRelation?: (initial: CharacterRelationCreateRequest) => void
  onCreateTimelineNode?: () => void
  language: LanguageName
}) {
  const zh = language === 'zh'
  const nodes = useMemo(
    () =>
      timelineNodes
        .filter((item) => item.data.type === 'timeline_node')
        .slice()
        .sort(compareTimelineEntries),
    [timelineNodes]
  )
  const [nodeId, setNodeId] = useState<string | null>(nodes.at(-1)?.data.id ?? null)
  const [egoId, setEgoId] = useState<string | null>(() =>
    resolveEgoCharacterId(
      selectedTarget,
      null,
      characterRelationSnapshot(items, nodes, nodes.at(-1)?.data.id ?? null),
      items
    )
  )
  const [size, setSize] = useState({ width: 640, height: 400 })
  const [settingImages, setSettingImages] = useState<
    Awaited<ReturnType<Window['quillarium']['getSettingImageBatch']>>
  >({})
  const paneRef = useRef<HTMLDivElement>(null)
  const pendingPersonClick = useRef<{ id: string; at: number } | null>(null)
  const lastPersonId = useRef<string | null>(null)
  useEffect(() => {
    if (!nodeId || !nodes.some((node) => node.data.id === nodeId)) setNodeId(nodes.at(-1)?.data.id ?? null)
  }, [nodeId, nodes])
  useEffect(() => {
    const stillThere = Boolean(
      egoId && items.some((item) => item.data.type === 'character' && item.data.id === egoId)
    )
    if (stillThere) return
    setEgoId(resolveEgoCharacterId(null, egoId, characterRelationSnapshot(items, nodes, nodeId), items))
  }, [egoId, items, nodeId, nodes])
  useEffect(() => {
    const pane = paneRef.current
    if (!pane || typeof ResizeObserver === 'undefined') return
    const apply = (width: number, height: number) => {
      setSize((current) => nextGraphPaneSize(current, { width, height }) ?? current)
    }
    apply(pane.clientWidth, pane.clientHeight)
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) apply(box.width, box.height)
    })
    observer.observe(pane)
    return () => observer.disconnect()
  }, [nodes.length])
  const selectedIndex = Math.max(
    0,
    nodes.findIndex((node) => node.data.id === nodeId)
  )
  const snapshot = useMemo(() => characterRelationSnapshot(items, nodes, nodeId), [items, nodeId, nodes])
  const factionMemberships = useMemo(
    () => activeFactionMembershipsAtNode(allDocs, nodes, nodeId),
    [allDocs, nodeId, nodes]
  )
  const timeIndex = useMemo(
    () => new Map(nodes.map((node, index) => [node.data.id, index] as const)),
    [nodes]
  )
  const graph = useMemo(
    () =>
      buildCharacterRelationEgoGraph({
        snapshot,
        items,
        egoId,
        timeIndex
      }),
    [snapshot, items, egoId, timeIndex]
  )
  const layout = useMemo(
    () => layoutCharacterRelationEgoGraph(graph, size.width, size.height),
    [graph, size.height, size.width]
  )
  const characterById = useMemo(
    () =>
      new Map(
        items
          .filter((item) => item.data.type === 'character')
          .map((character) => [character.data.id, character] as const)
      ),
    [items]
  )
  const settingImageKey = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items.filter((candidate) => SETTING_IMAGE_TYPES.has(candidate.data.type))) {
      ids.add(item.data.id)
    }
    for (const memberships of factionMemberships.values()) {
      for (const membership of memberships) ids.add(membership.faction.data.id)
    }
    return [...ids].sort().join('\n')
  }, [factionMemberships, items])
  useEffect(() => {
    let active = true
    if (!projectRoot || !settingImageKey) {
      setSettingImages({})
      return () => {
        active = false
      }
    }
    void window.quillarium
      .getSettingImageBatch(projectRoot, settingImageKey.split('\n'))
      .then((result) => {
        if (active) setSettingImages(result)
      })
      .catch(() => {
        if (active) setSettingImages({})
      })
    return () => {
      active = false
    }
  }, [projectRoot, settingImageKey])
  const selectCharacter = (id: string) => onSelect({ type: 'character', id })
  const recenter = (id: string) => {
    setEgoId(id)
    selectCharacter(id)
  }
  const handlePersonActivate = (id: string) => {
    lastPersonId.current = id
    const result = personPointerAction(pendingPersonClick.current, id, Date.now())
    pendingPersonClick.current = result.next
    if (result.kind === 'recenter') recenter(id)
    else selectCharacter(id)
    paneRef.current?.focus()
  }

  return (
    <section className="character-relation-workbench">
      <header className="planning-view-intro">
        <Users size={18} />
        <div>
          <strong>{zh ? '时态人物关系' : 'Time-aware character relationships'}</strong>
          <small>
            {zh
              ? '以当前人物为中心画两圈关系，时间轴只改变这一帧里谁还在、哪条关系还有效。'
              : 'Two rings around the current person. The time slider only changes who and which ties are in this frame.'}
          </small>
        </div>
        {onCreateRelation && (
          <button
            className="relationship-create-button"
            type="button"
            onClick={() => onCreateRelation({ startsAt: nodeId ?? undefined })}
          >
            <Plus size={15} /> {zh ? '新增关系' : 'New relationship'}
          </button>
        )}
      </header>
      {nodes.length ? (
        <>
          <div className="relationship-time-control">
            <input
              type="range"
              min={0}
              max={Math.max(0, nodes.length - 1)}
              step={1}
              value={selectedIndex}
              aria-label={zh ? '关系图时间点' : 'Relationship graph time point'}
              onChange={(event) => setNodeId(nodes[Number(event.target.value)]?.data.id ?? null)}
            />
            <strong>
              {snapshot.node ? timelineEntryLabel(snapshot.node) : zh ? '未选择' : 'Not selected'}
            </strong>
            <span>
              {zh
                ? `当前图外 ${snapshot.hiddenCharacters} 个人物 · ${snapshot.hiddenRelations} 条关系`
                : `${snapshot.hiddenCharacters} characters · ${snapshot.hiddenRelations} relationships outside this view`}
            </span>
          </div>
          <div
            ref={paneRef}
            className={`relationship-graph ${graph.nodes.length ? '' : 'empty'}`}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (!(event.key === 'Enter' && event.shiftKey)) return
              const id = lastPersonId.current ?? egoId
              if (!id) return
              event.preventDefault()
              pendingPersonClick.current = null
              recenter(id)
            }}
          >
            <div className="relationship-graph-inner">
              <svg
                viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
                role="group"
                aria-label={
                  zh ? '当前人物的两圈关系图' : 'Two-ring relationship graph for the current person'
                }
              >
                <defs>
                  <marker
                    id="relationship-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                {layout.edges.map((edge) => {
                  const relation = graph.edges.find(
                    (item) => item.relation.data.id === edge.relationId
                  )?.relation
                  if (!relation) return null
                  const label = String(relation.data.relation_type || relation.data.title)
                  const openRelation = () => onSelect({ type: 'character_relation', id: relation.data.id })
                  return (
                    <g
                      key={relation.data.id}
                      className={`relationship-graph-edge ${edge.faded ? 'relationship-graph-layer2' : ''} ${selectedTarget?.id === relation.data.id ? 'active' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={zh ? `编辑关系：${label}` : `Edit relationship: ${label}`}
                      onClick={openRelation}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openRelation()
                        }
                      }}
                    >
                      <title>{label}</title>
                      <line
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        markerEnd={
                          relation.data.direction === 'directed' ? 'url(#relationship-arrow)' : undefined
                        }
                      />
                      <text x={edge.labelX} y={edge.labelY}>
                        {label}
                      </text>
                    </g>
                  )
                })}
              </svg>
              {layout.nodes.map((node) => {
                const person = graph.nodes.find((item) => item.character.data.id === node.id)
                if (!person) return null
                const role = String(person.character.data.role || (zh ? '人物' : 'Character'))
                const absent = person.layer === 'ego' && !person.present
                const memberships = factionMemberships.get(node.id) ?? []
                return (
                  <button
                    type="button"
                    key={node.id}
                    className={`relationship-graph-chip relationship-graph-${node.layer} ${absent ? 'absent' : ''} ${selectedTarget?.id === node.id ? 'active' : ''}`}
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height
                    }}
                    aria-label={person.character.data.title}
                    onClick={() => handlePersonActivate(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && event.shiftKey) {
                        event.preventDefault()
                        event.stopPropagation()
                        pendingPersonClick.current = null
                        lastPersonId.current = node.id
                        recenter(node.id)
                      }
                    }}
                  >
                    <span className="relationship-person-main">
                      <SettingThumbnail
                        preview={settingImages[node.id]}
                        title={person.character.data.title}
                        type="character"
                        compact
                      />
                      <strong>{person.character.data.title}</strong>
                    </span>
                    <small>{absent ? (zh ? '此时未在场' : 'Not present at this time') : role}</small>
                    {!!memberships.length && (
                      <span className="relationship-faction-badges" aria-label={zh ? '所属势力' : 'Factions'}>
                        {memberships.map(({ membership, faction, untimed }) => (
                          <span
                            key={membership.data.id}
                            className={`relationship-faction-badge ${untimed ? 'untimed' : ''}`}
                            title={`${faction.data.title} · ${String(membership.data.role || '')}${untimed ? (zh ? ' · 未绑定时间' : ' · no time bound') : ''}`}
                          >
                            <SettingThumbnail
                              preview={settingImages[faction.data.id]}
                              title={faction.data.title}
                              type="faction"
                              compact
                            />
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {!graph.nodes.length && (
              <p className="empty-row relationship-empty">
                {zh
                  ? '当前时点没有已标注出场时间的人物。'
                  : 'No characters have an introduction time at this point.'}
              </p>
            )}
          </div>
          {!!graph.edges.length && (
            <div className="relationship-edge-list">
              {graph.edges.map((edge) => (
                <button
                  key={`relation-${edge.relation.data.id}`}
                  className={`relationship-edge-card ${selectedTarget?.id === edge.relation.data.id ? 'active' : ''}`}
                  onClick={() => onSelect({ type: 'character_relation', id: edge.relation.data.id })}
                >
                  <SettingThumbnail
                    preview={settingImages[edge.relation.data.id]}
                    title={edge.relation.data.title}
                    type="character_relation"
                    compact
                  />
                  <Link2 size={13} />
                  <span>{edge.relation.data.title}</span>
                  <small>{String(edge.relation.data.relation_type)}</small>
                  <span className="relationship-edge-action">
                    {zh ? '调整关系' : 'Edit relation'} <ArrowRight size={12} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="relationship-empty-setup">
          <div>
            <CalendarClock size={22} />
            <span>
              <strong>{zh ? '先建立时间坐标' : 'Create the time coordinates first'}</strong>
              <small>
                {zh
                  ? '新增时间节点 → 为人物填写出场/退场时间 → 为关系填写开始/结束时间。'
                  : 'Create timeline nodes → assign character introduction/exit → assign relationship start/end.'}
              </small>
            </span>
            {onCreateTimelineNode && (
              <button type="button" onClick={onCreateTimelineNode}>
                <CalendarPlus2 size={15} /> {zh ? '建立坐标' : 'Create coordinate'}
              </button>
            )}
          </div>
        </div>
      )}
      {!!(snapshot.outsideCharacters.length || snapshot.outsideRelations.length) && (
        <section className="planning-card-register" aria-label={zh ? '图外人物与关系' : 'Off-graph cards'}>
          <header className="planning-card-register-header">
            <div>
              <strong>{zh ? '图外人物与关系' : 'Characters and relations outside this point'}</strong>
              <small>
                {zh
                  ? '这些卡片未进入当前关系图，但始终可见。点击后在右栏补时间或调整关系。'
                  : 'These cards remain visible. Select one to update its timing or relationship in the detail pane.'}
              </small>
            </div>
            <span>{snapshot.outsideCharacters.length + snapshot.outsideRelations.length}</span>
          </header>
          <div className="planning-card-register-columns">
            {!!snapshot.outsideCharacters.length && (
              <section className="planning-card-register-group">
                <header>
                  <Users size={14} />
                  <strong>{zh ? '人物' : 'Characters'}</strong>
                  <span>{snapshot.outsideCharacters.length}</span>
                </header>
                <div>
                  {snapshot.outsideCharacters.map(({ item: character, reason }) => (
                    <button
                      type="button"
                      key={character.data.id}
                      className={`planning-index-card ${selectedTarget?.id === character.data.id ? 'active' : ''}`}
                      onClick={() => onSelect({ type: 'character', id: character.data.id })}
                    >
                      <span className="planning-index-copy">
                        <strong>{character.data.title}</strong>
                        <small>{String(character.data.role || (zh ? '人物' : 'Character'))}</small>
                      </span>
                      <span className="planning-index-reason">
                        {characterOutsideReasonLabel(reason, language)}
                      </span>
                      <span className="planning-index-action">
                        {zh ? '查看人物' : 'Open character'} <ArrowRight size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!!snapshot.outsideRelations.length && (
              <section className="planning-card-register-group">
                <header>
                  <Link2 size={14} />
                  <strong>{zh ? '人物关系' : 'Relationships'}</strong>
                  <span>{snapshot.outsideRelations.length}</span>
                </header>
                <div>
                  {snapshot.outsideRelations.map(({ item: relation, reason }) => {
                    const from = characterById.get(String(relation.data.from_character))
                    const to = characterById.get(String(relation.data.to_character))
                    return (
                      <button
                        type="button"
                        key={relation.data.id}
                        className={`planning-index-card ${selectedTarget?.id === relation.data.id ? 'active' : ''}`}
                        onClick={() => onSelect({ type: 'character_relation', id: relation.data.id })}
                      >
                        <span className="planning-index-copy">
                          <strong>{relation.data.title}</strong>
                          <small>
                            {from?.data.title ?? String(relation.data.from_character)} →{' '}
                            {to?.data.title ?? String(relation.data.to_character)}
                          </small>
                        </span>
                        <span className="planning-index-reason">
                          {relationOutsideReasonLabel(reason, language)}
                        </span>
                        <span className="planning-index-action">
                          {zh ? '调整关系' : 'Edit relation'} <ArrowRight size={12} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </section>
      )}
    </section>
  )
}

export function CharacterRelationshipPanel({
  character,
  items,
  selectedTarget,
  onSelect,
  onCreateRelation,
  language
}: {
  character: DocEntry
  items: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onCreateRelation: (initial: CharacterRelationCreateRequest) => void
  language: LanguageName
}) {
  const zh = language === 'zh'
  const characters = items.filter((item) => item.data.type === 'character')
  const characterById = new Map(characters.map((item) => [item.data.id, item] as const))
  const nodes = items
    .filter((item) => item.data.type === 'timeline_node')
    .slice()
    .sort(compareTimelineEntries)
  const nodeById = new Map(nodes.map((item) => [item.data.id, item] as const))
  const nodeOrder = new Map(nodes.map((item, index) => [item.data.id, index] as const))
  const relations = items
    .filter(
      (item) =>
        item.data.type === 'character_relation' &&
        (item.data.from_character === character.data.id || item.data.to_character === character.data.id)
    )
    .slice()
    .sort(
      (left, right) =>
        (nodeOrder.get(String(left.data.starts_at)) ?? Number.MAX_SAFE_INTEGER) -
          (nodeOrder.get(String(right.data.starts_at)) ?? Number.MAX_SAFE_INTEGER) ||
        String(left.data.relation_type).localeCompare(String(right.data.relation_type))
    )
  const legacyRelationships = isSimpleRecord(character.data.relationships)
    ? Object.entries(character.data.relationships)
    : []

  return (
    <section
      className="character-relationship-panel"
      aria-label={zh ? '时态人物关系' : 'Time-aware relationships'}
    >
      <header>
        <div>
          <span className="character-relationship-icon">
            <Link2 size={14} />
          </span>
          <span>
            <strong>{zh ? '时态人物关系' : 'Time-aware relationships'}</strong>
            <small>
              {zh
                ? '每张关系卡只描述一个时间阶段，并进入上方关系图。'
                : 'Each card describes one timed phase and appears in the relationship graph.'}
            </small>
          </span>
        </div>
        <button type="button" onClick={() => onCreateRelation({ fromCharacterId: character.data.id })}>
          <Plus size={14} /> {zh ? '新增关系' : 'New relationship'}
        </button>
      </header>

      {relations.length ? (
        <div className="character-relationship-phase-list">
          {relations.map((relation) => {
            const from = characterById.get(String(relation.data.from_character))
            const to = characterById.get(String(relation.data.to_character))
            const direction = relation.data.direction === 'mutual' ? '↔' : '→'
            const start = nodeById.get(String(relation.data.starts_at))
            const end = nodeById.get(String(relation.data.ends_at))
            return (
              <button
                type="button"
                key={relation.data.id}
                className={selectedTarget?.id === relation.data.id ? 'active' : ''}
                onClick={() => onSelect({ type: 'character_relation', id: relation.data.id })}
              >
                <span className="character-relationship-phase-main">
                  <strong>{String(relation.data.relation_type || relation.data.title)}</strong>
                  <small>
                    {from?.data.title ?? String(relation.data.from_character)} {direction}{' '}
                    {to?.data.title ?? String(relation.data.to_character)}
                  </small>
                </span>
                <span className="character-relationship-period">
                  <span>{start ? timelineEntryLabel(start) : zh ? '开始待补' : 'Start missing'}</span>
                  <ArrowRight size={12} />
                  <span>{end ? timelineEntryLabel(end) : zh ? '持续中' : 'Ongoing'}</span>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="character-relationship-empty">
          {zh
            ? '还没有时态关系。新增后，关系会按时间出现在关系图中。'
            : 'No timed relationship yet. New phases appear in the graph according to time.'}
        </p>
      )}

      {!!legacyRelationships.length && (
        <details className="legacy-relationship-notes" open={!relations.length}>
          <summary>
            <History size={13} />
            <span>{zh ? '旧关系备注' : 'Legacy relationship notes'}</span>
            <small>{legacyRelationships.length}</small>
          </summary>
          <p>
            {zh
              ? '这些静态备注会原样保留，但不会进入时态关系图。可逐条建立正式关系阶段。'
              : 'These notes are preserved but do not enter the timed graph. Convert them one by one.'}
          </p>
          <div>
            {legacyRelationships.map(([targetName, note]) => {
              const target = characters.find(
                (item) =>
                  item.data.id !== character.data.id &&
                  (item.data.title === targetName ||
                    (Array.isArray(item.data.aliases) && item.data.aliases.map(String).includes(targetName)))
              )
              return (
                <div className="legacy-relationship-row" key={targetName}>
                  <span>
                    <strong>{targetName}</strong>
                    <small>{String(note)}</small>
                  </span>
                  <button
                    type="button"
                    disabled={!target}
                    title={
                      target
                        ? zh
                          ? '选择时间并建立关系卡'
                          : 'Choose timing and create a relationship card'
                        : zh
                          ? '没有找到同名人物卡，请先建立对应人物。'
                          : 'No matching character card; create that character first.'
                    }
                    onClick={() =>
                      target &&
                      onCreateRelation({
                        fromCharacterId: character.data.id,
                        toCharacterId: target.data.id,
                        relationType: String(note)
                      })
                    }
                  >
                    {target
                      ? zh
                        ? '建立时态关系'
                        : 'Create timed relation'
                      : zh
                        ? '人物卡未找到'
                        : 'Character missing'}
                  </button>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </section>
  )
}

export function LocationExplorerView({
  items,
  selectedTarget,
  onSelect,
  language
}: {
  items: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  language: LanguageName
}) {
  const zh = language === 'zh'
  const model = locationExplorerModel(items, selectedTarget?.type === 'location' ? selectedTarget.id : null)
  const locationById = new Map(
    items
      .filter((item) => item.data.type === 'location')
      .map((location) => [location.data.id, location] as const)
  )
  const currentLayout =
    (selectedTarget?.type === 'location' &&
      model.layouts.find((layout) => layout.data.id === selectedTarget.id)) ||
    model.layouts[0] ||
    null
  const diagramNodes = Array.isArray(currentLayout?.data.diagram_nodes)
    ? (currentLayout.data.diagram_nodes as Array<Record<string, unknown>>)
    : []
  const diagramEdges = Array.isArray(currentLayout?.data.diagram_edges)
    ? (currentLayout.data.diagram_edges as Array<Record<string, unknown>>)
    : []
  const nodeById = new Map(diagramNodes.map((node) => [String(node.id), node]))

  return (
    <section className="location-explorer-workbench">
      <header className="planning-view-intro">
        <MapIcon size={18} />
        <div>
          <strong>{zh ? '地点层级与布局' : 'Location hierarchy and layout'}</strong>
          <small>
            {zh
              ? '主视图沿当前地点下钻；其他分支和未归属卡片保留在下方索引。'
              : 'Drill through the current branch; other branches and unattached cards remain indexed below.'}
          </small>
        </div>
      </header>
      {model.current ? (
        <>
          <nav className="location-breadcrumb" aria-label={zh ? '地点层级' : 'Location hierarchy'}>
            {[...model.ancestors, model.current].map((location, index, chain) => (
              <span key={location.data.id}>
                <button onClick={() => onSelect({ type: 'location', id: location.data.id })}>
                  {location.data.title}
                </button>
                {index < chain.length - 1 && <ArrowRight size={13} />}
              </span>
            ))}
          </nav>
          <div className="location-scale-strip">
            {LOCATION_SCALE_ORDER.map((scale) => (
              <span className={model.current?.data.scale === scale ? 'active' : ''} key={scale}>
                {enumChoiceLabel('scale', scale, language)}
              </span>
            ))}
          </div>
          <div className="location-explorer-grid">
            <section className="location-child-list">
              {!!model.peers.length && (
                <>
                  <strong>
                    {model.ancestors.length
                      ? zh
                        ? '同级定位'
                        : 'Sibling positions'
                      : zh
                        ? '根定位'
                        : 'Root positions'}
                  </strong>
                  <small>
                    {zh
                      ? '切换到同一父级下的其它地点。'
                      : 'Switch to another position under the same parent.'}
                  </small>
                  <div className="location-peer-list">
                    {model.peers.map((peer) => (
                      <button
                        key={peer.data.id}
                        onClick={() => onSelect({ type: 'location', id: peer.data.id })}
                      >
                        {peer.data.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <strong>{zh ? '下一级定位' : 'Next-level positions'}</strong>
              <small>
                {zh
                  ? '选择地点继续下钻；相对方位会用于组装场景上下文。'
                  : 'Select a child to drill down; relative direction feeds scene context.'}
              </small>
              {model.children.map((child) => (
                <button
                  key={child.data.id}
                  className={selectedTarget?.id === child.data.id ? 'active' : ''}
                  onClick={() => onSelect({ type: 'location', id: child.data.id })}
                >
                  <span>
                    <strong>{child.data.title}</strong>
                    <small>
                      {String(child.data.relative_direction || (zh ? '方位未定' : 'Direction unset'))}
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
              {!model.children.length && (
                <p className="empty-row">{zh ? '暂无更小尺度的定位。' : 'No smaller-scale positions.'}</p>
              )}
              <strong>{zh ? '布局解释' : 'Layout explanations'}</strong>
              {model.layouts.map((layout) => (
                <button
                  key={layout.data.id}
                  className={selectedTarget?.id === layout.data.id ? 'active' : ''}
                  onClick={() => onSelect({ type: 'location', id: layout.data.id })}
                >
                  <span>
                    <strong>{layout.data.title}</strong>
                    <small>
                      {documentTypeLabel('location', language)} · {zh ? '布局' : 'Layout'}
                    </small>
                  </span>
                  <MapIcon size={15} />
                </button>
              ))}
            </section>
            <section className="location-diagram-panel">
              <header>
                <div>
                  <strong>{currentLayout?.data.title ?? model.current.data.title}</strong>
                  <small>
                    {currentLayout
                      ? zh
                        ? '布局简图'
                        : 'Layout diagram'
                      : zh
                        ? '定位概览'
                        : 'Position overview'}
                  </small>
                </div>
              </header>
              <div className="location-diagram-canvas">
                {diagramNodes.length ? (
                  <>
                    <svg viewBox="0 0 100 100" aria-hidden="true">
                      {diagramEdges.map((edge, index) => {
                        const from = nodeById.get(String(edge.from))
                        const to = nodeById.get(String(edge.to))
                        if (!from || !to) return null
                        return (
                          <line
                            key={`${String(edge.from)}-${String(edge.to)}-${index}`}
                            x1={Number(from.x)}
                            y1={Number(from.y)}
                            x2={Number(to.x)}
                            y2={Number(to.y)}
                          />
                        )
                      })}
                    </svg>
                    {diagramNodes.map((node, index) => {
                      const target = String(node.target_location ?? '')
                      return (
                        <button
                          key={String(node.id || index)}
                          className="location-diagram-node"
                          style={
                            {
                              '--diagram-x': `${clampPercent(Number(node.x))}%`,
                              '--diagram-y': `${clampPercent(Number(node.y))}%`
                            } as CSSProperties
                          }
                          disabled={!target}
                          onClick={() => target && onSelect({ type: 'location', id: target })}
                        >
                          <strong>{String(node.label || node.id || index + 1)}</strong>
                          {node.floor ? <small>{String(node.floor)}</small> : null}
                        </button>
                      )
                    })}
                  </>
                ) : (
                  <CompassOverview current={model.current} children={model.children} language={language} />
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <p className="empty-row">
          {zh ? '还没有定位卡。请先建立一个全球或区域尺度的地点。' : 'No position cards yet.'}
        </p>
      )}
      {!!(model.outsidePositions.length || model.outsideLayouts.length) && (
        <section className="planning-card-register" aria-label={zh ? '其他地点与布局' : 'Other locations'}>
          <header className="planning-card-register-header">
            <div>
              <strong>{zh ? '其他地点与布局' : 'Other locations and layouts'}</strong>
              <small>
                {zh
                  ? '这里收纳当前层级外的地点卡。点击后可在右栏修改父地点、相对方位或布局关联。'
                  : 'Cards outside the current branch stay here. Select one to edit its parent, direction, or layout link.'}
              </small>
            </div>
            <span>{model.outsidePositions.length + model.outsideLayouts.length}</span>
          </header>
          <div className="planning-card-register-columns">
            {!!model.outsidePositions.length && (
              <section className="planning-card-register-group">
                <header>
                  <MapIcon size={14} />
                  <strong>{zh ? '其他地点' : 'Other positions'}</strong>
                  <span>{model.outsidePositions.length}</span>
                </header>
                <div>
                  {model.outsidePositions.map(({ item: location, reason }) => {
                    const parent = locationById.get(String(location.data.parent_location))
                    return (
                      <button
                        type="button"
                        key={location.data.id}
                        className={`planning-index-card ${selectedTarget?.id === location.data.id ? 'active' : ''}`}
                        onClick={() => onSelect({ type: 'location', id: location.data.id })}
                      >
                        <span className="planning-index-copy">
                          <strong>{location.data.title}</strong>
                          <small>{enumChoiceLabel('scale', String(location.data.scale), language)}</small>
                        </span>
                        <span className="planning-index-reason">
                          {locationOutsideReasonLabel(reason, parent?.data.title, language)}
                        </span>
                        <span className="planning-index-action">
                          {zh ? '调整归属' : 'Edit parent'} <ArrowRight size={12} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
            {!!model.outsideLayouts.length && (
              <section className="planning-card-register-group">
                <header>
                  <MapIcon size={14} />
                  <strong>{zh ? '其他布局' : 'Other layouts'}</strong>
                  <span>{model.outsideLayouts.length}</span>
                </header>
                <div>
                  {model.outsideLayouts.map(({ item: layout, reason }) => {
                    const owner = locationById.get(String(layout.data.layout_of))
                    return (
                      <button
                        type="button"
                        key={layout.data.id}
                        className={`planning-index-card ${selectedTarget?.id === layout.data.id ? 'active' : ''}`}
                        onClick={() => onSelect({ type: 'location', id: layout.data.id })}
                      >
                        <span className="planning-index-copy">
                          <strong>{layout.data.title}</strong>
                          <small>{zh ? '布局卡' : 'Layout card'}</small>
                        </span>
                        <span className="planning-index-reason">
                          {layoutOutsideReasonLabel(reason, owner?.data.title, language)}
                        </span>
                        <span className="planning-index-action">
                          {zh ? '调整关联' : 'Edit link'} <ArrowRight size={12} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
        </section>
      )}
    </section>
  )
}

function characterOutsideReasonLabel(reason: CharacterOutsideReason, language: LanguageName): string {
  const zh = language === 'zh'
  const labels: Record<CharacterOutsideReason, [string, string]> = {
    'no-timeline': ['尚未建立时间坐标', 'Timeline not set up'],
    'missing-introduction': ['出场时间待补', 'Introduction time missing'],
    'not-introduced': ['尚未出场', 'Not introduced yet'],
    'not-born': ['尚未出生', 'Not born yet'],
    exited: ['已退场', 'Exited by this point'],
    died: ['已死亡', 'Deceased by this point']
  }
  return labels[reason][zh ? 0 : 1]
}

function relationOutsideReasonLabel(reason: RelationOutsideReason, language: LanguageName): string {
  const zh = language === 'zh'
  const labels: Record<RelationOutsideReason, [string, string]> = {
    'no-timeline': ['尚未建立时间坐标', 'Timeline not set up'],
    'missing-character': ['关联人物不存在', 'Character link is broken'],
    'missing-start': ['开始时间待补', 'Start time missing'],
    'not-started': ['关系尚未形成', 'Relationship not formed'],
    ended: ['关系已经结束', 'Relationship has ended'],
    'character-outside': ['关联人物不在当前节点', 'A character is outside this point']
  }
  return labels[reason][zh ? 0 : 1]
}

function locationOutsideReasonLabel(
  reason: LocationOutsideReason,
  parentTitle: string | undefined,
  language: LanguageName
): string {
  const zh = language === 'zh'
  if (reason === 'other-root') return zh ? '另一条根级分支' : 'Another root branch'
  if (reason === 'broken-parent') return zh ? '父地点引用失效' : 'Parent location is missing'
  if (parentTitle) return zh ? `位于「${parentTitle}」下` : `Under “${parentTitle}”`
  return zh ? '位于其他地点分支' : 'In another location branch'
}

function layoutOutsideReasonLabel(
  reason: LayoutOutsideReason,
  ownerTitle: string | undefined,
  language: LanguageName
): string {
  const zh = language === 'zh'
  if (reason === 'missing-location') return zh ? '解释对象待补' : 'Layout target missing'
  if (ownerTitle) return zh ? `属于「${ownerTitle}」` : `Belongs to “${ownerTitle}”`
  return zh ? '属于其他地点' : 'Belongs to another location'
}

function CompassOverview({
  current,
  children,
  language
}: {
  current: DocEntry
  children: DocEntry[]
  language: LanguageName
}) {
  const zh = language === 'zh'
  const positions = graphPositions(children.length, 42)
  return (
    <div className="compass-overview">
      <span className="compass-north">{zh ? '北' : 'N'}</span>
      <strong className="compass-center">{current.data.title}</strong>
      {children.map((child, index) => (
        <span
          key={child.data.id}
          className="compass-child"
          style={
            {
              '--graph-x': `${positions[index].x}%`,
              '--graph-y': `${positions[index].y}%`
            } as CSSProperties
          }
        >
          {child.data.title}
        </span>
      ))}
      {!children.length && <small>{zh ? '暂无布局节点' : 'No layout nodes yet'}</small>}
    </div>
  )
}

function isSimpleRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function compareTimelineEntries(left: DocEntry, right: DocEntry): number {
  const leftKey = timelineEntryKey(left)
  const rightKey = timelineEntryKey(right)
  for (let index = 0; index < leftKey.length; index += 1) {
    const difference = Number(leftKey[index]) - Number(rightKey[index])
    if (difference) return difference
  }
  return left.data.id.localeCompare(right.data.id)
}

function timelineEntryKey(item: DocEntry): number[] {
  return [
    Number(item.data.year ?? Number.MAX_SAFE_INTEGER),
    Number(item.data.month ?? 13),
    Number(item.data.day ?? 0),
    Number(item.data.hour ?? 0),
    Number(item.data.minute ?? 0)
  ]
}

export function timelineEntryLabel(item: DocEntry): string {
  if (item.data.display_time) return String(item.data.display_time)
  if (item.data.date) return String(item.data.date)
  const [year, month, day, hour, minute] = timelineEntryKey(item)
  if (!Number.isFinite(year) || year === Number.MAX_SAFE_INTEGER) return item.data.title
  const parts = [String(year), String(month).padStart(2, '0')]
  if (item.data.day) parts.push(String(day).padStart(2, '0'))
  let label = parts.join('-')
  if (item.data.hour !== null && item.data.hour !== undefined) {
    label += ` ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  return label
}

function timelinePosition(index: Map<string, number>, value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null
  return index.get(value) ?? null
}

function locationScaleIndex(value: string): number {
  const index = LOCATION_SCALE_ORDER.indexOf(value as (typeof LOCATION_SCALE_ORDER)[number])
  return index < 0 ? LOCATION_SCALE_ORDER.length : index
}

function graphPositions(count: number, radius = 36): Array<{ x: number; y: number }> {
  if (count <= 0) return []
  if (count === 1) return [{ x: 50, y: 50 }]
  return Array.from({ length: count }, (_item, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
  })
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(4, Math.min(96, value))
}
