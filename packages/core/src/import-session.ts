import { createHash } from 'node:crypto'
import path from 'node:path'
import { readdir, stat } from 'node:fs/promises'
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
  /** Stable within one import session and deliberately independent of the editable title. */
  id?: string
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
  candidate_id?: string
  fingerprint?: string
  invalidated_reason?: string
  answer_mode?: 'confirm-current' | 'supplement-candidate'
  reasons?: Array<{ kind: 'source' | 'confidence' | 'question'; text: string }>
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
  status: 'planned' | 'needs-confirmation' | 'partial' | 'landed' | 'abandoned'
  abandoned_at?: string
}

export interface ImportPlanInput {
  sourceKind: ImportSession['source_kind']
  sourcePaths?: string[]
  markdownText?: string
  aiResponse?: string
  resumeSessionId?: string
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
  if (input.resumeSessionId) {
    const resumed = await loadImportSession(projectRoot, input.resumeSessionId)
    if (resumed.status === 'landed' || resumed.status === 'abandoned') {
      throw new Error('The selected import session can no longer be resumed.')
    }
    return resumed
  }
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
  const candidates = assignCandidateIds(parsed?.items ?? [], id)
  const issues = mergeCandidateConfirmations(
    candidates,
    (parsed?.issues ?? []).map((issue) => ({ ...issue, origin: 'source-review' as const }))
  )
  const session: ImportSession = {
    id,
    created_at: new Date().toISOString(),
    source_kind: input.sourceKind,
    sources: sourceEntries,
    prompt,
    // This field predates large-context models, but it is the authoritative pasted source used by
    // buildImportPrompt(). Truncating it here silently discarded material before the AI call.
    input_excerpt: sourceText,
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

export async function applyImportAIResponse(
  projectRoot: string,
  sessionId: string,
  aiResponse: string
): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  if (session.status === 'landed' || session.status === 'partial' || session.status === 'abandoned') {
    throw new Error('AI results cannot replace a completed or abandoned import session.')
  }
  if (session.landed.length) throw new Error('AI results cannot replace a partially applied import session.')
  const parsed = parseImportAIResponse(aiResponse)
  session.ai_response = aiResponse
  session.summary = parsed.summary
  session.candidates = assignCandidateIds(parsed.items, session.id, session.candidates)
  session.issues = mergeCandidateConfirmations(
    session.candidates,
    parsed.issues.map((issue) => ({ ...issue, origin: 'source-review' as const })),
    session.issues
  )
  session.status = activeImportStatus(session.issues)
  await saveImportSession(projectRoot, session)
  return session
}

export async function loadImportSession(projectRoot: string, sessionId: string): Promise<ImportSession> {
  return normalizeImportSession(
    JSON.parse(await readText(importSessionPath(projectRoot, sessionId))) as ImportSession
  )
}

export async function loadLatestUnfinishedImportSession(projectRoot: string): Promise<ImportSession | null> {
  const importsRoot = path.join(projectRoot, 'imports')
  if (!(await pathExists(importsRoot))) return null
  const sessionIds = (await readdir(importsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^import-[\w-]+\.json$/u.test(entry.name))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .sort((left, right) => right.localeCompare(left))

  for (const sessionId of sessionIds) {
    try {
      const session = await loadImportSession(projectRoot, sessionId)
      if (session.status !== 'landed' && session.status !== 'abandoned') return session
    } catch {
      // Recovery is optional: one damaged historical run must not prevent starting a new import.
    }
  }
  return null
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
  state: ImportSessionIssue['state'] = 'resolved',
  mode: 'confirm-current' | 'supplement-candidate' = 'confirm-current'
): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  const target = session.issues.find((issue) => issue.id === issueId)
  if (!target) throw new Error('The import confirmation no longer exists.')
  const normalizedAnswer = answer.trim()
  if (mode === 'supplement-candidate') {
    if (!normalizedAnswer) throw new Error('A candidate supplement cannot be empty.')
    if (!target.candidate_id) throw new Error('This confirmation is not linked to an import candidate.')
    const candidate = session.candidates.find((item) => item.id === target.candidate_id)
    if (!candidate) throw new Error('The import candidate linked to this confirmation no longer exists.')
    candidate.content = [candidate.content.trimEnd(), '', '## 作者导入补充', '', normalizedAnswer]
      .filter((value, index) => value || index > 0)
      .join('\n')
  }
  session.issues = session.issues.map((issue) =>
    issue.id === issueId
      ? {
          ...issue,
          answer: normalizedAnswer || 'Confirmed without additional changes.',
          answer_mode: mode,
          state,
          invalidated_reason: undefined
        }
      : issue
  )
  session.status = activeImportStatus(session.issues)
  await saveImportSession(projectRoot, session)
  return session
}

export async function abandonImportSession(projectRoot: string, sessionId: string): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  if (session.status === 'landed') throw new Error('A completed import session cannot be abandoned.')
  session.status = 'abandoned'
  session.abandoned_at = new Date().toISOString()
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
  session.candidates = assignCandidateIds(candidates, session.id, session.candidates).map((candidate) => ({
    id: candidate.id,
    type: candidate.type,
    title: String(candidate.title ?? '').trim() || '未命名导入',
    confidence: Math.max(0, Math.min(1, Number(candidate.confidence ?? 0))),
    frontmatter: candidate.frontmatter ?? {},
    content: String(candidate.content ?? ''),
    reason: String(candidate.reason ?? ''),
    questions: Array.isArray(candidate.questions) ? candidate.questions.map(String) : []
  }))
  session.issues = mergeCandidateConfirmations(session.candidates, [], session.issues)
  session.status = activeImportStatus(session.issues)
  session.failures = []
  await saveImportSession(projectRoot, session)
  return session
}

export async function landImportSession(projectRoot: string, sessionId: string): Promise<ImportSession> {
  const session = await loadImportSession(projectRoot, sessionId)
  if (session.status === 'landed') return session
  if (session.status === 'abandoned') throw new Error('An abandoned import session cannot be applied.')
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
  session.candidates[origin.candidate_index] = {
    ...parsed.items[0],
    id: session.candidates[origin.candidate_index]?.id
  }
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
  let parsed: {
    summary?: string
    items?: Array<Partial<ImportCandidate>>
    issues?: Array<Partial<ImportSessionIssue>>
  }
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as typeof parsed
  } catch (cause) {
    throw new Error(
      'AI_IMPORT_INVALID_RESPONSE: Background import response was incomplete or invalid JSON.',
      { cause }
    )
  }
  return {
    summary: parsed.summary,
    items: (parsed.items ?? []).map((item) => ({
      ...(item.id ? { id: item.id } : {}),
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

function normalizeImportSession(session: ImportSession): ImportSession {
  const candidates = assignCandidateIds(session.candidates, session.id)
  const issues = mergeCandidateConfirmations(candidates, [], session.issues)
  return {
    ...session,
    candidates,
    issues,
    status:
      session.status === 'landed' || session.status === 'partial' || session.status === 'abandoned'
        ? session.status
        : activeImportStatus(issues)
  }
}

function assignCandidateIds(
  candidates: ImportCandidate[],
  sessionId: string,
  previous: ImportCandidate[] = []
): ImportCandidate[] {
  const previousIds = new Set(previous.map((candidate) => candidate.id).filter(Boolean))
  const used = new Set<string>()
  return candidates.map((candidate, index) => {
    const proposed = normalizeCandidateId(candidate.id)
    const prior = normalizeCandidateId(previous[index]?.id)
    let id = proposed || prior || `${sessionId}-candidate-${String(index + 1).padStart(3, '0')}`
    let suffix = 2
    while (used.has(id)) {
      id = `${proposed || prior || `${sessionId}-candidate-${String(index + 1).padStart(3, '0')}`}-${suffix}`
      suffix += 1
    }
    used.add(id)
    previousIds.delete(id)
    return { ...candidate, id }
  })
}

function mergeCandidateConfirmations(
  candidates: ImportCandidate[],
  sourceIssues: ImportSessionIssue[],
  previous: ImportSessionIssue[] = []
): ImportSessionIssue[] {
  const matchedSourceIds = new Set<string>()
  const confirmations: ImportSessionIssue[] = []
  const legacyByTitle = new Map<string, ImportSessionIssue>()
  for (const issue of previous) {
    for (const title of issue.related_items) legacyByTitle.set(title, issue)
  }

  for (const candidate of candidates) {
    if (candidate.type === 'issue' || !candidate.id) continue
    const existing =
      previous.find((issue) => issue.candidate_id === candidate.id) ?? legacyByTitle.get(candidate.title)
    const relatedSource = sourceIssues.filter((issue) => sourceIssueMatchesCandidate(issue, candidate))
    for (const issue of relatedSource) matchedSourceIds.add(issue.id)
    const sourceReasons = relatedSource.length
      ? relatedSource.map((issue) => ({
          kind: 'source' as const,
          text: issue.decision_needed || issue.title
        }))
      : (existing?.reasons?.filter((reason) => reason.kind === 'source') ?? [])
    const reasons: NonNullable<ImportSessionIssue['reasons']> = [
      ...sourceReasons,
      ...(candidate.confidence < 0.72
        ? [
            {
              kind: 'confidence' as const,
              text: `候选置信度为 ${Math.round(candidate.confidence * 100)}%，需要作者确认。`
            }
          ]
        : []),
      ...candidate.questions.map((question) => ({ kind: 'question' as const, text: question }))
    ]
    if (!reasons.length) continue
    const fingerprint = confirmationFingerprint(candidate, reasons)
    const remainsValid = Boolean(
      existing && existing.state !== 'open' && existing.fingerprint === fingerprint
    )
    const legacyResolved = Boolean(existing && existing.state !== 'open' && !existing.fingerprint)
    const state = remainsValid || legacyResolved ? existing!.state : 'open'
    const invalidated = Boolean(existing?.fingerprint && existing.fingerprint !== fingerprint)
    confirmations.push({
      id: confirmationId(candidate.id),
      title: `${candidate.title} 导入确认`,
      priority:
        candidate.confidence < 0.5
          ? 'high'
          : relatedSource.some((issue) => issue.priority === 'high')
            ? 'high'
            : 'medium',
      decision_needed: reasons.map((reason) => reason.text).join('；'),
      related_items: [candidate.title],
      state,
      candidate_id: candidate.id,
      fingerprint,
      reasons,
      ...(state !== 'open' && existing?.answer ? { answer: existing.answer } : {}),
      ...(state !== 'open' && existing?.answer_mode ? { answer_mode: existing.answer_mode } : {}),
      ...(invalidated
        ? { invalidated_reason: '与本确认直接相关的类型、置信度、疑问或来源审查内容已变化。' }
        : {}),
      origin: 'candidate-confirmation'
    })
  }

  const unmatchedSource = [
    ...sourceIssues.filter((issue) => !matchedSourceIds.has(issue.id)),
    ...previous.filter(
      (issue) => issue.origin === 'source-review' && !sourceIssues.some((source) => source.id === issue.id)
    )
  ]
  const activeCandidateIds = new Set(candidates.map((candidate) => candidate.id).filter(Boolean))
  const unrelatedPrevious = previous.filter(
    (issue) =>
      issue.origin !== 'candidate-confirmation' &&
      issue.origin !== 'source-review' &&
      (!issue.candidate_id || activeCandidateIds.has(issue.candidate_id))
  )
  return deduplicateIssues([...unmatchedSource, ...unrelatedPrevious, ...confirmations])
}

function sourceIssueMatchesCandidate(issue: ImportSessionIssue, candidate: ImportCandidate): boolean {
  const title = candidate.title.trim().toLocaleLowerCase()
  if (!title) return false
  return (
    issue.related_items.some((item) => item.trim().toLocaleLowerCase() === title) ||
    issue.title.toLocaleLowerCase().includes(title)
  )
}

function confirmationFingerprint(
  candidate: ImportCandidate,
  reasons: NonNullable<ImportSessionIssue['reasons']>
): string {
  return sha256(
    JSON.stringify({
      candidate_id: candidate.id,
      type: candidate.type,
      confidence: Math.round(candidate.confidence * 10_000) / 10_000,
      questions: [...candidate.questions].map((value) => value.trim()).sort(),
      source_reasons: reasons
        .filter((reason) => reason.kind === 'source')
        .map((reason) => reason.text.trim())
        .sort()
    })
  )
}

function deduplicateIssues(issues: ImportSessionIssue[]): ImportSessionIssue[] {
  const byId = new Map<string, ImportSessionIssue>()
  for (const issue of issues) if (!byId.has(issue.id)) byId.set(issue.id, issue)
  return [...byId.values()]
}

function normalizeCandidateId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^[-_.]+|[-_.]+$/gu, '')
  return normalized || undefined
}

function confirmationId(candidateId: string): string {
  return `confirm-${candidateId}`.slice(0, 150).replace(/[-_.]+$/u, '')
}

function activeImportStatus(issues: ImportSessionIssue[]): 'planned' | 'needs-confirmation' {
  return issues.some((issue) => issue.state === 'open') ? 'needs-confirmation' : 'planned'
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
