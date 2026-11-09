import { useEffect, useMemo, useState, type CSSProperties, type WheelEvent } from 'react'
import {
  ArrowUpLeft,
  Compass,
  Edit3,
  Layers,
  MapPin,
  Package,
  RotateCcw,
  User,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import {
  EDGE_OPENING_LABELS,
  LOCATION_SCALE_METADATA,
  MAP_ZOOM_DRILL_DOWN_THRESHOLD,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  MAP_ZOOM_ROLL_UP_THRESHOLD,
  ROOM_TYPE_STYLE,
  buildInteriorFloorPlanModel,
  computeFocalZoomViewport,
  evaluateMapZoomTransition,
  isLocationMounted,
  normalizeCanonicalScale,
  type CanonicalLocationScale,
  type MapCanvasNodeSummary,
  type MapCanvasViewport
} from '@quillarium/core/browser-contracts'
import type { LocationDiagramEdge, LocationDiagramNode, LocationDiagramRoomType } from '@quillarium/core'
import type { DocEntry, LanguageName, TargetSelection } from '../../app/types.js'
import { LocationMapEditorModal } from './LocationMapEditorModal.js'

export interface LocationMapCanvasProps {
  current: DocEntry
  ancestors: DocEntry[]
  childrenLocations: DocEntry[]
  layouts: DocEntry[]
  allItems: DocEntry[]
  selectedTarget: TargetSelection | null
  onSelect: (target: TargetSelection) => void
  onSaveDoc?: (docEntry: DocEntry, nextData: Record<string, unknown>) => Promise<void>
  language: LanguageName
}

function autoCompassPosition(index: number, count: number, radius = 32): { x: number; y: number } {
  if (count <= 0) return { x: 50, y: 50 }
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  return {
    x: Number((50 + Math.cos(angle) * radius).toFixed(1)),
    y: Number((50 + Math.sin(angle) * radius).toFixed(1))
  }
}

export function LocationMapCanvas({
  current,
  ancestors,
  layouts,
  allItems,
  onSelect,
  onSaveDoc,
  language
}: LocationMapCanvasProps) {
  const zh = language === 'zh'
  const activeLayout = layouts[0] ?? current
  const derivedScale: CanonicalLocationScale = normalizeCanonicalScale(
    String(current.data.map_layer || current.data.scale || 'city')
  )
  const [activeLayer, setActiveLayer] = useState<CanonicalLocationScale>(derivedScale)
  const [viewport, setViewport] = useState<MapCanvasViewport>({ x: 50, y: 50, zoom: 1 })
  const [selectedFloor, setSelectedFloor] = useState<string>(
    String(activeLayout.data.floor || current.data.floor || '1F')
  )
  const [selectedFocusNodeId, setSelectedFocusNodeId] = useState<string | null>(null)
  const [transitionHint, setTransitionHint] = useState<string>('')
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    setActiveLayer(normalizeCanonicalScale(String(current.data.map_layer || current.data.scale || 'city')))
    setViewport({ x: 50, y: 50, zoom: 1 })
  }, [current.data.id, current.data.map_layer, current.data.scale])

  const scaleMeta = LOCATION_SCALE_METADATA[activeLayer]
  const parentDoc = ancestors.at(-1) ?? null
  const isFloorPlanMode = scaleMeta.isFloorPlan

  const rawDiagramNodes: LocationDiagramNode[] = useMemo(() => {
    const explicit = Array.isArray(activeLayout.data.diagram_nodes)
      ? (activeLayout.data.diagram_nodes as LocationDiagramNode[])
      : []
    if (explicit.length > 0) return explicit
    const currentNodes = Array.isArray(current.data.diagram_nodes)
      ? (current.data.diagram_nodes as LocationDiagramNode[])
      : []
    return currentNodes
  }, [activeLayout.data.diagram_nodes, current.data.diagram_nodes])

  const rawDiagramEdges: LocationDiagramEdge[] = useMemo(() => {
    const explicit = Array.isArray(activeLayout.data.diagram_edges)
      ? (activeLayout.data.diagram_edges as LocationDiagramEdge[])
      : []
    if (explicit.length > 0) return explicit
    const currentEdges = Array.isArray(current.data.diagram_edges)
      ? (current.data.diagram_edges as LocationDiagramEdge[])
      : []
    return currentEdges
  }, [activeLayout.data.diagram_edges, current.data.diagram_edges])

  const positionLocations = useMemo(
    () => allItems.filter((item) => item.data.type === 'location' && item.data.kind !== 'layout'),
    [allItems]
  )

  const unmountedLocations = useMemo(
    () => positionLocations.filter((loc) => !isLocationMounted(loc.data)),
    [positionLocations]
  )

  const mountedLocationsOnActiveLayer = useMemo(
    () =>
      positionLocations.filter(
        (loc) =>
          isLocationMounted(loc.data) && normalizeCanonicalScale(String(loc.data.map_layer)) === activeLayer
      ),
    [positionLocations, activeLayer]
  )

  const allLocationsById = useMemo(
    () => new Map(positionLocations.map((loc) => [loc.data.id, loc] as const)),
    [positionLocations]
  )

  // Only render locations that are explicitly mounted on activeLayer + explicit diagram_nodes
  const canvasNodes: MapCanvasNodeSummary[] = useMemo(() => {
    const placedTargetIds = new Set<string>()
    const summaries: MapCanvasNodeSummary[] = []

    for (const loc of mountedLocationsOnActiveLayer) {
      placedTargetIds.add(loc.data.id)
      summaries.push({
        id: loc.data.id,
        label: loc.data.title,
        x: Number(loc.data.map_x ?? 50),
        y: Number(loc.data.map_y ?? 50),
        floor: String(loc.data.floor || '1F'),
        targetLocationId: loc.data.id,
        targetScale: normalizeCanonicalScale(String(loc.data.map_layer || loc.data.scale)),
        drillable: true,
        roomType: (loc.data.map_room_type as LocationDiagramRoomType | undefined) ?? 'hall',
        width: Number(loc.data.map_width ?? 24),
        height: Number(loc.data.map_height ?? 16),
        itemId: null
      })
    }

    rawDiagramNodes.forEach((node, idx) => {
      const targetId = node.target_location ? String(node.target_location) : null
      if (targetId && placedTargetIds.has(targetId)) return
      const targetDoc = targetId ? allLocationsById.get(targetId) : null
      const pos = autoCompassPosition(idx, Math.max(1, rawDiagramNodes.length))
      summaries.push({
        id: String(node.id || `node-${idx + 1}`),
        label: String(node.label || targetDoc?.data.title || node.id || idx + 1),
        x: Number.isFinite(Number(node.x)) ? Number(node.x) : pos.x,
        y: Number.isFinite(Number(node.y)) ? Number(node.y) : pos.y,
        floor: String(node.floor ?? ''),
        targetLocationId: targetId,
        targetScale: targetDoc ? normalizeCanonicalScale(String(targetDoc.data.scale)) : null,
        drillable: Boolean(targetId),
        roomType: node.room_type,
        width: node.width,
        height: node.height,
        itemId: node.item_id ?? null
      })
    })

    return summaries
  }, [mountedLocationsOnActiveLayer, rawDiagramNodes, allLocationsById])

  const floorPlanModel = useMemo(() => {
    const synthesizedNodes: LocationDiagramNode[] = canvasNodes.map((n) => ({
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      floor: n.floor || '1F',
      target_location: n.targetLocationId,
      room_type: n.roomType ?? 'hall',
      width: n.width ?? 24,
      height: n.height ?? 16,
      item_id: n.itemId ?? null
    }))
    return buildInteriorFloorPlanModel({
      nodes: synthesizedNodes,
      edges: rawDiagramEdges,
      defaultFloor: String(current.data.floor || '1F'),
      selectedFloor
    })
  }, [canvasNodes, rawDiagramEdges, current.data.floor, selectedFloor])

  const visibleRoutes = useMemo(() => {
    const nodeByLocationId = new Map<string, MapCanvasNodeSummary>()
    for (const node of canvasNodes) {
      if (node.targetLocationId) {
        nodeByLocationId.set(node.targetLocationId, node)
      }
    }
    return allItems
      .filter((item) => item.data.type === 'route')
      .map((route) => {
        const fromNode = nodeByLocationId.get(String(route.data.from ?? ''))
        const toNode = nodeByLocationId.get(String(route.data.to ?? ''))
        if (!fromNode || !toNode) return null
        return {
          id: route.data.id,
          title: route.data.title,
          fromNode,
          toNode,
          distanceLi: route.data.distance_li ? Number(route.data.distance_li) : null,
          travelDays: route.data.travel_time_days ? Number(route.data.travel_time_days) : null
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [allItems, canvasNodes])

  const presentCharacters = useMemo(
    () =>
      allItems.filter((item) => {
        if (item.data.type !== 'character') return false
        const state = item.data.scene_state as Record<string, unknown> | undefined
        return state?.current_location === current.data.id
      }),
    [allItems, current.data.id]
  )

  const localItems = useMemo(
    () => allItems.filter((item) => item.data.type === 'item' && item.data.location_id === current.data.id),
    [allItems, current.data.id]
  )

  const focusedNode = useMemo(
    () =>
      canvasNodes.find((n) => n.id === selectedFocusNodeId) ?? canvasNodes.find((n) => n.drillable) ?? null,
    [canvasNodes, selectedFocusNodeId]
  )

  function applyZoomChange(nextZoom: number, focalPoint?: { x: number; y: number }) {
    const focal = focalPoint ?? (focusedNode ? { x: focusedNode.x, y: focusedNode.y } : { x: 50, y: 50 })
    const nextViewport = computeFocalZoomViewport(viewport, nextZoom, focal)
    const transition = evaluateMapZoomTransition({
      currentScale: activeLayer,
      parentLocation: parentDoc
        ? {
            id: parentDoc.data.id,
            title: parentDoc.data.title,
            scale: String(parentDoc.data.map_layer || parentDoc.data.scale || '')
          }
        : null,
      nodes: canvasNodes,
      viewport: nextViewport,
      focalPoint: focal
    })

    if (transition.action === 'drill-down') {
      setActiveLayer(transition.toScale)
      setViewport({ x: 50, y: 50, zoom: 1 })
      setTransitionHint(
        zh
          ? `已缩放穿透至下一级图层：${LOCATION_SCALE_METADATA[transition.toScale].zh}`
          : `Zoomed into ${LOCATION_SCALE_METADATA[transition.toScale].en}`
      )
      if (transition.targetLocationId) {
        onSelect({ type: 'location', id: transition.targetLocationId })
      }
      return
    }

    if (transition.action === 'roll-up') {
      setActiveLayer(transition.toScale)
      setViewport({ x: 50, y: 50, zoom: 1 })
      setTransitionHint(
        zh
          ? `已缩小返回上一级图层：${LOCATION_SCALE_METADATA[transition.toScale].zh}`
          : `Zoomed out to ${LOCATION_SCALE_METADATA[transition.toScale].en}`
      )
      if (transition.targetLocationId) {
        onSelect({ type: 'location', id: transition.targetLocationId })
      }
      return
    }

    setViewport(transition.viewport)
    if (transition.nearThreshold === 'drill-down') {
      setTransitionHint(
        zh
          ? `继续放大至 ${Math.round(MAP_ZOOM_DRILL_DOWN_THRESHOLD * 100)}% 自动切入下一级图层`
          : `Zoom to ${Math.round(MAP_ZOOM_DRILL_DOWN_THRESHOLD * 100)}% to enter next layer`
      )
    } else if (transition.nearThreshold === 'roll-up') {
      setTransitionHint(
        zh
          ? `继续缩小至 ${Math.round(MAP_ZOOM_ROLL_UP_THRESHOLD * 100)}% 自动返回上一级图层`
          : `Zoom out to ${Math.round(MAP_ZOOM_ROLL_UP_THRESHOLD * 100)}% to return to upper layer`
      )
    } else {
      setTransitionHint('')
    }
  }

  function handleWheelZoom(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.25 : -0.25
    applyZoomChange(viewport.zoom + delta)
  }

  return (
    <div className="location-map-canvas-shell">
      {/* Compact Zoom & Map Editor Toolbar (No explicit 8-level button strip) */}
      <div className="location-map-toolbar">
        <div className="location-map-toolbar-left">
          {parentDoc && (
            <button
              type="button"
              className="secondary"
              onClick={() => onSelect({ type: 'location', id: parentDoc.data.id })}
              title={zh ? `返回上一级：${parentDoc.data.title}` : `Back to ${parentDoc.data.title}`}
            >
              <ArrowUpLeft size={14} /> {zh ? `上级：${parentDoc.data.title}` : parentDoc.data.title}
            </button>
          )}
          <span
            className="status-pill"
            title={zh ? '通过滚轮或缩放滑块直接变换地图层级' : 'Zoom to switch map layers'}
          >
            <Compass size={13} />{' '}
            {zh
              ? `当前视图：${scaleMeta.zh}（${scaleMeta.rangeZh}）`
              : `${scaleMeta.en} (${scaleMeta.rangeEn})`}
          </span>
          {unmountedLocations.length > 0 && (
            <span
              className="status-pill muted"
              title={zh ? '尚未挂载到图层的地点保留在待挂载地点池中' : 'Unmounted locations stay in the pool'}
            >
              {zh
                ? `待挂载地点池：${unmountedLocations.length}`
                : `Unmounted pool: ${unmountedLocations.length}`}
            </span>
          )}
        </div>

        {isFloorPlanMode && (
          <div
            className="icon-segment floor-selector-pills"
            role="group"
            aria-label={zh ? '楼层切换' : 'Floor selector'}
          >
            <Layers size={14} />
            {floorPlanModel.availableFloors.map((fl) => (
              <button
                key={fl}
                type="button"
                className={floorPlanModel.activeFloor === fl ? 'active' : ''}
                onClick={() => setSelectedFloor(fl)}
              >
                {fl}
              </button>
            ))}
          </div>
        )}

        <div className="location-map-zoom-controls">
          <button
            type="button"
            className="secondary"
            aria-label={zh ? '缩小地图' : 'Zoom out'}
            onClick={() => applyZoomChange(viewport.zoom - 0.3)}
            title={zh ? '缩小（≤60% 自动切换到上一级图层）' : 'Zoom out (≤60% switches to upper layer)'}
          >
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={MAP_ZOOM_MIN}
            max={MAP_ZOOM_MAX}
            step={0.05}
            value={viewport.zoom}
            aria-label={zh ? '地图缩放比例' : 'Map zoom ratio'}
            onChange={(e) => applyZoomChange(Number(e.target.value))}
          />
          <span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
          <button
            type="button"
            className="secondary"
            aria-label={zh ? '放大地图' : 'Zoom in'}
            onClick={() => applyZoomChange(viewport.zoom + 0.3)}
            title={zh ? '放大（≥220% 自动切换到下一级图层）' : 'Zoom in (≥220% switches to finer layer)'}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setViewport({ x: 50, y: 50, zoom: 1 })
              setTransitionHint('')
            }}
            title={zh ? '重置缩放视口' : 'Reset zoom'}
          >
            <RotateCcw size={13} />
          </button>
          <button type="button" className="primary" onClick={() => setEditorOpen(true)}>
            <Edit3 size={14} /> {zh ? '打开地图编辑器' : 'Open Map Editor'}
          </button>
        </div>
      </div>

      {transitionHint && (
        <div className="location-map-transition-banner" role="status">
          {transitionHint}
        </div>
      )}

      {/* Main Pure Zoom Map / Architectural Floor Plan Viewport */}
      <div
        className={`location-diagram-canvas google-style-map-viewport ${
          isFloorPlanMode ? 'is-floor-plan-canvas' : 'is-macro-map-canvas'
        }`}
        onWheel={handleWheelZoom}
      >
        <div
          className="location-map-transform-stage"
          style={
            {
              transform: `scale(${viewport.zoom})`,
              transformOrigin: `${viewport.x}% ${viewport.y}%`
            } as CSSProperties
          }
        >
          {isFloorPlanMode ? (
            <>
              <svg
                viewBox="0 0 100 100"
                className="floor-plan-svg"
                aria-label={zh ? '室内房型平面图' : 'Architectural floor plan'}
              >
                <defs>
                  <pattern id="floor-grid" width="5" height="5" patternUnits="userSpaceOnUse">
                    <path
                      d="M 5 0 L 0 0 0 5"
                      fill="none"
                      stroke="rgba(120, 120, 120, 0.14)"
                      strokeWidth="0.2"
                    />
                  </pattern>
                </defs>
                <rect x="2" y="2" width="96" height="96" fill="url(#floor-grid)" rx="1.5" />

                {floorPlanModel.rooms.map((room) => (
                  <g key={room.id} className="floor-plan-room-group">
                    <rect
                      x={room.x - room.width / 2}
                      y={room.y - room.height / 2}
                      width={room.width}
                      height={room.height}
                      fill={room.fillColor}
                      stroke="#1A1A1A"
                      strokeWidth={room.outerWallStrokeWidth}
                    />
                    <rect
                      x={room.x - room.width / 2 + 0.8}
                      y={room.y - room.height / 2 + 0.8}
                      width={Math.max(1, room.width - 1.6)}
                      height={Math.max(1, room.height - 1.6)}
                      fill="none"
                      stroke="#666666"
                      strokeWidth={room.partitionWallStrokeWidth}
                      strokeDasharray={room.roomType === 'secret' ? '1.2 0.8' : undefined}
                    />
                  </g>
                ))}

                {floorPlanModel.openings.map((opening) => (
                  <g key={opening.id} className={`floor-plan-opening opening-${opening.edgeType}`}>
                    <line
                      x1={opening.x1}
                      y1={opening.y1}
                      x2={opening.x2}
                      y2={opening.y2}
                      stroke={opening.edgeType === 'secret_door' ? '#8B3A3A' : '#2C5E7A'}
                      strokeWidth={opening.edgeType === 'wall' ? '1.1' : '0.65'}
                      strokeDasharray={
                        opening.edgeType === 'secret_door'
                          ? '1.5 1'
                          : opening.edgeType === 'window'
                            ? '0.6 0.6'
                            : undefined
                      }
                    />
                    <circle
                      cx={opening.midX}
                      cy={opening.midY}
                      r="2.1"
                      fill="#FFFFFF"
                      stroke="#1A1A1A"
                      strokeWidth="0.45"
                    />
                  </g>
                ))}
              </svg>

              {floorPlanModel.rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className={`location-diagram-node floor-plan-room-node ${
                    selectedFocusNodeId === room.id ? 'is-focused' : ''
                  }`}
                  style={
                    {
                      '--diagram-x': `${room.x}%`,
                      '--diagram-y': `${room.y}%`
                    } as CSSProperties
                  }
                  onClick={() => {
                    setSelectedFocusNodeId(room.id)
                    if (room.targetLocationId) {
                      onSelect({ type: 'location', id: room.targetLocationId })
                    }
                  }}
                >
                  <strong>{room.label}</strong>
                  <small>
                    {ROOM_TYPE_STYLE[room.roomType][zh ? 'zh' : 'en']} · {room.floor}
                  </small>
                </button>
              ))}

              {floorPlanModel.openings.map((opening) => (
                <span
                  key={`label-${opening.id}`}
                  className="floor-plan-opening-badge"
                  style={
                    {
                      left: `${opening.midX}%`,
                      top: `${opening.midY}%`
                    } as CSSProperties
                  }
                >
                  {opening.label || EDGE_OPENING_LABELS[opening.edgeType][zh ? 'zh' : 'en']}
                </span>
              ))}
            </>
          ) : (
            <>
              <svg viewBox="0 0 100 100" aria-hidden="true" className="macro-map-svg">
                {visibleRoutes.map((route) => (
                  <g key={route.id}>
                    <line
                      x1={route.fromNode.x}
                      y1={route.fromNode.y}
                      x2={route.toNode.x}
                      y2={route.toNode.y}
                      stroke="#2B6CB0"
                      strokeWidth="0.7"
                      strokeDasharray="2 1"
                    />
                  </g>
                ))}

                {rawDiagramEdges.map((edge, index) => {
                  const from = canvasNodes.find((n) => n.id === String(edge.from))
                  const to = canvasNodes.find((n) => n.id === String(edge.to))
                  if (!from || !to) return null
                  return (
                    <line
                      key={`${String(edge.from)}-${String(edge.to)}-${index}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#4A5568"
                      strokeWidth="0.6"
                    />
                  )
                })}
              </svg>

              {visibleRoutes.map((route) => (
                <span
                  key={`route-badge-${route.id}`}
                  className="map-route-badge"
                  style={
                    {
                      left: `${(route.fromNode.x + route.toNode.x) / 2}%`,
                      top: `${(route.fromNode.y + route.toNode.y) / 2}%`
                    } as CSSProperties
                  }
                >
                  {route.title}
                  {route.distanceLi ? ` · ${route.distanceLi}${zh ? '里' : ' li'}` : ''}
                  {route.travelDays ? ` (${route.travelDays}${zh ? '日' : 'd'})` : ''}
                </span>
              ))}

              {canvasNodes.map((node) => {
                const isFocused = selectedFocusNodeId === node.id || focusedNode?.id === node.id
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`location-diagram-node ${isFocused ? 'is-focused' : ''} ${
                      node.drillable ? 'is-drillable' : ''
                    }`}
                    style={
                      {
                        '--diagram-x': `${Math.max(5, Math.min(95, node.x))}%`,
                        '--diagram-y': `${Math.max(5, Math.min(95, node.y))}%`
                      } as CSSProperties
                    }
                    onClick={() => {
                      setSelectedFocusNodeId(node.id)
                      setViewport((v) => ({ ...v, x: node.x, y: node.y }))
                      if (node.targetLocationId) {
                        onSelect({ type: 'location', id: node.targetLocationId })
                      }
                    }}
                    onDoubleClick={() => {
                      if (node.targetLocationId) {
                        onSelect({ type: 'location', id: node.targetLocationId })
                      }
                    }}
                  >
                    <strong>
                      <MapPin size={12} /> {node.label}
                    </strong>
                    {node.floor ? <small>{node.floor}</small> : null}
                  </button>
                )
              })}

              {!canvasNodes.length && (
                <div className="compass-overview empty-layer-watermark">
                  <span className="compass-north">{zh ? '北' : 'N'}</span>
                  <strong className="compass-center">{scaleMeta[zh ? 'zh' : 'en']}</strong>
                  <small>
                    {zh
                      ? '当前图层尚无已挂载地点。滚轮缩放可切换相邻图层，或点击右上角「打开地图编辑器」从待挂载地点池挂载地点。'
                      : 'No locations mounted on this layer yet. Zoom to switch layers or click Open Map Editor to mount locations.'}
                  </small>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom-right Scale Ruler Watermark */}
        <div className="map-scale-ruler-overlay">
          <span className="scale-ruler-line" />
          <small>
            {zh ? `${scaleMeta.zh} · ${scaleMeta.rangeZh}` : `${scaleMeta.en} · ${scaleMeta.rangeEn}`} ·{' '}
            {Math.round(viewport.zoom * 100)}%
          </small>
        </div>
      </div>

      {(presentCharacters.length > 0 || localItems.length > 0) && (
        <div className="location-map-presence-bar">
          {presentCharacters.length > 0 && (
            <div className="presence-group">
              <strong>
                <User size={13} /> {zh ? '在场人物：' : 'Present Characters:'}
              </strong>
              {presentCharacters.map((ch) => (
                <button
                  key={ch.data.id}
                  type="button"
                  className="secondary"
                  onClick={() => onSelect({ type: 'character', id: ch.data.id })}
                >
                  {ch.data.title}
                </button>
              ))}
            </div>
          )}
          {localItems.length > 0 && (
            <div className="presence-group">
              <strong>
                <Package size={13} /> {zh ? '此处关键道具：' : 'Items Here:'}
              </strong>
              {localItems.map((it) => (
                <button
                  key={it.data.id}
                  type="button"
                  className="secondary"
                  onClick={() => onSelect({ type: 'item', id: it.data.id })}
                >
                  {it.data.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {editorOpen && (
        <LocationMapEditorModal
          initialLayer={activeLayer}
          currentLocation={current}
          activeLayout={activeLayout}
          allItems={allItems}
          language={language}
          onClose={() => setEditorOpen(false)}
          onSaveDoc={
            onSaveDoc ??
            (async () => {
              // No-op fallback in static test renders without bridge
            })
          }
        />
      )}
    </div>
  )
}
