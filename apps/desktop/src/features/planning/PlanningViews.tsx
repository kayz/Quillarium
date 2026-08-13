import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus2,
  History,
  Link2,
  Map as MapIcon,
  Plus,
  Users
} from 'lucide-react'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import { documentTypeLabel, enumChoiceLabel, fieldLabel } from '../metadata/field-presentation.js'

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

export function buildTimelineLanes(items: DocEntry[]): {
  lanes: TimelineLane[]
  unattached: DocEntry[]
} {
  const nodes = items
    .filter((item) => item.data.type === 'timeline_node')
    .slice()
    .sort(compareTimelineEntries)
  const events = items.filter((item) => item.data.type === 'timeline_event')
  const nodeIds = new Set(nodes.map((node) => node.data.id))
  return {
    lanes: nodes.map((node) => ({
      node,
      events: events
        .filter((event) => event.data.timeline_node === node.data.id)
        .sort((left, right) => left.data.title.localeCompare(right.data.title))
    })),
    unattached: events.filter(
      (event) => !event.data.timeline_node || !nodeIds.has(String(event.data.timeline_node))
    )
  }
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
  language
}: {
  items: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onCreateCoordinate?: () => void
  onCreateCoordinateFromEvent?: (event: DocEntry) => void
  language: LanguageName
}) {
  const zh = language === 'zh'
  const { lanes, unattached } = buildTimelineLanes(items)
  return (
    <section className="timeline-chain-workbench">
      <header className="planning-view-intro">
        <CalendarClock size={18} />
        <div>
          <strong>{zh ? '时间主链' : 'Timeline chain'}</strong>
          <small>
            {zh
              ? '节点顺序唯一；同一时间点的多个事件并列显示。'
              : 'Nodes have one fixed order; concurrent events share a node.'}
          </small>
        </div>
      </header>
      <div className={`timeline-chain-scroll ${lanes.length ? '' : 'empty'}`}>
        {lanes.map(({ node, events }, index) => (
          <article
            className={`timeline-node-lane ${node.data.enabled === false ? 'disabled-card' : ''}`}
            key={node.data.id}
          >
            <button
              className={`timeline-node-card ${selectedTarget?.id === node.data.id ? 'active' : ''}`}
              onClick={() => onSelect({ type: 'timeline_node', id: node.data.id })}
            >
              <small>{zh ? `节点 ${index + 1}` : `Node ${index + 1}`}</small>
              <strong>{timelineEntryLabel(node)}</strong>
              <span>{node.data.title}</span>
              <em>
                {fieldLabel('precision', language)}：
                {enumChoiceLabel('precision', String(node.data.precision ?? 'month'), language)}
              </em>
            </button>
            {index < lanes.length - 1 && (
              <div className="timeline-chain-arrow" aria-hidden="true">
                <ArrowRight size={17} />
              </div>
            )}
            <div className="timeline-concurrent-events">
              {events.map((event) => (
                <button
                  key={event.data.id}
                  className={`${selectedTarget?.id === event.data.id ? 'active' : ''} ${event.data.enabled === false ? 'disabled-card' : ''}`}
                  onClick={() => onSelect({ type: 'timeline_event', id: event.data.id })}
                >
                  <span>{event.data.title}</span>
                  <small>{zh ? '同时事件' : 'Concurrent event'}</small>
                </button>
              ))}
              {!events.length && <small>{zh ? '暂无挂载事件' : 'No attached events'}</small>}
            </div>
          </article>
        ))}
        {!lanes.length && (
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
      </div>
      {!!unattached.length && (
        <section className="timeline-unattached">
          <strong>{zh ? '待挂载事件' : 'Unattached events'}</strong>
          <small>
            {zh
              ? '这些事件尚未选择时间节点，不会进入主链。'
              : 'These events do not have a valid timeline node and are outside the main chain.'}
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
    </section>
  )
}

export function CharacterRelationView({
  items,
  timelineNodes,
  selectedTarget,
  onSelect,
  onCreateRelation,
  onCreateTimelineNode,
  language
}: {
  items: DocEntry[]
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
  useEffect(() => {
    if (!nodeId || !nodes.some((node) => node.data.id === nodeId)) setNodeId(nodes.at(-1)?.data.id ?? null)
  }, [nodeId, nodes])
  const selectedIndex = Math.max(
    0,
    nodes.findIndex((node) => node.data.id === nodeId)
  )
  const snapshot = characterRelationSnapshot(items, nodes, nodeId)
  const positions = graphPositions(snapshot.characters.length)
  const byId = new Map(snapshot.characters.map((character, index) => [character.data.id, positions[index]]))
  const characterById = new Map(
    items
      .filter((item) => item.data.type === 'character')
      .map((character) => [character.data.id, character] as const)
  )

  return (
    <section className="character-relation-workbench">
      <header className="planning-view-intro">
        <Users size={18} />
        <div>
          <strong>{zh ? '时态人物关系' : 'Time-aware character relationships'}</strong>
          <small>
            {zh
              ? '主图聚焦当前时点；其他人物和关系始终保留在下方索引。'
              : 'The graph focuses on one point in time; every other card remains indexed below.'}
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
          <div className={`relationship-graph ${snapshot.characters.length ? '' : 'empty'}`}>
            <svg
              viewBox="0 0 1000 560"
              role="img"
              aria-label={zh ? '当前时间点的人物关系图' : 'Character relationships at the selected time'}
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
              {snapshot.relations.map((relation) => {
                const from = byId.get(String(relation.data.from_character))
                const to = byId.get(String(relation.data.to_character))
                if (!from || !to) return null
                const edge = relationshipEdgeGeometry(from, to)
                const label = String(relation.data.relation_type || relation.data.title)
                const openRelation = () => onSelect({ type: 'character_relation', id: relation.data.id })
                return (
                  <g
                    key={relation.data.id}
                    className={`relationship-graph-edge ${selectedTarget?.id === relation.data.id ? 'active' : ''}`}
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
            {snapshot.characters.map((character, index) => (
              <button
                key={character.data.id}
                className={`relationship-person ${selectedTarget?.id === character.data.id ? 'active' : ''}`}
                style={
                  {
                    '--graph-x': `${positions[index].x}%`,
                    '--graph-y': `${positions[index].y}%`
                  } as CSSProperties
                }
                onClick={() => onSelect({ type: 'character', id: character.data.id })}
              >
                <strong>{character.data.title}</strong>
                <small>{String(character.data.role || (zh ? '人物' : 'Character'))}</small>
              </button>
            ))}
            {!snapshot.characters.length && (
              <p className="empty-row relationship-empty">
                {zh
                  ? '当前时点没有已标注出场时间的人物。'
                  : 'No characters have an introduction time at this point.'}
              </p>
            )}
          </div>
          {!!snapshot.relations.length && (
            <div className="relationship-edge-list">
              {snapshot.relations.map((relation) => (
                <button
                  key={`relation-${relation.data.id}`}
                  className={`relationship-edge-card ${selectedTarget?.id === relation.data.id ? 'active' : ''}`}
                  onClick={() => onSelect({ type: 'character_relation', id: relation.data.id })}
                >
                  <Link2 size={13} />
                  <span>{relation.data.title}</span>
                  <small>{String(relation.data.relation_type)}</small>
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

function relationshipEdgeGeometry(
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x1: number; y1: number; x2: number; y2: number; labelX: number; labelY: number } {
  const rawX1 = from.x * 10
  const rawY1 = from.y * 5.6
  const rawX2 = to.x * 10
  const rawY2 = to.y * 5.6
  const dx = rawX2 - rawX1
  const dy = rawY2 - rawY1
  const distance = Math.max(Math.hypot(dx, dy), 1)
  const inset = Math.min(70, distance * 0.22)
  const unitX = dx / distance
  const unitY = dy / distance
  return {
    x1: rawX1 + unitX * inset,
    y1: rawY1 + unitY * inset,
    x2: rawX2 - unitX * inset,
    y2: rawY2 - unitY * inset,
    labelX: (rawX1 + rawX2) / 2,
    labelY: (rawY1 + rawY2) / 2 - 9
  }
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
