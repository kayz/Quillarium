import path from 'node:path'
import { ensureDir, listMarkdownFiles, pathExists, readMarkdown, readText, writeMarkdown } from './fs.js'
import { makeId, slugify } from './ids.js'
import {
  baseDocSchema,
  canonSchema,
  characterStateSchema,
  characterSchema,
  foreshadowingSchema,
  issueSchema,
  locationSchema,
  outlineSchema,
  patternSchema,
  referenceSchema,
  routeSchema,
  sceneSchema,
  strategySchema,
  timelineEventSchema,
  worldEntrySchema
} from './schema.js'
import type {
  BaseDoc,
  CanonDoc,
  CharacterStateDoc,
  CharacterDoc,
  DocType,
  ForeshadowingDoc,
  IssueDoc,
  LocationDoc,
  OutlineDoc,
  PatternDoc,
  ProjectIndex,
  ProjectIndexEntry,
  ReferenceDoc,
  RouteDoc,
  SceneDoc,
  StrategyDoc,
  TimelineEventDoc,
  WorldEntryDoc
} from './types.js'
import { loadProject, projectPaths } from './project.js'
import { writeText } from './fs.js'

const TYPE_DIR: Record<DocType, string> = {
  canon: 'canon',
  character: 'characters',
  timeline_event: 'timeline',
  location: 'locations',
  route: 'locations/routes',
  foreshadowing: 'foreshadowing',
  world_entry: 'world',
  reference: 'references',
  issue: 'issues',
  strategy: 'strategy',
  pattern: 'patterns',
  character_state: 'character-states',
  resource: 'resources',
  causality: 'causality',
  outline: 'outlines',
  scene: 'scenes',
  prompt: 'prompts'
}

const DOC_SCHEMAS = {
  canon: canonSchema.passthrough(),
  character: characterSchema.passthrough(),
  timeline_event: timelineEventSchema.passthrough(),
  location: locationSchema.passthrough(),
  route: routeSchema.passthrough(),
  foreshadowing: foreshadowingSchema.passthrough(),
  world_entry: worldEntrySchema.passthrough(),
  reference: referenceSchema.passthrough(),
  issue: issueSchema.passthrough(),
  strategy: strategySchema.passthrough(),
  pattern: patternSchema.passthrough(),
  character_state: characterStateSchema.passthrough(),
  resource: baseDocSchema.passthrough(),
  causality: baseDocSchema.passthrough(),
  outline: outlineSchema.passthrough(),
  scene: sceneSchema.passthrough(),
  prompt: baseDocSchema.passthrough()
}

export function dirForType(projectRoot: string, type: DocType): string {
  return path.join(projectRoot, TYPE_DIR[type])
}

export function fileForDoc(projectRoot: string, type: DocType, id: string, title: string): string {
  return path.join(dirForType(projectRoot, type), `${id}-${slugify(title)}.md`)
}

export async function createCanon(
  projectRoot: string,
  title: string,
  content: string,
  partial: Partial<CanonDoc> = {}
): Promise<string> {
  const doc = canonSchema.parse({
    id: partial.id ?? makeId('canon', title),
    type: 'canon',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
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
    id: partial.id ?? makeId('char', name),
    type: 'character',
    schema_version: 1,
    title: name,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
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
    scene_state: partial.scene_state ?? {}
  }) as CharacterDoc
  const file = fileForDoc(projectRoot, 'character', doc.id, name)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Profile\n\n## Notes\n`)
  return file
}

export async function createForeshadowing(
  projectRoot: string,
  title: string,
  partial: Partial<ForeshadowingDoc> = {},
  content = ''
): Promise<string> {
  const doc = foreshadowingSchema.parse({
    id: partial.id ?? (partial.code ? partial.code.toLocaleLowerCase() : makeId('fb', title)),
    type: 'foreshadowing',
    schema_version: 1,
    title,
    status: partial.status ?? partial.state ?? 'planned',
    tags: partial.tags ?? [],
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
    related_arc: partial.related_arc ?? ''
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
    id: partial.id ?? (partial.code ? partial.code.toLocaleLowerCase() : makeId('world', title)),
    type: 'world_entry',
    schema_version: 1,
    title,
    status: partial.status ?? partial.entry_status ?? 'candidate',
    tags: partial.tags ?? [],
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
    id: partial.id ?? makeId('ref', title),
    type: 'reference',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
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
    id: partial.id ?? makeId('issue', title),
    type: 'issue',
    schema_version: 1,
    title,
    status: partial.status ?? partial.state ?? 'open',
    tags: partial.tags ?? [],
    priority: partial.priority ?? 'medium',
    state: partial.state ?? 'open',
    due: partial.due ?? '',
    decision_needed: partial.decision_needed ?? '',
    related_docs: partial.related_docs ?? []
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
    id: partial.id ?? makeId('strategy', title),
    type: 'strategy',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
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
    id: partial.id ?? makeId('pattern', title),
    type: 'pattern',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
    kind: partial.kind ?? 'story',
    scope: partial.scope ?? 'project',
    applies_to: partial.applies_to ?? [],
    source: partial.source ?? 'user'
  }) as PatternDoc
  const file = fileForDoc(projectRoot, 'pattern', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Pattern\n`)
  return file
}

export async function createCharacterState(
  projectRoot: string,
  title: string,
  partial: Partial<CharacterStateDoc>,
  content = ''
): Promise<string> {
  const doc = characterStateSchema.parse({
    id: partial.id ?? makeId('state', title),
    type: 'character_state',
    schema_version: 1,
    title,
    status: partial.status ?? 'active',
    tags: partial.tags ?? [],
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

export async function appendTimelineEvent(
  projectRoot: string,
  title: string,
  partial: Partial<TimelineEventDoc> = {},
  content = ''
): Promise<string> {
  const events = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
  const previous =
    partial.previous === undefined ? (events.at(-1)?.data.id ?? null) : (partial.previous ?? null)
  const doc = timelineEventSchema.parse({
    id: partial.id ?? makeId('evt', title),
    type: 'timeline_event',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    date: partial.date ?? '',
    previous,
    next: partial.next ?? null,
    duration: partial.duration ?? '',
    location: partial.location ?? null,
    characters: partial.characters ?? [],
    flashback_reference: partial.flashback_reference ?? null
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
    id: partial.id ?? makeId('loc', title),
    type: 'location',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
    parent_location: partial.parent_location ?? null,
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
    id: partial.id ?? makeId('route', title),
    type: 'route',
    schema_version: 1,
    title,
    status: partial.status ?? 'confirmed',
    tags: partial.tags ?? [],
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
  level: OutlineDoc['level'],
  title: string,
  partial: Partial<OutlineDoc> = {},
  content = ''
): Promise<string> {
  const doc = outlineSchema.parse({
    id: partial.id ?? makeId(level, title),
    type: 'outline',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
    tags: partial.tags ?? [],
    level,
    parent: partial.parent ?? null,
    order: partial.order ?? 0,
    target_words: partial.target_words,
    chapter_hook: partial.chapter_hook,
    reader_promise: partial.reader_promise ?? '',
    reader_payoff: partial.reader_payoff ?? '',
    reader_benefit: partial.reader_benefit ?? '',
    core_appeal: partial.core_appeal ?? [],
    core_suspense: partial.core_suspense ?? [],
    genre_boundary: partial.genre_boundary ?? [],
    volume_goal: partial.volume_goal ?? '',
    event_chain: partial.event_chain ?? [],
    character_growth: partial.character_growth ?? [],
    writer_cycles: partial.writer_cycles ?? [],
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
  const doc = sceneSchema.parse({
    id: partial.id ?? makeId('scene', title),
    type: 'scene',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
    tags: partial.tags ?? [],
    chapter_number: partial.chapter_number ?? '',
    volume: partial.volume ?? '',
    act: partial.act ?? '',
    section: partial.section,
    timeline_node: partial.timeline_node,
    location: partial.location,
    pov: partial.pov,
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
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Draft\n`)
  return file
}

export async function listDocs<T extends BaseDoc>(
  projectRoot: string,
  type?: DocType
): Promise<Array<{ path: string; data: T; content: string }>> {
  const roots = type
    ? [dirForType(projectRoot, type)]
    : [
        'canon',
        'characters',
        'timeline',
        'locations',
        'foreshadowing',
        'world',
        'references',
        'issues',
        'strategy',
        'patterns',
        'character-states',
        'resources',
        'causality',
        'outlines',
        'scenes',
        'prompts'
      ].map((d) => path.join(projectRoot, d))
  const files = (await Promise.all(roots.map(listMarkdownFiles))).flat()
  const docs = []
  for (const file of files) {
    const parsed = await readMarkdown<Record<string, unknown>>(file)
    if (type && parsed.data.type !== type) continue
    const data = parseKnownDocument(parsed.data, file)
    docs.push({ path: file, data, content: parsed.content })
  }
  return docs as Array<{ path: string; data: T; content: string }>
}

function parseKnownDocument(data: Record<string, unknown>, file: string): Record<string, unknown> {
  const type = data.type
  if (typeof type !== 'string' || !Object.hasOwn(DOC_SCHEMAS, type)) return data

  const schema = DOC_SCHEMAS[type as keyof typeof DOC_SCHEMAS]
  const result = schema.safeParse(data)
  if (result.success) return result.data

  const details = result.error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : 'frontmatter'}: ${issue.message}`)
    .join('; ')
  throw new Error(`Invalid ${type} document at ${file}: ${details}`)
}

export async function findDoc<T extends BaseDoc>(
  projectRoot: string,
  id: string
): Promise<{ path: string; data: T; content: string } | null> {
  const docs = await listDocs<T>(projectRoot)
  return docs.find((doc) => doc.data.id === id) ?? null
}

export async function buildIndex(projectRoot: string): Promise<ProjectIndex> {
  const project = await loadProject(projectRoot)
  const docs = await listDocs<BaseDoc>(projectRoot)
  const entries: ProjectIndexEntry[] = docs.map((doc) => ({
    id: doc.data.id,
    type: doc.data.type,
    title: doc.data.title,
    status: doc.data.status,
    tags: doc.data.tags ?? [],
    path: path.relative(projectRoot, doc.path).replace(/\\/g, '/')
  }))
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

export async function requireDoc<T extends BaseDoc>(
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
