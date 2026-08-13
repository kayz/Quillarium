import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyFinalizeReviewSession,
  confirmFinalizeImpact,
  completeFinalizeReviewSession,
  createCanon,
  createChapterProse,
  createCharacter,
  createFinalizeReviewSession,
  createLocation,
  createOutline,
  createProjectAt,
  createTimelineNode,
  finalizationApplicationReportPath,
  findDoc,
  loadFinalizeReviewSession,
  pathExists,
  readMarkdown,
  readText,
  recoverFinalizationApplications,
  stableProjectId,
  writeMarkdown,
  writeText,
  type FinalizeReviewSession
} from './index.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('atomic finalization apply', () => {
  it('keeps model-proposed impacts open and completes the original review session', async () => {
    const fixture = await createFixture()
    const planned = await createFinalizeReviewSession(fixture.root, {
      chapterId: 'chapter-001',
      sceneIds: [],
      draft: 'Draft.',
      final: 'Accepted final prose.'
    })
    const completed = await completeFinalizeReviewSession(
      fixture.root,
      planned.id,
      JSON.stringify({
        impacts: [
          {
            ...canonUpdate('Proposed content.'),
            confidence: 1,
            evidence: 'Final.',
            requires_confirmation: false,
            state: 'confirmed'
          }
        ],
        questions: [
          {
            title: 'Unresolved decision',
            priority: 'high',
            decision_needed: 'The author must decide.',
            state: 'resolved'
          }
        ]
      })
    )

    expect(completed.id).toBe(planned.id)
    expect(completed.status).toBe('needs-confirmation')
    expect(completed.impacts[0].requires_confirmation).toBe(true)
    expect(completed.impacts[0].state).toBe('open')
    expect(completed.questions[0].state).toBe('open')
  })

  it('backs up, applies, verifies, and audits a complete confirmed change set', async () => {
    const fixture = await createFixture()
    const canon = await readMarkdown<Record<string, unknown>>(fixture.canonPath)
    await writeMarkdown(fixture.canonPath, { ...canon.data, extension_field: 'preserved' }, canon.content)
    const session = await createReadySession(fixture.root, [
      {
        target_type: 'canon',
        target_id: 'canon-main',
        operation: 'update',
        title: 'Core constraint',
        change: 'Clarify the accepted constraint.',
        frontmatter: { strength: 'soft' },
        content: 'The accepted chapter establishes a narrower constraint.'
      },
      {
        target_type: 'character_state',
        target_id: 'state-after-choice',
        operation: 'create',
        title: 'State after the choice',
        change: 'Record the protagonist state.',
        frontmatter: {
          character: 'char-main',
          scope_type: 'outline',
          scope_id: 'chapter-001',
          timeline_node: 'time-main',
          knowledge: ['The constraint has narrowed.']
        },
        content: 'The character now acts with this knowledge.'
      },
      {
        target_type: 'timeline_event',
        target_id: 'event-choice',
        operation: 'create',
        title: 'The opening choice',
        change: 'Record the accepted event.',
        frontmatter: {
          timeline_node: 'time-main',
          location: 'loc-main',
          characters: ['char-main']
        },
        content: 'The protagonist makes the irreversible choice.'
      },
      {
        target_type: 'resource',
        target_id: 'resource-trust',
        operation: 'create',
        title: 'Trust reserve',
        change: 'Track the resource consumed by the choice.',
        frontmatter: { status: 'active', amount: 2 },
        content: 'Two units remain after the chapter.'
      },
      {
        target_type: 'foreshadowing',
        target_id: 'foreshadow-future-cost',
        operation: 'create',
        title: 'Future cost',
        change: 'Record the planted cost.',
        frontmatter: {
          code: 'FS-001',
          state: 'planted',
          summary: 'The choice will carry a later cost.',
          related_characters: ['char-main'],
          related_arc: 'chapter-001'
        },
        content: 'The accepted prose plants the consequence.'
      },
      {
        target_type: 'issue',
        target_id: 'issue-continuity-gap',
        operation: 'create',
        title: 'Continuity gap',
        change: 'Track the unresolved continuity question.',
        frontmatter: {
          priority: 'high',
          related_docs: ['canon-main'],
          evidence: 'The accepted chapter leaves the constraint unresolved.'
        },
        content: 'Resolve this question before the next chapter is finalized.'
      }
    ])

    const report = await applyFinalizeReviewSession(fixture.root, session.id, {
      applicationId: () => 'apply-success',
      now: () => new Date('2026-08-13T08:00:00.000Z')
    })

    expect(report.state).toBe('applied')
    expect(report.source_chapter_id).toBe('chapter-001')
    expect(report.items).toHaveLength(6)
    expect(report.items.every((item) => item.after_sha256.length === 64)).toBe(true)
    expect(report.items.find((item) => item.target_id === 'canon-main')?.backup_path).toBeTruthy()
    expect(await pathExists(path.join(fixture.root, report.items[0].backup_path ?? 'missing'))).toBe(true)

    const updatedCanon = await readMarkdown<Record<string, unknown>>(fixture.canonPath)
    expect(updatedCanon.data.strength).toBe('soft')
    expect(updatedCanon.data.extension_field).toBe('preserved')
    expect(updatedCanon.content.trim()).toBe('The accepted chapter establishes a narrower constraint.')
    const issue = await findDoc(fixture.root, 'issue-continuity-gap')
    expect(issue?.data.type).toBe('issue')
    expect(issue && (await readMarkdown<Record<string, unknown>>(issue.path)).data.source_refs).toEqual([
      'chapter-001'
    ])
    for (const id of ['state-after-choice', 'event-choice', 'resource-trust', 'foreshadow-future-cost']) {
      expect(await findDoc(fixture.root, id)).toBeTruthy()
    }

    const appliedSession = await loadFinalizeReviewSession(fixture.root, session.id)
    expect(appliedSession.status).toBe('applied')
    expect(appliedSession.impacts.every((impact) => impact.state === 'applied')).toBe(true)
    expect(appliedSession.application?.id).toBe('apply-success')
    expect(
      JSON.parse(await readText(finalizationApplicationReportPath(fixture.root, session.id))).state
    ).toBe('applied')
  })

  it('rejects a target hash conflict before writing any reviewed change', async () => {
    const fixture = await createFixture()
    const session = await createReadySession(fixture.root, [canonUpdate('Reviewed content.')])
    const external = await readMarkdown<Record<string, unknown>>(fixture.canonPath)
    await writeMarkdown(fixture.canonPath, external.data, 'A later author edit must win.')
    const before = await readText(fixture.canonPath)

    await expect(
      applyFinalizeReviewSession(fixture.root, session.id, {
        applicationId: () => 'apply-conflict'
      })
    ).rejects.toThrow('changed after review')

    expect(await readText(fixture.canonPath)).toBe(before)
    expect((await loadFinalizeReviewSession(fixture.root, session.id)).status).toBe('ready-to-apply')
    expect(await pathExists(finalizationApplicationReportPath(fixture.root, session.id))).toBe(false)
  })

  it('rejects a source-chapter edit after review before writing continuity', async () => {
    const fixture = await createFixture()
    const session = await createReadySession(fixture.root, [canonUpdate('Reviewed content.')])
    const prose = await findDoc(fixture.root, 'prose-chapter-001')
    expect(prose).toBeTruthy()
    await writeMarkdown(prose!.path, prose!.data as unknown as Record<string, unknown>, 'Author revision.')
    const beforeCanon = await readText(fixture.canonPath)

    await expect(applyFinalizeReviewSession(fixture.root, session.id)).rejects.toThrow(
      'source changed after review'
    )
    expect(await readText(fixture.canonPath)).toBe(beforeCanon)
    expect((await loadFinalizeReviewSession(fixture.root, session.id)).status).toBe('ready-to-apply')
  })

  it('rolls every target and the review session back after a mid-apply disk failure', async () => {
    const fixture = await createFixture()
    const secondCanonPath = await createCanon(fixture.root, 'Secondary constraint', 'Second original.', {
      id: 'canon-secondary'
    })
    const beforeMain = await readText(fixture.canonPath)
    const beforeSecondary = await readText(secondCanonPath)
    const session = await createReadySession(fixture.root, [
      canonUpdate('First reviewed content.'),
      {
        ...canonUpdate('Second reviewed content.'),
        target_id: 'canon-secondary',
        title: 'Secondary constraint'
      }
    ])
    let writes = 0

    await expect(
      applyFinalizeReviewSession(fixture.root, session.id, {
        applicationId: () => 'apply-disk-failure',
        writeTarget: async (filePath, content) => {
          writes += 1
          if (writes === 2) throw new Error('simulated disk failure')
          await writeText(filePath, content)
        }
      })
    ).rejects.toThrow('was rolled back')

    expect(await readText(fixture.canonPath)).toBe(beforeMain)
    expect(await readText(secondCanonPath)).toBe(beforeSecondary)
    expect((await loadFinalizeReviewSession(fixture.root, session.id)).status).toBe('ready-to-apply')
    expect(await pathExists(finalizationApplicationReportPath(fixture.root, session.id))).toBe(false)
    const attempts = await readdir(path.join(fixture.root, 'reviews', 'apply', session.id, 'attempts'))
    expect(attempts.some((name) => name.endsWith('-rolled_back.json'))).toBe(true)
  })

  it('recovers an interrupted transaction from retained before images', async () => {
    const fixture = await createFixture()
    const beforeCanon = await readText(fixture.canonPath)
    const session = await createReadySession(fixture.root, [canonUpdate('Applied before interruption.')])
    const report = await applyFinalizeReviewSession(fixture.root, session.id, {
      applicationId: () => 'apply-interrupted'
    })
    const reportPath = finalizationApplicationReportPath(fixture.root, session.id)
    await writeText(
      reportPath,
      `${JSON.stringify({ ...report, state: 'applying', finished_at: undefined }, null, 2)}\n`
    )

    const recovered = await recoverFinalizationApplications(fixture.root)

    expect(recovered).toHaveLength(1)
    expect(recovered[0].state).toBe('recovered')
    expect(await readText(fixture.canonPath)).toBe(beforeCanon)
    expect((await loadFinalizeReviewSession(fixture.root, session.id)).status).toBe('ready-to-apply')
    expect(await pathExists(reportPath)).toBe(false)
  })

  it('rejects traversal-like target ids and leaves the project unchanged', async () => {
    const fixture = await createFixture()
    const before = await fingerprint(fixture.canonPath)
    const session = await createReadySession(fixture.root, [
      {
        target_type: 'issue',
        target_id: '../outside',
        operation: 'create',
        title: 'Unsafe target',
        change: 'Must never escape the project.',
        content: 'Unsafe.'
      }
    ])

    await expect(applyFinalizeReviewSession(fixture.root, session.id)).rejects.toThrow('Unsafe target id')
    expect(await fingerprint(fixture.canonPath)).toBe(before)
    expect(await pathExists(path.join(path.dirname(fixture.root), 'outside.md'))).toBe(false)
  })
})

interface ReviewImpactInput {
  target_type: string
  target_id: string
  operation: 'create' | 'update'
  title: string
  change: string
  frontmatter?: Record<string, unknown>
  content?: string
}

function canonUpdate(content: string): ReviewImpactInput {
  return {
    target_type: 'canon',
    target_id: 'canon-main',
    operation: 'update',
    title: 'Core constraint',
    change: 'Update the accepted constraint.',
    content
  }
}

async function createReadySession(
  root: string,
  impacts: ReviewImpactInput[]
): Promise<FinalizeReviewSession> {
  let session = await createFinalizeReviewSession(root, {
    chapterId: 'chapter-001',
    sceneIds: ['scene-001'],
    draft: 'Draft prose.',
    final: 'Accepted final prose.',
    aiResponse: JSON.stringify({
      summary: 'Continuity changes require an atomic apply.',
      impacts: impacts.map((impact) => ({
        ...impact,
        confidence: 0.92,
        evidence: 'Accepted final prose.',
        requires_confirmation: true
      })),
      questions: []
    })
  })
  for (const impact of session.impacts) {
    session = await confirmFinalizeImpact(root, session.id, impact.id, 'Confirmed by author.')
  }
  expect(session.status).toBe('ready-to-apply')
  return session
}

async function createFixture(): Promise<{ root: string; canonPath: string }> {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'quillarium-finalization-'))
  temporaryRoots.push(temporary)
  const id = stableProjectId('Atomic Apply Fixture')
  const project = await createProjectAt(path.join(temporary, id), {
    id,
    title: 'Atomic Apply Fixture'
  })
  await createOutline(project.root, 'book', 'Story spine', { id: 'book-main' })
  await createOutline(project.root, 'volume', 'Opening stage', {
    id: 'volume-001',
    parent: 'book-main'
  })
  await createOutline(project.root, 'part', 'First movement', {
    id: 'part-001',
    parent: 'volume-001'
  })
  await createOutline(project.root, 'chapter', 'Opening choice', {
    id: 'chapter-001',
    parent: 'part-001'
  })
  await createChapterProse(
    project.root,
    'chapter-001',
    'Opening choice prose',
    { id: 'prose-chapter-001', status: 'final', finalized_at: '2026-08-13T07:00:00.000Z' },
    'Accepted final prose.'
  )
  await createCharacter(project.root, 'Primary character', { id: 'char-main' })
  await createLocation(project.root, 'Primary location', { id: 'loc-main' })
  await createTimelineNode(project.root, 'Opening time', { id: 'time-main', year: 1, month: 1 })
  const canonPath = await createCanon(project.root, 'Core constraint', 'Original constraint.', {
    id: 'canon-main'
  })
  return { root: project.root, canonPath }
}

async function fingerprint(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readText(filePath))
    .digest('hex')
}
