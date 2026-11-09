import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  appendTimelineEvent,
  createChapterProse,
  createCharacter,
  createFaction,
  createItem,
  createLocation,
  createOutline,
  createWorldEntry,
  listDocs
} from './documents.js'
import { ensureDir, readMarkdown, writeText } from './fs.js'
import { loadProject } from './project.js'
import type { OutlineDoc } from './types.js'

export const BOOK_BREAKDOWN_TYPES = [
  'world_entry',
  'character',
  'location',
  'timeline_event',
  'item',
  'faction'
] as const

export type BookBreakdownType = (typeof BOOK_BREAKDOWN_TYPES)[number]

export interface BookBreakdownProposal {
  id: string
  type: BookBreakdownType
  title: string
  content: string
  selected: boolean
}

export interface BookBreakdownUnit {
  kind: 'volume' | 'chapter'
  title: string
  content: string
  volume_title?: string
}

export interface BookBreakdownPlan {
  id: string
  import_prose: boolean
  proposals: BookBreakdownProposal[]
  units: BookBreakdownUnit[]
  /** Present only when prose stays out of the writing tree. */
  source_text?: string
  warning?: string
}

export interface BookBreakdownResult {
  record_path: string
  written: Array<{ type: BookBreakdownType; title: string; id: string }>
  chapters: string[]
  volumes: string[]
}

const STRUCTURE_LINE = /^(?:#{1,6}[ \t]+)?(第[0-9０-９一二三四五六七八九十百千零两]+[卷章])(?:[ \t]+(.+))?$/u

export function splitBookBreakdown(text: string): BookBreakdownUnit[] {
  const units: BookBreakdownUnit[] = []
  let volumeTitle: string | undefined
  let pending: string[] = []
  let chapter: { title: string; lines: string[] } | null = null
  const flushChapter = () => {
    if (!chapter) return
    units.push({
      kind: 'chapter',
      title: chapter.title,
      content: chapter.lines.join('\n').trim(),
      ...(volumeTitle ? { volume_title: volumeTitle } : {})
    })
    chapter = null
  }
  for (const line of text.split(/\r?\n/u)) {
    const match = line.trim().match(STRUCTURE_LINE)
    if (!match) {
      if (chapter) chapter.lines.push(line)
      else pending.push(line)
      continue
    }
    const title = [match[1], match[2]?.trim()].filter(Boolean).join(' ')
    if (match[1]!.endsWith('卷')) {
      flushChapter()
      units.push({ kind: 'volume', title, content: '' })
      volumeTitle = title
      continue
    }
    flushChapter()
    chapter = { title, lines: pending }
    pending = []
  }
  flushChapter()
  return units
}

export function parseBookBreakdownProposals(
  response: string
): Array<Pick<BookBreakdownProposal, 'type' | 'title' | 'content'>> {
  const start = response.indexOf('{')
  const end = response.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(response.slice(start, end + 1))
  } catch {
    return []
  }
  const proposals = (parsed as { proposals?: unknown }).proposals
  if (!Array.isArray(proposals)) return []
  const accepted = new Set<string>(BOOK_BREAKDOWN_TYPES)
  return proposals.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const type = String(record.type ?? '')
    const title = String(record.title ?? '').trim()
    if (!accepted.has(type) || !title) return []
    return [{ type: type as BookBreakdownType, title, content: String(record.content ?? '').trim() }]
  })
}

export function buildBookBreakdownPlan(input: {
  text: string
  importProse?: boolean
  proposals?: Array<Pick<BookBreakdownProposal, 'type' | 'title' | 'content'> & { selected?: boolean }>
  warning?: string
}): BookBreakdownPlan {
  const importProse = input.importProse === true
  return {
    id: `book-breakdown-${randomUUID()}`,
    import_prose: importProse,
    proposals: (input.proposals ?? []).map((proposal) => ({
      id: randomUUID(),
      type: proposal.type,
      title: proposal.title.trim(),
      content: proposal.content,
      selected: proposal.selected !== false
    })),
    units: importProse ? splitBookBreakdown(input.text) : [],
    ...(importProse ? {} : { source_text: input.text }),
    ...(input.warning ? { warning: input.warning } : {})
  }
}

export async function confirmBookBreakdown(
  projectRoot: string,
  plan: BookBreakdownPlan
): Promise<BookBreakdownResult> {
  const written: BookBreakdownResult['written'] = []
  for (const proposal of plan.proposals) {
    if (!proposal.selected || !proposal.title.trim()) continue
    const id = await writeProposal(projectRoot, proposal)
    written.push({ type: proposal.type, title: proposal.title.trim(), id })
  }
  const chapters: string[] = []
  const volumes: string[] = []
  if (plan.import_prose) {
    const placed = await writeProseUnits(projectRoot, plan.units)
    chapters.push(...placed.chapters)
    volumes.push(...placed.volumes)
  }
  const record = {
    id: plan.id,
    import_prose: plan.import_prose,
    proposals: plan.proposals.map(({ id, type, title, selected }) => ({ id, type, title, selected })),
    written,
    chapters,
    volumes,
    ...(plan.import_prose ? {} : { source_text: plan.source_text ?? '' })
  }
  const directory = path.join(projectRoot, '.quillarium', 'book-breakdown')
  await ensureDir(directory)
  const recordPath = path.join(directory, `${plan.id}.json`)
  await writeText(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  return { record_path: recordPath, written, chapters, volumes }
}

async function writeProposal(projectRoot: string, proposal: BookBreakdownProposal): Promise<string> {
  const title = proposal.title.trim()
  const content = proposal.content.trim()
  if (proposal.type === 'character') {
    return readCreatedId(await createCharacter(projectRoot, title, {}, content))
  }
  if (proposal.type === 'location') {
    return readCreatedId(await createLocation(projectRoot, title, {}, content))
  }
  if (proposal.type === 'item') {
    return readCreatedId(await createItem(projectRoot, title, { description: content }, content))
  }
  if (proposal.type === 'faction') {
    return readCreatedId(await createFaction(projectRoot, title, {}, content))
  }
  if (proposal.type === 'timeline_event') {
    return readCreatedId(await appendTimelineEvent(projectRoot, title, {}, content))
  }
  return readCreatedId(await createWorldEntry(projectRoot, title, {}, content))
}

async function readCreatedId(file: string): Promise<string> {
  const stored = await readMarkdown<Record<string, unknown>>(file)
  return String(stored.data.id ?? '')
}

async function writeProseUnits(
  projectRoot: string,
  units: BookBreakdownUnit[]
): Promise<{ chapters: string[]; volumes: string[] }> {
  const project = await loadProject(projectRoot)
  let outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
  let book = outlines.find((item) => item.data.level === 'book')
  if (!book) {
    const file = await createOutline(projectRoot, 'book', project.title || '总纲')
    outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
    book = outlines.find((item) => item.path === file)
  }
  if (!book) throw new Error('Book outline is missing.')
  const volumeIds = new Map<string, string>()
  const createdVolumes: string[] = []
  const createdChapters: string[] = []
  const ensureVolume = async (title: string): Promise<string> => {
    const known = volumeIds.get(title)
    if (known) return known
    outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
    const existing = outlines
      .filter((item) => item.data.level === 'volume' && item.data.title === title)
      .sort((left, right) => left.data.order - right.data.order)[0]
    if (existing) {
      volumeIds.set(title, existing.data.id)
      return existing.data.id
    }
    const file = await createOutline(projectRoot, 'volume', title, { parent: book.data.id })
    outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
    const created = outlines.find((item) => item.path === file)
    if (!created) throw new Error(`Volume was not created: ${title}`)
    volumeIds.set(title, created.data.id)
    createdVolumes.push(created.data.id)
    return created.data.id
  }
  const firstExisting = outlines
    .filter((item) => item.data.level === 'volume')
    .sort((left, right) => left.data.order - right.data.order)[0]
  const defaultVolumeId = firstExisting ? firstExisting.data.id : await ensureVolume('第一卷')
  for (const unit of units) {
    if (unit.kind === 'volume') {
      await ensureVolume(unit.title)
      continue
    }
    const volumeId = unit.volume_title ? await ensureVolume(unit.volume_title) : defaultVolumeId
    outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
    const parent = chapterParentId(volumeId, outlines, project.story_structure)
    const file = await createOutline(projectRoot, 'chapter', unit.title, { parent })
    outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
    const chapter = outlines.find((item) => item.path === file)
    if (!chapter) throw new Error(`Chapter was not created: ${unit.title}`)
    await createChapterProse(projectRoot, chapter.data.id, `${unit.title} 正文`, {}, unit.content)
    createdChapters.push(chapter.data.id)
  }
  return { chapters: createdChapters, volumes: createdVolumes }
}

function chapterParentId(
  volumeId: string,
  outlines: Array<{ data: OutlineDoc }>,
  structure: { part_enabled: boolean; act_enabled: boolean }
): string {
  if (!structure.part_enabled) return volumeId
  const parts = outlines
    .filter((item) => item.data.level === 'part' && item.data.parent === volumeId)
    .sort((left, right) => left.data.order - right.data.order)
  if (!structure.act_enabled) {
    if (!parts[0]) throw new Error('这部作品的结构要求篇。拆书不会从原文新建篇或幕。')
    return parts[0].data.id
  }
  const acts = outlines
    .filter((item) => item.data.level === 'act' && parts.some((part) => part.data.id === item.data.parent))
    .sort((left, right) => left.data.order - right.data.order)
  const parent = acts[0] ?? parts[0]
  if (!parent) throw new Error('这部作品的结构要求篇或幕。拆书不会从原文新建这些层。')
  return parent.data.id
}
