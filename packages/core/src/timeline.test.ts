import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendTimelineEvent,
  createProjectAt,
  createTimelineEventAtNode,
  createTimelineNode,
  createTimelineNodeFromEvent,
  listDocs,
  parseStoryTime,
  readMarkdown,
  sortTimelineEvents,
  validateTimelineChain,
  type TimelineEventDoc,
  type TimelineNodeDoc
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-timeline-model-'))
  roots.push(root)
  await createProjectAt(root, { id: 'timeline-model', title: 'Timeline Model' })
  return root
}

describe('story time', () => {
  it('accepts month-to-minute precision and anchors a fuzzy season to a month range', () => {
    expect(parseStoryTime('1449-10')).toMatchObject({ year: 1449, month: 10, precision: 'month' })
    expect(parseStoryTime('1449-10-03 08:15')).toMatchObject({
      year: 1449,
      month: 10,
      day: 3,
      hour: 8,
      minute: 15,
      precision: 'minute'
    })
    expect(parseStoryTime('20年秋')).toMatchObject({
      year: 20,
      month: 9,
      month_end: 11,
      precision: 'month',
      fuzzy: true
    })
    expect(parseStoryTime('第1周周二')).toMatchObject({
      calendar: 'relative-week',
      year: 1,
      month: 1,
      day: 2,
      precision: 'day',
      display_time: '第1周周二'
    })
    expect(parseStoryTime('第54周周一')).toMatchObject({
      calendar: 'relative-week',
      year: 1,
      month: 12,
      day: 31,
      precision: 'day'
    })
  })

  it('rejects a year-only or unparseable time', () => {
    expect(() => parseStoryTime('1449')).toThrow(/at least a month|Unsupported timeline time/)
    expect(() => parseStoryTime('很久以前')).toThrow(/Unsupported timeline time/)
  })
})

describe('timeline node chain', () => {
  it('inserts nodes by time and lets multiple events share one node', async () => {
    const root = await project()
    await createTimelineNode(root, 'October', { id: 'time-oct', year: 1449, month: 10 })
    await createTimelineNode(root, 'August', { id: 'time-aug', year: 1449, month: 8 })
    await createTimelineNode(root, 'September', { id: 'time-sep', year: 1449, month: 9 })
    await createTimelineEventAtNode(root, 'time-sep', 'Event B', { id: 'event-b' })
    await createTimelineEventAtNode(root, 'time-sep', 'Event A', { id: 'event-a' })

    const nodes = await listDocs<TimelineNodeDoc>(root, 'timeline_node')
    const byId = new Map(nodes.map((item) => [item.data.id, item.data]))
    expect(byId.get('time-aug')).toMatchObject({ previous: null, next: 'time-sep' })
    expect(byId.get('time-sep')).toMatchObject({ previous: 'time-aug', next: 'time-oct' })
    expect(byId.get('time-oct')).toMatchObject({ previous: 'time-sep', next: null })
    expect(validateTimelineChain(nodes.map((item) => item.data))).toEqual([])

    const events = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    expect(events.every((event) => event.data.timeline_node === 'time-sep')).toBe(true)
    expect(
      sortTimelineEvents(
        events.map((item) => item.data),
        nodes.map((item) => item.data)
      ).map((event) => event.id)
    ).toEqual(['event-a', 'event-b'])
  })

  it('rejects a duplicate node at the same moment', async () => {
    const root = await project()
    await createTimelineNode(root, 'Morning', {
      id: 'time-morning',
      year: 1449,
      month: 10,
      day: 3,
      hour: 8,
      precision: 'hour'
    })
    await expect(
      createTimelineNode(root, 'Another event time', {
        id: 'time-duplicate',
        year: 1449,
        month: 10,
        day: 3,
        hour: 8,
        precision: 'hour'
      })
    ).rejects.toThrow(/attach another event/)
  })

  it('builds or reuses a coordinate from an event story time and attaches the event', async () => {
    const root = await project()
    await appendTimelineEvent(root, 'Autumn audience', {
      id: 'event-autumn-a',
      date: '20年秋'
    })
    const nodePath = await createTimelineNodeFromEvent(root, 'event-autumn-a')
    const createdNode = await readMarkdown<Record<string, unknown>>(nodePath)

    expect(createdNode.data).toMatchObject({
      type: 'timeline_node',
      year: 20,
      month: 9,
      month_end: 11,
      display_time: '20年秋',
      fuzzy: true
    })
    let events = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    expect(events[0]?.data).toMatchObject({
      id: 'event-autumn-a',
      timeline_node: createdNode.data.id,
      date: '20年秋',
      previous: null,
      next: null
    })

    await appendTimelineEvent(root, 'Autumn council', {
      id: 'event-autumn-b',
      date: '20年秋'
    })
    const reusedPath = await createTimelineNodeFromEvent(root, 'event-autumn-b')
    expect(reusedPath).toBe(nodePath)
    expect(await listDocs<TimelineNodeDoc>(root, 'timeline_node')).toHaveLength(1)
    events = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    expect(events.every((event) => event.data.timeline_node === createdNode.data.id)).toBe(true)
  })
})
