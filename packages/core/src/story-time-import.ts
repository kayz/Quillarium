import { createHash } from 'node:crypto'
import path from 'node:path'
import { realpath, rm } from 'node:fs/promises'
import { attachTimelineEventToNode, createTimelineNode, listDocs } from './documents.js'
import { ensureDir, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { parseStoryTime, timelineNodeKey, type StoryTimeInput } from './timeline.js'
import type { TimelineEventDoc, TimelineNodeDoc } from './types.js'
import { sha256Text } from './versioned-yaml-store.js'
import { DEFAULT_TIME_SYSTEM_ID, DEFAULT_TIMELINE_TRACK_ID, listTimelineCatalog } from './timeline-model.js'

export interface StoryTimeImportSuggestionV1 {
  suggestion_id: string
  raw_story_time: string
  coordinate: StoryTimeInput
  event_ids: string[]
  existing_node_id: string | null
}

export interface StoryTimeImportAmbiguityV1 {
  event_id: string
  event_title: string
  raw_story_time: string
  reason: string
}

export interface StoryTimeImportPlanV1 {
  schema_version: 1
  plan_id: string
  created_at: string
  project_root: string
  suggestions: StoryTimeImportSuggestionV1[]
  ambiguities: StoryTimeImportAmbiguityV1[]
  skipped_event_ids: string[]
  expected_hashes: Record<string, string>
}

export interface StoryTimeImportDecisionV1 {
  approved_suggestion_ids: string[]
  ambiguity_resolutions?: Array<{
    event_id: string
    story_time: string
  }>
}

export interface StoryTimeImportReportV1 {
  schema_version: 1
  plan_id: string
  applied_at: string
  backup_path: string
  created_node_ids: string[]
  reused_node_ids: string[]
  attached_event_ids: string[]
  unresolved_event_ids: string[]
  verified: boolean
}

export async function planStoryTimeTimelineImport(
  projectRoot: string,
  now: Date = new Date()
): Promise<StoryTimeImportPlanV1> {
  const root = await realpath(projectRoot)
  const [events, nodes] = await Promise.all([
    listDocs<TimelineEventDoc>(root, 'timeline_event'),
    listDocs<TimelineNodeDoc>(root, 'timeline_node')
  ])
  const nodeByKey = new Map(nodes.map((node) => [timelineNodeKey(node.data), node.data.id] as const))
  const grouped = new Map<string, StoryTimeImportSuggestionV1>()
  const ambiguities: StoryTimeImportAmbiguityV1[] = []
  const skipped: string[] = []

  for (const document of events
    .slice()
    .sort((left, right) => left.data.id.localeCompare(right.data.id, 'en'))) {
    if (document.data.timeline_node || (document.data.placements ?? []).length) {
      skipped.push(document.data.id)
      continue
    }
    const data = document.data as unknown as Record<string, unknown>
    const raw = String(data['story_time'] ?? document.data.date ?? '').trim()
    if (!raw) {
      ambiguities.push({
        event_id: document.data.id,
        event_title: document.data.title,
        raw_story_time: '',
        reason: 'Story time is missing.'
      })
      continue
    }
    try {
      const coordinate = parseStoryTime(raw)
      const key = timelineNodeKey({
        calendar: coordinate.calendar ?? 'story',
        year: coordinate.year,
        month: coordinate.month,
        day: coordinate.day ?? null,
        hour: coordinate.hour ?? null,
        minute: coordinate.minute ?? null
      })
      const existing = grouped.get(key)
      if (existing) {
        existing.event_ids.push(document.data.id)
      } else {
        grouped.set(key, {
          suggestion_id: stableSuggestionId(key),
          raw_story_time: raw,
          coordinate,
          event_ids: [document.data.id],
          existing_node_id: nodeByKey.get(key) ?? null
        })
      }
    } catch (error) {
      ambiguities.push({
        event_id: document.data.id,
        event_title: document.data.title,
        raw_story_time: raw,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const allDocuments = [...events, ...nodes]
  return {
    schema_version: 1,
    plan_id: `story-time-import-${compactTimestamp(now)}`,
    created_at: now.toISOString(),
    project_root: root,
    suggestions: [...grouped.values()].sort((left, right) =>
      timelineNodeKey({
        calendar: left.coordinate.calendar ?? 'story',
        year: left.coordinate.year,
        month: left.coordinate.month,
        day: left.coordinate.day ?? null,
        hour: left.coordinate.hour ?? null,
        minute: left.coordinate.minute ?? null
      }).localeCompare(
        timelineNodeKey({
          calendar: right.coordinate.calendar ?? 'story',
          year: right.coordinate.year,
          month: right.coordinate.month,
          day: right.coordinate.day ?? null,
          hour: right.coordinate.hour ?? null,
          minute: right.coordinate.minute ?? null
        })
      )
    ),
    ambiguities,
    skipped_event_ids: skipped,
    expected_hashes: Object.fromEntries(
      await Promise.all(
        allDocuments.map(
          async (document) => [document.data.id, sha256Text(await readText(document.path))] as const
        )
      )
    )
  }
}

export async function applyStoryTimeTimelineImport(
  projectRoot: string,
  plan: StoryTimeImportPlanV1,
  decision: StoryTimeImportDecisionV1,
  now: Date = new Date()
): Promise<StoryTimeImportReportV1> {
  const root = await realpath(projectRoot)
  if (path.resolve(plan.project_root) !== path.resolve(root)) {
    throw new Error('Story-time import plan belongs to a different project.')
  }
  return withProjectWriteLock(root, async () => {
    const approved = new Set(decision.approved_suggestion_ids)
    if (approved.size !== decision.approved_suggestion_ids.length) {
      throw new Error('Story-time import decisions contain duplicate suggestion IDs.')
    }
    if ([...approved].some((id) => !plan.suggestions.some((suggestion) => suggestion.suggestion_id === id))) {
      throw new Error('Story-time import decision references an unknown suggestion.')
    }
    const [events, nodes] = await Promise.all([
      listDocs<TimelineEventDoc>(root, 'timeline_event'),
      listDocs<TimelineNodeDoc>(root, 'timeline_node')
    ])
    const catalog = await listTimelineCatalog(root)
    const persistedDefaultTrack = catalog.tracks.some(
      (track) => track.value.id === DEFAULT_TIMELINE_TRACK_ID && !track.virtual
    )
    const allDocuments = [...events, ...nodes]
    const snapshots = new Map<string, string>()
    for (const document of allDocuments) {
      const raw = await readText(document.path)
      if (plan.expected_hashes[document.data.id] !== sha256Text(raw)) {
        throw new Error(`STALE_PROJECT_WRITE: Timeline document changed: ${document.data.id}`)
      }
      snapshots.set(document.path, raw)
    }
    const backupRoot = path.join(root, '.quillarium', 'migrations', plan.plan_id, 'backup')
    await ensureDir(backupRoot)
    for (const [file, raw] of snapshots) {
      const relative = path.relative(root, file)
      await writeText(path.join(backupRoot, relative), raw)
    }

    const selected = plan.suggestions.filter((suggestion) => approved.has(suggestion.suggestion_id))
    const resolvedAmbiguities: StoryTimeImportSuggestionV1[] = []
    for (const resolution of decision.ambiguity_resolutions ?? []) {
      const ambiguity = plan.ambiguities.find((item) => item.event_id === resolution.event_id)
      if (!ambiguity) throw new Error(`Unknown story-time ambiguity: ${resolution.event_id}`)
      const coordinate = parseStoryTime(resolution.story_time)
      const key = timelineNodeKey({
        calendar: coordinate.calendar ?? 'story',
        year: coordinate.year,
        month: coordinate.month,
        day: coordinate.day ?? null,
        hour: coordinate.hour ?? null,
        minute: coordinate.minute ?? null
      })
      const existingNode = nodes.find((node) => timelineNodeKey(node.data) === key)
      resolvedAmbiguities.push({
        suggestion_id: stableSuggestionId(`${key}\0${resolution.event_id}`),
        raw_story_time: resolution.story_time,
        coordinate,
        event_ids: [resolution.event_id],
        existing_node_id: existingNode?.data.id ?? null
      })
    }

    const createdNodePaths: string[] = []
    const createdNodeIds: string[] = []
    const reusedNodeIds: string[] = []
    const attachedEventIds: string[] = []
    const eventCountByNode = new Map<string, number>()
    for (const event of events) {
      const placement = (event.data.placements ?? []).find(
        (item) => item.timeline_id === DEFAULT_TIMELINE_TRACK_ID
      )
      const nodeId = placement?.start_node_id ?? event.data.timeline_node
      if (!nodeId) continue
      eventCountByNode.set(nodeId, Math.max(eventCountByNode.get(nodeId) ?? 0, (placement?.order ?? -1) + 1))
    }
    try {
      for (const suggestion of [...selected, ...resolvedAmbiguities]) {
        let nodeId = suggestion.existing_node_id
        if (!nodeId) {
          const displayOrder = nodes.length + createdNodeIds.length
          const file = await createTimelineNode(root, suggestion.raw_story_time, {
            ...suggestion.coordinate,
            ...(persistedDefaultTrack
              ? {
                  coordinate_v2: {
                    schema_version: 2,
                    time_system_id: DEFAULT_TIME_SYSTEM_ID,
                    components: storyTimeComponents(suggestion.coordinate),
                    precision: suggestion.coordinate.precision ?? 'month',
                    display_text: suggestion.coordinate.display_time ?? suggestion.raw_story_time,
                    sort_value: legacyCoordinateSortValue(suggestion.coordinate),
                    explicit_order: displayOrder,
                    uncertain: suggestion.coordinate.fuzzy ?? false,
                    fuzzy: suggestion.coordinate.fuzzy ?? false,
                    cycle: null,
                    occurrence: 1
                  },
                  timeline_tracks: [
                    {
                      timeline_id: DEFAULT_TIMELINE_TRACK_ID,
                      order: displayOrder,
                      narrative_order: displayOrder
                    }
                  ]
                }
              : {})
          })
          createdNodePaths.push(file)
          const created = await readMarkdown<Record<string, unknown>>(file)
          nodeId = String(created.data.id)
          createdNodeIds.push(nodeId)
        } else {
          reusedNodeIds.push(nodeId)
        }
        for (const eventId of suggestion.event_ids) {
          await attachTimelineEventToNode(root, eventId, nodeId, suggestion.coordinate.display_time)
          if (persistedDefaultTrack) {
            const sourceEvent = events.find((item) => item.data.id === eventId)
            if (!sourceEvent) throw new Error(`Timeline event not found during import: ${eventId}`)
            const eventDocument = await readMarkdown<Record<string, unknown>>(sourceEvent.path)
            const order = eventCountByNode.get(nodeId) ?? 0
            eventCountByNode.set(nodeId, order + 1)
            const currentPlacements = Array.isArray(eventDocument.data['placements'])
              ? eventDocument.data['placements'].filter(isTimelinePlacementRecord)
              : []
            await writeMarkdown(
              sourceEvent.path,
              {
                ...eventDocument.data,
                placements: [
                  ...currentPlacements.filter(
                    (placement) => placement.timeline_id !== DEFAULT_TIMELINE_TRACK_ID
                  ),
                  {
                    timeline_id: DEFAULT_TIMELINE_TRACK_ID,
                    start_node_id: nodeId,
                    end_node_id: null,
                    order,
                    narrative_order: order,
                    occurrence: 1
                  }
                ]
              },
              eventDocument.content
            )
          }
          attachedEventIds.push(eventId)
        }
      }
    } catch (error) {
      for (const file of createdNodePaths) await rm(file, { force: true })
      for (const [file, raw] of snapshots) await writeText(file, raw)
      throw error
    }

    const reloadedEvents = await listDocs<TimelineEventDoc>(root, 'timeline_event')
    for (const eventId of attachedEventIds) {
      const reloaded = reloadedEvents.find((item) => item.data.id === eventId)?.data
      if (
        !reloaded?.timeline_node ||
        (persistedDefaultTrack &&
          !(reloaded.placements ?? []).some(
            (placement) => placement.timeline_id === DEFAULT_TIMELINE_TRACK_ID
          ))
      ) {
        for (const file of createdNodePaths) await rm(file, { force: true })
        for (const [file, raw] of snapshots) await writeText(file, raw)
        throw new Error(`Story-time import verification failed for event ${eventId}.`)
      }
    }
    const resolvedIds = new Set((decision.ambiguity_resolutions ?? []).map((item) => item.event_id))
    const report: StoryTimeImportReportV1 = {
      schema_version: 1,
      plan_id: plan.plan_id,
      applied_at: now.toISOString(),
      backup_path: path.relative(root, backupRoot).replace(/\\/gu, '/'),
      created_node_ids: createdNodeIds,
      reused_node_ids: [...new Set(reusedNodeIds)],
      attached_event_ids: attachedEventIds,
      unresolved_event_ids: plan.ambiguities
        .map((item) => item.event_id)
        .filter((id) => !resolvedIds.has(id)),
      verified: true
    }
    await writeText(
      path.join(root, '.quillarium', 'migrations', plan.plan_id, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`
    )
    return report
  })
}

function isTimelinePlacementRecord(value: unknown): value is Record<string, unknown> & {
  timeline_id: string
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)['timeline_id'] === 'string'
  )
}

function storyTimeComponents(coordinate: StoryTimeInput): Record<string, number> {
  return {
    year: coordinate.year,
    month: coordinate.month,
    ...(coordinate.day !== null && coordinate.day !== undefined ? { day: coordinate.day } : {}),
    ...(coordinate.hour !== null && coordinate.hour !== undefined ? { hour: coordinate.hour } : {}),
    ...(coordinate.minute !== null && coordinate.minute !== undefined ? { minute: coordinate.minute } : {})
  }
}

function legacyCoordinateSortValue(coordinate: StoryTimeInput): number {
  return (
    (((coordinate.year * 13 + coordinate.month) * 32 + (coordinate.day ?? 0)) * 25 + (coordinate.hour ?? 0)) *
      61 +
    (coordinate.minute ?? 0)
  )
}

function stableSuggestionId(value: string): string {
  return `time-${createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)}`
}

function compactTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)
}
