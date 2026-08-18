import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIssue, listDocs } from './documents.js'
import {
  applyIssueBatchAction,
  issueSuppressionFingerprint,
  loadIssueSuppressionLedger
} from './issue-workflow.js'
import { createProjectAt } from './project.js'
import type { IssueDoc } from './types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('dedicated issue workflow', () => {
  it('uses stable evidence and target IDs rather than mutable titles for suppression fingerprints', () => {
    const input = {
      checker: 'continuity-check',
      issue_code: 'TIME_GAP',
      target_ids: ['scene-b', 'scene-a'],
      key_evidence: 'Three hours are missing.'
    }
    expect(issueSuppressionFingerprint(input)).toBe(
      issueSuppressionFingerprint({ ...input, target_ids: ['scene-a', 'scene-b'] })
    )
    expect(issueSuppressionFingerprint(input)).not.toBe(
      issueSuppressionFingerprint({ ...input, key_evidence: 'Four hours are missing.' })
    )
  })

  it('applies ignore, resolve, and reopen in batches while keeping resolved issues out of suppression', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-issue-batch-'))
    roots.push(base)
    const root = (await createProjectAt(path.join(base, 'project'), { id: 'issues', title: 'Issues' })).root
    await createIssue(root, 'First mutable title', {
      id: 'issue-first',
      rule_id: 'TIME_GAP',
      related_docs: ['scene-a'],
      evidence: 'Three hours are missing.'
    })
    await createIssue(root, 'Second mutable title', {
      id: 'issue-second',
      rule_id: 'POV_SHIFT',
      related_docs: ['scene-b'],
      evidence: 'Viewpoint changes mid-paragraph.'
    })

    const ignored = await applyIssueBatchAction(root, ['issue-first', 'issue-second'], 'ignore')
    expect(ignored.updated_issue_ids).toEqual(['issue-first', 'issue-second'])
    expect(new Set(ignored.suppression_fingerprints).size).toBe(2)
    expect((await loadIssueSuppressionLedger(root)).entries).toHaveLength(2)
    expect((await listDocs<IssueDoc>(root, 'issue')).map((issue) => issue.data.state).sort()).toEqual([
      'ignored',
      'ignored'
    ])

    await applyIssueBatchAction(root, ['issue-first'], 'resolve')
    expect((await loadIssueSuppressionLedger(root)).entries).toHaveLength(1)
    const afterResolve = await listDocs<IssueDoc>(root, 'issue')
    expect(afterResolve.find((issue) => issue.data.id === 'issue-first')?.data.state).toBe('resolved')

    await applyIssueBatchAction(root, ['issue-first', 'issue-second'], 'reopen')
    expect((await loadIssueSuppressionLedger(root)).entries).toHaveLength(0)
    expect((await listDocs<IssueDoc>(root, 'issue')).map((issue) => issue.data.state)).toEqual([
      'open',
      'open'
    ])
  })
})
