import { describe, expect, it } from 'vitest'
import {
  CANONICAL_LOCATION_SCALES,
  MAP_ZOOM_DRILL_DOWN_THRESHOLD,
  MAP_ZOOM_ROLL_UP_THRESHOLD,
  adjacentLocationScales,
  buildInteriorFloorPlanModel,
  computeFocalZoomViewport,
  evaluateMapZoomTransition,
  normalizeCanonicalScale
} from './location-canvas.js'

describe('location-canvas (WB-22 8-level map & floor plan)', () => {
  it('defines the 8 canonical Google Maps-style location scales and normalizes legacy aliases', () => {
    expect(CANONICAL_LOCATION_SCALES).toEqual([
      'global',
      'province',
      'city',
      'county',
      'town',
      'district',
      'cluster',
      'interior'
    ])
    expect(normalizeCanonicalScale('region')).toBe('province')
    expect(normalizeCanonicalScale('estate')).toBe('cluster')
    expect(adjacentLocationScales('city')).toEqual({
      current: 'city',
      level: 3,
      parentScale: 'province',
      childScale: 'county'
    })
  })

  it('computes focal-point zoom and triggers drill-down / roll-up across thresholds', () => {
    const zoomedIn = computeFocalZoomViewport({ x: 0, y: 0, zoom: 1 }, 2.3, { x: 40, y: 60 })
    expect(zoomedIn.zoom).toBe(2.3)

    const nodes = [
      {
        id: 'node-county',
        label: '临海县',
        x: 42,
        y: 58,
        floor: '',
        targetLocationId: 'loc-county-linhai',
        targetScale: 'county' as const,
        drillable: true
      }
    ]

    const stayResult = evaluateMapZoomTransition({
      currentScale: 'city',
      parentLocation: { id: 'loc-province', title: '东海省', scale: 'province' },
      nodes,
      viewport: { x: 0, y: 0, zoom: 1.5 },
      focalPoint: { x: 40, y: 60 }
    })
    expect(stayResult.action).toBe('stay')

    const drillResult = evaluateMapZoomTransition({
      currentScale: 'city',
      parentLocation: { id: 'loc-province', title: '东海省', scale: 'province' },
      nodes,
      viewport: { x: 0, y: 0, zoom: MAP_ZOOM_DRILL_DOWN_THRESHOLD },
      focalPoint: { x: 40, y: 60 }
    })
    expect(drillResult).toMatchObject({
      action: 'drill-down',
      targetLocationId: 'loc-county-linhai',
      fromScale: 'city',
      toScale: 'county'
    })

    const rollUpResult = evaluateMapZoomTransition({
      currentScale: 'city',
      parentLocation: { id: 'loc-province', title: '东海省', scale: 'province' },
      nodes,
      viewport: { x: 0, y: 0, zoom: MAP_ZOOM_ROLL_UP_THRESHOLD }
    })
    expect(rollUpResult).toMatchObject({
      action: 'roll-up',
      targetLocationId: 'loc-province',
      fromScale: 'city',
      toScale: 'province'
    })
  })

  it('builds an architectural floor plan model with floors, room zones, and door/window openings', () => {
    const floorPlan = buildInteriorFloorPlanModel({
      defaultFloor: '1F',
      selectedFloor: '1F',
      nodes: [
        {
          id: 'room-study',
          label: '留云书房',
          x: 35,
          y: 40,
          floor: '1F',
          target_location: null,
          room_type: 'study',
          width: 24,
          height: 18,
          item_id: 'item-compass'
        },
        {
          id: 'room-secret',
          label: '抱厦暗室',
          x: 68,
          y: 40,
          floor: '1F',
          target_location: null,
          room_type: 'secret',
          width: 18,
          height: 14
        },
        {
          id: 'room-upstairs',
          label: '二楼观星台',
          x: 50,
          y: 50,
          floor: '2F',
          target_location: null,
          room_type: 'courtyard'
        }
      ],
      edges: [
        {
          from: 'room-study',
          to: 'room-secret',
          label: '机关暗门',
          edge_type: 'secret_door'
        }
      ]
    })

    expect(floorPlan.availableFloors).toEqual(['1F', '2F'])
    expect(floorPlan.activeFloor).toBe('1F')
    expect(floorPlan.rooms).toHaveLength(2)
    expect(floorPlan.rooms[0]?.itemId).toBe('item-compass')
    expect(floorPlan.openings).toHaveLength(1)
    expect(floorPlan.openings[0]?.edgeType).toBe('secret_door')
  })
})
