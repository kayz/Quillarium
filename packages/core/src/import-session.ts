import { createHash } from 'node:crypto'
import path from 'node:path'
import { stat } from 'node:fs/promises'
import {
  createCanon,
  createCharacter,
  createCharacterState,
  createForeshadowing,
  createIssue,
  createLocation,
  createOutline,
  createPattern,
  createReference,
  createScene,
  createStrategy,
  createWorldEntry,
  appendTimelineEvent
} from './documents.js'
import { ensureDir, listMarkdownFiles, pathExists, readText, writeText } from './fs.js'
import { makeId, timestampId } from './ids.js'
import { readPrompt } from './prompts.js'
import type { DocType } from './types.js'

export interface SourceIndexEntry {
  source: string
  relative_path: string
  size: number
  mtime_ms: number
  sha256: string
  imported_at?: string
  session_id?: string
  status: 'new' | 'changed' | 'imported'
}

export interface ImportCandidate {
  type: DocType
  title: string
  confidence: number
  frontmatter: Record<string, unknown>
  content: string
  reason: string
  questions: string[]
}

export interface ImportSessionIssue {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  decision_needed: string
  related_items: string[]
  state: 'open' | 'resolved' | 'deferred'
  answer?: string
}

export interface ImportSession {
  id: string
  created_at: string
  source_kind: 'file' | 'directory' | 'text' | 'obsidian-scan'
  sources: SourceIndexEntry[]
  prompt: string
  input_excerpt: string
  ai_response?: string
  summary?: string
  candidates: ImportCandidate[]
  issues: ImportSessionIssue[]
  landed: Array<{ type: DocType; title: string; path: string }>
  status: 'planned' | 'needs-confirmation' | 'landed'
}

export interface ImportPlanInput {
  sourceKind: ImportSession['source_kind']
  sourcePaths?: string[]
  markdownText?: string
  aiResponse?: string
}

export function sourceIndexPath(projectRoot: string): string {
  return path.join(projectRoot, '.quillarium', 'source-index.json')
}

export function importSessionPath(projectRoot: string, sessionId: string): string {
  return path.join(projectRoot, 'imports', `${sessionId}.json`)
}

export async function loadSourceIndex(projectRoot: string): Promise<SourceIndexEntry[]> {
  const file = sourceIndexPath(projectRoot)
  if (!(await pathExists(file))) return []
  return JSON.parse(await readText(file)) as SourceIndexEntry[]
}

export async function saveSourceIndex(projectRoot: string, entries: SourceIndexEntry[]): Promise<void> {
  await writeText(sourceIndexPath(projectRoot), `${JSON.stringify(entries, null, 2)}\n`)
}

export async function scanImportSources(projectRoot: string, roots: string[]): Promise<SourceIndexEntry[]> {
  const previous = await loadSourceIndex(projectRoot)
  const previousBySource = new Map(previous.map((entry) => [path.resolve(entry.source), entry]))
  const files = (
    await Promise.all(
      roots.map(async (root) => {
        const resolved = path.resolve(root)
        const info = await stat(resolved)
        return info.isDirectory() ? listMarkdownFiles(resolved) : [resolved]
      })
    )
  ).flat()
  const entries: SourceIndexEntry[] = []
  for (const file of files) {
    const raw = await readText(file)
    const info = await stat(file)
    const hash = sha256(raw)
    const previousEntry = previousBySource.get(path.resolve(file))
    const status =
      previousEntry?.sha256 === hash && previousEntry.imported_at
        ? 'imported'
        : previousEntry
          ? 'changed'
          : 'new'
    entries.push({
      source: path.resolve(file),
      relative_path: path.relative(projectRoot, file).replace(/\\/g, '/'),
      size: info.size,
      mtime_ms: info.mtimeMs,
      sha256: hash,
      imported_at: previousEntry?.imported_at,
      session_id: previousEntry?.session_id,
      status
    })
  }
  return entries
}

export async function createImportSessionPlan(
  projectRoot: string,
  input: ImportPlanInput
): Promise<ImportSession> {
  const id = timestampId('import')
  const prompt = await readPrompt(projectRoot, 'background-import')
  const sourceEntries = input.sourcePaths?.length
    ? await scanImportSources(projectRoot, input.sourcePaths)
    : [
        {
          source: 'pasted-markdown',
          relative_path: 'pasted-markdown',
          size: Buffer.byteLength(input.markdownText ?? '', 'utf8'),
          mtime_ms: Date.now(),
          sha256: sha256(input.markdownText ?? ''),
          status: 'new' as const
        }
      ]
  const sourceText = input.markdownText ?? (await readSources(sourceEntries.map((entry) => entry.source)))
  const parsed = input.aiResponse ? parseImportAIResponse(input.aiResponse) : null
  const candidates = parsed?.items ?? []
  const issues = [
    ...(parsed?.issues ?? []),
    ...candidates
      .filter((item) => item.confidence < 0.72 || item.questions.length)
      .map((item) => ({
        id: makeId('issue', `${item.title} 导入确认`),
        title: `${item.title} 导入确认`,
        priority: item.confidence < 0.5 ? 'high' as const : 'medium' as const,
        decision_needed: item.questions.join('；') || `确认是否作为 ${item.type} 落地。`,
        related_items: [item.title],
        state: 'open' as const
      }))
  ]
  const session: ImportSession = {
    id,
    created_at: new Date().toISOString(),
    source_kind: input.sourceKind,
    sources: sourceEntries,
    prompt,
    input_excerpt: sourceText.slice(0, 12000),
    ai_response: input.aiResponse,
    summary: parsed?.summary,
    candidates,
    issues,
    landed: [],
    status: issues.length ? 'needs-confirmation' : 'planned'
  }
  await saveImportSession(projectRoot, session)
  return session
}

export async function loadImportSession(projectRoot: string, sessionId: string): Promise<ImportSession> {
  return JSON.parse(await readText(importSessionPath(projectRoot, sessionId))) as ImportSession
}

export async function saveImportSession(projectRoot: string, session: ImportSession): Promise<void> {
  await ensureDir(path.join(projectRoot, 'imports'))
  await writeText(importSessionPath(projectRoot, session.id), `${JSON.stringify(session, null, 2)}\n`)
}

export async function answerImportIssue(
  projectRoot: string,
  sessionId: string,
  issueId: string,
  answer: string,
  state: ImportSessionIssue['state'] = 'resolved'
): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  session.issues = session.issues.map((issue) =>
    issue.id === issueId ? { ...issue, answer, state } : issue
  )
  session.status = session.issues.some((issue) => issue.state === 'open') ? 'needs-confirmation' : 'planned'
  await saveImportSession(projectRoot, session)
  return session
}

export async function landImportSession(projectRoot: string, sessionId: string): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  if (session.issues.some((issue) => issue.state === 'open')) {
    throw new Error('Import session still has open issues.')
  }
  for (const candidate of session.candidates) {
    if (candidate.confidence < 0.72) continue
    const file = await createCandidateDoc(projectRoot, candidate)
    session.landed.push({ type: candidate.type, title: candidate.title, path: file })
  }
  const index = await loadSourceIndex(projectRoot)
  const bySource = new Map(index.map((entry) => [path.resolve(entry.source), entry]))
  for (const source of session.sources) {
    bySource.set(path.resolve(source.source), {
      ...source,
      imported_at: new Date().toISOString(),
      session_id: session.id,
      status: 'imported'
    })
  }
  await saveSourceIndex(projectRoot, [...bySource.values()])
  session.status = 'landed'
  await saveImportSession(projectRoot, session)
  return session
}

export function buildImportPrompt(session: ImportSession): string {
  return [
    session.prompt,
    '',
    '# 输入来源',
    session.sources.map((source) => `- ${source.relative_path} (${source.status})`).join('\n'),
    '',
    '# 输入正文',
    session.input_excerpt
  ].join('\n')
}

function parseImportAIResponse(raw: string): {
  summary?: string
  items: ImportCandidate[]
  issues: ImportSessionIssue[]
} {
  const parsed = JSON.parse(stripCodeFence(raw)) as {
    summary?: string
    items?: Array<Partial<ImportCandidate>>
    issues?: Array<Partial<ImportSessionIssue>>
  }
  return {
    summary: parsed.summary,
    items: (parsed.items ?? []).map((item) => ({
      type: item.type as DocType,
      title: item.title ?? '未命名导入',
      confidence: Number(item.confidence ?? 0),
      frontmatter: item.frontmatter ?? {},
      content: item.content ?? '',
      reason: item.reason ?? '',
      questions: item.questions ?? []
    })),
    issues: (parsed.issues ?? []).map((issue) => ({
      id: issue.id ?? makeId('issue', issue.title ?? '导入确认'),
      title: issue.title ?? '导入确认',
      priority: issue.priority ?? 'medium',
      decision_needed: issue.decision_needed ?? '',
      related_items: issue.related_items ?? [],
      state: issue.state ?? 'open'
    }))
  }
}

async function createCandidateDoc(projectRoot: string, candidate: ImportCandidate): Promise<string> {
  const input = { ...candidate.frontmatter, title: candidate.title } as Record<string, unknown>
  switch (candidate.type) {
    case 'canon':
      return createCanon(projectRoot, candidate.title, candidate.content, input)
    case 'character':
      return createCharacter(projectRoot, candidate.title, input, candidate.content)
    case 'character_state':
      return createCharacterState(projectRoot, candidate.title, input, candidate.content)
    case 'foreshadowing':
      return createForeshadowing(projectRoot, candidate.title, input, candidate.content)
    case 'world_entry':
      return createWorldEntry(projectRoot, candidate.title, input, candidate.content)
    case 'reference':
      return createReference(projectRoot, candidate.title, input, candidate.content)
    case 'issue':
      return createIssue(projectRoot, candidate.title, input, candidate.content)
    case 'strategy':
      return createStrategy(projectRoot, candidate.title, input, candidate.content)
    case 'pattern':
      return createPattern(projectRoot, candidate.title, input, candidate.content)
    case 'timeline_event':
      return appendTimelineEvent(projectRoot, candidate.title, input, candidate.content)
    case 'location':
      return createLocation(projectRoot, candidate.title, input, candidate.content)
    case 'outline':
      return createOutline(projectRoot, (input.level as never) ?? 'book', candidate.title, input, candidate.content)
    case 'scene':
      return createScene(projectRoot, candidate.title, input, candidate.content)
    default:
      return createIssue(projectRoot, `${candidate.title} 未支持导入类型`, {
        decision_needed: `暂不支持自动落地 ${candidate.type}，请人工处理。`,
        related_docs: []
      }, candidate.content)
  }
}

async function readSources(files: string[]): Promise<string> {
  const parts = []
  for (const file of files) {
    parts.push(`\n\n# Source: ${file}\n\n${await readText(file)}`)
  }
  return parts.join('').trim()
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
}
