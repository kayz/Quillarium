import path from 'node:path'
import { realpath, rm } from 'node:fs/promises'
import { createVersionedYaml, listVersionedYaml, sha256Text } from './versioned-yaml-store.js'
import { listDocs } from './documents.js'
import { ensureDir, pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { timeSystemV1Schema, timelineTrackV1Schema } from './schema.js'
import {
  DEFAULT_TIME_SYSTEM_ID,
  DEFAULT_TIMELINE_TRACK_ID,
  LEGACY_TIMELINE_TRACK,
  LEGACY_TIME_SYSTEM
} from './timeline-model.js'
import type { TimelineEventDoc, TimelineNodeDoc, TimelinePlacementV1 } from './types.js'

export interface TimelineMigrationDocumentV1 {
  relative_path: string
  expected_sha256: string
  data: Record<string, unknown>
  content: string
}

export interface TimelineMigrationPlanV1 {
  schema_version: 1
  migration_id: string
  created_at: string
  project_root: string
  create_default_time_system: boolean
  create_default_track: boolean
  documents: TimelineMigrationDocumentV1[]
  source_node_count: number
  source_event_count: number
  source_document_sha256: string
}

export interface TimelineMigrationReportV1 {
  schema_version: 1
  migration_id: string
  applied_at: string
  backup_path: string
  migrated_nodes: number
  migrated_events: number
  source_document_sha256: string
  target_document_sha256: string
  verified: boolean
}

const TIME_SYSTEM_DIRECTORY = 'timeline/time-systems'
const TRACK_DIRECTORY = 'timeline/tracks'

export async function planLegacyTimelineMigration(
  projectRoot: string,
  now: Date = new Date()
): Promise<TimelineMigrationPlanV1> {
  const root = await realpath(projectRoot)
  const [nodes, events, systems, tracks] = await Promise.all([
    listDocs<TimelineNodeDoc>(root, 'timeline_node'),
    listDocs<TimelineEventDoc>(root, 'timeline_event'),
    listVersionedYaml(root, TIME_SYSTEM_DIRECTORY, timeSystemV1Schema),
    listVersionedYaml(root, TRACK_DIRECTORY, timelineTrackV1Schema)
  ])
  const orderedNodes = legacyChainOrder(nodes.map((item) => item.data))
  const nodeOrder = new Map(orderedNodes.map((node, index) => [node.id, index] as const))
  const documents: TimelineMigrationDocumentV1[] = []

  for (const document of nodes) {
    const order = nodeOrder.get(document.data.id) ?? nodeOrder.size
    const hasMain = (document.data.timeline_tracks ?? []).some(
      (placement) => placement.timeline_id === DEFAULT_TIMELINE_TRACK_ID
    )
    const data: TimelineNodeDoc = {
      ...document.data,
      coordinate_v2: document.data.coordinate_v2 ?? {
        schema_version: 2,
        time_system_id: DEFAULT_TIME_SYSTEM_ID,
        components: {
          year: document.data.year,
          month: document.data.month,
          ...(document.data.day !== null ? { day: document.data.day } : {}),
          ...(document.data.hour !== null ? { hour: document.data.hour } : {}),
          ...(document.data.minute !== null ? { minute: document.data.minute } : {})
        },
        precision: document.data.precision,
        display_text: document.data.display_time || `${document.data.year}-${document.data.month}`,
        sort_value: legacySortValue(document.data),
        explicit_order: order,
        uncertain: document.data.fuzzy,
        fuzzy: document.data.fuzzy,
        cycle: null,
        occurrence: 1
      },
      timeline_tracks: hasMain
        ? document.data.timeline_tracks
        : [
            ...(document.data.timeline_tracks ?? []),
            { timeline_id: DEFAULT_TIMELINE_TRACK_ID, order, narrative_order: order }
          ]
    }
    if (JSON.stringify(data) !== JSON.stringify(document.data)) {
      documents.push(await migrationDocument(root, document, data))
    }
  }

  const eventsByNode = new Map<string, TimelineEventDoc[]>()
  for (const event of events.map((item) => item.data).sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    if (!event.timeline_node) continue
    ;(
      eventsByNode.get(event.timeline_node) ??
      eventsByNode.set(event.timeline_node, []).get(event.timeline_node)!
    ).push(event)
  }
  const eventOrder = new Map<string, number>()
  for (const group of eventsByNode.values()) {
    for (const [index, event] of legacyEventOrder(group).entries()) eventOrder.set(event.id, index)
  }
  for (const document of events) {
    if (!document.data.timeline_node) continue
    const hasMain = (document.data.placements ?? []).some(
      (placement) => placement.timeline_id === DEFAULT_TIMELINE_TRACK_ID
    )
    if (hasMain) continue
    const order = eventOrder.get(document.data.id) ?? 0
    const placement: TimelinePlacementV1 = {
      timeline_id: DEFAULT_TIMELINE_TRACK_ID,
      start_node_id: document.data.timeline_node,
      end_node_id: null,
      order,
      narrative_order: order,
      occurrence: 1
    }
    const data: TimelineEventDoc = {
      ...document.data,
      placements: [...(document.data.placements ?? []), placement]
    }
    documents.push(await migrationDocument(root, document, data))
  }

  return {
    schema_version: 1,
    migration_id: `timeline-v2-${compactTimestamp(now)}`,
    created_at: now.toISOString(),
    project_root: root,
    create_default_time_system: !systems.some((item) => item.value.id === DEFAULT_TIME_SYSTEM_ID),
    create_default_track: !tracks.some((item) => item.value.id === DEFAULT_TIMELINE_TRACK_ID),
    documents,
    source_node_count: nodes.length,
    source_event_count: events.length,
    source_document_sha256: await documentSetHash([...nodes, ...events])
  }
}

export async function applyLegacyTimelineMigration(
  projectRoot: string,
  plan: TimelineMigrationPlanV1,
  now: Date = new Date()
): Promise<TimelineMigrationReportV1> {
  const root = await realpath(projectRoot)
  if (path.resolve(plan.project_root) !== path.resolve(root)) {
    throw new Error('Timeline migration plan belongs to a different project.')
  }
  return withProjectWriteLock(root, async () => {
    const backupRoot = path.join(root, '.quillarium', 'migrations', plan.migration_id, 'backup')
    const snapshots = new Map<string, string>()
    for (const document of plan.documents) {
      const absolute = containedPath(root, document.relative_path)
      const raw = await readText(absolute)
      if (sha256Text(raw) !== document.expected_sha256) {
        throw new Error(`STALE_PROJECT_WRITE: Timeline document changed: ${document.relative_path}`)
      }
      snapshots.set(document.relative_path, raw)
    }
    await ensureDir(backupRoot)
    for (const [relativePath, raw] of snapshots) {
      await writeText(path.join(backupRoot, ...relativePath.split('/')), raw)
    }

    const createdYaml: string[] = []
    const written: string[] = []
    try {
      if (plan.create_default_time_system) {
        const created = await createVersionedYaml(
          root,
          TIME_SYSTEM_DIRECTORY,
          LEGACY_TIME_SYSTEM,
          timeSystemV1Schema
        )
        createdYaml.push(created.source_path)
      }
      if (plan.create_default_track) {
        const created = await createVersionedYaml(
          root,
          TRACK_DIRECTORY,
          LEGACY_TIMELINE_TRACK,
          timelineTrackV1Schema
        )
        createdYaml.push(created.source_path)
      }
      for (const document of plan.documents) {
        await writeMarkdown(containedPath(root, document.relative_path), document.data, document.content)
        written.push(document.relative_path)
      }
      await verifyMigration(root, plan)
    } catch (error) {
      for (const relativePath of [...written].reverse()) {
        await writeText(containedPath(root, relativePath), snapshots.get(relativePath)!)
      }
      for (const relativePath of [...createdYaml].reverse()) {
        if (await pathExists(path.join(root, relativePath)))
          await rm(path.join(root, relativePath), { force: false })
      }
      throw error
    }

    const [nodes, events] = await Promise.all([
      listDocs<TimelineNodeDoc>(root, 'timeline_node'),
      listDocs<TimelineEventDoc>(root, 'timeline_event')
    ])
    const report: TimelineMigrationReportV1 = {
      schema_version: 1,
      migration_id: plan.migration_id,
      applied_at: now.toISOString(),
      backup_path: path.relative(root, backupRoot).replace(/\\/gu, '/'),
      migrated_nodes: nodes.filter((item) => item.data.coordinate_v2).length,
      migrated_events: events.filter((item) => (item.data.placements ?? []).length > 0).length,
      source_document_sha256: plan.source_document_sha256,
      target_document_sha256: await documentSetHash([...nodes, ...events]),
      verified: true
    }
    await writeText(
      path.join(root, '.quillarium', 'migrations', plan.migration_id, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`
    )
    return report
  })
}

async function migrationDocument<T extends TimelineNodeDoc | TimelineEventDoc>(
  root: string,
  document: { path: string; data: T; content: string },
  data: T
): Promise<TimelineMigrationDocumentV1> {
  return {
    relative_path: path.relative(root, document.path).replace(/\\/gu, '/'),
    expected_sha256: sha256Text(await readText(document.path)),
    data: data as unknown as Record<string, unknown>,
    content: document.content
  }
}

async function verifyMigration(root: string, plan: TimelineMigrationPlanV1): Promise<void> {
  for (const document of plan.documents) {
    const parsed = await readMarkdown<Record<string, unknown>>(containedPath(root, document.relative_path))
    for (const [key, expected] of Object.entries(document.data)) {
      if (JSON.stringify(parsed.data[key]) !== JSON.stringify(expected)) {
        throw new Error(`Timeline migration verification failed: ${document.relative_path}.${key}`)
      }
    }
  }
  const [nodes, events] = await Promise.all([
    listDocs<TimelineNodeDoc>(root, 'timeline_node'),
    listDocs<TimelineEventDoc>(root, 'timeline_event')
  ])
  if (nodes.length !== plan.source_node_count || events.length !== plan.source_event_count) {
    throw new Error('Timeline migration changed the number of timeline documents.')
  }
}

function legacyChainOrder(nodes: TimelineNodeDoc[]): TimelineNodeDoc[] {
  const byId = new Map(nodes.map((node) => [node.id, node] as const))
  const result: TimelineNodeDoc[] = []
  const visited = new Set<string>()
  for (const head of nodes.filter((node) => !node.previous).sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    let current: TimelineNodeDoc | undefined = head
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      result.push(current)
      current = current.next ? byId.get(current.next) : undefined
    }
  }
  result.push(
    ...nodes
      .filter((node) => !visited.has(node.id))
      .sort(
        (left, right) =>
          legacySortValue(left) - legacySortValue(right) || left.id.localeCompare(right.id, 'en')
      )
  )
  return result
}

function legacyEventOrder(events: TimelineEventDoc[]): TimelineEventDoc[] {
  const byId = new Map(events.map((event) => [event.id, event] as const))
  const result: TimelineEventDoc[] = []
  const visited = new Set<string>()
  for (const head of events
    .filter((event) => !event.previous)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
    let current: TimelineEventDoc | undefined = head
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      result.push(current)
      current = current.next ? byId.get(current.next) : undefined
    }
  }
  result.push(
    ...events.filter((event) => !visited.has(event.id)).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  )
  return result
}

function legacySortValue(node: TimelineNodeDoc): number {
  return (
    (((node.year + 1_000_000) * 13 + node.month) * 32 + (node.day ?? 0)) * 1_440 +
    (node.hour ?? 0) * 60 +
    (node.minute ?? 0)
  )
}

async function documentSetHash(
  documents: Array<{ path: string; data: TimelineNodeDoc | TimelineEventDoc }>
): Promise<string> {
  const values = await Promise.all(
    documents
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path, 'en'))
      .map(async (document) => `${document.path}\0${sha256Text(await readText(document.path))}`)
  )
  return sha256Text(values.join('\n'))
}

function containedPath(root: string, relativePath: string): string {
  const absolute = path.resolve(root, ...relativePath.replace(/\\/gu, '/').split('/'))
  const relative = path.relative(root, absolute)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Timeline migration target escapes the project: ${relativePath}`)
  }
  return absolute
}

function compactTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)
}
