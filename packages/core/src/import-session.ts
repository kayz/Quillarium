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
  appendTimelineEvent,
  parseKnownDocument
} from './documents.js'
import {
  ensureDir,
  listMarkdownFiles,
  pathExists,
  readMarkdown,
  readText,
  writeMarkdown,
  writeText
} from './fs.js'
import { makeId, timestampId } from './ids.js'
import { readPrompt } from './prompts.js'
import {
  DOCUMENT_ORIGIN_FIELD,
  assertProjectPath,
  attachDocumentOrigin,
  refreshOriginSources,
  type AIImportOrigin,
  type OriginSourceFile
} from './provenance.js'
import type { BaseDoc, DocType } from './types.js'

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
  origin?: 'source-review' | 'candidate-confirmation'
}

export interface ImportSessionFailure {
  candidate_index: number
  type: DocType
  title: string
  message: string
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
  landed: Array<{
    type: DocType
    title: string
    path: string
    document_id?: string
    candidate_index?: number
  }>
  failures?: ImportSessionFailure[]
  status: 'planned' | 'needs-confirmation' | 'partial' | 'landed'
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
    ...(parsed?.issues ?? []).map((issue) => ({ ...issue, origin: 'source-review' as const })),
    ...candidateConfirmationIssues(candidates)
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
  session.issues = session.issues.map((issue) => (issue.id === issueId ? { ...issue, answer, state } : issue))
  session.status = session.issues.some((issue) => issue.state === 'open') ? 'needs-confirmation' : 'planned'
  await saveImportSession(projectRoot, session)
  return session
}

export async function updateImportSessionCandidates(
  projectRoot: string,
  sessionId: string,
  candidates: ImportCandidate[]
): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  if (session.landed.length) {
    throw new Error('Candidates cannot be edited after this import has started landing files.')
  }
  const priorCandidateIssueIds = new Set(
    session.candidates.map((candidate) => makeId('issue', `${candidate.title} 导入确认`))
  )
  session.candidates = candidates.map((candidate) => ({
    type: candidate.type,
    title: String(candidate.title ?? '').trim() || '未命名导入',
    confidence: Math.max(0, Math.min(1, Number(candidate.confidence ?? 0))),
    frontmatter: candidate.frontmatter ?? {},
    content: String(candidate.content ?? ''),
    reason: String(candidate.reason ?? ''),
    questions: Array.isArray(candidate.questions) ? candidate.questions.map(String) : []
  }))
  const candidateIssues = candidateConfirmationIssues(session.candidates, session.issues)
  const candidateIssueIds = new Set(candidateIssues.map((issue) => issue.id))
  session.issues = [
    ...session.issues.filter(
      (issue) =>
        issue.origin !== 'candidate-confirmation' &&
        !(issue.origin === undefined && priorCandidateIssueIds.has(issue.id)) &&
        !candidateIssueIds.has(issue.id)
    ),
    ...candidateIssues
  ]
  session.status = session.issues.some((issue) => issue.state === 'open') ? 'needs-confirmation' : 'planned'
  session.failures = []
  await saveImportSession(projectRoot, session)
  return session
}

export async function landImportSession(projectRoot: string, sessionId: string): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  if (session.status === 'landed') return session
  if (session.issues.some((issue) => issue.state === 'open')) {
    throw new Error('Import session still has open issues.')
  }
  const landedIndexes = new Set(
    session.landed
      .map((item) => item.candidate_index)
      .filter((index): index is number => typeof index === 'number')
  )
  const failures: ImportSessionFailure[] = []
  for (const [candidateIndex, candidate] of session.candidates.entries()) {
    if (landedIndexes.has(candidateIndex)) continue
    try {
      const file = await createCandidateDoc(projectRoot, candidate)
      const document = await readMarkdown<BaseDoc & Record<string, unknown>>(file)
      await attachDocumentOrigin(file, aiImportOrigin(session, candidateIndex))
      session.landed.push({
        type: candidate.type,
        title: candidate.title,
        path: file,
        document_id: document.data.id,
        candidate_index: candidateIndex
      })
    } catch (error) {
      failures.push({
        candidate_index: candidateIndex,
        type: candidate.type,
        title: candidate.title,
        message: error instanceof Error ? error.message : String(error)
      })
    }
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
  session.failures = failures
  session.status = failures.length ? 'partial' : 'landed'
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

export function buildSingleCardReimportPrompt(
  session: ImportSession,
  candidateIndex: number,
  currentDocument: { data: Record<string, unknown>; content: string },
  sourceText: string
): string {
  const candidate = session.candidates[candidateIndex]
  if (!candidate) throw new Error('The original import candidate no longer exists.')
  return [
    session.prompt,
    '',
    '# 单卡重提取任务',
    '只重新提取下面指定的一张卡片。不要返回同一来源中的其它人物、事件或词条。',
    `文档类型必须保持为 ${candidate.type}。JSON 的 items 必须恰好包含一项，issues 必须为空。`,
    '不要输出 id、type、schema_version 或 quillarium_origin 等系统字段。',
    '',
    '# 当前卡片',
    JSON.stringify(
      {
        type: currentDocument.data.type,
        title: currentDocument.data.title,
        fields: Object.fromEntries(
          Object.entries(currentDocument.data).filter(
            ([key]) => !['id', 'type', 'schema_version', DOCUMENT_ORIGIN_FIELD].includes(key)
          )
        ),
        content: currentDocument.content
      },
      null,
      2
    ),
    '',
    '# 原候选定位',
    JSON.stringify(candidate, null, 2),
    '',
    '# 当前源文件正文',
    sourceText
  ].join('\n')
}

export async function readImportSessionSources(session: ImportSession): Promise<string> {
  const files = session.sources
    .map((source) => source.source)
    .filter((source) => source !== 'pasted-markdown')
  if (!files.length) {
    throw new Error('This import came from pasted text and has no source file to re-read.')
  }
  return readSources(files)
}

export async function reimportAIImportCard(
  projectRoot: string,
  targetPath: string,
  origin: AIImportOrigin,
  aiResponse: string
): Promise<{ path: string; document: { data: Record<string, unknown>; content: string } }> {
  const parsed = parseImportAIResponse(aiResponse)
  if (parsed.items.length !== 1 || parsed.issues.length) {
    throw new Error(
      'Background AI did not return exactly one issue-free card; the original card was not changed.'
    )
  }
  const session = await loadImportSession(projectRoot, origin.session_id)
  const result = await reapplyImportCandidate(projectRoot, targetPath, parsed.items[0], origin)
  session.candidates[origin.candidate_index] = parsed.items[0]
  session.ai_response = aiResponse
  await saveImportSession(projectRoot, session)
  return result
}

export async function reapplyImportCandidate(
  projectRoot: string,
  targetPath: string,
  candidate: ImportCandidate,
  origin: AIImportOrigin
): Promise<{ path: string; document: { data: Record<string, unknown>; content: string } }> {
  const target = assertProjectPath(projectRoot, targetPath)
  const current = await readMarkdown<Record<string, unknown>>(target)
  if (current.data.type !== candidate.type) {
    throw new Error(`Re-import returned ${candidate.type}; expected ${String(current.data.type)}.`)
  }
  const candidateData = {
    ...current.data,
    ...candidate.frontmatter,
    id: current.data.id,
    type: current.data.type,
    schema_version: current.data.schema_version,
    title: candidate.title,
    [DOCUMENT_ORIGIN_FIELD]: {
      ...origin,
      sources: await refreshOriginSources(origin.sources),
      updated_at: new Date().toISOString()
    }
  }
  const parsed = parseKnownDocument(candidateData, target)
  await writeMarkdown(target, parsed, candidate.content)
  return { path: target, document: await readMarkdown(target) }
}

export function parseImportAIResponse(raw: string): {
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
      state: issue.state ?? 'open',
      origin: issue.origin ?? 'source-review'
    }))
  }
}

function candidateConfirmationIssues(
  candidates: ImportCandidate[],
  previous: ImportSessionIssue[] = []
): ImportSessionIssue[] {
  return candidates
    .filter((item) => item.confidence < 0.72 || item.questions.length)
    .map((item) => {
      const id = makeId('issue', `${item.title} 导入确认`)
      const existing = previous.find((issue) => issue.id === id)
      return {
        id,
        title: `${item.title} 导入确认`,
        priority: item.confidence < 0.5 ? ('high' as const) : ('medium' as const),
        decision_needed: item.questions.join('；') || `确认是否作为 ${item.type} 落地。`,
        related_items: [item.title],
        state: existing?.state ?? ('open' as const),
        ...(existing?.answer ? { answer: existing.answer } : {}),
        origin: 'candidate-confirmation' as const
      }
    })
}

function aiImportOrigin(session: ImportSession, candidateIndex: number): AIImportOrigin {
  const now = new Date().toISOString()
  return {
    schema_version: 1,
    kind: 'ai-import',
    session_id: session.id,
    candidate_index: candidateIndex,
    sources: session.sources
      .filter((source) => source.source !== 'pasted-markdown')
      .map((source): OriginSourceFile => ({ path: source.source, sha256: source.sha256 })),
    created_at: now,
    updated_at: now
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
      return createOutline(
        projectRoot,
        (input.level as never) ?? 'book',
        candidate.title,
        input,
        candidate.content,
        { placement: 'legacy-import' }
      )
    case 'scene':
      return createScene(projectRoot, candidate.title, input, candidate.content)
    default:
      return createIssue(
        projectRoot,
        `${candidate.title} 未支持导入类型`,
        {
          decision_needed: `暂不支持自动落地 ${candidate.type}，请人工处理。`,
          related_docs: []
        },
        candidate.content
      )
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
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
}
