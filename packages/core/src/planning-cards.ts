import type { CardRelation, DocType, DocumentIdentity, PlanningCardDoc, ReferenceDoc } from './types.js'
import { createLocalDocumentReferenceResolver, type LocalReferenceCandidate } from './document-references.js'

export const PLANNING_CARD_TYPES = new Set<DocType>([
  'canon',
  'character',
  'character_relation',
  'timeline_node',
  'timeline_event',
  'location',
  'route',
  'foreshadowing',
  'world_entry',
  'issue',
  'strategy',
  'pattern',
  'narrative',
  'character_state'
])

export interface PlanningCardGraphIssue {
  severity: 'error' | 'warning' | 'info'
  code:
    | 'missing-source-reference'
    | 'ambiguous-source-reference'
    | 'missing-relation-target'
    | 'ambiguous-relation-target'
    | 'self-relation'
    | 'isolated-card'
  card_id: string
  target_id?: string
  resolved_target_id?: string
  relation_field?: string
  candidates?: LocalReferenceCandidate[]
  message: string
}

export interface PlanningCardGraphOptions {
  projectRoot?: string
  includeCard?: (document: PlanningCardDoc) => boolean
  countInboundFrom?: (document: PlanningCardDoc) => boolean
}

export type DocumentWithContent<T extends DocumentIdentity = DocumentIdentity> = {
  path?: string
  data: T
  content: string
}

export function isPlanningCardType(type: string): type is DocType {
  return PLANNING_CARD_TYPES.has(type as DocType)
}

export function isPlanningCard(document: DocumentIdentity): document is PlanningCardDoc {
  return isPlanningCardType(document.type)
}

export function isEnabledPlanningCard(document: DocumentIdentity): boolean {
  if (!isPlanningCard(document)) return false
  return document.enabled !== false
}

export function enabledPlanningCards<T extends DocumentWithContent>(documents: T[]): T[] {
  return documents.filter((document) => isEnabledPlanningCard(document.data))
}

export function derivedCardsForReference<T extends DocumentWithContent>(
  reference: ReferenceDoc | string,
  documents: T[]
): T[] {
  const referenceId = typeof reference === 'string' ? reference : reference.id
  return documents.filter(
    (document) => isPlanningCard(document.data) && (document.data.source_refs ?? []).includes(referenceId)
  )
}

export function relationTargets(document: DocumentIdentity): string[] {
  if (!isPlanningCard(document)) return []
  return [
    ...(document.relations ?? []).map((relation) => relation.target_id),
    ...intrinsicCardLinks(document).map((link) => link.target_id)
  ].filter((target, index, targets) => target && targets.indexOf(target) === index)
}

export function validatePlanningCardGraph(
  documents: Array<DocumentWithContent<DocumentIdentity>>,
  options: PlanningCardGraphOptions = {}
): PlanningCardGraphIssue[] {
  const byId = new Map(documents.map((document) => [document.data.id, document.data]))
  const resolver = createLocalDocumentReferenceResolver(documents, options.projectRoot)
  const inbound = new Map<string, number>()
  const issues: PlanningCardGraphIssue[] = []
  const includeCard = options.includeCard ?? (() => true)
  const countInboundFrom = options.countInboundFrom ?? (() => true)

  for (const document of documents) {
    if (!isPlanningCard(document.data)) continue
    const included = includeCard(document.data)
    for (const sourceId of document.data.source_refs ?? []) {
      const resolved = resolver.resolve(sourceId, {
        sourcePath: document.path,
        origin: 'structured_link'
      })
      const source = resolved.target_id ? byId.get(resolved.target_id) : undefined
      if (resolved.status === 'ambiguous') {
        if (included) {
          issues.push({
            severity: 'error',
            code: 'ambiguous-source-reference',
            card_id: document.data.id,
            target_id: sourceId,
            relation_field: 'source_refs',
            candidates: resolved.candidates,
            message: `Card ${document.data.id} cites ambiguous reference material ${sourceId}.`
          })
        }
      } else if (!source || source.type !== 'reference') {
        if (included) {
          issues.push({
            severity: 'error',
            code: 'missing-source-reference',
            card_id: document.data.id,
            target_id: sourceId,
            relation_field: 'source_refs',
            message: `Card ${document.data.id} cites missing reference material ${sourceId}.`
          })
        }
      } else if (countInboundFrom(document.data) && resolved.target_id) {
        inbound.set(resolved.target_id, (inbound.get(resolved.target_id) ?? 0) + 1)
      }
    }
    const links = [
      ...(document.data.relations ?? []).map((relation) => ({
        target_id: relation.target_id,
        field: 'relations'
      })),
      ...intrinsicCardLinks(document.data)
    ]
    for (const relation of links) {
      const resolved = resolver.resolve(relation.target_id, {
        sourcePath: document.path,
        origin: 'structured_link'
      })
      if (resolved.status === 'ambiguous') {
        if (included) {
          issues.push({
            severity: 'error',
            code: 'ambiguous-relation-target',
            card_id: document.data.id,
            target_id: relation.target_id,
            relation_field: relation.field,
            candidates: resolved.candidates,
            message: `Card ${document.data.id} links to ambiguous card ${relation.target_id} through ${relation.field}.`
          })
        }
        continue
      }
      const targetId = resolved.target_id
      if (targetId === document.data.id) {
        if (included) {
          issues.push({
            severity: 'warning',
            code: 'self-relation',
            card_id: document.data.id,
            target_id: relation.target_id,
            resolved_target_id: targetId,
            relation_field: relation.field,
            message: `Card ${document.data.id} links to itself through ${relation.field}.`
          })
        }
        continue
      }
      if (!targetId || !byId.has(targetId)) {
        if (included) {
          issues.push({
            severity: 'error',
            code: 'missing-relation-target',
            card_id: document.data.id,
            target_id: relation.target_id,
            relation_field: relation.field,
            message: `Card ${document.data.id} links to missing card ${relation.target_id} through ${relation.field}.`
          })
        }
      } else if (countInboundFrom(document.data)) {
        inbound.set(targetId, (inbound.get(targetId) ?? 0) + 1)
      }
    }
  }

  for (const document of documents) {
    if (!isPlanningCard(document.data) || !includeCard(document.data)) continue
    const hasOutgoing =
      (document.data.source_refs ?? []).length > 0 || relationTargets(document.data).length > 0
    if (!hasOutgoing && !inbound.has(document.data.id)) {
      issues.push({
        severity: 'info',
        code: 'isolated-card',
        card_id: document.data.id,
        message: `Card ${document.data.id} is not connected to any material or card.`
      })
    }
  }

  return issues
}

function intrinsicCardLinks(document: PlanningCardDoc): Array<{ target_id: string; field: string }> {
  const data = document as PlanningCardDoc & Record<string, unknown>
  const links: Array<{ target_id: string; field: string }> = []
  const add = (field: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) links.push({ target_id: value, field })
  }
  const addMany = (field: string, value: unknown) => {
    if (!Array.isArray(value)) return
    for (const item of value) add(field, item)
  }

  switch (document.type) {
    case 'character':
      for (const field of ['born_at', 'died_at', 'introduced_at', 'exited_at']) add(field, data[field])
      break
    case 'character_relation':
      for (const field of ['from_character', 'to_character', 'starts_at', 'ends_at']) add(field, data[field])
      break
    case 'foreshadowing': {
      add('planted_at', data['planted_at'])
      add('related_arc', data['related_arc'])
      for (const field of ['planned_plant_ref', 'planned_resolve_ref']) {
        const position = data[field]
        if (typeof position === 'object' && position !== null) {
          const record = position as Record<string, unknown>
          if (record['target_type'] !== 'timeline') add(`${field}.target_id`, record['target_id'])
          add(`${field}.outline_id`, record['outline_id'])
        }
      }
      addMany('reinforced_at', data['reinforced_at'])
      addMany('related_characters', data['related_characters'])
      const triggers = Array.isArray(data['trigger_conditions']) ? data['trigger_conditions'] : []
      for (const trigger of triggers) {
        if (typeof trigger === 'object' && trigger !== null) {
          add('trigger_conditions.target_id', (trigger as Record<string, unknown>)['target_id'])
        }
      }
      break
    }
    case 'world_entry': {
      addMany('links', data['links'])
      const uses = Array.isArray(data['used_in']) ? data['used_in'] : []
      for (const use of uses) {
        if (typeof use === 'object' && use !== null)
          add('used_in.scene', (use as Record<string, unknown>)['scene'])
      }
      break
    }
    case 'issue':
      addMany('related_docs', data['related_docs'])
      break
    case 'character_state':
      add('character', data['character'])
      add('scope_id', data['scope_id'])
      add('timeline_node', data['timeline_node'])
      break
    case 'timeline_node':
      add('previous', data['previous'])
      add('next', data['next'])
      break
    case 'timeline_event':
      add('timeline_node', data['timeline_node'])
      add('location', data['location'])
      add('previous', data['previous'])
      add('next', data['next'])
      add('flashback_reference', data['flashback_reference'])
      addMany('characters', data['characters'])
      break
    case 'location': {
      add('parent_location', data['parent_location'])
      add('layout_of', data['layout_of'])
      const nodes = Array.isArray(data['diagram_nodes']) ? data['diagram_nodes'] : []
      for (const node of nodes) {
        if (typeof node === 'object' && node !== null) {
          add('diagram_nodes.target_location', (node as Record<string, unknown>)['target_location'])
        }
      }
      break
    }
    case 'route':
      add('from', data['from'])
      add('to', data['to'])
      break
  }

  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.field}\0${link.target_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function assertCardReferencesExist(
  document: DocumentIdentity,
  documents: Array<DocumentWithContent<DocumentIdentity>>,
  projectRoot?: string
): void {
  if (!isPlanningCard(document)) return
  const resolver = createLocalDocumentReferenceResolver(documents, projectRoot)
  for (const source of document.source_refs ?? []) {
    const resolved = resolver.resolve(source, { origin: 'structured_link' })
    if (resolved.status === 'ambiguous') throw new Error(`Reference material is ambiguous: ${source}`)
    const target = documents.find((item) => item.data.id === resolved.target_id)
    if (!target || target.data.type !== 'reference')
      throw new Error(`Reference material not found: ${source}`)
  }
  for (const relation of document.relations ?? []) {
    const resolved = resolver.resolve(relation.target_id, { origin: 'structured_link' })
    if (resolved.status === 'ambiguous') throw new Error(`Related card is ambiguous: ${relation.target_id}`)
    if (!resolved.target_id) throw new Error(`Related card not found: ${relation.target_id}`)
  }
}

export function normalizeCardRelations(value: CardRelation[]): CardRelation[] {
  const seen = new Set<string>()
  return value.filter((relation) => {
    const key = `${relation.kind}\0${relation.target_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
