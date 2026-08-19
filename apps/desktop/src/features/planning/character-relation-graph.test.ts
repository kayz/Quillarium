import { describe, expect, it } from 'vitest'
import type { DocEntry, TargetSelection } from '../../app/types.js'
import {
  buildCharacterRelationEgoGraph,
  layoutCharacterRelationEgoGraph,
  PERSON_DOUBLE_CLICK_MS,
  personPointerAction,
  nextGraphPaneSize,
  resolveEgoCharacterId
} from './character-relation-graph.js'
import {
  activeFactionMembershipsAtNode,
  characterRelationSnapshot,
  compareTimelineEntries
} from './PlanningViews.js'

function doc(type: string, id: string, title: string, data: Record<string, unknown> = {}): DocEntry {
  return {
    path: `${type}/${id}.md`,
    data: { id, type, title, schema_version: 1, tags: [], ...data },
    content: ''
  }
}

function timeIndex(nodes: DocEntry[]): Map<string, number> {
  return new Map(
    nodes
      .slice()
      .sort(compareTimelineEntries)
      .map((node, index) => [node.data.id, index] as const)
  )
}

function winterCourt() {
  const t1 = doc('timeline_node', 'time-1', '1450-1', { year: 1450, month: 1 })
  const t2 = doc('timeline_node', 'time-2', '1450-2', { year: 1450, month: 2 })
  const wang = doc('character', 'wang', '汪皇后', { role: '皇后', introduced_at: 'time-1' })
  const yu = doc('character', 'yu', '于谦', { role: '兵部尚书', introduced_at: 'time-1' })
  const zhu = doc('character', 'zhu', '朱祁钰', { role: '监国', introduced_at: 'time-1' })
  const shi = doc('character', 'shi', '石亨', { role: '武将', introduced_at: 'time-1' })
  const cao = doc('character', 'cao', '曹吉祥', { role: '宦官', introduced_at: 'time-1' })
  const wife = doc('character_relation', 'wife', '夫妻', {
    from_character: 'wang',
    to_character: 'zhu',
    relation_type: '夫妻',
    direction: 'mutual',
    starts_at: 'time-1',
    ends_at: null
  })
  const ally = doc('character_relation', 'ally', '同盟', {
    from_character: 'wang',
    to_character: 'yu',
    relation_type: '同盟',
    direction: 'mutual',
    starts_at: 'time-1',
    ends_at: null
  })
  const l1l1 = doc('character_relation', 'court', '君臣', {
    from_character: 'yu',
    to_character: 'zhu',
    relation_type: '君臣',
    direction: 'directed',
    starts_at: 'time-1',
    ends_at: null
  })
  const l1l2 = doc('character_relation', 'subordinate', '部将', {
    from_character: 'yu',
    to_character: 'shi',
    relation_type: '部将',
    direction: 'directed',
    starts_at: 'time-1',
    ends_at: null
  })
  const l1l2b = doc('character_relation', 'eunuch', '从属', {
    from_character: 'yu',
    to_character: 'cao',
    relation_type: '从属',
    direction: 'directed',
    starts_at: 'time-1',
    ends_at: null
  })
  const l2l2 = doc('character_relation', 'hidden', '密谋', {
    from_character: 'shi',
    to_character: 'cao',
    relation_type: '密谋',
    direction: 'mutual',
    starts_at: 'time-1',
    ends_at: null
  })
  const items = [t1, t2, wang, yu, zhu, shi, cao, wife, ally, l1l1, l1l2, l1l2b, l2l2]
  const nodes = [t1, t2]
  return { items, nodes, wang, yu, zhu, shi, cao, wife, ally, l1l1, l1l2, l1l2b, l2l2 }
}

describe('character relation ego graph', () => {
  it('keeps two hops around the ego and drops layer-2 cross links', () => {
    const { items, nodes, wang, wife, ally, l1l1, l1l2, l1l2b, l2l2 } = winterCourt()
    const snapshot = characterRelationSnapshot(items, nodes, 'time-2')
    const graph = buildCharacterRelationEgoGraph({
      snapshot,
      items,
      egoId: wang.data.id,
      timeIndex: timeIndex(nodes)
    })

    expect(graph.egoId).toBe('wang')
    expect(graph.nodes.find((node) => node.character.data.id === 'wang')?.layer).toBe('ego')
    expect(graph.nodes.find((node) => node.character.data.id === 'wang')?.present).toBe(true)
    expect(
      graph.nodes
        .filter((node) => node.layer === 'layer1')
        .map((node) => node.character.data.id)
        .sort()
    ).toEqual(['yu', 'zhu'])
    expect(
      graph.nodes
        .filter((node) => node.layer === 'layer2')
        .map((node) => node.character.data.id)
        .sort()
    ).toEqual(['cao', 'shi'])
    expect(graph.nodes.find((node) => node.character.data.id === 'shi')?.parentId).toBe('yu')
    expect(graph.edges.map((edge) => edge.relation.data.id).sort()).toEqual(
      [ally.data.id, l1l1.data.id, l1l2.data.id, l1l2b.data.id, wife.data.id].sort()
    )
    expect(graph.edges.some((edge) => edge.relation.data.id === l2l2.data.id)).toBe(false)
    expect(graph.edges.find((edge) => edge.relation.data.id === l1l2.data.id)?.faded).toBe(true)
    expect(graph.edges.find((edge) => edge.relation.data.id === wife.data.id)?.faded).toBe(false)
  })

  it('picks the earlier layer-1 parent when a layer-2 character has two links', () => {
    const t1 = doc('timeline_node', 'time-1', '初', { year: 1, month: 1 })
    const t2 = doc('timeline_node', 'time-2', '后', { year: 1, month: 2 })
    const ego = doc('character', 'ego', '中心', { introduced_at: 'time-1' })
    const early = doc('character', 'early', '早', { introduced_at: 'time-1' })
    const late = doc('character', 'late', '晚', { introduced_at: 'time-1' })
    const outer = doc('character', 'outer', '外', { introduced_at: 'time-1' })
    const items = [
      t1,
      t2,
      ego,
      early,
      late,
      outer,
      doc('character_relation', 'e1', 'e1', {
        from_character: 'ego',
        to_character: 'early',
        relation_type: '友',
        starts_at: 'time-1',
        ends_at: null
      }),
      doc('character_relation', 'e2', 'e2', {
        from_character: 'ego',
        to_character: 'late',
        relation_type: '友',
        starts_at: 'time-1',
        ends_at: null
      }),
      doc('character_relation', 'late-outer', '晚连', {
        from_character: 'late',
        to_character: 'outer',
        relation_type: '部',
        starts_at: 'time-2',
        ends_at: null
      }),
      doc('character_relation', 'early-outer', '早连', {
        from_character: 'early',
        to_character: 'outer',
        relation_type: '部',
        starts_at: 'time-1',
        ends_at: null
      })
    ]
    const shuffled = [...items].reverse()
    const snapshot = characterRelationSnapshot(shuffled, [t1, t2], 'time-2')
    const graph = buildCharacterRelationEgoGraph({
      snapshot,
      items: shuffled,
      egoId: 'ego',
      timeIndex: timeIndex([t1, t2])
    })
    expect(graph.nodes.find((node) => node.character.data.id === 'outer')?.parentId).toBe('early')
  })

  it('keeps an absent ego on the graph with no edges', () => {
    const t1 = doc('timeline_node', 'time-1', '初', { year: 1, month: 1 })
    const t2 = doc('timeline_node', 'time-2', '后', { year: 1, month: 2 })
    const ego = doc('character', 'ego', '甲', { introduced_at: 'time-2' })
    const other = doc('character', 'other', '乙', { introduced_at: 'time-1' })
    const items = [
      t1,
      t2,
      ego,
      other,
      doc('character_relation', 'rel', '友', {
        from_character: 'ego',
        to_character: 'other',
        relation_type: '友',
        starts_at: 'time-2',
        ends_at: null
      })
    ]
    const snapshot = characterRelationSnapshot(items, [t1, t2], 'time-1')
    const graph = buildCharacterRelationEgoGraph({
      snapshot,
      items,
      egoId: 'ego',
      timeIndex: timeIndex([t1, t2])
    })
    expect(graph.nodes).toHaveLength(1)
    expect(graph.nodes[0]?.present).toBe(false)
    expect(graph.edges).toEqual([])
  })

  it('drops a relation at its exclusive end node', () => {
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
    const items = [first, third, a, b, friends, enemies]
    const before = buildCharacterRelationEgoGraph({
      snapshot: characterRelationSnapshot(items, [first, third], 'time-1'),
      items,
      egoId: 'a',
      timeIndex: timeIndex([first, third])
    })
    const after = buildCharacterRelationEgoGraph({
      snapshot: characterRelationSnapshot(items, [first, third], 'time-3'),
      items,
      egoId: 'a',
      timeIndex: timeIndex([first, third])
    })
    expect(before.edges.map((edge) => edge.relation.data.id)).toEqual(['friends'])
    expect(after.edges.map((edge) => edge.relation.data.id)).toEqual(['enemies'])
  })

  it('resolves ego from selection, then stored id, then first present character', () => {
    const { items, nodes, wang, yu } = winterCourt()
    const snapshot = characterRelationSnapshot(items, nodes, 'time-2')
    const selected: TargetSelection = { type: 'character', id: yu.data.id }
    expect(resolveEgoCharacterId(selected, null, snapshot, items)).toBe('yu')
    expect(resolveEgoCharacterId(null, wang.data.id, snapshot, items)).toBe('wang')
    expect(resolveEgoCharacterId(null, 'missing', snapshot, items)).toBe('cao')
  })
})

describe('faction badges at a relationship-graph time point', () => {
  it('uses start-inclusive and end-exclusive membership intervals and keeps untimed memberships visible', () => {
    const t1 = doc('timeline_node', 't1', '一月', { year: 1450, month: 1 })
    const t2 = doc('timeline_node', 't2', '二月', { year: 1450, month: 2 })
    const factionA = doc('faction', 'fa', '海灯会')
    const factionB = doc('faction', 'fb', '北港议会')
    const active = doc('faction_membership', 'm-active', '阶段所属', {
      faction_id: 'fa',
      character_id: 'char',
      starts_at: 't1',
      ends_at: 't2',
      primary: true
    })
    const future = doc('faction_membership', 'm-future', '未来所属', {
      faction_id: 'fb',
      character_id: 'char',
      starts_at: 't2',
      ends_at: null
    })
    const untimed = doc('faction_membership', 'm-untimed', '待确认所属', {
      faction_id: 'fb',
      character_id: 'char',
      starts_at: null,
      ends_at: null
    })
    const docs = [t1, t2, factionA, factionB, active, future, untimed]

    expect(
      activeFactionMembershipsAtNode(docs, [t1, t2], 't1')
        .get('char')
        ?.map((item) => [item.membership.data.id, item.untimed])
    ).toEqual([
      ['m-active', false],
      ['m-untimed', true]
    ])
    expect(
      activeFactionMembershipsAtNode(docs, [t1, t2], 't2')
        .get('char')
        ?.map((item) => item.membership.data.id)
    ).toEqual(['m-future', 'm-untimed'])
  })
})

describe('character relation ego layout', () => {
  it('places rings in one pixel space that scales with the pane', () => {
    const { items, nodes, wang } = winterCourt()
    const graph = buildCharacterRelationEgoGraph({
      snapshot: characterRelationSnapshot(items, nodes, 'time-2'),
      items,
      egoId: wang.data.id,
      timeIndex: timeIndex(nodes)
    })
    const small = layoutCharacterRelationEgoGraph(graph, 640, 400)
    const wide = layoutCharacterRelationEgoGraph(graph, 1280, 400)
    const ego = small.nodes.find((node) => node.id === 'wang')
    expect(ego?.x).toBe(320)
    expect(ego?.y).toBe(200)

    const radius = (layout: typeof small, id: string) => {
      const node = layout.nodes.find((item) => item.id === id)
      if (!node || !ego) return 0
      return Math.hypot(node.x - ego.x, node.y - ego.y)
    }
    const inner = Math.min(radius(small, 'yu'), radius(small, 'zhu'))
    const outer = radius(small, 'shi')
    expect(inner).toBeGreaterThan(40)
    expect(outer).toBeGreaterThan(inner)

    for (const edge of small.edges) {
      const from = small.nodes.find((node) => node.id === edge.fromId)
      const to = small.nodes.find((node) => node.id === edge.toId)
      expect(from).toBeTruthy()
      expect(to).toBeTruthy()
      if (!from || !to) continue
      expect(Math.hypot(edge.x1 - from.x, edge.y1 - from.y)).toBeGreaterThan(8)
      expect(Math.hypot(edge.x2 - to.x, edge.y2 - to.y)).toBeGreaterThan(8)
    }

    expect(wide.nodes.find((node) => node.id === 'wang')?.x).toBe(640)
    expect(small.viewBox).toEqual({ width: 640, height: 400 })
    expect(wide.viewBox).toEqual({ width: 1280, height: 400 })
  })
})

describe('person pointer action', () => {
  it('treats a second click on the same person as recenter even after a slow inspector refresh', () => {
    const first = personPointerAction(null, 'yu', 1000)
    expect(first.kind).toBe('select')
    const second = personPointerAction(first.next, 'yu', 1000 + PERSON_DOUBLE_CLICK_MS)
    expect(second.kind).toBe('recenter')
    expect(second.next).toBeNull()
  })

  it('selects again when the second click is a different person or too late', () => {
    const first = personPointerAction(null, 'yu', 1000)
    expect(personPointerAction(first.next, 'zhu', 1100).kind).toBe('select')
    expect(personPointerAction(first.next, 'yu', 1000 + PERSON_DOUBLE_CLICK_MS + 1).kind).toBe('select')
  })
})

describe('graph pane size', () => {
  it('does not keep growing when the measured box is only a fraction off', () => {
    expect(nextGraphPaneSize({ width: 640, height: 400 }, { width: 640.4, height: 399.6 })).toBeNull()
    expect(nextGraphPaneSize({ width: 640, height: 400 }, { width: 642, height: 400 })).toEqual({
      width: 642,
      height: 400
    })
    expect(nextGraphPaneSize({ width: 640, height: 400 }, { width: 10, height: 10 })).toBeNull()
  })
})
