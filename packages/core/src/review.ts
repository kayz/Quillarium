import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { ensureDir, readText, writeText } from './fs.js'
import { findDoc, listDocs } from './documents.js'
import { timestampId, makeId } from './ids.js'
import { readPrompt } from './prompts.js'
import type { ChapterProseDoc, DocType, OutlineDoc } from './types.js'

export interface FinalizeImpact {
  id: string
  target_type: DocType
  target_id?: string
  title: string
  confidence: number
  change: string
  evidence: string
  operation?: 'create' | 'update'
  frontmatter?: Record<string, unknown>
  content?: string
  /** Hash captured by Quillarium when the review is created; never trusted from model output. */
  expected_sha256?: string | null
  requires_confirmation: boolean
  state: 'open' | 'confirmed' | 'rejected' | 'applied'
  answer?: string
}

export interface FinalizeQuestion {
  id: string
  title: string
  priority: 'high' | 'medium' | 'low'
  decision_needed: string
  state: 'open' | 'resolved' | 'deferred'
  answer?: string
}

export interface FinalizeReviewSession {
  id: string
  created_at: string
  chapter_id: string
  scene_ids: string[]
  draft_excerpt: string
  final_excerpt: string
  prompt: string
  ai_response?: string
  summary?: string
  impacts: FinalizeImpact[]
  questions: FinalizeQuestion[]
  status: 'planned' | 'needs-confirmation' | 'ready-to-apply' | 'applied'
  source_snapshot?: {
    chapter_sha256: string
    prose_id: string
    prose_sha256: string
    prose_status: ChapterProseDoc['status']
  }
  application?: {
    id: string
    report_path: string
    applied_at: string
  }
}

export function reviewSessionPath(projectRoot: string, sessionId: string): string {
  return path.join(projectRoot, 'reviews', `${sessionId}.json`)
}

export async function createFinalizeReviewSession(
  projectRoot: string,
  input: {
    chapterId: string
    sceneIds: string[]
    draft: string
    final: string
    aiResponse?: string
  }
): Promise<FinalizeReviewSession> {
  const id = `${timestampId('review')}-${randomUUID()}`
  const prompt = await readPrompt(projectRoot, 'check-finalize-review')
  const parsed = input.aiResponse ? parseFinalizeAIResponse(input.aiResponse) : null
  const impacts = parsed ? await hydrateFinalizeImpactHashes(projectRoot, parsed.impacts) : []
  const sourceSnapshot = await captureFinalizeSourceSnapshot(projectRoot, input.chapterId)
  if (sourceSnapshot) await assertFinalMatchesSource(projectRoot, sourceSnapshot, input.final)
  const session: FinalizeReviewSession = {
    id,
    created_at: new Date().toISOString(),
    chapter_id: input.chapterId,
    scene_ids: input.sceneIds,
    draft_excerpt: input.draft.slice(0, 20000),
    final_excerpt: input.final.slice(0, 24000),
    prompt,
    ai_response: input.aiResponse,
    summary: parsed?.summary,
    impacts,
    questions: parsed?.questions ?? [],
    status: parsed ? nextFinalizeStatus(impacts, parsed.questions) : 'planned',
    source_snapshot: sourceSnapshot
  }
  await saveFinalizeReviewSession(projectRoot, session)
  return session
}

export async function completeFinalizeReviewSession(
  projectRoot: string,
  sessionId: string,
  aiResponse: string
): Promise<FinalizeReviewSession> {
  const session = await loadFinalizeReviewSession(projectRoot, sessionId)
  if (session.status === 'applied') throw new Error(`Finalization review is already applied: ${sessionId}`)
  const parsed = parseFinalizeAIResponse(aiResponse)
  const impacts = await hydrateFinalizeImpactHashes(projectRoot, parsed.impacts)
  const currentSnapshot = await captureFinalizeSourceSnapshot(projectRoot, session.chapter_id)
  if (!currentSnapshot) throw new Error(`Finalization source chapter prose not found: ${session.chapter_id}`)
  if (session.source_snapshot && !sameSourceSnapshot(session.source_snapshot, currentSnapshot)) {
    throw new Error(`Finalization source changed while the review was running: ${session.chapter_id}`)
  }
  const completed: FinalizeReviewSession = {
    ...session,
    ai_response: aiResponse,
    summary: parsed.summary,
    impacts,
    questions: parsed.questions,
    status: nextFinalizeStatus(impacts, parsed.questions),
    source_snapshot: currentSnapshot
  }
  await saveFinalizeReviewSession(projectRoot, completed)
  return completed
}

export async function loadFinalizeReviewSession(
  projectRoot: string,
  sessionId: string
): Promise<FinalizeReviewSession> {
  return JSON.parse(await readText(reviewSessionPath(projectRoot, sessionId))) as FinalizeReviewSession
}

export async function saveFinalizeReviewSession(
  projectRoot: string,
  session: FinalizeReviewSession
): Promise<void> {
  await ensureDir(path.join(projectRoot, 'reviews'))
  await writeText(reviewSessionPath(projectRoot, session.id), `${JSON.stringify(session, null, 2)}\n`)
}

export async function answerFinalizeQuestion(
  projectRoot: string,
  sessionId: string,
  questionId: string,
  answer: string,
  state: FinalizeQuestion['state'] = 'resolved'
): Promise<FinalizeReviewSession> {
  const session = await loadFinalizeReviewSession(projectRoot, sessionId)
  if (session.status === 'applied') throw new Error(`Finalization review is already applied: ${sessionId}`)
  if (!session.questions.some((question) => question.id === questionId)) {
    throw new Error(`Finalize question not found: ${questionId}`)
  }
  session.questions = session.questions.map((question) =>
    question.id === questionId ? { ...question, answer, state } : question
  )
  session.status = nextFinalizeStatus(session.impacts, session.questions)
  await saveFinalizeReviewSession(projectRoot, session)
  return session
}

export async function confirmFinalizeImpact(
  projectRoot: string,
  sessionId: string,
  impactId: string,
  answer: string,
  state: 'confirmed' | 'rejected' = 'confirmed'
): Promise<FinalizeReviewSession> {
  const session = await loadFinalizeReviewSession(projectRoot, sessionId)
  if (session.status === 'applied') throw new Error(`Finalization review is already applied: ${sessionId}`)
  if (!session.impacts.some((impact) => impact.id === impactId)) {
    throw new Error(`Finalize impact not found: ${impactId}`)
  }
  session.impacts = session.impacts.map((impact) =>
    impact.id === impactId ? { ...impact, answer, state } : impact
  )
  session.status = nextFinalizeStatus(session.impacts, session.questions)
  await saveFinalizeReviewSession(projectRoot, session)
  return session
}

export function buildFinalizeReviewPrompt(session: FinalizeReviewSession): string {
  return [
    session.prompt,
    '',
    '# Chapter',
    session.chapter_id,
    '',
    '# Scenes',
    session.scene_ids.join(', '),
    '',
    '# Draft',
    session.draft_excerpt,
    '',
    '# Final',
    session.final_excerpt
  ].join('\n')
}

function parseFinalizeAIResponse(raw: string): {
  summary?: string
  impacts: FinalizeImpact[]
  questions: FinalizeQuestion[]
} {
  const parsed = JSON.parse(stripCodeFence(raw)) as {
    summary?: string
    impacts?: Array<Partial<FinalizeImpact>>
    questions?: Array<Partial<FinalizeQuestion>>
  }
  return {
    summary: parsed.summary,
    impacts: (parsed.impacts ?? []).map((impact) => ({
      id: impact.id ?? makeId('impact', impact.title ?? '定稿影响'),
      target_type: impact.target_type as DocType,
      target_id: impact.target_id,
      title: impact.title ?? '定稿影响',
      confidence: Number(impact.confidence ?? 0),
      change: impact.change ?? '',
      evidence: impact.evidence ?? '',
      operation:
        impact.operation === 'create' || impact.operation === 'update' ? impact.operation : undefined,
      frontmatter:
        impact.frontmatter && typeof impact.frontmatter === 'object' && !Array.isArray(impact.frontmatter)
          ? impact.frontmatter
          : undefined,
      content: typeof impact.content === 'string' ? impact.content : undefined,
      // Model output cannot grant itself write authority. Every executable impact
      // must cross an explicit author-confirmation boundary.
      requires_confirmation: true,
      state: 'open' as const
    })),
    questions: (parsed.questions ?? []).map((question) => ({
      id: question.id ?? makeId('issue', question.title ?? '定稿反查问题'),
      title: question.title ?? '定稿反查问题',
      priority: question.priority ?? 'medium',
      decision_needed: question.decision_needed ?? '',
      // Questions, like impacts, require an explicit author decision.
      state: 'open' as const
    }))
  }
}

function nextFinalizeStatus(
  impacts: FinalizeImpact[],
  questions: FinalizeQuestion[]
): FinalizeReviewSession['status'] {
  if (
    impacts.some((impact) => impact.state === 'open') ||
    questions.some((question) => question.state === 'open')
  ) {
    return 'needs-confirmation'
  }
  return 'ready-to-apply'
}

async function hydrateFinalizeImpactHashes(
  projectRoot: string,
  impacts: FinalizeImpact[]
): Promise<FinalizeImpact[]> {
  return Promise.all(
    impacts.map(async (impact) => {
      if (!impact.target_id) return impact
      const target = await findDoc(projectRoot, impact.target_id)
      return {
        ...impact,
        expected_sha256: target
          ? createHash('sha256')
              .update(await readText(target.path))
              .digest('hex')
          : null
      }
    })
  )
}

async function captureFinalizeSourceSnapshot(
  projectRoot: string,
  chapterId: string
): Promise<FinalizeReviewSession['source_snapshot']> {
  const chapter = await findDoc<OutlineDoc>(projectRoot, chapterId)
  if (!chapter || chapter.data.type !== 'outline' || chapter.data.level !== 'chapter') return undefined
  const prose = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
    (document) => document.data.chapter_id === chapterId
  )
  if (!prose) return undefined
  return {
    chapter_sha256: sha256(await readText(chapter.path)),
    prose_id: prose.data.id,
    prose_sha256: sha256(await readText(prose.path)),
    prose_status: prose.data.status
  }
}

async function assertFinalMatchesSource(
  projectRoot: string,
  snapshot: NonNullable<FinalizeReviewSession['source_snapshot']>,
  final: string
): Promise<void> {
  const prose = await findDoc<ChapterProseDoc>(projectRoot, snapshot.prose_id)
  if (!prose || prose.data.type !== 'chapter_prose') {
    throw new Error(`Finalization source prose not found: ${snapshot.prose_id}`)
  }
  if (normalizeProse(prose.content) !== normalizeProse(final)) {
    throw new Error('Finalize review input does not match the authoritative chapter prose.')
  }
}

function sameSourceSnapshot(
  left: NonNullable<FinalizeReviewSession['source_snapshot']>,
  right: NonNullable<FinalizeReviewSession['source_snapshot']>
): boolean {
  return (
    left.chapter_sha256 === right.chapter_sha256 &&
    left.prose_id === right.prose_id &&
    left.prose_sha256 === right.prose_sha256 &&
    left.prose_status === right.prose_status
  )
}

function normalizeProse(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim()
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
}
