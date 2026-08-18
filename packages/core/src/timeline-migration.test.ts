import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendTimelineEvent,
  applyLegacyTimelineMigration,
  applyStoryTimeTimelineImport,
  checkTimelineDeterministically,
  createCharacter,
  createProjectAt,
  createTimelineNode,
  listDocs,
  listTimelineCatalog,
  planLegacyTimelineMigration,
  planStoryTimeTimelineImport,
  readMarkdown,
  readText,
  writeMarkdown,
  writeText,
  type CharacterDoc,
  type TimelineEventDoc,
  type TimelineNodeDoc
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-timeline-migration-'))
  roots.push(root)
  await createProjectAt(root, { id: 'timeline-migration', title: 'Timeline migration' })
  return root
}

describe('legacy timeline migration', () => {
  it('uses dry-run, backup, apply, verify, and report without changing unknown frontmatter or Runs', async () => {
    const root = await project()
    const node = await createTimelineNode(root, 'Month one', { id: 'node-one', year: 10, month: 1 })
    const event = await appendTimelineEvent(root, 'Event', {
      id: 'event-one',
      timeline_node: 'node-one',
      date: '10-01'
    })
    const parsed = await readMarkdown<Record<string, unknown>>(node)
    await writeMarkdown(node, { ...parsed.data, unknown_future_field: { preserve: true } }, parsed.content)
    const run = path.join(root, 'runs', 'legacy', 'result.json')
    await writeText(run, '{"unchanged":true}\n')
    const beforeNode = await readText(node)
    const beforeEvent = await readText(event)

    const plan = await planLegacyTimelineMigration(root, new Date('2026-08-17T12:00:00.000Z'))
    expect(await readText(node)).toBe(beforeNode)
    expect(await readText(event)).toBe(beforeEvent)
    expect(plan).toMatchObject({
      create_default_time_system: true,
      create_default_track: true,
      source_node_count: 1,
      source_event_count: 1
    })

    const report = await applyLegacyTimelineMigration(root, plan, new Date('2026-08-17T12:01:00.000Z'))
    const migratedNode = await readMarkdown<Record<string, unknown>>(node)
    const migratedEvent = await readMarkdown<Record<string, unknown>>(event)
    expect(migratedNode.data).toMatchObject({
      previous: null,
      next: null,
      unknown_future_field: { preserve: true },
      coordinate_v2: { time_system_id: 'legacy-story', precision: 'month' },
      timeline_tracks: [{ timeline_id: 'main', order: 0, narrative_order: 0 }]
    })
    expect(migratedEvent.data).toMatchObject({
      timeline_node: 'node-one',
      placements: [{ timeline_id: 'main', start_node_id: 'node-one' }]
    })
    expect(await readText(run)).toBe('{"unchanged":true}\n')
    expect(report).toMatchObject({ migrated_nodes: 1, migrated_events: 1, verified: true })
    expect(
      await readText(path.join(root, report.backup_path, 'timeline', 'nodes', path.basename(node)))
    ).toBe(beforeNode)
    expect((await listTimelineCatalog(root)).legacy_fallback).toBe(false)
  })

  it('rejects a stale plan before changing timeline documents', async () => {
    const root = await project()
    const node = await createTimelineNode(root, 'Month one', { id: 'node-one', year: 10, month: 1 })
    const plan = await planLegacyTimelineMigration(root)
    const parsed = await readMarkdown<Record<string, unknown>>(node)
    await writeMarkdown(node, parsed.data, `${parsed.content}\nexternal change`)

    await expect(applyLegacyTimelineMigration(root, plan)).rejects.toThrow(/STALE_PROJECT_WRITE/)
    expect((await readMarkdown<Record<string, unknown>>(node)).data.coordinate_v2).toBeNull()
  })
})

describe('story-time scan and author-confirmed import', () => {
  it('parses, groups, deduplicates, previews ambiguity, and only writes approved suggestions', async () => {
    const root = await project()
    const first = await appendTimelineEvent(root, 'First', { id: 'first', date: '1449-08' })
    const second = await appendTimelineEvent(root, 'Second', { id: 'second', date: '1449-08' })
    await appendTimelineEvent(root, 'Ambiguous', { id: 'ambiguous', date: '很久以前' })
    const beforeFirst = await readText(first)
    const beforeSecond = await readText(second)

    const plan = await planStoryTimeTimelineImport(root, new Date('2026-08-17T12:30:00.000Z'))
    expect(plan.suggestions).toHaveLength(1)
    expect(plan.suggestions[0]?.event_ids).toEqual(['first', 'second'])
    expect(plan.ambiguities).toEqual([
      expect.objectContaining({ event_id: 'ambiguous', raw_story_time: '很久以前' })
    ])
    expect(await readText(first)).toBe(beforeFirst)
    expect(await readText(second)).toBe(beforeSecond)

    const report = await applyStoryTimeTimelineImport(root, plan, {
      approved_suggestion_ids: [plan.suggestions[0]!.suggestion_id]
    })
    expect(report).toMatchObject({
      created_node_ids: [expect.any(String)],
      attached_event_ids: ['first', 'second'],
      unresolved_event_ids: ['ambiguous'],
      verified: true
    })
    const events = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    const attached = events.filter((item) => ['first', 'second'].includes(item.data.id))
    expect(new Set(attached.map((item) => item.data.timeline_node)).size).toBe(1)
    expect(events.find((item) => item.data.id === 'ambiguous')?.data.timeline_node).toBeNull()
  })

  it('writes V2 coordinates and placements after the author explicitly migrates the timeline model', async () => {
    const root = await project()
    await appendTimelineEvent(root, 'Opening', { id: 'opening', date: '1449-08-15 09:30' })
    const migration = await planLegacyTimelineMigration(root, new Date('2026-08-17T13:00:00.000Z'))
    await applyLegacyTimelineMigration(root, migration, new Date('2026-08-17T13:01:00.000Z'))

    const plan = await planStoryTimeTimelineImport(root, new Date('2026-08-17T13:02:00.000Z'))
    const report = await applyStoryTimeTimelineImport(root, plan, {
      approved_suggestion_ids: [plan.suggestions[0]!.suggestion_id]
    })
    const [node] = await listDocs<TimelineNodeDoc>(root, 'timeline_node')
    const [event] = await listDocs<TimelineEventDoc>(root, 'timeline_event')

    expect(report.verified).toBe(true)
    expect(node?.data.coordinate_v2).toMatchObject({
      schema_version: 2,
      time_system_id: 'legacy-story',
      precision: 'minute',
      occurrence: 1
    })
    expect(node?.data.timeline_tracks).toEqual([{ timeline_id: 'main', order: 0, narrative_order: 0 }])
    expect(event?.data.placements).toEqual([
      {
        timeline_id: 'main',
        start_node_id: node?.data.id,
        end_node_id: null,
        order: 0,
        narrative_order: 0,
        occurrence: 1
      }
    ])
  })
})

describe('deterministic timeline checks', () => {
  it('finds invalid intervals, causality reversal, and character appearance range before semantic AI', async () => {
    const root = await project()
    await createTimelineNode(root, 'Early', { id: 'early', year: 1, month: 1 })
    await createTimelineNode(root, 'Late', { id: 'late', year: 1, month: 2 })
    await createCharacter(root, 'Character', {
      id: 'character',
      introduced_at: 'late'
    })
    await appendTimelineEvent(root, 'Cause', {
      id: 'cause',
      timeline_node: 'late',
      placements: [
        {
          timeline_id: 'main',
          start_node_id: 'late',
          end_node_id: 'early',
          order: 0,
          narrative_order: 0,
          occurrence: 1
        }
      ]
    })
    await appendTimelineEvent(root, 'Effect', {
      id: 'effect',
      timeline_node: 'early',
      characters: ['character'],
      relations: [{ kind: 'depends_on', target_id: 'cause', note: '' }],
      placements: [
        {
          timeline_id: 'main',
          start_node_id: 'early',
          end_node_id: null,
          order: 0,
          narrative_order: 0,
          occurrence: 1
        }
      ]
    })
    const [nodes, events, characters, catalog] = await Promise.all([
      listDocs<TimelineNodeDoc>(root, 'timeline_node'),
      listDocs<TimelineEventDoc>(root, 'timeline_event'),
      listDocs<CharacterDoc>(root, 'character'),
      listTimelineCatalog(root)
    ])

    const issues = checkTimelineDeterministically({
      tracks: catalog.tracks.map((item) => item.value),
      nodes: nodes.map((item) => item.data),
      events: events.map((item) => item.data),
      characters: characters.map((item) => item.data)
    })
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'timeline-invalid-interval',
        'timeline-causality-reversed',
        'timeline-character-not-active'
      ])
    )
  })
})
