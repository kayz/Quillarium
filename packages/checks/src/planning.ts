import {
  compareTimelineNodes,
  isEnabledPlanningCard,
  isPlanningCard,
  listDocs,
  listTimelineCatalog,
  checkTimelineDeterministically,
  validatePlanningCardGraph,
  validateTimelineChain,
  type CharacterDoc,
  type CharacterRelationDoc,
  type DocumentIdentity,
  type ForeshadowingDoc,
  type LocationDoc,
  type NarrativeDoc,
  type TimelineEventDoc,
  type TimelineNodeDoc
} from '@quillarium/core'
import type { CheckIssue } from './index.js'

export const PLANNING_CHECK_SCOPES = [
  'project',
  'outline',
  'canon',
  'characters',
  'timeline',
  'locations',
  'foreshadowing',
  'narrative',
  'world',
  'issues',
  'references'
] as const

export type PlanningCheckScope = (typeof PLANNING_CHECK_SCOPES)[number]

const CHECK_TYPES_BY_SCOPE: Record<PlanningCheckScope, ReadonlySet<string>> = {
  project: new Set([
    'outline',
    'canon',
    'character',
    'character_relation',
    'character_state',
    'timeline_node',
    'timeline_event',
    'location',
    'route',
    'foreshadowing',
    'strategy',
    'pattern',
    'narrative'
  ]),
  outline: new Set(['outline']),
  canon: new Set(['canon']),
  characters: new Set(['character', 'character_relation', 'character_state']),
  timeline: new Set(['timeline_node', 'timeline_event']),
  locations: new Set(['location', 'route']),
  foreshadowing: new Set(['foreshadowing']),
  narrative: new Set(['narrative']),
  world: new Set(),
  issues: new Set(),
  references: new Set()
}

/**
 * Trusted scope boundary shared by deterministic and semantic planning checks.
 * World-book entries are deliberately absent from every scope: they are reference
 * knowledge, not deterministic story truth.
 */
export function isPlanningCheckDocumentType(type: string, scope: PlanningCheckScope): boolean {
  return CHECK_TYPES_BY_SCOPE[scope].has(type)
}

export interface PlanningRuleReport {
  generated_at: string
  checked_card_ids: string[]
  skipped_disabled_ids: string[]
  issues: CheckIssue[]
}

const LOCATION_SCALE_ORDER: Record<string, number> = {
  global: 0,
  region: 1,
  city: 2,
  district: 3,
  estate: 4,
  interior: 5
}

export async function checkPlanningCards(
  projectRoot: string,
  scope: PlanningCheckScope = 'project'
): Promise<PlanningRuleReport> {
  const documents = await listDocs<DocumentIdentity>(projectRoot)
  const included = documents.filter(
    (document) =>
      isPlanningCard(document.data) &&
      isPlanningCheckDocumentType(document.data.type, scope) &&
      isEnabledPlanningCard(document.data)
  )
  const includedIds = new Set(included.map((document) => document.data.id))
  const skippedDisabled = documents.filter(
    (document) =>
      isPlanningCard(document.data) &&
      isPlanningCheckDocumentType(document.data.type, scope) &&
      !isEnabledPlanningCard(document.data)
  )
  const issues: CheckIssue[] = []
  const byId = new Map(documents.map((document) => [document.data.id, document]))

  for (const issue of validatePlanningCardGraph(documents, {
    projectRoot,
    includeCard: (document) => document.type !== 'issue' && includedIds.has(document.id),
    countInboundFrom: (document) => isPlanningCheckDocumentType(document.type, scope)
  })) {
    issues.push({
      severity: issue.severity,
      code: `planning-${issue.code}`,
      message: issue.message,
      evidence: issue.relation_field ? `Field: ${issue.relation_field}` : undefined,
      related_ids: [issue.card_id, issue.target_id].filter((id): id is string => Boolean(id))
    })
  }

  const timelineNodes = documents
    .filter((document) => document.data.type === 'timeline_node')
    .map((document) => document.data as TimelineNodeDoc)
  const timelineEvents = documents
    .filter((document) => document.data.type === 'timeline_event')
    .map((document) => document.data as TimelineEventDoc)
  if (scope === 'project' || scope === 'timeline') {
    const timelineCatalog = await listTimelineCatalog(projectRoot)
    for (const issue of checkTimelineDeterministically({
      tracks: timelineCatalog.tracks.map((track) => track.value),
      nodes: timelineNodes,
      events: timelineEvents,
      characters:
        scope === 'project'
          ? documents
              .filter((document) => document.data.type === 'character')
              .map((document) => document.data as CharacterDoc)
          : []
    })) {
      issues.push({
        severity: issue.severity,
        code: `planning-${issue.code}`,
        message: issue.summary,
        evidence: issue.evidence.join('; '),
        related_ids: [...issue.track_ids, ...issue.node_ids, ...issue.event_ids, ...issue.character_ids]
      })
    }
    for (const issue of validateTimelineChain(timelineNodes)) {
      if (!includedIds.has(issue.node_id)) continue
      issues.push({
        severity:
          issue.code === 'duplicate-time-node' || issue.code === 'timeline-cycle' ? 'error' : 'warning',
        code: `planning-${issue.code}`,
        message: issue.message,
        related_ids: [issue.node_id, issue.related_id].filter((id): id is string => Boolean(id))
      })
    }
  }

  const nodeOrder = new Map(
    [...timelineNodes].sort(compareTimelineNodes).map((node, index) => [node.id, index] as const)
  )
  for (const document of included) {
    switch (document.data.type) {
      case 'timeline_event':
        checkTimelineEvent(document.data as TimelineEventDoc, issues)
        break
      case 'character':
        checkCharacterTimes(document.data as CharacterDoc, nodeOrder, issues)
        break
      case 'character_relation':
        checkCharacterRelationTimes(document.data as CharacterRelationDoc, nodeOrder, issues)
        break
      case 'location':
        checkLocation(document.data as LocationDoc, byId, issues)
        break
      case 'foreshadowing':
        checkForeshadowingCard(document.data as ForeshadowingDoc, issues)
        break
      case 'narrative':
        checkNarrativeCard(document.data as NarrativeDoc, document.content, issues)
        break
    }
  }

  return {
    generated_at: new Date().toISOString(),
    checked_card_ids: included.map((document) => document.data.id),
    skipped_disabled_ids: skippedDisabled.map((document) => document.data.id),
    issues: uniqueIssues(issues)
  }
}

function checkTimelineEvent(event: TimelineEventDoc, issues: CheckIssue[]): void {
  if (event.timeline_node) return
  issues.push({
    severity: 'error',
    code: 'planning-event-without-time-node',
    message: `Timeline event ${event.id} is not attached to a timeline node.`,
    related_ids: [event.id]
  })
}

function checkCharacterTimes(
  character: CharacterDoc,
  nodeOrder: Map<string, number>,
  issues: CheckIssue[]
): void {
  const sequence = [
    ['born_at', character.born_at],
    ['introduced_at', character.introduced_at],
    ['exited_at', character.exited_at],
    ['died_at', character.died_at]
  ] as const
  let previous: (typeof sequence)[number] | null = null
  for (const item of sequence) {
    if (!item[1] || !nodeOrder.has(item[1])) continue
    if (previous && Number(nodeOrder.get(previous[1]!)) > Number(nodeOrder.get(item[1]))) {
      issues.push({
        severity: 'error',
        code: 'planning-character-time-order',
        message: `Character ${character.id} has ${previous[0]} after ${item[0]}.`,
        evidence: `${previous[0]}=${previous[1]}; ${item[0]}=${item[1]}`,
        related_ids: [character.id, previous[1]!, item[1]]
      })
    }
    previous = item
  }
}

function checkCharacterRelationTimes(
  relation: CharacterRelationDoc,
  nodeOrder: Map<string, number>,
  issues: CheckIssue[]
): void {
  if (!relation.starts_at) {
    issues.push({
      severity: 'error',
      code: 'planning-character-relation-missing-start',
      message: `Character relationship ${relation.id} has no start timeline node.`,
      related_ids: [relation.id, relation.from_character, relation.to_character]
    })
    return
  }
  if (
    relation.ends_at &&
    nodeOrder.has(relation.starts_at) &&
    nodeOrder.has(relation.ends_at) &&
    Number(nodeOrder.get(relation.starts_at)) >= Number(nodeOrder.get(relation.ends_at))
  ) {
    issues.push({
      severity: 'error',
      code: 'planning-character-relation-time-order',
      message: `Character relationship ${relation.id} must end after it starts.`,
      evidence: `starts_at=${relation.starts_at}; ends_at=${relation.ends_at}`,
      related_ids: [relation.id, relation.from_character, relation.to_character]
    })
  }
}

function checkLocation(
  location: LocationDoc,
  byId: Map<string, { data: DocumentIdentity; content: string }>,
  issues: CheckIssue[]
): void {
  if (location.kind === 'layout' && !location.layout_of) {
    issues.push({
      severity: 'error',
      code: 'planning-layout-without-position',
      message: `Layout card ${location.id} does not explain an existing position card.`,
      related_ids: [location.id]
    })
  }
  if (location.kind === 'position' && location.layout_of) {
    issues.push({
      severity: 'warning',
      code: 'planning-position-has-layout-target',
      message: `Position card ${location.id} should not use layout_of.`,
      related_ids: [location.id, location.layout_of]
    })
  }
  if (location.layout_of) {
    const target = byId.get(location.layout_of)?.data
    if (target?.type === 'location' && (target as LocationDoc).kind !== 'position') {
      issues.push({
        severity: 'error',
        code: 'planning-layout-target-not-position',
        message: `Layout card ${location.id} points to another layout instead of a position card.`,
        related_ids: [location.id, location.layout_of]
      })
    }
  }
  if (location.parent_location) {
    const parent = byId.get(location.parent_location)?.data
    if (parent?.type === 'location') {
      const parentScale = LOCATION_SCALE_ORDER[(parent as LocationDoc).scale]
      const childScale = LOCATION_SCALE_ORDER[location.scale]
      if (parentScale !== undefined && childScale !== undefined && parentScale > childScale) {
        issues.push({
          severity: 'error',
          code: 'planning-location-scale-order',
          message: `Location ${location.id} has a parent at a narrower spatial scale.`,
          evidence: `parent=${location.parent_location}:${(parent as LocationDoc).scale}; child=${location.id}:${location.scale}`,
          related_ids: [location.id, location.parent_location]
        })
      }
    }
  }
}

function checkForeshadowingCard(card: ForeshadowingDoc, issues: CheckIssue[]): void {
  if (card.trigger_conditions.length) return
  issues.push({
    severity: 'warning',
    code: 'planning-foreshadowing-without-trigger',
    message: `Foreshadowing card ${card.id} has no reminder trigger condition.`,
    related_ids: [card.id]
  })
}

function checkNarrativeCard(card: NarrativeDoc, content: string, issues: CheckIssue[]): void {
  if (card.principles.length || card.sample.trim() || content.trim()) return
  issues.push({
    severity: 'warning',
    code: 'planning-empty-narrative-card',
    message: `Enabled narrative card ${card.id} has no principle, sample, or body content.`,
    related_ids: [card.id]
  })
}

function uniqueIssues(issues: CheckIssue[]): CheckIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}\0${[...(issue.related_ids ?? [])].sort().join(',')}\0${issue.evidence ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
