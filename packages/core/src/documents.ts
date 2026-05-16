import path from 'node:path'
import { ensureDir, listMarkdownFiles, pathExists, readMarkdown, readText, writeMarkdown } from './fs.js'
import { makeId, slugify } from './ids.js'
import {
  canonSchema,
  characterSchema,
  locationSchema,
  outlineSchema,
  routeSchema,
  sceneSchema,
  timelineEventSchema
} from './schema.js'
import type {
  BaseDoc,
  CanonDoc,
  CharacterDoc,
  DocType,
  LocationDoc,
  OutlineDoc,
  ProjectIndex,
  ProjectIndexEntry,
  RouteDoc,
  SceneDoc,
  TimelineEventDoc
} from './types.js'
import { loadProject, projectPaths } from './project.js'
import { writeText } from './fs.js'

const TYPE_DIR: Record<DocType, string> = {
  canon: 'canon',
  character: 'characters',
  timeline_event: 'timeline',
  location: 'locations',
  route: 'locations/routes',
  resource: 'resources',
  causality: 'causality',
  outline: 'outlines',
  scene: 'scenes',
  prompt: 'prompts'
}

export function dirForType(projectRoot: string, type: DocType): string {
  return path.join(projectRoot, TYPE_DIR[type])
}

export function fileForDoc(projectRoot: string, type: DocType, id: string, title: string): string {
  return path.join(dirForType(projectRoot, type), `${id}-${slugify(title)}.md`)
}

export async function createCanon(projectRoot: string, title: string, content: string, partial: Partial<CanonDoc> = {}): Promise<string> {
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

export async function importCanonFile(projectRoot: string, sourceFile: string, options: Partial<CanonDoc> = {}): Promise<string> {
  const content = await readText(sourceFile)
  const title = path.basename(sourceFile, path.extname(sourceFile))
  return createCanon(projectRoot, title, content, { ...options, source: options.source ?? 'imported' })
}

export async function createCharacter(projectRoot: string, name: string, partial: Partial<CharacterDoc> = {}, content = ''): Promise<string> {
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
    relationships: partial.relationships ?? {},
    arc: partial.arc ?? {},
    ooc_guardrails: partial.ooc_guardrails ?? [],
    scene_state: partial.scene_state ?? {}
  }) as CharacterDoc
  const file = fileForDoc(projectRoot, 'character', doc.id, name)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Profile\n\n## Notes\n`)
  return file
}

export async function appendTimelineEvent(projectRoot: string, title: string, partial: Partial<TimelineEventDoc> = {}, content = ''): Promise<string> {
  const events = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
  const previous = partial.previous === undefined ? events.at(-1)?.data.id ?? null : partial.previous ?? null
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

export async function createLocation(projectRoot: string, title: string, partial: Partial<LocationDoc> = {}, content = ''): Promise<string> {
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

export async function createRoute(projectRoot: string, from: string, to: string, partial: Partial<RouteDoc> = {}): Promise<string> {
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

export async function createOutline(projectRoot: string, level: OutlineDoc['level'], title: string, partial: Partial<OutlineDoc> = {}, content = ''): Promise<string> {
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
    chapter_hook: partial.chapter_hook
  }) as OutlineDoc
  const file = fileForDoc(projectRoot, 'outline', doc.id, title)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## ${title}\n`)
  return file
}

export async function createScene(projectRoot: string, title: string, partial: Partial<SceneDoc>, content = ''): Promise<string> {
  const project = await loadProject(projectRoot)
  const doc = sceneSchema.parse({
    id: partial.id ?? makeId('scene', title),
    type: 'scene',
    schema_version: 1,
    title,
    status: partial.status ?? 'draft',
    tags: partial.tags ?? [],
    section: partial.section,
    timeline_node: partial.timeline_node,
    location: partial.location,
    pov: partial.pov,
    characters: partial.characters ?? [],
    target_words: partial.target_words ?? project.section_words,
    chapter_hook: partial.chapter_hook ?? false,
    previous_scene: partial.previous_scene ?? null
  }) as SceneDoc
  const volume = partial.tags?.find(t => t.startsWith('volume-')) ?? 'volume-01'
  const chapter = partial.tags?.find(t => t.startsWith('chapter-')) ?? 'chapter-001'
  const file = path.join(projectRoot, 'scenes', volume, chapter, `${doc.id}-${slugify(title)}.md`)
  await writeMarkdown(file, doc as unknown as Record<string, unknown>, content || `## Draft\n`)
  return file
}

export async function listDocs<T extends BaseDoc>(projectRoot: string, type?: DocType): Promise<Array<{ path: string; data: T; content: string }>> {
  const roots = type ? [dirForType(projectRoot, type)] : [
    'canon', 'characters', 'timeline', 'locations', 'resources', 'causality', 'outlines', 'scenes', 'prompts'
  ].map(d => path.join(projectRoot, d))
  const files = (await Promise.all(roots.map(listMarkdownFiles))).flat()
  const docs = []
  for (const file of files) {
    const parsed = await readMarkdown<Record<string, unknown>>(file)
    if (!type || parsed.data.type === type) docs.push({ path: file, data: parsed.data, content: parsed.content })
  }
  return docs as Array<{ path: string; data: T; content: string }>
}

export async function findDoc<T extends BaseDoc>(projectRoot: string, id: string): Promise<{ path: string; data: T; content: string } | null> {
  const docs = await listDocs<T>(projectRoot)
  return docs.find(doc => doc.data.id === id) ?? null
}

export async function buildIndex(projectRoot: string): Promise<ProjectIndex> {
  const project = await loadProject(projectRoot)
  const docs = await listDocs<BaseDoc>(projectRoot)
  const entries: ProjectIndexEntry[] = docs.map(doc => ({
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

export async function requireDoc<T extends BaseDoc>(projectRoot: string, id: string): Promise<{ path: string; data: T; content: string }> {
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
