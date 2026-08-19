import path from 'node:path'
import { rm } from 'node:fs/promises'
import { ensureDir, listMarkdownFiles, pathExists, readMarkdown, readText, writeMarkdown } from './fs.js'
import { makeId, slugify } from './ids.js'
import { assertOutlinePlacementAgainst, normalizeOutlineLevel } from './outline-rules.js'
import {
  baseDocSchema,
  canonSchema,
  chapterProseSchema,
  characterRelationSchema,
  characterStateSchema,
  characterSchema,
  factionMembershipSchema,
  factionRelationSchema,
  factionSchema,
  foreshadowingSchema,
  issueSchema,
  locationSchema,
  narrativeSchema,
  outlineSchema,
  patternSchema,
  referenceSchema,
  routeSchema,
  sceneSchema,
  strategySchema,
  timelineEventSchema,
  timelineNodeSchema,
  worldEntrySchema
} from './schema.js'
import type {
  BaseDoc,
  CanonDoc,
  CharacterRelationDoc,
  ChapterProseDoc,
  CharacterStateDoc,
  CharacterDoc,
  DocType,
  DocumentIdentity,
  FactionDoc,
  FactionMembershipDoc,
  FactionRelationDoc,
  ForeshadowingDoc,
  IssueDoc,
  LocationDoc,
  NarrativeDoc,
  OutlineDoc,
  OutlineLevelInput,
  PatternDoc,
  PlanningCardDoc,
  ProjectIndex,
  ProjectIndexEntry,
  ReferenceDoc,
  RouteDoc,
  SceneDoc,
  StrategyDoc,
  TimelineEventDoc,
  TimelineNodeDoc,
  WorldEntryDoc
} from './types.js'
import { loadProject, projectPaths } from './project.js'
import { writeText } from './fs.js'
import {
  compareTimelineNodes,
  parseStoryTime,
  timelineNodeKey,
  validateStoryTime,
  validateTimelineChain
} from './timeline.js'

const TYPE_DIR: Record<DocType, string> = {
  canon: 'canon',
  character: 'characters',
  character_relation: 'characters/relations',
  faction: 'factions',
  faction_relation: 'factions/relations',
  faction_membership: 'factions/memberships',
  timeline_node: 'timeline/nodes',
  timeline_event: 'timeline',
  location: 'locations',
  route: 'locations/routes',
  foreshadowing: 'foreshadowing',
  world_entry: 'world',
  reference: 'references',
  issue: 'issues',
  strategy: 'strategy',
  pattern: 'patterns',
  narrative: 'narrative',
  character_state: 'character-states',
  resource: 'resources',
  causality: 'causality',
  outline: 'outlines',
  chapter_prose: 'chapters',
  scene: 'scenes',
  prompt: 'prompts'
}

const DOC_SCHEMAS = {
  canon: canonSchema.passthrough(),
  character: characterSchema.passthrough(),
  character_relation: characterRelationSchema.passthrough(),
  faction: factionSchema.passthrough(),
  faction_relation: factionRelationSchema.passthrough(),
  faction_membership: factionMembershipSchema.passthrough(),
  timeline_node: timelineNodeSchema.passthrough(),
  timeline_event: timelineEventSchema.passthrough(),
  location: locationSchema.passthrough(),
  route: routeSchema.passthrough(),
  foreshadowing: foreshadowingSchema.passthrough(),
  world_entry: worldEntrySchema.passthrough(),
  reference: referenceSchema.passthrough(),
  issue: issueSchema.passthrough(),
  strategy: strategySchema.passthrough(),
  pattern: patternSchema.passthrough(),
  narrative: narrativeSchema.passthrough(),
  character_state: characterStateSchema.passthrough(),
  resource: baseDocSchema.passthrough(),
  causality: baseDocSchema.passthrough(),
  outline: outlineSchema,
  chapter_prose: chapterProseSchema,
  scene: sceneSchema,
  prompt: baseDocSchema.passthrough()
}

const reservedAutoIds = new Map<string, Set<string>>()

function planningCardFields(partial: Partial<PlanningCardDoc>) {
  return {
    enabled: partial.enabled ?? true,
    source_refs: partial.source_refs ?? [],
    relations: partial.relations ?? [],
    image: partial.image ?? null
  }
}

export function dirForType(projectRoot: string, type: DocType): string {
  return path.join(projectRoot, TYPE_DIR[type])
}

export function fileForDoc(projectRoot: string, type: DocType, id: string, title: string): string {
  return path.join(dirForType(projectRoot, type), `${id}-${slugify(title)}.md`)
}

async function allocateAutoId(
  projectRoot: string,
  type: DocType,
  prefix: string,
  title: string
): Promise<string> {
  const suggested = makeId(prefix, title)
  const reservationKey = `${path.resolve(projectRoot)}\0${type}`
  const reserved = reservedAutoIds.get(reservationKey) ?? new Set<string>()
  reservedAutoIds.set(reservationKey, reserved)
  const existingIds = new Set(
    (await listDocs<BaseDoc>(projectRoot, type)).map((document) => document.data.id)
  )
  if (!existingIds.has(suggested) && !reserved.has(suggested)) {
    reserved.add(suggested)
    return suggested
  }

  const base = `${prefix}-${slugify(title).toLocaleLowerCase()}`
  for (let suffix = 2; suffix <= 100_000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!existingIds.has(candidate) && !reserved.has(candidate)) {
      reserved.add(candidate)
      return candidate
    }
  }
  throw new Error(`Could not allocate a unique ${type} id for ${title}.`)
}

export async function createCanon(
  projectRoot: string,
  title: string,
  content: string,
  partial: Partial<CanonDoc> = {}
): Promise<string> {
  const doc = canonSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'canon', 'canon', title)),
    type: 'canon',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    strength: partial.strength ?? 'hard',
    source: partial.source ?? 'user'
  }) as CanonDoc
  const file = fileForDoc(projectRoot, 'canon', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

export async function searchCanon(
  projectRoot: string,
  query: string
): Promise<Array<{ path: string; data: CanonDoc; content: string }>> {
  const needle = query.toLocaleLowerCase()
  const docs = await listDocs<CanonDoc>(projectRoot, 'canon')
  return docs.filter((doc) =>
    [doc.data.id, doc.data.title, doc.data.status, doc.data.strength, doc.data.source, doc.content]
      .join('\n')
      .toLocaleLowerCase()
      .includes(needle)
  )
}

export async function importCanonFile(
  projectRoot: string,
  sourceFile: string,
  options: Partial<CanonDoc> = {}
): Promise<string> {
  const content = await readText(sourceFile)
  const title = path.basename(sourceFile, path.extname(sourceFile))
  return createCanon(projectRoot, title, content, { ...options, source: options.source ?? 'imported' })
}

export async function createCharacter(
  projectRoot: string,
  name: string,
  partial: Partial<CharacterDoc> = {},
  content = ''
): Promise<string> {
  const doc = characterSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'character', 'char', name)),
    type: 'character',
    schema_version: 1,
    title: name,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    aliases: partial.aliases ?? [],
    role: partial.role ?? 'supporting',
    speech_style: partial.speech_style ?? '',
    desire: partial.desire ?? '',
    fear: partial.fear ?? '',
    bottom_line: partial.bottom_line ?? '',
    motivation_anchors: partial.motivation_anchors ?? [],
    relationships: partial.relationships ?? {},
    arc: partial.arc ?? {},
    ooc_guardrails: partial.ooc_guardrails ?? [],
    active_flags: partial.active_flags ?? [],
    disclosure: partial.disclosure ?? [],
    born_at: partial.born_at ?? null,
    died_at: partial.died_at ?? null,
    introduced_at: partial.introduced_at ?? null,
    exited_at: partial.exited_at ?? null,
    scene_state: partial.scene_state ?? {}
  }) as CharacterDoc
  const file = fileForDoc(projectRoot, 'character', doc.id, name)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Profile\n\n## Notes\n`)
  return file
}

export async function createCharacterRelation(
  projectRoot: string,
  title: string,
  partial: Partial<CharacterRelationDoc> &
    Pick<CharacterRelationDoc, 'from_character' | 'to_character' | 'relation_type'>,
  content = ''
): Promise<string> {
  const characters = await listDocs<CharacterDoc>(projectRoot, 'character')
  const characterIds = new Set(characters.map((document) => document.data.id))
  if (!characterIds.has(partial.from_character)) {
    throw new Error(`Relationship source character not found: ${partial.from_character}`)
  }
  if (!characterIds.has(partial.to_character)) {
    throw new Error(`Relationship target character not found: ${partial.to_character}`)
  }
  if (partial.from_character === partial.to_character) {
    throw new Error('A character relationship must connect two different characters.')
  }
  const timelineDocuments = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
  const timelineIds = new Set(timelineDocuments.map((document) => document.data.id))
  for (const nodeId of [partial.starts_at, partial.ends_at]) {
    if (nodeId && !timelineIds.has(nodeId)) throw new Error(`Timeline node not found: ${nodeId}`)
  }
  if (partial.starts_at && partial.ends_at) {
    const order = new Map(
      timelineDocuments
        .map((document) => document.data)
        .sort(compareTimelineNodes)
        .map((node, index) => [node.id, index] as const)
    )
    if (Number(order.get(partial.ends_at)) <= Number(order.get(partial.starts_at))) {
      throw new Error('Relationship end time must be after start time.')
    }
  }
  const doc = characterRelationSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'character_relation', 'rel', title)),
    type: 'character_relation',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    from_character: partial.from_character,
    to_character: partial.to_character,
    relation_type: partial.relation_type,
    direction: partial.direction ?? 'directed',
    starts_at: partial.starts_at ?? null,
    ends_at: partial.ends_at ?? null,
    visibility: partial.visibility ?? 'private'
  }) as CharacterRelationDoc
  const file = fileForDoc(projectRoot, 'character_relation', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

export async function createFaction(
  projectRoot: string,
  title: string,
  partial: Partial<FactionDoc> = {},
  content = ''
): Promise<string> {
  const locationIds = new Set(
    (await listDocs<LocationDoc>(projectRoot, 'location')).map((document) => document.data.id)
  )
  if (partial.headquarters && !locationIds.has(partial.headquarters)) {
    throw new Error(`Faction headquarters not found: ${partial.headquarters}`)
  }
  await assertTimelineInterval(projectRoot, partial.founded_at, partial.dissolved_at, 'Faction')
  const doc = factionSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'faction', 'faction', title)),
    type: 'faction',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    aliases: partial.aliases ?? [],
    faction_kind: partial.faction_kind ?? 'organization',
    summary: partial.summary ?? '',
    motto: partial.motto ?? '',
    goals: partial.goals ?? [],
    methods: partial.methods ?? [],
    headquarters: partial.headquarters ?? null,
    founded_at: partial.founded_at ?? null,
    dissolved_at: partial.dissolved_at ?? null,
    visibility: partial.visibility ?? 'private'
  }) as FactionDoc
  const file = fileForDoc(projectRoot, 'faction', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Faction\n`)
  return file
}

export async function createFactionRelation(
  projectRoot: string,
  title: string,
  partial: Partial<FactionRelationDoc> &
    Pick<FactionRelationDoc, 'from_faction' | 'to_faction' | 'relation_type'>,
  content = ''
): Promise<string> {
  const factionIds = new Set(
    (await listDocs<FactionDoc>(projectRoot, 'faction')).map((document) => document.data.id)
  )
  if (!factionIds.has(partial.from_faction)) {
    throw new Error(`Faction relationship source not found: ${partial.from_faction}`)
  }
  if (!factionIds.has(partial.to_faction)) {
    throw new Error(`Faction relationship target not found: ${partial.to_faction}`)
  }
  if (partial.from_faction === partial.to_faction) {
    throw new Error('A faction relationship must connect two different factions.')
  }
  await assertTimelineInterval(projectRoot, partial.starts_at, partial.ends_at, 'Faction relationship')
  const doc = factionRelationSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'faction_relation', 'frel', title)),
    type: 'faction_relation',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    from_faction: partial.from_faction,
    to_faction: partial.to_faction,
    relation_type: partial.relation_type,
    direction: partial.direction ?? 'directed',
    starts_at: partial.starts_at ?? null,
    ends_at: partial.ends_at ?? null,
    visibility: partial.visibility ?? 'private'
  }) as FactionRelationDoc
  const file = fileForDoc(projectRoot, 'faction_relation', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

export async function createFactionMembership(
  projectRoot: string,
  title: string,
  partial: Partial<FactionMembershipDoc> & Pick<FactionMembershipDoc, 'faction_id' | 'character_id'>,
  content = ''
): Promise<string> {
  const [factions, characters] = await Promise.all([
    listDocs<FactionDoc>(projectRoot, 'faction'),
    listDocs<CharacterDoc>(projectRoot, 'character')
  ])
  if (!factions.some((document) => document.data.id === partial.faction_id)) {
    throw new Error(`Faction membership faction not found: ${partial.faction_id}`)
  }
  if (!characters.some((document) => document.data.id === partial.character_id)) {
    throw new Error(`Faction membership character not found: ${partial.character_id}`)
  }
  await assertTimelineInterval(projectRoot, partial.starts_at, partial.ends_at, 'Faction membership')
  const doc = factionMembershipSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'faction_membership', 'member', title)),
    type: 'faction_membership',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    faction_id: partial.faction_id,
    character_id: partial.character_id,
    role: partial.role ?? 'member',
    rank: partial.rank ?? '',
    primary: partial.primary ?? false,
    starts_at: partial.starts_at ?? null,
    ends_at: partial.ends_at ?? null,
    visibility: partial.visibility ?? 'private'
  }) as FactionMembershipDoc
  const file = fileForDoc(projectRoot, 'faction_membership', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

async function assertTimelineInterval(
  projectRoot: string,
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  label: string
): Promise<void> {
  if (!startsAt && !endsAt) return
  const timelineDocuments = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
  const timelineIds = new Set(timelineDocuments.map((document) => document.data.id))
  for (const nodeId of [startsAt, endsAt]) {
    if (nodeId && !timelineIds.has(nodeId)) throw new Error(`Timeline node not found: ${nodeId}`)
  }
  if (!startsAt || !endsAt) return
  const order = new Map(
    timelineDocuments
      .map((document) => document.data)
      .sort(compareTimelineNodes)
      .map((node, index) => [node.id, index] as const)
  )
  if (Number(order.get(endsAt)) <= Number(order.get(startsAt))) {
    throw new Error(`${label} end time must be after start time.`)
  }
}

export async function createForeshadowing(
  projectRoot: string,
  title: string,
  partial: Partial<ForeshadowingDoc> = {},
  content = ''
): Promise<string> {
  const doc = foreshadowingSchema.parse({
    id:
      partial.id ??
      (partial.code
        ? partial.code.toLocaleLowerCase()
        : await allocateAutoId(projectRoot, 'foreshadowing', 'fb', title)),
    type: 'foreshadowing',
    schema_version: 1,
    title,
    status: partial.status ?? partial.state ?? 'planned',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    code: partial.code ?? '',
    level: partial.level ?? 'L4',
    summary: partial.summary ?? '',
    planned_plant: partial.planned_plant ?? '',
    planted_at: partial.planted_at ?? null,
    reinforced_at: partial.reinforced_at ?? [],
    planned_resolve: partial.planned_resolve ?? '',
    expires_at: partial.expires_at ?? '',
    state: partial.state ?? 'planned',
    related_characters: partial.related_characters ?? [],
    related_arc: partial.related_arc ?? '',
    trigger_conditions: partial.trigger_conditions ?? [],
    reminder_window: partial.reminder_window ?? '',
    reminded_at: partial.reminded_at ?? []
  }) as ForeshadowingDoc
  const file = path.join(dirForType(projectRoot, 'foreshadowing'), `${doc.id}.md`)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Foreshadowing\n`)
  return file
}

export async function createWorldEntry(
  projectRoot: string,
  title: string,
  partial: Partial<WorldEntryDoc> = {},
  content = ''
): Promise<string> {
  const doc = worldEntrySchema.parse({
    id:
      partial.id ??
      (partial.code
        ? partial.code.toLocaleLowerCase()
        : await allocateAutoId(projectRoot, 'world_entry', 'world', title)),
    type: 'world_entry',
    schema_version: 1,
    title,
    status: partial.status ?? partial.entry_status ?? 'candidate',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    code: partial.code ?? '',
    triggers: partial.triggers ?? [],
    category_tags: partial.category_tags ?? [],
    role: partial.role ?? 'both',
    valid_from: partial.valid_from ?? '',
    valid_until: partial.valid_until ?? '',
    entry_status: partial.entry_status ?? 'candidate',
    importance: partial.importance ?? 'medium',
    historical_reference: partial.historical_reference ?? '',
    story_setting: partial.story_setting ?? '',
    used_in: partial.used_in ?? [],
    links: partial.links ?? [],
    source: partial.source ?? ''
  }) as WorldEntryDoc
  const file = fileForDoc(projectRoot, 'world_entry', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## World Entry\n`)
  return file
}

export async function createReference(
  projectRoot: string,
  title: string,
  partial: Partial<ReferenceDoc> = {},
  content = ''
): Promise<string> {
  const doc = referenceSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'reference', 'ref', title)),
    type: 'reference',
    schema_version: 1,
    title,
    tags: partial.tags ?? [],
    source_title: partial.source_title ?? title,
    author: partial.author ?? '',
    material_type: partial.material_type ?? 'other',
    location: partial.location ?? '',
    reading_status: partial.reading_status ?? 'unread',
    topic_tags: partial.topic_tags ?? [],
    extracted_entries: partial.extracted_entries ?? [],
    value_assessment: partial.value_assessment ?? ''
  }) as ReferenceDoc
  const file = fileForDoc(projectRoot, 'reference', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Reference\n`)
  return file
}

export async function createIssue(
  projectRoot: string,
  title: string,
  partial: Partial<IssueDoc> = {},
  content = ''
): Promise<string> {
  const doc = issueSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'issue', 'issue', title)),
    type: 'issue',
    schema_version: 1,
    title,
    status: partial.status ?? partial.state ?? 'open',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    priority: partial.priority ?? 'medium',
    state: partial.state ?? 'open',
    due: partial.due ?? '',
    decision_needed: partial.decision_needed ?? '',
    related_docs: partial.related_docs ?? [],
    rule_id: partial.rule_id ?? '',
    evidence: partial.evidence ?? '',
    check_fingerprint: partial.check_fingerprint ?? '',
    ...(partial.issue_identity_v2 ? { issue_identity_v2: partial.issue_identity_v2 } : {}),
    legacy_check_fingerprints: partial.legacy_check_fingerprints ?? [],
    checked_at: partial.checked_at ?? ''
  }) as IssueDoc
  const file = path.join(dirForType(projectRoot, 'issue'), `${doc.id}.md`)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Issue\n`)
  return file
}

export async function createStrategy(
  projectRoot: string,
  title: string,
  partial: Partial<StrategyDoc> = {},
  content = ''
): Promise<string> {
  const doc = strategySchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'strategy', 'strategy', title)),
    type: 'strategy',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    category: partial.category ?? 'narrative',
    scope: partial.scope ?? 'project',
    principles: partial.principles ?? [],
    avoid: partial.avoid ?? []
  }) as StrategyDoc
  const file = fileForDoc(projectRoot, 'strategy', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Strategy\n`)
  return file
}

export async function createPattern(
  projectRoot: string,
  title: string,
  partial: Partial<PatternDoc> = {},
  content = ''
): Promise<string> {
  const doc = patternSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'pattern', 'pattern', title)),
    type: 'pattern',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    kind: partial.kind ?? 'story',
    scope: partial.scope ?? 'project',
    applies_to: partial.applies_to ?? [],
    source: partial.source ?? 'user'
  }) as PatternDoc
  const file = fileForDoc(projectRoot, 'pattern', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Pattern\n`)
  return file
}

export async function createNarrative(
  projectRoot: string,
  title: string,
  partial: Partial<NarrativeDoc> = {},
  content = ''
): Promise<string> {
  const doc = narrativeSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'narrative', 'narrative', title)),
    type: 'narrative',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    category: partial.category ?? 'style',
    scope: partial.scope ?? 'project',
    applies_to: partial.applies_to ?? [],
    principles: partial.principles ?? [],
    avoid: partial.avoid ?? [],
    source: partial.source ?? 'user',
    sample: partial.sample ?? ''
  }) as NarrativeDoc
  const file = fileForDoc(projectRoot, 'narrative', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

export async function createCharacterState(
  projectRoot: string,
  title: string,
  partial: Partial<CharacterStateDoc>,
  content = ''
): Promise<string> {
  const doc = characterStateSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'character_state', 'state', title)),
    type: 'character_state',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    character: partial.character,
    scope_type: partial.scope_type ?? 'outline',
    scope_id: partial.scope_id,
    timeline_node: partial.timeline_node ?? null,
    motivation: partial.motivation ?? '',
    emotion: partial.emotion ?? '',
    knowledge: partial.knowledge ?? [],
    relationship_delta: partial.relationship_delta ?? {},
    public_disclosure: partial.public_disclosure ?? [],
    notes: partial.notes ?? ''
  }) as CharacterStateDoc
  const file = fileForDoc(projectRoot, 'character_state', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Character State\n`)
  return file
}

export async function createTimelineNode(
  projectRoot: string,
  title: string,
  partial: Partial<TimelineNodeDoc> & Pick<TimelineNodeDoc, 'year' | 'month'>,
  content = ''
): Promise<string> {
  const time = validateStoryTime(partial)
  const existing = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
  const candidateForKey = timelineNodeSchema.parse({
    id: partial.id ?? 'timeline-key-preview',
    type: 'timeline_node',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    ...time,
    previous: null,
    next: null,
    coordinate_v2: partial.coordinate_v2 ?? null,
    timeline_tracks: partial.timeline_tracks ?? []
  }) as TimelineNodeDoc
  const duplicate = existing.find(
    (document) => timelineNodeKey(document.data) === timelineNodeKey(candidateForKey)
  )
  if (duplicate) {
    throw new Error(
      `Timeline node ${duplicate.data.title} already represents this moment; attach another event to that node.`
    )
  }

  const ordered = [...existing].sort((a, b) => compareTimelineNodes(a.data, b.data))
  const insertionIndex = ordered.findIndex(
    (document) => compareTimelineNodes(candidateForKey, document.data) < 0
  )
  const index = insertionIndex < 0 ? ordered.length : insertionIndex
  const previous = index > 0 ? ordered[index - 1] : null
  const next = index < ordered.length ? ordered[index] : null
  const doc = timelineNodeSchema.parse({
    ...candidateForKey,
    id: partial.id ?? (await allocateAutoId(projectRoot, 'timeline_node', 'time', title)),
    previous: previous?.data.id ?? null,
    next: next?.data.id ?? null
  }) as TimelineNodeDoc
  const file = fileForDoc(projectRoot, 'timeline_node', doc.id, title)
  const previousSnapshot = previous ? { data: previous.data, content: previous.content } : null
  const nextSnapshot = next ? { data: next.data, content: next.content } : null

  try {
    await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
    if (previous) {
      await writeMarkdown(
        previous.path,
        { ...previous.data, next: doc.id } as unknown as Record<string, unknown>,
        previous.content
      )
    }
    if (next) {
      await writeMarkdown(
        next.path,
        { ...next.data, previous: doc.id } as unknown as Record<string, unknown>,
        next.content
      )
    }
    const updated = (await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')).map(
      (document) => document.data
    )
    const issues = validateTimelineChain(updated)
    if (issues.length) throw new Error(issues.map((issue) => issue.message).join(' '))
    return file
  } catch (error) {
    await rm(file, { force: true })
    if (previous && previousSnapshot) {
      await writeMarkdown(
        previous.path,
        previousSnapshot.data as unknown as Record<string, unknown>,
        previousSnapshot.content
      )
    }
    if (next && nextSnapshot) {
      await writeMarkdown(
        next.path,
        nextSnapshot.data as unknown as Record<string, unknown>,
        nextSnapshot.content
      )
    }
    throw error
  }
}

export async function createTimelineEventAtNode(
  projectRoot: string,
  timelineNode: string,
  title: string,
  partial: Partial<TimelineEventDoc> = {},
  content = ''
): Promise<string> {
  const node = await findDoc<TimelineNodeDoc>(projectRoot, timelineNode)
  if (!node) throw new Error(`Timeline node not found: ${timelineNode}`)
  return appendTimelineEvent(
    projectRoot,
    title,
    {
      ...partial,
      timeline_node: node.data.id,
      date: node.data.display_time,
      previous: null,
      next: null
    },
    content
  )
}

export async function attachTimelineEventToNode(
  projectRoot: string,
  eventId: string,
  timelineNode: string,
  displayTime?: string
): Promise<string> {
  const [event, node] = await Promise.all([
    findDoc<TimelineEventDoc>(projectRoot, eventId),
    findDoc<TimelineNodeDoc>(projectRoot, timelineNode)
  ])
  if (!event) throw new Error(`Timeline event not found: ${eventId}`)
  if (!node) throw new Error(`Timeline node not found: ${timelineNode}`)
  const date = displayTime?.trim() || event.data.date.trim() || node.data.display_time
  await writeMarkdown(
    event.path,
    {
      ...event.data,
      timeline_node: node.data.id,
      date,
      previous: null,
      next: null
    } as unknown as Record<string, unknown>,
    event.content
  )
  return event.path
}

export async function createTimelineNodeFromEvent(
  projectRoot: string,
  eventId: string,
  title?: string,
  storyTime?: string
): Promise<string> {
  const event = await findDoc<TimelineEventDoc>(projectRoot, eventId)
  if (!event) throw new Error(`Timeline event not found: ${eventId}`)
  const rawTime = storyTime?.trim() || event.data.date.trim()
  const time = parseStoryTime(rawTime)
  const nodes = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
  const key = timelineNodeKey({
    calendar: time.calendar ?? 'story',
    year: time.year,
    month: time.month,
    day: time.day ?? null,
    hour: time.hour ?? null,
    minute: time.minute ?? null
  })
  const existing = nodes.find((item) => timelineNodeKey(item.data) === key)
  if (existing) {
    await attachTimelineEventToNode(projectRoot, event.data.id, existing.data.id, time.display_time)
    return existing.path
  }

  const nodePath = await createTimelineNode(
    projectRoot,
    title?.trim() || event.data.title || time.display_time || rawTime,
    time
  )
  const node = await readMarkdown<Record<string, unknown>>(nodePath)
  const nodeData = timelineNodeSchema.parse(node.data) as TimelineNodeDoc
  await attachTimelineEventToNode(projectRoot, event.data.id, nodeData.id, time.display_time)
  return nodePath
}

export async function appendTimelineEvent(
  projectRoot: string,
  title: string,
  partial: Partial<TimelineEventDoc> = {},
  content = ''
): Promise<string> {
  if (partial.timeline_node && !(await findDoc<TimelineNodeDoc>(projectRoot, partial.timeline_node))) {
    throw new Error(`Timeline node not found: ${partial.timeline_node}`)
  }
  const events = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
  const previous =
    partial.previous === undefined ? (events.at(-1)?.data.id ?? null) : (partial.previous ?? null)
  const doc = timelineEventSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'timeline_event', 'evt', title)),
    type: 'timeline_event',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    timeline_node: partial.timeline_node ?? null,
    date: partial.date ?? '',
    previous,
    next: partial.next ?? null,
    duration: partial.duration ?? '',
    location: partial.location ?? null,
    characters: partial.characters ?? [],
    flashback_reference: partial.flashback_reference ?? null,
    placements: partial.placements ?? []
  }) as TimelineEventDoc
  const file = fileForDoc(projectRoot, 'timeline_event', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Event\n`)
  return file
}

export async function createLocation(
  projectRoot: string,
  title: string,
  partial: Partial<LocationDoc> = {},
  content = ''
): Promise<string> {
  const doc = locationSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'location', 'loc', title)),
    type: 'location',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    kind: partial.kind ?? 'position',
    scale: partial.scale ?? 'city',
    parent_location: partial.parent_location ?? null,
    layout_of: partial.layout_of ?? null,
    relative_direction: partial.relative_direction ?? '',
    floor: partial.floor ?? '',
    diagram_nodes: partial.diagram_nodes ?? [],
    diagram_edges: partial.diagram_edges ?? [],
    description: partial.description ?? ''
  }) as LocationDoc
  const file = fileForDoc(projectRoot, 'location', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Location\n`)
  return file
}

export async function createRoute(
  projectRoot: string,
  from: string,
  to: string,
  partial: Partial<RouteDoc> = {}
): Promise<string> {
  const title = partial.title ?? `${from} to ${to}`
  const doc = routeSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'route', 'route', title)),
    type: 'route',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    ...planningCardFields(partial),
    from,
    to,
    distance_li: partial.distance_li ?? null,
    travel_time_days: partial.travel_time_days ?? null,
    route_type: partial.route_type ?? 'road',
    restriction: partial.restriction ?? ''
  }) as RouteDoc
  const file = fileForDoc(projectRoot, 'route', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, `## Route\n`)
  return file
}

export async function createOutline(
  projectRoot: string,
  level: OutlineLevelInput,
  title: string,
  partial: Partial<OutlineDoc> = {},
  content = '',
  options: { placement?: 'strict' | 'legacy-import' } = {}
): Promise<string> {
  const currentLevel = normalizeOutlineLevel(level)
  const parent = partial.parent ?? null
  if (options.placement !== 'legacy-import') {
    const [outlines, project] = await Promise.all([
      listDocs<OutlineDoc>(projectRoot, 'outline'),
      loadProject(projectRoot)
    ])
    assertOutlinePlacementAgainst(
      outlines.map((item) => item.data),
      currentLevel,
      parent,
      undefined,
      project.story_structure
    )
  }
  const doc = outlineSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'outline', currentLevel, title)),
    type: 'outline',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
    tags: partial.tags ?? [],
    level: currentLevel,
    parent,
    order: partial.order ?? (await nextDirectStoryOrder(projectRoot, parent)),
    target_words: partial.target_words,
    chapter_hook: partial.chapter_hook,
    story_purpose: partial.story_purpose ?? '',
    core_characters: partial.core_characters ?? [],
    central_conflict: partial.central_conflict ?? '',
    final_direction: partial.final_direction ?? '',
    worldline_axis: partial.worldline_axis ?? '',
    character_destiny_axis: partial.character_destiny_axis ?? '',
    key_stages: partial.key_stages ?? [],
    causal_chain: partial.causal_chain ?? [],
    final_state: partial.final_state ?? '',
    stage_goal: partial.stage_goal ?? '',
    irreversible_change: partial.irreversible_change ?? '',
    reader_promise: partial.reader_promise ?? '',
    reader_payoff: partial.reader_payoff ?? '',
    reader_benefit: partial.reader_benefit ?? '',
    core_appeal: partial.core_appeal ?? [],
    core_suspense: partial.core_suspense ?? [],
    genre_boundary: partial.genre_boundary ?? [],
    volume_goal: partial.volume_goal ?? '',
    event_chain: partial.event_chain ?? [],
    character_growth: partial.character_growth ?? [],
    story_cycles: partial.story_cycles ?? [],
    conflict_ladder: partial.conflict_ladder ?? [],
    cast_lock: partial.cast_lock ?? [],
    fixed_reveals: partial.fixed_reveals ?? [],
    chapter_goal: partial.chapter_goal ?? '',
    chapter_conflict: partial.chapter_conflict ?? '',
    chapter_change: partial.chapter_change ?? '',
    ending_hook: partial.ending_hook ?? '',
    invariants: partial.invariants ?? [],
    narrative_function: partial.narrative_function ?? '',
    emotional_curve: partial.emotional_curve ?? '',
    povs: partial.povs ?? [],
    start_state: partial.start_state ?? '',
    end_state: partial.end_state ?? '',
    context_pins: partial.context_pins ?? [],
    context_exclusions: partial.context_exclusions ?? [],
    related_timeline: partial.related_timeline ?? [],
    related_characters: partial.related_characters ?? [],
    related_events: partial.related_events ?? [],
    related_foreshadowing: partial.related_foreshadowing ?? [],
    world_entries_used: partial.world_entries_used ?? [],
    foreshadowing_planted: partial.foreshadowing_planted ?? [],
    foreshadowing_resolved: partial.foreshadowing_resolved ?? [],
    related_patterns: partial.related_patterns ?? []
  }) as OutlineDoc
  const file = fileForDoc(projectRoot, 'outline', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## ${title}\n`)
  return file
}

export async function createScene(
  projectRoot: string,
  title: string,
  partial: Partial<SceneDoc>,
  content = ''
): Promise<string> {
  const project = await loadProject(projectRoot)
  if (!project.story_structure.scene_enabled) {
    throw new Error('SCENE_LEVEL_DISABLED')
  }
  const chapterId = partial.chapter_id ?? partial.section
  const doc = sceneSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'scene', 'scene', title)),
    type: 'scene',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
    tags: partial.tags ?? [],
    chapter_id: chapterId,
    section: chapterId,
    order: partial.order ?? (await nextDirectStoryOrder(projectRoot, chapterId ?? null)),
    writing_focus: partial.writing_focus ?? '',
    outline_content: partial.outline_content ?? content,
    accepted_at: partial.accepted_at ?? null,
    purged_at: partial.purged_at ?? null,
    chapter_number: partial.chapter_number ?? '',
    volume: partial.volume ?? '',
    act: partial.act ?? '',
    timeline_node: partial.timeline_node ?? '',
    location: partial.location ?? '',
    pov: partial.pov ?? '',
    characters: partial.characters ?? [],
    world_time: partial.world_time ?? '',
    chapter_break_hook: partial.chapter_break_hook ?? '',
    narrative_function: partial.narrative_function ?? '',
    writing_environment: partial.writing_environment ?? '',
    scene_goal: partial.scene_goal ?? '',
    scene_conflict: partial.scene_conflict ?? '',
    scene_change: partial.scene_change ?? '',
    reader_benefit: partial.reader_benefit ?? '',
    ending_hook: partial.ending_hook ?? '',
    foreshadowing_planted: partial.foreshadowing_planted ?? [],
    foreshadowing_resolved: partial.foreshadowing_resolved ?? [],
    foreshadowing_reinforced: partial.foreshadowing_reinforced ?? [],
    world_entries_used: partial.world_entries_used ?? [],
    impact: partial.impact ?? [],
    target_words: partial.target_words ?? project.section_words,
    chapter_hook: partial.chapter_hook ?? false,
    previous_scene: partial.previous_scene ?? null,
    context_pins: partial.context_pins ?? [],
    context_exclusions: partial.context_exclusions ?? [],
    related_patterns: partial.related_patterns ?? []
  }) as SceneDoc
  const volume = partial.tags?.find((t) => t.startsWith('volume-')) ?? 'volume-01'
  const chapter = partial.tags?.find((t) => t.startsWith('chapter-')) ?? 'chapter-001'
  const file = path.join(projectRoot, 'scenes', volume, chapter, `${doc.id}-${slugify(title)}.md`)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

async function nextDirectStoryOrder(projectRoot: string, parentId: string | null): Promise<number> {
  const [outlines, scenes] = await Promise.all([
    listDocs<OutlineDoc>(projectRoot, 'outline'),
    listDocs<SceneDoc>(projectRoot, 'scene')
  ])
  const directOrders = [
    ...outlines
      .filter(
        (item) =>
          item.data.parent === parentId &&
          ['volume', 'part', 'arc', 'act', 'chapter'].includes(item.data.level)
      )
      .map((item) => item.data.order),
    ...scenes
      .filter((item) => (item.data.chapter_id || item.data.section || null) === parentId)
      .map((item) => item.data.order)
  ]
  return directOrders.length ? Math.max(...directOrders) + 1 : 0
}

export async function createChapterProse(
  projectRoot: string,
  chapterId: string,
  title: string,
  partial: Partial<ChapterProseDoc> = {},
  content = ''
): Promise<string> {
  const existing = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
    (item) => item.data.chapter_id === chapterId
  )
  if (existing) return existing.path
  const doc = chapterProseSchema.parse({
    id: partial.id ?? (await allocateAutoId(projectRoot, 'chapter_prose', 'prose', title)),
    type: 'chapter_prose',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
    tags: partial.tags ?? [],
    chapter_id: chapterId,
    scene_ids: partial.scene_ids ?? [],
    finalized_at: partial.finalized_at ?? null,
    published_at: partial.published_at ?? null
  }) as ChapterProseDoc
  const file = fileForDoc(projectRoot, 'chapter_prose', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content)
  return file
}

export async function listDocs<T extends DocumentIdentity>(
  projectRoot: string,
  type?: DocType
): Promise<Array<{ path: string; data: T; content: string }>> {
  const roots = type
    ? [dirForType(projectRoot, type)]
    : [
        'canon',
        'characters',
        'factions',
        'timeline',
        'locations',
        'foreshadowing',
        'world',
        'references',
        'issues',
        'strategy',
        'patterns',
        'narrative',
        'character-states',
        'resources',
        'causality',
        'outlines',
        'chapters',
        'scenes'
      ].map((d) => path.join(projectRoot, d))
  const files = (await Promise.all(roots.map(listMarkdownFiles))).flat()
  const docs: Array<{ path: string; data: T; content: string }> = []
  for (const file of files) {
    const parsed = await readMarkdown<Record<string, unknown>>(file)
    if (type && parsed.data.type !== type) continue
    const data = parseKnownDocument(parsed.data, file)
    // Prompt assets are intentionally not ordinary project documents.  They are
    // pure Markdown files managed by the prompt loader and have no document
    // identity/frontmatter.  Unknown future document types remain readable as
    // long as they carry the minimum identity fields.
    if (data.type === 'prompt') continue
    if (!hasDocumentIdentity(data)) continue
    docs.push({ path: file, data: data as T, content: parsed.content })
  }
  return docs
}

/** Runtime guard used at document boundaries before data enters a typed API. */
export function hasDocumentIdentity(value: unknown): value is DocumentIdentity {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    typeof record.type === 'string' &&
    record.type.trim().length > 0 &&
    typeof record.title === 'string' &&
    record.title.trim().length > 0 &&
    typeof record.schema_version === 'number' &&
    Number.isFinite(record.schema_version) &&
    Array.isArray(record.tags)
  )
}

export function parseKnownDocument(data: Record<string, unknown>, file: string): Record<string, unknown> {
  const type = data.type
  if (typeof type !== 'string' || !Object.hasOwn(DOC_SCHEMAS, type)) return data

  const schema = DOC_SCHEMAS[type as keyof typeof DOC_SCHEMAS]
  const result = schema.safeParse(data)
  if (result.success) {
    if (type === 'reference') {
      const reference: Record<string, unknown> = { ...result.data }
      delete reference.status
      delete reference.enabled
      delete reference.source_refs
      delete reference.relations
      return reference
    }
    return result.data
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : 'frontmatter'}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid ${type} document at ${file}: ${details}`)
}

export async function findDoc<T extends DocumentIdentity>(
  projectRoot: string,
  id: string
): Promise<{ path: string; data: T; content: string } | null> {
  const docs = await listDocs<T>(projectRoot)
  return docs.find((doc) => doc.data.id === id) ?? null
}

export async function buildIndex(projectRoot: string): Promise<ProjectIndex> {
  const project = await loadProject(projectRoot)
  const docs = await listDocs<DocumentIdentity>(projectRoot)
  const entries: ProjectIndexEntry[] = docs.map((doc) => {
    const status = 'status' in doc.data && typeof doc.data.status === 'string' ? doc.data.status : undefined
    return {
      id: doc.data.id,
      type: doc.data.type,
      title: doc.data.title,
      ...(status ? { status } : {}),
      tags: doc.data.tags ?? [],
      path: path.relative(projectRoot, doc.path).replace(/\\/g, '/')
    }
  })
  const index: ProjectIndex = {
    generated_at: new Date().toISOString(),
    project_title: project.title,
    entries
  }
  const paths = projectPaths(projectRoot)
  await ensureDir(path.dirname(paths.indexFile))
  await writeText(paths.indexFile, `${JSON.stringify(index, null, 2)}\n`)
  return index
}

export async function requireDoc<T extends DocumentIdentity>(
  projectRoot: string,
  id: string
): Promise<{ path: string; data: T; content: string }> {
  const doc = await findDoc<T>(projectRoot, id)
  if (!doc) throw new Error(`Document not found: ${id}`)
  return doc
}

export async function docExists(projectRoot: string, id: string): Promise<boolean> {
  return (await findDoc(projectRoot, id)) !== null
}

export async function projectExists(projectRoot: string): Promise<boolean> {
  return pathExists(path.join(projectRoot, 'project.yaml'))
}
