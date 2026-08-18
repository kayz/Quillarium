import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  abandonImportSession,
  applyImportAIResponse,
  answerImportIssue,
  buildImportPrompt,
  createImportSessionPlan,
  createProjectAt,
  landImportSession,
  listDocs,
  loadImportSession,
  loadLatestUnfinishedImportSession,
  parseImportAIResponse,
  saveImportSession,
  stableProjectId,
  updateImportSessionCandidates
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function projectRoot(): Promise<string> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'quillarium-import-review-'))
  roots.push(workspace)
  const id = stableProjectId('Import Review Sample')
  return (await createProjectAt(path.join(workspace, 'projects', id), { id, title: 'Import Review Sample' }))
    .root
}

describe('AI-assisted import review', () => {
  it('updates the one preflight session with the AI response instead of creating a sibling session', async () => {
    const root = await projectRoot()
    const planned = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'A place called the Quiet Quay.'
    })

    const reviewed = await applyImportAIResponse(
      root,
      planned.id,
      JSON.stringify({
        items: [
          {
            type: 'location',
            title: 'Quiet Quay',
            confidence: 0.95,
            frontmatter: {},
            content: 'A sheltered landing.',
            reason: 'Named place',
            questions: []
          }
        ]
      })
    )

    expect(reviewed.id).toBe(planned.id)
    expect(reviewed.candidates).toHaveLength(1)
    const files = await readdir(path.join(root, 'imports'))
    expect(files.filter((name) => name.endsWith('.json'))).toEqual([`${planned.id}.json`])
  })

  it('merges source, confidence and candidate questions into one stable confirmation', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'An uncertain old bridge.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'location',
            title: 'Old Bridge',
            confidence: 0.4,
            frontmatter: {},
            content: 'A crossing.',
            reason: 'Place',
            questions: ['Is it still open?']
          }
        ],
        issues: [
          {
            id: 'source-bridge',
            title: 'Old Bridge source uncertainty',
            decision_needed: 'The source disagrees about its condition.',
            related_items: ['Old Bridge']
          }
        ]
      })
    })

    expect(session.issues).toHaveLength(1)
    expect(session.issues[0]).toMatchObject({
      origin: 'candidate-confirmation',
      candidate_id: session.candidates[0]?.id,
      state: 'open'
    })
    expect(session.issues[0]?.reasons?.map((reason) => reason.kind)).toEqual([
      'source',
      'confidence',
      'question'
    ])
  })

  it('keeps a resolved confirmation through rename and body edits, but invalidates it on relevant changes', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'An uncertain tower.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'location',
            title: 'Old Tower',
            confidence: 0.5,
            frontmatter: {},
            content: 'Draft body.',
            reason: 'Place',
            questions: ['Is it occupied?']
          }
        ]
      })
    })
    const issue = session.issues[0]!
    await answerImportIssue(root, session.id, issue.id, 'Confirmed.')

    const renamed = await updateImportSessionCandidates(root, session.id, [
      { ...session.candidates[0]!, title: 'Watch Tower', content: 'Edited body.' }
    ])
    expect(renamed.issues[0]).toMatchObject({ id: issue.id, state: 'resolved' })

    const changed = await updateImportSessionCandidates(root, session.id, [
      { ...renamed.candidates[0]!, confidence: 0.2, questions: ['Who occupies it?'] }
    ])
    expect(changed.issues[0]).toMatchObject({ id: issue.id, state: 'open' })
    expect(changed.issues[0]?.invalidated_reason).toContain('已变化')
  })

  it('distinguishes confirmation from an author supplement and preserves abandoned audit sessions', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'An uncertain archive.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'location',
            title: 'Archive',
            confidence: 0.5,
            frontmatter: {},
            content: 'Original extraction.',
            reason: 'Place',
            questions: ['Who owns it?']
          }
        ]
      })
    })
    const supplemented = await answerImportIssue(
      root,
      session.id,
      session.issues[0]!.id,
      'The harbor guild owns it.',
      'resolved',
      'supplement-candidate'
    )
    expect(supplemented.candidates[0]?.content).toContain('The harbor guild owns it.')
    expect(supplemented.issues[0]?.answer_mode).toBe('supplement-candidate')

    const abandoned = await abandonImportSession(root, session.id)
    expect(abandoned.status).toBe('abandoned')
    await expect(loadLatestUnfinishedImportSession(root)).resolves.toBeNull()
    await expect(loadImportSession(root, session.id)).resolves.toMatchObject({ status: 'abandoned' })
  })

  it('reports incomplete model JSON with a stable import error code', () => {
    expect(() => parseImportAIResponse('{"items":[')).toThrow(/AI_IMPORT_INVALID_RESPONSE/u)
  })

  it('keeps the complete pasted source instead of silently truncating at 12000 characters', async () => {
    const root = await projectRoot()
    const source = `${'long source '.repeat(1_500)}TAIL-MARKER`
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: source
    })

    expect(session.input_excerpt).toBe(source)
    expect(buildImportPrompt(session)).toContain('TAIL-MARKER')
  })

  it('lets the author edit or remove candidates before confirming a low-confidence record', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'A mixed collection of notes.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'location',
            title: 'Old Bridge',
            confidence: 0.42,
            frontmatter: {},
            content: 'Unreviewed body.',
            reason: 'Place description',
            questions: ['Is the bridge still in use?']
          },
          {
            type: 'reference',
            title: 'Discarded Note',
            confidence: 0.95,
            frontmatter: {},
            content: 'Not relevant.',
            reason: 'Possible reference',
            questions: []
          }
        ]
      })
    })

    const edited = await updateImportSessionCandidates(root, session.id, [
      {
        ...session.candidates[0],
        title: 'River Gate Bridge',
        content: 'Reviewed and corrected body.'
      }
    ])

    expect(edited.candidates).toHaveLength(1)
    expect(edited.issues).toHaveLength(1)
    expect(edited.issues[0]).toMatchObject({
      origin: 'candidate-confirmation',
      related_items: ['River Gate Bridge'],
      state: 'open'
    })

    const resolved = await answerImportIssue(
      root,
      session.id,
      edited.issues[0].id,
      'The reviewed record is correct.'
    )
    expect(resolved.status).toBe('planned')

    const landed = await landImportSession(root, session.id)
    expect(landed.status).toBe('landed')
    expect(landed.landed).toHaveLength(1)
    const locations = await listDocs(root, 'location')
    expect(locations.map((entry) => entry.data.title)).toContain('River Gate Bridge')
    expect(locations.find((entry) => entry.data.title === 'River Gate Bridge')?.content.trim()).toBe(
      'Reviewed and corrected body.'
    )
  })

  it('does not require a duplicate confirmation before importing an unresolved issue card', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'The source does not define the civic code.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'issue',
            title: 'Civic code needs clarification',
            confidence: 0.55,
            frontmatter: {},
            content: 'The author should decide which civic rules apply.',
            reason: 'Missing source fact',
            questions: ['Which civic rules apply?']
          }
        ],
        issues: [
          {
            title: 'Civic code needs clarification',
            decision_needed: 'Which civic rules apply?',
            related_items: ['Civic code needs clarification']
          }
        ]
      })
    })

    expect(session.issues).toHaveLength(1)
    expect(session.issues[0]).toMatchObject({ origin: 'source-review', state: 'open' })

    const resolved = await answerImportIssue(root, session.id, session.issues[0].id, 'Keep as an issue card.')
    expect(resolved.status).toBe('planned')
    expect(resolved.issues).toHaveLength(1)
  })

  it('hides duplicate issue-card confirmations from sessions created by older builds', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'An unresolved physical rule.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'issue',
            title: 'Physical rule needs clarification',
            confidence: 0.5,
            frontmatter: {},
            content: 'The physical rule remains unknown.',
            reason: 'Missing source fact',
            questions: ['What is the rule?']
          }
        ]
      })
    })
    session.issues.push({
      id: 'issue-legacy-duplicate',
      title: 'Physical rule needs clarification import confirmation',
      priority: 'medium',
      decision_needed: 'What is the rule?',
      related_items: ['Physical rule needs clarification'],
      state: 'open',
      origin: 'candidate-confirmation'
    })
    session.status = 'needs-confirmation'
    await saveImportSession(root, session)

    const loaded = await loadImportSession(root, session.id)
    expect(loaded.issues).toEqual([])
    expect(loaded.status).toBe('planned')
  })

  it('recovers the latest unfinished review without rerunning AI', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'A review that should survive an application restart.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'reference',
            title: 'Restart-safe note',
            confidence: 0.95,
            frontmatter: {},
            content: 'Reviewed content.',
            reason: 'Reference material',
            questions: []
          }
        ]
      })
    })

    await expect(loadLatestUnfinishedImportSession(root)).resolves.toMatchObject({
      id: session.id,
      status: 'planned',
      candidates: [{ title: 'Restart-safe note' }]
    })
  })

  it('retries failed candidates without writing successful candidates twice', async () => {
    const root = await projectRoot()
    const session = await createImportSessionPlan(root, {
      sourceKind: 'text',
      markdownText: 'One valid place and one malformed scene.',
      aiResponse: JSON.stringify({
        items: [
          {
            type: 'location',
            title: 'Signal Tower',
            confidence: 0.98,
            frontmatter: {},
            content: 'A visible landmark.',
            reason: 'Place description',
            questions: []
          },
          {
            type: 'scene',
            title: 'Detached Scene',
            confidence: 0.98,
            frontmatter: {},
            content: 'Missing its chapter relationship.',
            reason: 'Malformed AI output',
            questions: []
          }
        ]
      })
    })

    const first = await landImportSession(root, session.id)
    expect(first.status).toBe('partial')
    expect(first.landed).toHaveLength(1)
    expect(first.failures).toHaveLength(1)
    expect(await listDocs(root, 'location')).toHaveLength(1)

    const retried = await landImportSession(root, session.id)
    expect(retried.status).toBe('partial')
    expect(retried.landed).toHaveLength(1)
    expect(retried.failures).toHaveLength(1)
    expect(await listDocs(root, 'location')).toHaveLength(1)
  })
})
