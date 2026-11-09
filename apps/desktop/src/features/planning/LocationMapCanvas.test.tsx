import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { LocationMapCanvas } from './LocationMapCanvas.js'
import { LocationMapEditorModal } from './LocationMapEditorModal.js'

function makeLocationDoc(id: string, title: string, extra: Record<string, unknown> = {}): DocEntry {
  return {
    path: `world/locations/${id}.md`,
    content: `${title} description`,
    data: {
      id,
      type: 'location',
      title,
      tags: [],
      status: 'active',
      created: '2026-04-19',
      updated: '2026-04-19',
      kind: 'position',
      scale: 'city',
      parent_location: null,
      layout_of: null,
      relative_direction: '',
      landmarks: [],
      routes: [],
      atmosphere: '',
      access_rules: '',
      floor: '',
      map_layer: null,
      map_x: null,
      map_y: null,
      map_width: null,
      map_height: null,
      map_room_type: null,
      diagram_nodes: [],
      diagram_edges: [],
      setting_visibility: 'normal',
      spoiler_note: '',
      summary: title,
      ...extra
    }
  }
}

describe('LocationMapCanvas & LocationMapEditorModal', () => {
  it('renders pure zoom-driven map view without explicit level strip and keeps unmounted locations in the pool', () => {
    const province = makeLocationDoc('prov-1', '江南省', { scale: 'province' })
    const city = makeLocationDoc('city-1', '临安城', {
      scale: 'city',
      parent_location: 'prov-1'
    })
    const mountedCounty = makeLocationDoc('county-1', '钱塘县', {
      scale: 'county',
      parent_location: 'city-1',
      map_layer: 'city',
      map_x: 35,
      map_y: 45
    })
    const unmountedCounty = makeLocationDoc('county-2', '余杭县', {
      scale: 'county',
      parent_location: 'city-1',
      map_layer: null,
      map_x: null,
      map_y: null
    })

    const html = renderToStaticMarkup(
      <LocationMapCanvas
        current={city}
        ancestors={[province]}
        childrenLocations={[mountedCounty, unmountedCounty]}
        layouts={[]}
        allItems={[province, city, mountedCounty, unmountedCounty]}
        selectedTarget={{ type: 'location', id: 'city-1' }}
        onSelect={() => undefined}
        language="zh"
      />
    )

    expect(html).not.toContain('location-eight-scale-bar')
    expect(html).toContain('钱塘县')
    expect(html).not.toContain('余杭县')
    expect(html).toContain('待挂载地点池：3')
    expect(html).toContain('打开地图编辑器')
    expect(html).toContain('返回上一级：江南省')
    expect(html).toContain('100%')
  })

  it('switches automatically to architectural floor-plan mode at interior layer with multi-floor tabs and door openings', () => {
    const cluster = makeLocationDoc('cluster-1', '听雨轩宅院', { scale: 'cluster' })
    const interior = makeLocationDoc('interior-1', '主楼室内', {
      scale: 'interior',
      map_layer: 'interior',
      map_x: 50,
      map_y: 50,
      parent_location: 'cluster-1',
      floor: '1F',
      diagram_nodes: [
        {
          id: 'r-hall',
          label: '正堂议事厅',
          x: 35,
          y: 50,
          floor: '1F',
          room_type: 'hall',
          width: 28,
          height: 20
        },
        {
          id: 'r-study',
          label: '东侧书房',
          x: 70,
          y: 50,
          floor: '1F',
          room_type: 'study',
          width: 22,
          height: 18
        },
        {
          id: 'r-bed',
          label: '二楼内寝',
          x: 50,
          y: 45,
          floor: '2F',
          room_type: 'bedroom',
          width: 26,
          height: 18
        }
      ],
      diagram_edges: [
        {
          from: 'r-hall',
          to: 'r-study',
          edge_type: 'secret_door',
          label: '书架暗门'
        }
      ]
    })

    const html = renderToStaticMarkup(
      <LocationMapCanvas
        current={interior}
        ancestors={[cluster]}
        childrenLocations={[]}
        layouts={[]}
        allItems={[cluster, interior]}
        selectedTarget={{ type: 'location', id: 'interior-1' }}
        onSelect={() => undefined}
        language="zh"
      />
    )

    expect(html).toContain('1F')
    expect(html).toContain('2F')
    expect(html).toContain('正堂议事厅')
    expect(html).toContain('东侧书房')
    expect(html).toContain('书架暗门')
  })

  it('renders fullscreen map editor modal with unmounted locations pool and mounted layer list', () => {
    const city = makeLocationDoc('city-1', '临安城', {
      scale: 'city',
      map_layer: 'city',
      map_x: 50,
      map_y: 50
    })
    const unmounted = makeLocationDoc('town-1', '乌镇', {
      scale: 'town',
      map_layer: null,
      map_x: null,
      map_y: null
    })

    const html = renderToStaticMarkup(
      <LocationMapEditorModal
        initialLayer="city"
        currentLocation={city}
        activeLayout={city}
        allItems={[city, unmounted]}
        language="zh"
        onClose={() => undefined}
        onSaveDoc={async () => undefined}
      />
    )

    expect(html).toContain('全屏地图编辑器')
    expect(html).toContain('待挂载地点池')
    expect(html).toContain('乌镇')
    expect(html).toContain('挂载到当前图层')
    expect(html).toContain('临安城')
  })
})
