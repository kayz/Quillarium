import type {
  CanonicalLocationScale,
  LocationDiagramEdge,
  LocationDiagramEdgeType,
  LocationDiagramNode,
  LocationDiagramRoomType,
  LocationScale
} from './types.js'

export type { CanonicalLocationScale } from './types.js'

export const CANONICAL_LOCATION_SCALES: readonly CanonicalLocationScale[] = [
  'global',
  'province',
  'city',
  'county',
  'town',
  'district',
  'cluster',
  'interior'
] as const

export const MAP_ZOOM_MIN = 0.4
export const MAP_ZOOM_MAX = 3.0
export const MAP_ZOOM_DRILL_DOWN_THRESHOLD = 2.2
export const MAP_ZOOM_ROLL_UP_THRESHOLD = 0.6

export interface LocationScaleMetadata {
  scale: CanonicalLocationScale
  level: number
  zh: string
  en: string
  rangeZh: string
  rangeEn: string
  isFloorPlan: boolean
}

export const LOCATION_SCALE_METADATA: Record<CanonicalLocationScale, LocationScaleMetadata> = {
  global: {
    scale: 'global',
    level: 1,
    zh: '全图（平面地图）',
    en: 'Global Map',
    rangeZh: '1000km+',
    rangeEn: '1000km+',
    isFloorPlan: false
  },
  province: {
    scale: 'province',
    level: 2,
    zh: '省级',
    en: 'Province',
    rangeZh: '200–1000km',
    rangeEn: '200–1000km',
    isFloorPlan: false
  },
  city: {
    scale: 'city',
    level: 3,
    zh: '市级',
    en: 'City',
    rangeZh: '30–200km',
    rangeEn: '30–200km',
    isFloorPlan: false
  },
  county: {
    scale: 'county',
    level: 4,
    zh: '县级',
    en: 'County',
    rangeZh: '5–30km',
    rangeEn: '5–30km',
    isFloorPlan: false
  },
  town: {
    scale: 'town',
    level: 5,
    zh: '镇级',
    en: 'Town',
    rangeZh: '1–5km',
    rangeEn: '1–5km',
    isFloorPlan: false
  },
  district: {
    scale: 'district',
    level: 6,
    zh: '街区级',
    en: 'District',
    rangeZh: '200m–1km',
    rangeEn: '200m–1km',
    isFloorPlan: false
  },
  cluster: {
    scale: 'cluster',
    level: 7,
    zh: '组团级（宅院）',
    en: 'Cluster / Compound',
    rangeZh: '50–200m',
    rangeEn: '50–200m',
    isFloorPlan: false
  },
  interior: {
    scale: 'interior',
    level: 8,
    zh: '室内（房型图）',
    en: 'Interior Floor Plan',
    rangeZh: '5–50m',
    rangeEn: '5–50m',
    isFloorPlan: true
  }
}

export function normalizeCanonicalScale(scale: string | undefined | null): CanonicalLocationScale {
  if (!scale) return 'city'
  if (scale === 'region') return 'province'
  if (scale === 'estate') return 'cluster'
  if ((CANONICAL_LOCATION_SCALES as readonly string[]).includes(scale)) {
    return scale as CanonicalLocationScale
  }
  return 'city'
}

export function canonicalScaleIndex(scale: string | undefined | null): number {
  const normalized = normalizeCanonicalScale(scale)
  return CANONICAL_LOCATION_SCALES.indexOf(normalized)
}

export function adjacentLocationScales(scale: string | undefined | null): {
  current: CanonicalLocationScale
  level: number
  parentScale: CanonicalLocationScale | null
  childScale: CanonicalLocationScale | null
} {
  const idx = canonicalScaleIndex(scale)
  const current = CANONICAL_LOCATION_SCALES[idx] ?? 'city'
  return {
    current,
    level: idx + 1,
    parentScale: idx > 0 ? CANONICAL_LOCATION_SCALES[idx - 1]! : null,
    childScale: idx < CANONICAL_LOCATION_SCALES.length - 1 ? CANONICAL_LOCATION_SCALES[idx + 1]! : null
  }
}

export interface MapCanvasViewport {
  x: number
  y: number
  zoom: number
}

export interface MapCanvasPoint {
  x: number
  y: number
}

export interface MapCanvasNodeSummary {
  id: string
  label: string
  x: number
  y: number
  floor: string
  targetLocationId: string | null
  targetScale: CanonicalLocationScale | null
  drillable: boolean
  roomType?: LocationDiagramRoomType
  width?: number
  height?: number
  itemId?: string | null
}

export function clampMapZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, Number(zoom.toFixed(3))))
}

/**
 * Computes the next viewport when zooming around a specific focal point (0..100 canvas coordinates).
 */
export function computeFocalZoomViewport(
  current: MapCanvasViewport,
  nextZoomRaw: number,
  focalPoint: MapCanvasPoint = { x: 50, y: 50 }
): MapCanvasViewport {
  const nextZoom = clampMapZoom(nextZoomRaw)
  const ratio = nextZoom / (current.zoom || 1)
  const nextX = focalPoint.x - (focalPoint.x - current.x) * ratio
  const nextY = focalPoint.y - (focalPoint.y - current.y) * ratio
  return {
    x: Number(nextX.toFixed(2)),
    y: Number(nextY.toFixed(2)),
    zoom: nextZoom
  }
}

export type MapZoomTransitionResult =
  | {
      action: 'stay'
      viewport: MapCanvasViewport
      nearThreshold: 'drill-down' | 'roll-up' | null
      focusedTargetId: string | null
    }
  | {
      action: 'drill-down'
      targetLocationId: string | null
      targetLabel: string
      fromScale: CanonicalLocationScale
      toScale: CanonicalLocationScale
      nextViewport: MapCanvasViewport
    }
  | {
      action: 'roll-up'
      targetLocationId: string | null
      targetLabel: string
      fromScale: CanonicalLocationScale
      toScale: CanonicalLocationScale
      nextViewport: MapCanvasViewport
    }

export function isLocationMounted(doc: Record<string, unknown>): boolean {
  if (doc.kind === 'layout') return false
  return Boolean(
    typeof doc.map_layer === 'string' &&
    doc.map_layer.length > 0 &&
    typeof doc.map_x === 'number' &&
    Number.isFinite(doc.map_x) &&
    typeof doc.map_y === 'number' &&
    Number.isFinite(doc.map_y)
  )
}

/**
 * Evaluates Google Maps-style zoom threshold transitions:
 * - Zooming in >= 2.2x transitions to the next finer layer (and selects focused child if present).
 * - Zooming out <= 0.6x transitions up to the next coarser layer (and selects parent if present).
 * - Between (0.6x, 2.2x) stays in the hysteresis band without jumping levels.
 */
export function evaluateMapZoomTransition(input: {
  currentScale: LocationScale | string | undefined
  parentLocation?: { id: string; title: string; scale?: string } | null
  nodes: MapCanvasNodeSummary[]
  viewport: MapCanvasViewport
  focalPoint?: MapCanvasPoint
  focusRadius?: number
}): MapZoomTransitionResult {
  const fromScale = normalizeCanonicalScale(input.currentScale)
  const focal = input.focalPoint ?? { x: 50, y: 50 }
  const radius = input.focusRadius ?? 38

  const drillableNodes = input.nodes.filter((node) => node.drillable && node.targetLocationId)
  let closestNode: MapCanvasNodeSummary | null = null
  let closestDist = Number.POSITIVE_INFINITY
  for (const node of drillableNodes) {
    const dist = Math.hypot(node.x - focal.x, node.y - focal.y)
    if (dist < closestDist) {
      closestDist = dist
      closestNode = node
    }
  }
  const focusedNode = closestNode && closestDist <= radius ? closestNode : (drillableNodes[0] ?? null)
  const { parentScale, childScale } = adjacentLocationScales(fromScale)

  if (input.viewport.zoom >= MAP_ZOOM_DRILL_DOWN_THRESHOLD && (focusedNode?.targetLocationId || childScale)) {
    const toScale = focusedNode?.targetScale ?? childScale ?? 'interior'
    return {
      action: 'drill-down',
      targetLocationId: focusedNode?.targetLocationId ?? null,
      targetLabel: focusedNode?.label ?? LOCATION_SCALE_METADATA[toScale].zh,
      fromScale,
      toScale,
      nextViewport: { x: 0, y: 0, zoom: 0.9 }
    }
  }

  if (input.viewport.zoom <= MAP_ZOOM_ROLL_UP_THRESHOLD && (input.parentLocation || parentScale)) {
    const toScale = input.parentLocation?.scale
      ? normalizeCanonicalScale(input.parentLocation.scale)
      : (parentScale ?? 'global')
    return {
      action: 'roll-up',
      targetLocationId: input.parentLocation?.id ?? null,
      targetLabel: input.parentLocation?.title ?? LOCATION_SCALE_METADATA[toScale].zh,
      fromScale,
      toScale,
      nextViewport: { x: 0, y: 0, zoom: 1.4 }
    }
  }

  const nearThreshold =
    input.viewport.zoom >= MAP_ZOOM_DRILL_DOWN_THRESHOLD - 0.35 && (focusedNode || childScale)
      ? 'drill-down'
      : input.viewport.zoom <= MAP_ZOOM_ROLL_UP_THRESHOLD + 0.15 && (input.parentLocation || parentScale)
        ? 'roll-up'
        : null

  return {
    action: 'stay',
    viewport: input.viewport,
    nearThreshold,
    focusedTargetId: focusedNode?.targetLocationId ?? null
  }
}

export interface FloorPlanRoomZone {
  id: string
  label: string
  roomType: LocationDiagramRoomType
  floor: string
  x: number
  y: number
  width: number
  height: number
  fillColor: string
  outerWallStrokeWidth: number
  partitionWallStrokeWidth: number
  targetLocationId: string | null
  itemId: string | null
}

export interface FloorPlanOpening {
  id: string
  fromId: string
  toId: string
  label: string
  edgeType: LocationDiagramEdgeType
  x1: number
  y1: number
  x2: number
  y2: number
  midX: number
  midY: number
}

export interface InteriorFloorPlanModel {
  availableFloors: string[]
  activeFloor: string
  rooms: FloorPlanRoomZone[]
  openings: FloorPlanOpening[]
}

export const ROOM_TYPE_STYLE: Record<LocationDiagramRoomType, { zh: string; en: string; fill: string }> = {
  hall: { zh: '正厅/主堂', en: 'Main Hall', fill: '#FAF6EE' },
  study: { zh: '书房/要地', en: 'Study', fill: '#EEF5F6' },
  bedroom: { zh: '卧房/起居', en: 'Bedroom', fill: '#FDF8F2' },
  secret: { zh: '暗室/密室', en: 'Secret Room', fill: '#EAE6E3' },
  corridor: { zh: '走廊/动线', en: 'Corridor', fill: '#F4F4F2' },
  courtyard: { zh: '庭院/天井', en: 'Courtyard', fill: '#EFF6EE' },
  kitchen: { zh: '膳房/库房', en: 'Kitchen / Storage', fill: '#F9F3EC' },
  gate: { zh: '门厅/玄关', en: 'Entrance / Gate', fill: '#F3EFEA' },
  other: { zh: '普通房间', en: 'Room', fill: '#F8F7F4' }
}

export const EDGE_OPENING_LABELS: Record<LocationDiagramEdgeType, { zh: string; en: string }> = {
  single_door: { zh: '单开门', en: 'Single Door' },
  double_door: { zh: '双开大门', en: 'Double Door' },
  sliding_door: { zh: '推拉门/隔扇', en: 'Sliding Door' },
  archway: { zh: '拱门/月亮门', en: 'Archway' },
  window: { zh: '窗户', en: 'Window' },
  secret_door: { zh: '隐藏暗门', en: 'Secret Door' },
  passage: { zh: '走廊通道', en: 'Passage' },
  wall: { zh: '实墙隔断', en: 'Solid Wall' }
}

export const DEFAULT_FLOOR_LEVELS = ['B2', 'B1', '1F', '2F', '3F', '顶层'] as const

/**
 * Builds the architectural floor-plan view model for an `interior` (or `cluster`) location.
 */
export function buildInteriorFloorPlanModel(input: {
  nodes: LocationDiagramNode[]
  edges: LocationDiagramEdge[]
  defaultFloor?: string
  selectedFloor?: string
}): InteriorFloorPlanModel {
  const discoveredFloors = new Set<string>()
  if (input.defaultFloor?.trim()) discoveredFloors.add(input.defaultFloor.trim())
  for (const node of input.nodes) {
    if (node.floor?.trim()) discoveredFloors.add(node.floor.trim())
  }
  if (discoveredFloors.size === 0) {
    discoveredFloors.add('1F')
  }
  const availableFloors = Array.from(discoveredFloors).sort((a, b) => {
    const idxA = DEFAULT_FLOOR_LEVELS.indexOf(a as (typeof DEFAULT_FLOOR_LEVELS)[number])
    const idxB = DEFAULT_FLOOR_LEVELS.indexOf(b as (typeof DEFAULT_FLOOR_LEVELS)[number])
    if (idxA >= 0 && idxB >= 0) return idxA - idxB
    if (idxA >= 0) return -1
    if (idxB >= 0) return 1
    return a.localeCompare(b, 'zh-CN')
  })

  const activeFloor =
    input.selectedFloor && availableFloors.includes(input.selectedFloor)
      ? input.selectedFloor
      : (availableFloors[0] ?? '1F')

  const filteredNodes = input.nodes.filter((node) => {
    const nodeFloor = node.floor?.trim() || input.defaultFloor?.trim() || '1F'
    return nodeFloor === activeFloor
  })

  const rooms: FloorPlanRoomZone[] = filteredNodes.map((node) => {
    const roomType: LocationDiagramRoomType = node.room_type ?? 'other'
    const width = Math.max(10, Math.min(60, Number(node.width ?? 22)))
    const height = Math.max(8, Math.min(50, Number(node.height ?? 16)))
    const x = Math.max(width / 2 + 2, Math.min(98 - width / 2, Number(node.x || 50)))
    const y = Math.max(height / 2 + 2, Math.min(98 - height / 2, Number(node.y || 50)))
    return {
      id: node.id,
      label: node.label,
      roomType,
      floor: node.floor?.trim() || activeFloor,
      x,
      y,
      width,
      height,
      fillColor: ROOM_TYPE_STYLE[roomType].fill,
      outerWallStrokeWidth: roomType === 'secret' || roomType === 'hall' ? 1.2 : 0.9,
      partitionWallStrokeWidth: 0.55,
      targetLocationId: node.target_location ?? null,
      itemId: node.item_id ?? null
    }
  })

  const roomById = new Map(rooms.map((room) => [room.id, room]))
  const openings: FloorPlanOpening[] = []
  input.edges.forEach((edge, index) => {
    const fromRoom = roomById.get(edge.from)
    const toRoom = roomById.get(edge.to)
    if (!fromRoom || !toRoom) return
    const edgeType: LocationDiagramEdgeType = edge.edge_type ?? 'single_door'
    openings.push({
      id: `${edge.from}-${edge.to}-${index}`,
      fromId: edge.from,
      toId: edge.to,
      label: edge.label || EDGE_OPENING_LABELS[edgeType].zh,
      edgeType,
      x1: fromRoom.x,
      y1: fromRoom.y,
      x2: toRoom.x,
      y2: toRoom.y,
      midX: Number(((fromRoom.x + toRoom.x) / 2).toFixed(2)),
      midY: Number(((fromRoom.y + toRoom.y) / 2).toFixed(2))
    })
  })

  return {
    availableFloors,
    activeFloor,
    rooms,
    openings
  }
}
