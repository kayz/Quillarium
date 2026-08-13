import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  answerImportIssue,
  createImportSessionPlan,
  createProjectAt,
  landImportSession,
  listDocs,
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
