import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import {
  buildTimelineLanes,
  CharacterRelationshipPanel,
  characterRelationSnapshot,
  CharacterRelationView,
  locationExplorerModel,
  LocationExplorerView,
  TimelineChainView
} from './PlanningViews.js'

function doc(type: string, id: string, title: string, data: Record<string, unknown> = {}): DocEntry {
  return {
    path: `${type}/${id}.md`,
    data: { id, type, title, schema_version: 1, tags: [], ...data },
    content: ''
  }
}

describe('planning visual workbenches', () => {
  it('uses one track placement order for mixed-precision nodes and event intervals', () => {
    const year = doc('timeline_node', 'year', '年度阶段', {
      coordinate_v2: {
        schema_version: 2,
        time_system_id: 'fictional',
        components: { era: 1 },
        precision: 'era',
        display_text: '第一纪元',
        sort_value: null,
        explicit_order: 0,
        uncertain: false,
        fuzzy: false,
        cycle: null,
        occurrence: 1
      },
      timeline_tracks: [{ timeline_id: 'world', order: 1, narrative_order: 1 }]
    })
    const minute = doc('timeline_node', 'minute', '决战时刻', {
      coordinate_v2: {
        schema_version: 2,
        time_system_id: 'fictional',
        components: { era: 1, beat: 15 },
        precision: 'beat',
        display_text: '第一纪元第十五拍',
        sort_value: null,
        explicit_order: 1,
        uncertain: false,
        fuzzy: false,
        cycle: null,
        occurrence: 1
      },
      timeline_tracks: [{ timeline_id: 'world', order: 0, narrative_order: 0 }]
    })
    const later = doc('timeline_event', 'later', '后显示', {
      placements: [
        {
          timeline_id: 'world',
          start_node_id: 'minute',
          end_node_id: 'year',
          order: 2,
          narrative_order: 2,
          occurrence: 1
        }
      ]
    })
    const earlier = doc('timeline_event', 'earlier', '先显示', {
      placements: [
        {
          timeline_id: 'world',
          start_node_id: 'minute',
          end_node_id: null,
          order: 0,
          narrative_order: 0,
          occurrence: 1
        }
      ]
    })

    const model = buildTimelineLanes([year, later, minute, earlier], 'world')
    expect(model.lanes.map((lane) => lane.node.data.id)).toEqual(['minute', 'year'])
    expect(model.lanes[0]?.events.map((event) => event.data.id)).toEqual(['earlier', 'later'])
    expect(model.unattached).toEqual([])
  })

  it('orders the timeline by real story time and groups concurrent events under one node', () => {
    const autumn = doc('timeline_node', 'autumn', '秋季', {
      year: 20,
      month: 9,
      display_time: '20年秋',
      precision: 'month'
    })
    const spring = doc('timeline_node', 'spring', '春季', {
      year: 20,
      month: 3,
      display_time: '20年春',
      precision: 'month'
    })
    const first = doc('timeline_event', 'event-a', '春日会议', { timeline_node: 'spring' })
    const concurrent = doc('timeline_event', 'event-b', '春日谈判', { timeline_node: 'spring' })
    const unattached = doc('timeline_event', 'event-c', '时间待定', {
      timeline_node: null,
      date: '20年夏'
    })

    const model = buildTimelineLanes([autumn, first, unattached, spring, concurrent])
    expect(model.lanes.map((lane) => lane.node.data.id)).toEqual(['spring', 'autumn'])
    expect(model.lanes[0].events.map((event) => event.data.id)).toEqual(['event-a', 'event-b'])
    expect(model.unattached.map((event) => event.data.id)).toEqual(['event-c'])

    const html = renderToStaticMarkup(
      <TimelineChainView
        items={[autumn, first, unattached, spring, concurrent]}
        selectedTarget={null}
        onSelect={() => undefined}
        onCreateCoordinate={() => undefined}
        onCreateCoordinateFromEvent={() => undefined}
        language="zh"
      />
    )
    expect(html).toContain('时间体系与叙事轨道')
    expect(html).toContain('待挂载事件')
    expect(html).toContain('使用此时间建立坐标')
    expect(html).toContain('timeline-rail-board')
    expect(html).not.toContain('节点内顺序')
    expect(html).not.toContain('timeline-chain-scroll')
    expect(html).not.toContain('事件轨道位置')
    expect(html).not.toContain('旧单链兼容模式')
    expect(html).not.toContain('timeline-intervals')
    expect(html).not.toContain('timeline-placement-panel')
  })

  it('renders junctions and span overlays on the rail board without the event chain', () => {
    const tracks = ['lin', 'shen', 'north']
    const nodeOn = (id: string, title: string, order: number) =>
      doc('timeline_node', id, title, {
        display_time: title,
        timeline_tracks: tracks.map((timeline_id) => ({ timeline_id, order, narrative_order: order }))
      })
    const html = renderToStaticMarkup(
      <TimelineChainView
        items={[
          nodeOn('eve', '冬至前夜', 0),
          nodeOn('gate', '城门开启', 1),
          nodeOn('later', '三日后', 2),
          doc('timeline_event', 'dress', '更衣', {
            placements: [
              {
                timeline_id: 'shen',
                start_node_id: 'gate',
                end_node_id: null,
                order: 0,
                narrative_order: 0,
                occurrence: 1
              }
            ]
          }),
          doc('timeline_event', 'swap', '调包出城', {
            placements: [
              {
                timeline_id: 'lin',
                start_node_id: 'gate',
                end_node_id: null,
                order: 1,
                narrative_order: 1,
                occurrence: 1
              },
              {
                timeline_id: 'shen',
                start_node_id: 'gate',
                end_node_id: null,
                order: 1,
                narrative_order: 1,
                occurrence: 1
              }
            ]
          }),
          doc('timeline_event', 'siege', '围城', {
            placements: [
              {
                timeline_id: 'shen',
                start_node_id: 'gate',
                end_node_id: 'later',
                order: 3,
                narrative_order: 3,
                occurrence: 1
              },
              {
                timeline_id: 'north',
                start_node_id: 'gate',
                end_node_id: 'later',
                order: 3,
                narrative_order: 3,
                occurrence: 1
              }
            ]
          })
        ]}
        selectedTarget={{ type: 'timeline_event', id: 'swap' }}
        onSelect={() => undefined}
        language="zh"
      />
    )
    expect(html).toContain('timeline-rail-board')
    expect(html).toContain('调包出城')
    expect(html).toContain('围城')
    expect(html).toContain('城门开启')
    expect(html).not.toContain('timeline-chain-scroll')
    expect(html).not.toContain('节点内顺序')
    expect(html).not.toContain('事件轨道位置')
    expect(html).not.toContain('旧单链兼容模式')
    expect(html).not.toContain('timeline-intervals')
    expect(html).not.toContain('timeline-placement-panel')
    expect(html).not.toContain('待挂载事件')
  })

  it('focuses the graph by time while keeping every other character and relationship discoverable', () => {
    const start = doc('timeline_node', 'time-1', '元年一月', { year: 1, month: 1 })
    const middle = doc('timeline_node', 'time-2', '元年二月', { year: 1, month: 2 })
    const end = doc('timeline_node', 'time-3', '元年三月', { year: 1, month: 3 })
    const a = doc('character', 'a', '甲', { introduced_at: 'time-1' })
    const b = doc('character', 'b', '乙', { introduced_at: 'time-2' })
    const future = doc('character', 'future', '丙', { introduced_at: 'time-3' })
    const untimed = doc('character', 'untimed', '丁', { introduced_at: null })
    const formed = doc('character_relation', 'relation-now', '同盟', {
      from_character: 'a',
      to_character: 'b',
      relation_type: '同盟',
      starts_at: 'time-2',
      ends_at: null
    })
    const later = doc('character_relation', 'relation-later', '师徒', {
      from_character: 'a',
      to_character: 'future',
      relation_type: '师徒',
      starts_at: 'time-3',
      ends_at: null
    })
    const unstarted = doc('character_relation', 'relation-unstarted', '旧识', {
      from_character: 'a',
      to_character: 'untimed',
      relation_type: '旧识',
      starts_at: null,
      ends_at: null
    })

    const snapshot = characterRelationSnapshot(
      [a, b, future, untimed, formed, later, unstarted],
      [start, middle, end],
      'time-2'
    )
    expect(snapshot.characters.map((character) => character.data.id)).toEqual(['a', 'b'])
    expect(snapshot.relations.map((relation) => relation.data.id)).toEqual(['relation-now'])
    expect(snapshot.outsideCharacters.map(({ item }) => item.data.id)).toEqual(['future', 'untimed'])
    expect(snapshot.outsideRelations.map(({ item }) => item.data.id)).toEqual([
      'relation-later',
      'relation-unstarted'
    ])
    expect(snapshot.hiddenCharacters).toBe(2)
    expect(snapshot.hiddenRelations).toBe(2)

    const html = renderToStaticMarkup(
      <CharacterRelationView
        items={[a, b, future, untimed, formed, later, unstarted]}
        timelineNodes={[start, middle, end]}
        selectedTarget={null}
        onSelect={() => undefined}
        language="zh"
      />
    )
    expect(html).toContain('时态人物关系')
    expect(html).toContain('关系图时间点')
    expect(html).toContain('图外人物与关系')
    expect(html).toContain('丁')
    expect(html).toContain('旧识')
    expect(html).toContain('出场时间待补')
    expect(html).toContain('调整关系')
    expect(html).toContain('编辑关系：师徒')
    expect(html).toContain('两圈')
    expect(html).not.toContain('--graph-x')
    expect(html).not.toContain('viewBox="0 0 1000 560"')
  })

  it('replaces a relationship at its exclusive end node', () => {
    const first = doc('timeline_node', 'time-1', '初见', { year: 1, month: 1 })
    const third = doc('timeline_node', 'time-3', '反目', { year: 1, month: 3 })
    const a = doc('character', 'a', '甲', { introduced_at: 'time-1' })
    const b = doc('character', 'b', '乙', { introduced_at: 'time-1' })
    const friends = doc('character_relation', 'friends', '朋友', {
      from_character: 'a',
      to_character: 'b',
      relation_type: '朋友',
      direction: 'mutual',
      starts_at: 'time-1',
      ends_at: 'time-3'
    })
    const enemies = doc('character_relation', 'enemies', '敌对', {
      from_character: 'a',
      to_character: 'b',
      relation_type: '敌对',
      direction: 'mutual',
      starts_at: 'time-3',
      ends_at: null
    })

    expect(characterRelationSnapshot([a, b, friends, enemies], [first, third], 'time-1').relations).toEqual([
      friends
    ])
    const replacement = characterRelationSnapshot([a, b, friends, enemies], [first, third], 'time-3')
    expect(replacement.relations).toEqual([enemies])
    expect(replacement.outsideRelations).toContainEqual({ item: friends, reason: 'ended' })
  })

  it('shows timed phases and preserves legacy notes in a character detail panel', () => {
    const opening = doc('timeline_node', 'time-1', '初见', {
      year: 1,
      month: 1,
      display_time: '元年一月'
    })
    const a = doc('character', 'a', '甲', {
      introduced_at: 'time-1',
      relationships: { 乙: '旧识' }
    })
    const b = doc('character', 'b', '乙', { introduced_at: 'time-1' })
    const friends = doc('character_relation', 'friends', '甲乙朋友', {
      from_character: 'a',
      to_character: 'b',
      relation_type: '朋友',
      direction: 'mutual',
      starts_at: 'time-1',
      ends_at: null
    })
    const html = renderToStaticMarkup(
      <CharacterRelationshipPanel
        character={a}
        items={[opening, a, b, friends]}
        selectedTarget={null}
        onSelect={() => undefined}
        onCreateRelation={() => undefined}
        language="zh"
      />
    )

    expect(html).toContain('时态人物关系')
    expect(html).toContain('朋友')
    expect(html).toContain('元年一月')
    expect(html).toContain('持续中')
    expect(html).toContain('旧关系备注')
    expect(html).toContain('建立时态关系')
  })

  it('renders a compact two-ring ego graph with faded second-layer people', () => {
    const t1 = doc('timeline_node', 'time-1', '元年', { year: 1, month: 1 })
    const wang = doc('character', 'wang', '汪皇后', { role: '皇后', introduced_at: 'time-1' })
    const yu = doc('character', 'yu', '于谦', { role: '兵部尚书', introduced_at: 'time-1' })
    const shi = doc('character', 'shi', '石亨', { role: '武将', introduced_at: 'time-1' })
    const html = renderToStaticMarkup(
      <CharacterRelationView
        items={[
          t1,
          wang,
          yu,
          shi,
          doc('character_relation', 'ally', '同盟', {
            from_character: 'wang',
            to_character: 'yu',
            relation_type: '同盟',
            starts_at: 'time-1',
            ends_at: null
          }),
          doc('character_relation', 'sub', '部将', {
            from_character: 'yu',
            to_character: 'shi',
            relation_type: '部将',
            starts_at: 'time-1',
            ends_at: null
          })
        ]}
        timelineNodes={[t1]}
        selectedTarget={{ type: 'character', id: 'wang' }}
        onSelect={() => undefined}
        language="zh"
      />
    )
    expect(html).toContain('汪皇后')
    expect(html).toContain('皇后')
    expect(html).toContain('兵部尚书')
    expect(html).toContain('武将')
    expect(html).toContain('同盟')
    expect(html).toContain('部将')
    expect(html).toContain('relationship-graph-layer2')
    expect(html).not.toContain('--graph-x')
    expect(html).not.toContain('viewBox="0 0 1000 560"')
  })

  it('builds a drill-down location chain and indexes every card outside the current branch', () => {
    const world = doc('location', 'world', '世界', {
      kind: 'position',
      scale: 'global',
      parent_location: null
    })
    const region = doc('location', 'region', '东部大陆', {
      kind: 'position',
      scale: 'region',
      parent_location: 'world',
      relative_direction: '世界东部'
    })
    const city = doc('location', 'city', '河港城', {
      kind: 'position',
      scale: 'city',
      parent_location: 'region',
      relative_direction: '大陆东南'
    })
    const layout = doc('location', 'city-layout', '河港城布局', {
      kind: 'layout',
      scale: 'city',
      layout_of: 'city',
      diagram_nodes: [{ id: 'gate', label: '城门', x: 50, y: 80, floor: '', target_location: null }],
      diagram_edges: []
    })
    const westernRegion = doc('location', 'western-region', '西部群山', {
      kind: 'position',
      scale: 'region',
      parent_location: 'world'
    })
    const orphan = doc('location', 'orphan', '失落庭院', {
      kind: 'position',
      scale: 'estate',
      parent_location: 'missing-location'
    })
    const westernLayout = doc('location', 'western-layout', '群山路径图', {
      kind: 'layout',
      scale: 'region',
      layout_of: 'western-region'
    })
    const detachedLayout = doc('location', 'detached-layout', '待归属平面图', {
      kind: 'layout',
      scale: 'interior',
      layout_of: null
    })
    const allLocations = [city, layout, world, region, westernRegion, orphan, westernLayout, detachedLayout]

    const model = locationExplorerModel(allLocations, 'city-layout')
    expect(model.current?.data.id).toBe('city')
    expect(model.ancestors.map((location) => location.data.id)).toEqual(['world', 'region'])
    expect(model.peers).toEqual([])
    expect(model.layouts.map((location) => location.data.id)).toEqual(['city-layout'])
    expect(model.outsidePositions.map(({ item }) => item.data.id)).toEqual(['western-region', 'orphan'])
    expect(model.outsideLayouts.map(({ item }) => item.data.id)).toEqual([
      'detached-layout',
      'western-layout'
    ])

    const html = renderToStaticMarkup(
      <LocationExplorerView
        items={allLocations}
        selectedTarget={{ type: 'location', id: 'city-layout' }}
        onSelect={() => undefined}
        language="zh"
      />
    )
    expect(html).toContain('地点层级与布局')
    expect(html).toContain('全世界')
    expect(html).toContain('布局简图')
    expect(html).toContain('城门')
    expect(html).toContain('其他地点与布局')
    expect(html).toContain('西部群山')
    expect(html).toContain('失落庭院')
    expect(html).toContain('群山路径图')
    expect(html).toContain('父地点引用失效')
    expect(html).toContain('调整归属')
    expect(html).toContain('调整关联')
  })
})
