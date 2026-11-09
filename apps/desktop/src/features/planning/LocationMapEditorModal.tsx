import { useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react'
import {
  Compass,
  DoorOpen,
  Layers,
  MapPin,
  Move,
  Plus,
  Trash2,
  Unlink,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import {
  CANONICAL_LOCATION_SCALES,
  DEFAULT_FLOOR_LEVELS,
  EDGE_OPENING_LABELS,
  LOCATION_SCALE_METADATA,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  ROOM_TYPE_STYLE,
  buildInteriorFloorPlanModel,
  evaluateMapZoomTransition,
  isLocationMounted,
  normalizeCanonicalScale,
  type CanonicalLocationScale,
  type MapCanvasNodeSummary,
  type MapCanvasViewport
} from '@quillarium/core/browser-contracts'
import type {
  LocationDiagramEdge,
  LocationDiagramEdgeType,
  LocationDiagramNode,
  LocationDiagramRoomType
} from '@quillarium/core'
import type { DocEntry, LanguageName } from '../../app/types.js'
import { enumChoiceLabel } from '../metadata/field-presentation.js'

export interface LocationMapEditorModalProps {
  initialLayer: CanonicalLocationScale
  currentLocation: DocEntry
  activeLayout: DocEntry
  allItems: DocEntry[]
  language: LanguageName
  onClose: () => void
  onSaveDoc: (docEntry: DocEntry, nextData: Record<string, unknown>) => Promise<void>
}

export function LocationMapEditorModal({
  initialLayer,
  currentLocation,
  activeLayout,
  allItems,
  language,
  onClose,
  onSaveDoc
}: LocationMapEditorModalProps) {
  const zh = language === 'zh'
  const [activeLayer, setActiveLayer] = useState<CanonicalLocationScale>(initialLayer)
  const [viewport, setViewport] = useState<MapCanvasViewport>({ x: 50, y: 50, zoom: 1 })
  const [selectedFloor, setSelectedFloor] = useState<string>(
    String(activeLayout.data.floor || currentLocation.data.floor || '1F')
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [draggingLocationId, setDraggingLocationId] = useState<string | null>(null)
  const [dragPreviewPos, setDragPreviewPos] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)

  // Custom diagram node / edge states
  const [newNodeLabel, setNewNodeLabel] = useState('')
  const [newNodeRoomType, setNewNodeRoomType] = useState<LocationDiagramRoomType>('hall')
  const [newEdgeFrom, setNewEdgeFrom] = useState('')
  const [newEdgeTo, setNewEdgeTo] = useState('')
  const [newEdgeType, setNewEdgeType] = useState<LocationDiagramEdgeType>('single_door')
  const [newEdgeLabel, setNewEdgeLabel] = useState('')

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const scaleMeta = LOCATION_SCALE_METADATA[activeLayer]
  const isFloorPlanMode = scaleMeta.isFloorPlan

  const positionLocations = useMemo(
    () => allItems.filter((item) => item.data.type === 'location' && item.data.kind !== 'layout'),
    [allItems]
  )

  const unmountedLocations = useMemo(
    () => positionLocations.filter((loc) => !isLocationMounted(loc.data)),
    [positionLocations]
  )

  const mountedOnActiveLayer = useMemo(
    () =>
      positionLocations.filter(
        (loc) =>
          isLocationMounted(loc.data) && normalizeCanonicalScale(String(loc.data.map_layer)) === activeLayer
      ),
    [positionLocations, activeLayer]
  )

  const rawDiagramNodes: LocationDiagramNode[] = useMemo(
    () =>
      Array.isArray(activeLayout.data.diagram_nodes)
        ? (activeLayout.data.diagram_nodes as LocationDiagramNode[])
        : [],
    [activeLayout.data.diagram_nodes]
  )

  const rawDiagramEdges: LocationDiagramEdge[] = useMemo(
    () =>
      Array.isArray(activeLayout.data.diagram_edges)
        ? (activeLayout.data.diagram_edges as LocationDiagramEdge[])
        : [],
    [activeLayout.data.diagram_edges]
  )

  const editorNodes: MapCanvasNodeSummary[] = useMemo(() => {
    const list: MapCanvasNodeSummary[] = mountedOnActiveLayer.map((loc) => {
      const isDragging = draggingLocationId === loc.data.id && dragPreviewPos
      return {
        id: loc.data.id,
        label: loc.data.title,
        x: isDragging ? dragPreviewPos.x : Number(loc.data.map_x ?? 50),
        y: isDragging ? dragPreviewPos.y : Number(loc.data.map_y ?? 50),
        floor: String(loc.data.floor || '1F'),
        targetLocationId: loc.data.id,
        targetScale: activeLayer,
        drillable: true,
        roomType: (loc.data.map_room_type as LocationDiagramRoomType | undefined) ?? 'hall',
        width: Number(loc.data.map_width ?? 24),
        height: Number(loc.data.map_height ?? 16),
        itemId: null
      }
    })

    for (const [idx, node] of rawDiagramNodes.entries()) {
      list.push({
        id: String(node.id || `node-${idx + 1}`),
        label: String(node.label || node.id || idx + 1),
        x: Number(node.x ?? 50),
        y: Number(node.y ?? 50),
        floor: String(node.floor || '1F'),
        targetLocationId: node.target_location ? String(node.target_location) : null,
        targetScale: activeLayer,
        drillable: Boolean(node.target_location),
        roomType: node.room_type ?? 'hall',
        width: node.width ?? 22,
        height: node.height ?? 16,
        itemId: node.item_id ?? null
      })
    }
    return list
  }, [mountedOnActiveLayer, rawDiagramNodes, activeLayer, draggingLocationId, dragPreviewPos])

  const floorPlanModel = useMemo(() => {
    const synthesizedNodes: LocationDiagramNode[] = editorNodes.map((n) => ({
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
      defaultFloor: selectedFloor,
      selectedFloor
    })
  }, [editorNodes, rawDiagramEdges, selectedFloor])

  function applyEditorZoom(nextZoom: number) {
    const clamped = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, Number(nextZoom.toFixed(2))))
    const nextViewport = { ...viewport, zoom: clamped }
    const transition = evaluateMapZoomTransition({
      currentScale: activeLayer,
      parentLocation: null,
      nodes: editorNodes,
      viewport: nextViewport
    })
    if (transition.action === 'drill-down' || transition.action === 'roll-up') {
      setActiveLayer(transition.toScale)
      setViewport({ x: 50, y: 50, zoom: 1 })
      return
    }
    setViewport(nextViewport)
  }

  function clientPointToCanvasPercent(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return { x: 50, y: 50 }
    }
    const rawX = ((clientX - rect.left) / rect.width) * 100
    const rawY = ((clientY - rect.top) / rect.height) * 100
    return {
      x: Number(Math.max(6, Math.min(94, rawX)).toFixed(1)),
      y: Number(Math.max(6, Math.min(94, rawY)).toFixed(1))
    }
  }

  async function mountLocationToActiveLayer(loc: DocEntry, coords?: { x: number; y: number }) {
    setSaving(true)
    try {
      const idx = mountedOnActiveLayer.length
      const angle = (Math.PI * 2 * idx) / Math.max(1, idx + 4) - Math.PI / 2
      const defaultX = Number((50 + Math.cos(angle) * 26).toFixed(1))
      const defaultY = Number((50 + Math.sin(angle) * 26).toFixed(1))
      const x = coords?.x ?? defaultX
      const y = coords?.y ?? defaultY
      await onSaveDoc(loc, {
        ...loc.data,
        map_layer: activeLayer,
        map_x: x,
        map_y: y,
        floor: activeLayer === 'interior' ? String(loc.data.floor || selectedFloor) : loc.data.floor,
        map_width:
          activeLayer === 'interior' ? Number(loc.data.map_width || 24) : (loc.data.map_width ?? null),
        map_height:
          activeLayer === 'interior' ? Number(loc.data.map_height || 16) : (loc.data.map_height ?? null),
        map_room_type:
          activeLayer === 'interior'
            ? String(loc.data.map_room_type || 'hall')
            : (loc.data.map_room_type ?? null)
      })
      setSelectedNodeId(loc.data.id)
    } finally {
      setSaving(false)
    }
  }

  async function unmountLocation(loc: DocEntry) {
    setSaving(true)
    try {
      await onSaveDoc(loc, {
        ...loc.data,
        map_layer: null,
        map_x: null,
        map_y: null
      })
      if (selectedNodeId === loc.data.id) {
        setSelectedNodeId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function updateMountedLocationFields(loc: DocEntry, patch: Record<string, unknown>) {
    setSaving(true)
    try {
      await onSaveDoc(loc, {
        ...loc.data,
        ...patch
      })
    } finally {
      setSaving(false)
    }
  }

  function handleCanvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const droppedLocationId = event.dataTransfer.getData('text/quillarium-location-id')
    if (!droppedLocationId) return
    const loc = positionLocations.find((item) => item.data.id === droppedLocationId)
    if (!loc) return
    const coords = clientPointToCanvasPercent(event.clientX, event.clientY)
    void mountLocationToActiveLayer(loc, coords)
  }

  function handleNodePointerDown(event: PointerEvent<HTMLButtonElement>, locationId: string) {
    const loc = mountedOnActiveLayer.find((item) => item.data.id === locationId)
    if (!loc) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingLocationId(locationId)
    setSelectedNodeId(locationId)
    setDragPreviewPos({
      x: Number(loc.data.map_x ?? 50),
      y: Number(loc.data.map_y ?? 50)
    })
  }

  function handleNodePointerMove(event: PointerEvent<HTMLButtonElement>, locationId: string) {
    if (draggingLocationId !== locationId) return
    setDragPreviewPos(clientPointToCanvasPercent(event.clientX, event.clientY))
  }

  async function handleNodePointerUp(event: PointerEvent<HTMLButtonElement>, locationId: string) {
    if (draggingLocationId !== locationId) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const finalPos = dragPreviewPos
    setDraggingLocationId(null)
    setDragPreviewPos(null)
    const loc = mountedOnActiveLayer.find((item) => item.data.id === locationId)
    if (loc && finalPos) {
      await updateMountedLocationFields(loc, {
        map_x: finalPos.x,
        map_y: finalPos.y
      })
    }
  }

  async function handleAddDiagramNode() {
    if (!newNodeLabel.trim()) return
    setSaving(true)
    try {
      const nextNode: LocationDiagramNode = {
        id: `room-${Date.now().toString(36)}`,
        label: newNodeLabel.trim(),
        x: 50,
        y: 50,
        floor: isFloorPlanMode ? selectedFloor : '',
        target_location: null,
        room_type: isFloorPlanMode ? newNodeRoomType : 'other',
        width: isFloorPlanMode ? 24 : undefined,
        height: isFloorPlanMode ? 16 : undefined
      }
      await onSaveDoc(activeLayout, {
        ...activeLayout.data,
        diagram_nodes: [...rawDiagramNodes, nextNode]
      })
      setNewNodeLabel('')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDiagramEdge() {
    if (!newEdgeFrom || !newEdgeTo || newEdgeFrom === newEdgeTo) return
    setSaving(true)
    try {
      const nextEdge: LocationDiagramEdge = {
        from: newEdgeFrom,
        to: newEdgeTo,
        label: newEdgeLabel.trim() || EDGE_OPENING_LABELS[newEdgeType][zh ? 'zh' : 'en'],
        edge_type: newEdgeType
      }
      await onSaveDoc(activeLayout, {
        ...activeLayout.data,
        diagram_edges: [...rawDiagramEdges, nextEdge]
      })
      setNewEdgeLabel('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteDiagramEdge(index: number) {
    setSaving(true)
    try {
      await onSaveDoc(activeLayout, {
        ...activeLayout.data,
        diagram_edges: rawDiagramEdges.filter((_, idx) => idx !== index)
      })
    } finally {
      setSaving(false)
    }
  }

  const selectedMountedDoc = mountedOnActiveLayer.find((item) => item.data.id === selectedNodeId) ?? null

  return (
    <div
      className="modal-backdrop map-editor-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={zh ? '全屏地图编辑器' : 'Fullscreen Map Editor'}
    >
      <div className="modal-card map-editor-modal-card">
        <header className="map-editor-modal-header">
          <div className="map-editor-modal-title">
            <Compass size={18} />
            <div>
              <h2>{zh ? '全屏地图编辑器' : 'Fullscreen Map & Floor Plan Editor'}</h2>
              <p>
                {zh
                  ? '直接缩放画布自动切换图层（全图 ↔ 省 ↔ 市 ↔ 县 ↔ 镇 ↔ 街区 ↔ 组团 ↔ 室内房型图），将左侧待挂载地点拖入或点击挂载到当前图层，并可拖拽节点调整坐标。'
                  : 'Zoom to transition layers, mount locations from the unmounted pool onto the active layer, and drag nodes to adjust coordinates.'}
              </p>
            </div>
          </div>

          <div className="map-editor-modal-controls">
            <label className="map-editor-layer-Jump">
              <span>{zh ? '当前缩放图层：' : 'Active Layer:'}</span>
              <select
                aria-label={zh ? '编辑目标图层' : 'Target map layer'}
                value={activeLayer}
                onChange={(event) => {
                  setActiveLayer(event.target.value as CanonicalLocationScale)
                  setViewport({ x: 50, y: 50, zoom: 1 })
                }}
              >
                {CANONICAL_LOCATION_SCALES.map((scale) => {
                  const meta = LOCATION_SCALE_METADATA[scale]
                  return (
                    <option key={scale} value={scale}>
                      {zh ? `${meta.zh}（${meta.rangeZh}）` : `${meta.en} (${meta.rangeEn})`}
                    </option>
                  )
                })}
              </select>
            </label>

            {isFloorPlanMode && (
              <div
                className="icon-segment floor-selector-pills"
                role="group"
                aria-label={zh ? '楼层切换' : 'Floor switch'}
              >
                <Layers size={14} />
                {Array.from(
                  new Set([...DEFAULT_FLOOR_LEVELS.slice(1, 5), ...floorPlanModel.availableFloors])
                ).map((fl) => (
                  <button
                    key={fl}
                    type="button"
                    className={selectedFloor === fl ? 'active' : ''}
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
                onClick={() => applyEditorZoom(viewport.zoom - 0.3)}
                title={zh ? '缩小（达阈值切换上一图层）' : 'Zoom out'}
              >
                <ZoomOut size={14} />
              </button>
              <input
                type="range"
                min={MAP_ZOOM_MIN}
                max={MAP_ZOOM_MAX}
                step={0.05}
                value={viewport.zoom}
                onChange={(e) => applyEditorZoom(Number(e.target.value))}
              />
              <span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
              <button
                type="button"
                className="secondary"
                onClick={() => applyEditorZoom(viewport.zoom + 0.3)}
                title={zh ? '放大（达阈值切换下一图层）' : 'Zoom in'}
              >
                <ZoomIn size={14} />
              </button>
            </div>

            <button type="button" className="primary" onClick={onClose}>
              <X size={15} /> {zh ? '完成并关闭' : 'Done'}
            </button>
          </div>
        </header>

        <div className="map-editor-workbench-grid">
          {/* Left Sidebar: Unmounted Locations Pool & Mounted Locations on Active Layer */}
          <aside className="map-editor-pool-sidebar">
            <section className="map-editor-pool-section">
              <header>
                <strong>{zh ? '待挂载地点池' : 'Unmounted Locations Pool'}</strong>
                <span className="status-pill">{unmountedLocations.length}</span>
              </header>
              <small className="muted">
                {zh
                  ? '尚未挂载到任何图层的现有地点。可点击「挂载到当前图层」或直接拖拽到右侧地图画布。'
                  : 'Existing locations not yet mounted on any layer. Click Mount or drag onto the canvas.'}
              </small>
              <div className="map-editor-pool-list">
                {unmountedLocations.map((loc) => (
                  <div
                    key={loc.data.id}
                    className="map-editor-pool-item"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/quillarium-location-id', loc.data.id)
                    }}
                  >
                    <div>
                      <strong>{loc.data.title}</strong>
                      <small>{enumChoiceLabel('scale', String(loc.data.scale ?? 'city'), language)}</small>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      onClick={() => void mountLocationToActiveLayer(loc)}
                    >
                      <MapPin size={13} /> {zh ? '挂载到当前图层' : 'Mount here'}
                    </button>
                  </div>
                ))}
                {!unmountedLocations.length && (
                  <p className="empty-row">
                    {zh ? '所有地点均已挂载到图层。' : 'All locations are mounted on layers.'}
                  </p>
                )}
              </div>
            </section>

            <section className="map-editor-pool-section">
              <header>
                <strong>{zh ? `当前图层已挂载（${scaleMeta.zh}）` : `Mounted on ${scaleMeta.en}`}</strong>
                <span className="status-pill">{mountedOnActiveLayer.length}</span>
              </header>
              <div className="map-editor-pool-list">
                {mountedOnActiveLayer.map((loc) => (
                  <div
                    key={loc.data.id}
                    className={`map-editor-pool-item ${selectedNodeId === loc.data.id ? 'active' : ''}`}
                    onClick={() => setSelectedNodeId(loc.data.id)}
                  >
                    <div>
                      <strong>{loc.data.title}</strong>
                      <small>
                        X: {Number(loc.data.map_x ?? 50)}% · Y: {Number(loc.data.map_y ?? 50)}%
                        {isFloorPlanMode ? ` · ${String(loc.data.floor || '1F')}` : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="secondary"
                      disabled={saving}
                      title={zh ? '移回待挂载地点池' : 'Return to unmounted pool'}
                      onClick={(e) => {
                        e.stopPropagation()
                        void unmountLocation(loc)
                      }}
                    >
                      <Unlink size={13} /> {zh ? '卸载' : 'Unmount'}
                    </button>
                  </div>
                ))}
                {!mountedOnActiveLayer.length && (
                  <p className="empty-row">
                    {zh ? '当前图层尚未挂载地点。' : 'No locations mounted on this layer yet.'}
                  </p>
                )}
              </div>
            </section>
          </aside>

          {/* Center Interactive Map / Floor Plan Canvas */}
          <main className="map-editor-canvas-stage">
            <div
              ref={canvasRef}
              className={`location-diagram-canvas google-style-map-viewport map-editor-interactive-canvas ${
                isFloorPlanMode ? 'is-floor-plan-canvas' : 'is-macro-map-canvas'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleCanvasDrop}
              onWheel={(e) => {
                e.preventDefault()
                const delta = e.deltaY < 0 ? 0.22 : -0.22
                applyEditorZoom(viewport.zoom + delta)
              }}
            >
              <div
                className="location-map-transform-stage"
                style={
                  {
                    transform: `scale(${viewport.zoom})`,
                    transformOrigin: '50% 50%'
                  } as CSSProperties
                }
              >
                {isFloorPlanMode ? (
                  <>
                    <svg
                      viewBox="0 0 100 100"
                      className="floor-plan-svg"
                      aria-label={zh ? '室内房型图编辑画布' : 'Floor plan editor canvas'}
                    >
                      <defs>
                        <pattern id="editor-floor-grid" width="5" height="5" patternUnits="userSpaceOnUse">
                          <path
                            d="M 5 0 L 0 0 0 5"
                            fill="none"
                            stroke="rgba(120, 120, 120, 0.18)"
                            strokeWidth="0.22"
                          />
                        </pattern>
                      </defs>
                      <rect x="2" y="2" width="96" height="96" fill="url(#editor-floor-grid)" rx="1.5" />

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
                            strokeWidth="0.7"
                            strokeDasharray={opening.edgeType === 'secret_door' ? '1.5 1' : undefined}
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
                          selectedNodeId === room.id ? 'is-focused' : ''
                        }`}
                        style={
                          {
                            '--diagram-x': `${room.x}%`,
                            '--diagram-y': `${room.y}%`
                          } as CSSProperties
                        }
                        onPointerDown={(e) => handleNodePointerDown(e, room.id)}
                        onPointerMove={(e) => handleNodePointerMove(e, room.id)}
                        onPointerUp={(e) => void handleNodePointerUp(e, room.id)}
                        onClick={() => setSelectedNodeId(room.id)}
                      >
                        <strong>
                          <Move size={11} /> {room.label}
                        </strong>
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
                      <defs>
                        <pattern id="editor-macro-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                          <path
                            d="M 10 0 L 0 0 0 10"
                            fill="none"
                            stroke="rgba(120, 120, 120, 0.14)"
                            strokeWidth="0.2"
                          />
                        </pattern>
                      </defs>
                      <rect x="0" y="0" width="100" height="100" fill="url(#editor-macro-grid)" />

                      {rawDiagramEdges.map((edge, idx) => {
                        const from = editorNodes.find((n) => n.id === String(edge.from))
                        const to = editorNodes.find((n) => n.id === String(edge.to))
                        if (!from || !to) return null
                        return (
                          <line
                            key={`${edge.from}-${edge.to}-${idx}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke="#4A5568"
                            strokeWidth="0.65"
                          />
                        )
                      })}
                    </svg>

                    {editorNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        className={`location-diagram-node ${selectedNodeId === node.id ? 'is-focused' : ''}`}
                        style={
                          {
                            '--diagram-x': `${node.x}%`,
                            '--diagram-y': `${node.y}%`
                          } as CSSProperties
                        }
                        onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                        onPointerMove={(e) => handleNodePointerMove(e, node.id)}
                        onPointerUp={(e) => void handleNodePointerUp(e, node.id)}
                        onClick={() => setSelectedNodeId(node.id)}
                      >
                        <strong>
                          <Move size={11} /> {node.label}
                        </strong>
                        <small>
                          ({node.x}%, {node.y}%)
                        </small>
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="map-scale-ruler-overlay">
                <span className="scale-ruler-line" />
                <small>
                  {zh ? `${scaleMeta.zh} · ${scaleMeta.rangeZh}` : `${scaleMeta.en} · ${scaleMeta.rangeEn}`} ·{' '}
                  {Math.round(viewport.zoom * 100)}%
                </small>
              </div>
            </div>
          </main>

          {/* Right Inspector: Selected Node Coordinates / Room Sizing / Door & Edge Builder */}
          <aside className="map-editor-inspector-sidebar">
            {selectedMountedDoc ? (
              <section className="map-editor-inspector-card">
                <strong>
                  {zh
                    ? `已选地点：${selectedMountedDoc.data.title}`
                    : `Selected: ${selectedMountedDoc.data.title}`}
                </strong>
                <label>
                  <span>{zh ? '横坐标 X (%)' : 'X (%)'}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedMountedDoc.data.map_x ?? 50)}
                    onChange={(e) =>
                      void updateMountedLocationFields(selectedMountedDoc, {
                        map_x: Number(e.target.value)
                      })
                    }
                  />
                </label>
                <label>
                  <span>{zh ? '纵坐标 Y (%)' : 'Y (%)'}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={Number(selectedMountedDoc.data.map_y ?? 50)}
                    onChange={(e) =>
                      void updateMountedLocationFields(selectedMountedDoc, {
                        map_y: Number(e.target.value)
                      })
                    }
                  />
                </label>
                {isFloorPlanMode && (
                  <>
                    <label>
                      <span>{zh ? '房间功能分区' : 'Room type'}</span>
                      <select
                        value={String(selectedMountedDoc.data.map_room_type || 'hall')}
                        onChange={(e) =>
                          void updateMountedLocationFields(selectedMountedDoc, {
                            map_room_type: e.target.value
                          })
                        }
                      >
                        {(Object.keys(ROOM_TYPE_STYLE) as LocationDiagramRoomType[]).map((rt) => (
                          <option key={rt} value={rt}>
                            {ROOM_TYPE_STYLE[rt][zh ? 'zh' : 'en']}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{zh ? '房型宽度 (%)' : 'Width (%)'}</span>
                      <input
                        type="number"
                        min={8}
                        max={80}
                        value={Number(selectedMountedDoc.data.map_width ?? 24)}
                        onChange={(e) =>
                          void updateMountedLocationFields(selectedMountedDoc, {
                            map_width: Number(e.target.value)
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>{zh ? '房型高度 (%)' : 'Height (%)'}</span>
                      <input
                        type="number"
                        min={8}
                        max={80}
                        value={Number(selectedMountedDoc.data.map_height ?? 16)}
                        onChange={(e) =>
                          void updateMountedLocationFields(selectedMountedDoc, {
                            map_height: Number(e.target.value)
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </section>
            ) : (
              <section className="map-editor-inspector-card">
                <strong>{zh ? '节点位置调整' : 'Node Positioning'}</strong>
                <small className="muted">
                  {zh
                    ? '在画布中点击或按住拖拽任意已挂载地点，可实时调整其图层坐标与房型尺寸。'
                    : 'Click or drag any mounted node on the canvas to adjust its layer coordinates and room dimensions.'}
                </small>
              </section>
            )}

            <section className="map-editor-inspector-card">
              <strong>{zh ? '新增辅助房间 / 地标锚点' : 'Add Auxiliary Room / Landmark'}</strong>
              <input
                placeholder={zh ? '名称（如：正堂、城门）' : 'Label'}
                value={newNodeLabel}
                onChange={(e) => setNewNodeLabel(e.target.value)}
              />
              {isFloorPlanMode && (
                <select
                  value={newNodeRoomType}
                  onChange={(e) => setNewNodeRoomType(e.target.value as LocationDiagramRoomType)}
                >
                  {(Object.keys(ROOM_TYPE_STYLE) as LocationDiagramRoomType[]).map((rt) => (
                    <option key={rt} value={rt}>
                      {ROOM_TYPE_STYLE[rt][zh ? 'zh' : 'en']}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => void handleAddDiagramNode()}
              >
                <Plus size={14} /> {zh ? '添加锚点' : 'Add node'}
              </button>
            </section>

            <section className="map-editor-inspector-card">
              <strong>
                <DoorOpen size={14} />{' '}
                {isFloorPlanMode
                  ? zh
                    ? '门窗开口与暗门连接'
                    : 'Doors, Windows & Secret Passages'
                  : zh
                    ? '图层道路连接'
                    : 'Layer Connections'}
              </strong>
              <select value={newEdgeFrom} onChange={(e) => setNewEdgeFrom(e.target.value)}>
                <option value="">{zh ? '选择起点…' : 'From…'}</option>
                {editorNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <select value={newEdgeTo} onChange={(e) => setNewEdgeTo(e.target.value)}>
                <option value="">{zh ? '选择终点…' : 'To…'}</option>
                {editorNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label}
                  </option>
                ))}
              </select>
              <select
                value={newEdgeType}
                onChange={(e) => setNewEdgeType(e.target.value as LocationDiagramEdgeType)}
              >
                {(Object.keys(EDGE_OPENING_LABELS) as LocationDiagramEdgeType[]).map((et) => (
                  <option key={et} value={et}>
                    {EDGE_OPENING_LABELS[et][zh ? 'zh' : 'en']}
                  </option>
                ))}
              </select>
              <input
                placeholder={zh ? '连接标签（可选，如：书架暗门）' : 'Optional label'}
                value={newEdgeLabel}
                onChange={(e) => setNewEdgeLabel(e.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => void handleAddDiagramEdge()}
              >
                <Plus size={14} /> {zh ? '添加连接' : 'Add connection'}
              </button>

              {!!rawDiagramEdges.length && (
                <div className="map-editor-edge-list">
                  {rawDiagramEdges.map((edge, idx) => (
                    <div key={`${edge.from}-${edge.to}-${idx}`} className="map-editor-edge-row">
                      <small>
                        {edge.from} → {edge.to} ({edge.label || edge.edge_type || 'passage'})
                      </small>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => void handleDeleteDiagramEdge(idx)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
