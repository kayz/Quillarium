import path from 'node:path'
import { ensureDir, readText, writeText } from './fs.js'
import { timestampId, makeId } from './ids.js'
import { readPrompt } from './prompts.js'
import type { DocType } from './types.js'

export interface FinalizeImpact {
  id: string
  target_type: DocType
  target_id?: string
  title: string
  confidence: number
  change: string
  evidence: string
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
  const id = timestampId('review')
  const prompt = await readPrompt(projectRoot, 'check-finalize-review')
  const parsed = input.aiResponse ? parseFinalizeAIResponse(input.aiResponse) : null
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
    impacts: parsed?.impacts ?? [],
    questions: parsed?.questions ?? [],
    status: parsed && (parsed.impacts.some((item) => item.requires_confirmation) || parsed.questions.length)
      ? 'needs-confirmation'
      : 'planned'
  }
  await saveFinalizeReviewSession(projectRoot, session)
  return session
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
  session.questions = session.questions.map((question) =>
    question.id === questionId ? { ...question, answer, state } : question
  )
  session.status = session.questions.some((question) => question.state === 'open')
    ? 'needs-confirmation'
    : 'ready-to-apply'
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
  session.impacts = session.impacts.map((impact) =>
    impact.id === impactId ? { ...impact, answer, state } : impact
  )
  session.status = session.impacts.some((impact) => impact.state === 'open')
    ? 'needs-confirmation'
    : 'ready-to-apply'
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
      requires_confirmation: impact.requires_confirmation ?? true,
      state: impact.state ?? 'open'
    })),
    questions: (parsed.questions ?? []).map((question) => ({
      id: question.id ?? makeId('issue', question.title ?? '定稿反查问题'),
      title: question.title ?? '定稿反查问题',
      priority: question.priority ?? 'medium',
      decision_needed: question.decision_needed ?? '',
      state: question.state ?? 'open'
    }))
  }
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
}
