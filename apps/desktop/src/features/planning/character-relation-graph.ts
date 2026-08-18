import type { DocEntry, TargetSelection } from '../../app/types.js'
import type { CharacterRelationSnapshot } from './PlanningViews.js'

export type RelationGraphLayer = 'ego' | 'layer1' | 'layer2'

export interface CharacterRelationEgoNode {
  character: DocEntry
  layer: RelationGraphLayer
  present: boolean
  parentId: string | null
}

export interface CharacterRelationEgoEdge {
  relation: DocEntry
  fromId: string
  toId: string
  faded: boolean
}

export interface CharacterRelationEgoGraph {
  egoId: string | null
  nodes: CharacterRelationEgoNode[]
  edges: CharacterRelationEgoEdge[]
}

export interface CharacterRelationLayoutNode {
  id: string
  x: number
  y: number
  layer: RelationGraphLayer
  width: number
  height: number
}

export interface CharacterRelationLayoutEdge {
  relationId: string
  fromId: string
  toId: string
  faded: boolean
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
}

export interface CharacterRelationLayout {
  viewBox: { width: number; height: number }
  nodes: CharacterRelationLayoutNode[]
  edges: CharacterRelationLayoutEdge[]
}

export const PERSON_DOUBLE_CLICK_MS = 700

export function personPointerAction(
  previous: { id: string; at: number } | null,
  id: string,
  now: number,
  windowMs = PERSON_DOUBLE_CLICK_MS
): { kind: 'select' | 'recenter'; next: { id: string; at: number } | null } {
  if (previous && previous.id === id && now - previous.at <= windowMs) {
    return { kind: 'recenter', next: null }
  }
  return { kind: 'select', next: { id, at: now } }
}

export function nextGraphPaneSize(
  current: { width: number; height: number },
  measured: { width: number; height: number },
  min = 32
): { width: number; height: number } | null {
  const width = Math.round(measured.width)
  const height = Math.round(measured.height)
  if (width < min || height < min) return null
  if (width === current.width && height === current.height) return null
  return { width, height }
}

const EGO_CHIP = { width: 108, height: 40 }
const LAYER1_CHIP = { width: 96, height: 36 }
const LAYER2_CHIP = { width: 84, height: 32 }

export function resolveEgoCharacterId(
  selectedTarget: TargetSelection | null,
  storedEgoId: string | null,
  snapshot: CharacterRelationSnapshot,
  items: DocEntry[]
): string | null {
  const characters = items.filter((item) => item.data.type === 'character')
  const exists = (id: string | null | undefined) =>
    Boolean(id && characters.some((item) => item.data.id === id))
  if (selectedTarget?.type === 'character' && exists(selectedTarget.id)) return selectedTarget.id
  if (exists(storedEgoId)) return storedEgoId
  const present = snapshot.characters
    .slice()
    .sort((left, right) => left.data.id.localeCompare(right.data.id, 'en'))
  if (present[0]) return present[0].data.id
  const any = characters.slice().sort((left, right) => left.data.id.localeCompare(right.data.id, 'en'))
  return any[0]?.data.id ?? null
}

export function buildCharacterRelationEgoGraph(input: {
  snapshot: CharacterRelationSnapshot
  items: DocEntry[]
  egoId: string | null
  timeIndex: Map<string, number>
}): CharacterRelationEgoGraph {
  const { snapshot, items, egoId, timeIndex } = input
  if (!egoId) return { egoId: null, nodes: [], edges: [] }
  const egoCharacter = items.find((item) => item.data.type === 'character' && item.data.id === egoId)
  if (!egoCharacter) return { egoId, nodes: [], edges: [] }

  const presentIds = new Set(snapshot.characters.map((item) => item.data.id))
  const present = presentIds.has(egoId)
  const active = present ? snapshot.relations : []
  const layer1 = new Set<string>()
  if (present) {
    for (const relation of active) {
      const other = otherEnd(relation, egoId)
      if (other && presentIds.has(other)) layer1.add(other)
    }
  }

  const layer2 = new Set<string>()
  if (present) {
    for (const relation of active) {
      const [from, to] = relationEnds(relation)
      for (const end of [from, to]) {
        if (!layer1.has(end)) continue
        const other = end === from ? to : from
        if (other === egoId || layer1.has(other) || !presentIds.has(other)) continue
        layer2.add(other)
      }
    }
  }

  const parentOf = new Map<string, string>()
  for (const outerId of layer2) {
    const candidates: Array<{ parentId: string; start: number; relationId: string }> = []
    for (const relation of active) {
      const other = otherEnd(relation, outerId)
      if (!other || !layer1.has(other)) continue
      const start = timeIndex.get(String(relation.data.starts_at ?? '')) ?? Number.MAX_SAFE_INTEGER
      candidates.push({ parentId: other, start, relationId: relation.data.id })
    }
    candidates.sort(
      (left, right) =>
        left.start - right.start ||
        left.parentId.localeCompare(right.parentId, 'en') ||
        left.relationId.localeCompare(right.relationId, 'en')
    )
    if (candidates[0]) parentOf.set(outerId, candidates[0].parentId)
  }

  const layerOf = (id: string): RelationGraphLayer | null => {
    if (id === egoId) return 'ego'
    if (layer1.has(id)) return 'layer1'
    if (layer2.has(id)) return 'layer2'
    return null
  }

  const edges: CharacterRelationEgoEdge[] = []
  if (present) {
    for (const relation of active) {
      const [from, to] = relationEnds(relation)
      const fromLayer = layerOf(from)
      const toLayer = layerOf(to)
      if (!fromLayer || !toLayer) continue
      if (fromLayer === 'layer2' && toLayer === 'layer2') continue
      edges.push({
        relation,
        fromId: from,
        toId: to,
        faded: fromLayer === 'layer2' || toLayer === 'layer2'
      })
    }
  }

  const byId = new Map(
    items.filter((item) => item.data.type === 'character').map((item) => [item.data.id, item])
  )
  const nodes: CharacterRelationEgoNode[] = [
    { character: egoCharacter, layer: 'ego', present, parentId: null }
  ]
  for (const id of [...layer1].sort((left, right) => left.localeCompare(right, 'en'))) {
    const character = byId.get(id)
    if (character) nodes.push({ character, layer: 'layer1', present: true, parentId: null })
  }
  for (const id of [...layer2].sort((left, right) => left.localeCompare(right, 'en'))) {
    const character = byId.get(id)
    if (character) {
      nodes.push({ character, layer: 'layer2', present: true, parentId: parentOf.get(id) ?? null })
    }
  }
  return { egoId, nodes, edges }
}

export function layoutCharacterRelationEgoGraph(
  graph: CharacterRelationEgoGraph,
  width: number,
  height: number
): CharacterRelationLayout {
  const cx = width / 2
  const cy = height / 2
  const minSide = Math.min(width, height)
  const scale = minSide < 280 ? 0.75 : 1
  const innerR = 0.28 * minSide
  const outerR = 0.42 * minSide
  const inset = 24
  const positions = new Map<string, CharacterRelationLayoutNode>()

  const place = (id: string, layer: RelationGraphLayer, x: number, y: number) => {
    const size = chipSize(layer, scale)
    positions.set(id, {
      id,
      layer,
      width: size.width,
      height: size.height,
      x: clamp(x, inset + size.width / 2, width - inset - size.width / 2),
      y: clamp(y, inset + size.height / 2, height - inset - size.height / 2)
    })
  }

  const ego = graph.nodes.find((node) => node.layer === 'ego')
  if (ego) place(ego.character.data.id, 'ego', cx, cy)

  const layer1 = graph.nodes
    .filter((node) => node.layer === 'layer1')
    .sort((left, right) => left.character.data.id.localeCompare(right.character.data.id, 'en'))
  layer1.forEach((node, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(layer1.length, 1)
    place(node.character.data.id, 'layer1', cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR)
  })

  const layer2 = graph.nodes.filter((node) => node.layer === 'layer2')
  const byParent = new Map<string, CharacterRelationEgoNode[]>()
  for (const node of layer2) {
    const parentId = node.parentId ?? ''
    const group = byParent.get(parentId) ?? []
    group.push(node)
    byParent.set(parentId, group)
  }
  for (const [parentId, children] of byParent) {
    children.sort((left, right) => left.character.data.id.localeCompare(right.character.data.id, 'en'))
    const parent = positions.get(parentId)
    const parentAngle = parent ? Math.atan2(parent.y - cy, parent.x - cx) : -Math.PI / 2
    const spread = Math.min(0.7, 0.22 * Math.max(children.length, 1))
    children.forEach((node, index) => {
      const t = children.length === 1 ? 0 : index / (children.length - 1) - 0.5
      const angle = parentAngle + t * spread
      place(node.character.data.id, 'layer2', cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR)
    })
  }

  const grouped = new Map<string, CharacterRelationEgoEdge[]>()
  for (const edge of graph.edges) {
    const key = [edge.fromId, edge.toId].sort().join('|')
    const list = grouped.get(key) ?? []
    list.push(edge)
    grouped.set(key, list)
  }

  const edges: CharacterRelationLayoutEdge[] = []
  for (const group of grouped.values()) {
    group.forEach((edge, index) => {
      const from = positions.get(edge.fromId)
      const to = positions.get(edge.toId)
      if (!from || !to) return
      const dx = to.x - from.x
      const dy = to.y - from.y
      const length = Math.hypot(dx, dy) || 1
      const px = -dy / length
      const py = dx / length
      const offset = (index - (group.length - 1) / 2) * 10
      const fx = from.x + px * offset
      const fy = from.y + py * offset
      const tx = to.x + px * offset
      const ty = to.y + py * offset
      const start = rectExit(fx, fy, from.width, from.height, tx, ty)
      const end = rectExit(tx, ty, to.width, to.height, fx, fy)
      edges.push({
        relationId: edge.relation.data.id,
        fromId: edge.fromId,
        toId: edge.toId,
        faded: edge.faded,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        labelX: (start.x + end.x) / 2 + px * 10,
        labelY: (start.y + end.y) / 2 + py * 10
      })
    })
  }

  return {
    viewBox: { width, height },
    nodes: [...positions.values()],
    edges
  }
}

function otherEnd(relation: DocEntry, id: string): string | null {
  const [from, to] = relationEnds(relation)
  if (from === id) return to
  if (to === id) return from
  return null
}

function relationEnds(relation: DocEntry): [string, string] {
  return [String(relation.data.from_character), String(relation.data.to_character)]
}

function chipSize(layer: RelationGraphLayer, scale: number): { width: number; height: number } {
  const base = layer === 'ego' ? EGO_CHIP : layer === 'layer1' ? LAYER1_CHIP : LAYER2_CHIP
  return { width: base.width * scale, height: base.height * scale }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function rectExit(
  cx: number,
  cy: number,
  width: number,
  height: number,
  towardX: number,
  towardY: number
): { x: number; y: number } {
  const dx = towardX - cx
  const dy = towardY - cy
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const hitX = Math.abs(ux) < 1e-6 ? Number.POSITIVE_INFINITY : width / 2 / Math.abs(ux)
  const hitY = Math.abs(uy) < 1e-6 ? Number.POSITIVE_INFINITY : height / 2 / Math.abs(uy)
  const t = Math.min(hitX, hitY)
  return { x: cx + ux * t, y: cy + uy * t }
}
