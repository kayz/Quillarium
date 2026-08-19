import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createIssue, createWorldEntry, listDocs } from './documents.js'
import { writeText } from './fs.js'
import {
  applyIssueBatchAction,
  createIssueFieldEvidenceAnchor,
  issueSuppressionFingerprint,
  issueSuppressionFingerprintV2,
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

  it('uses V2 field anchors so language and explanatory copy do not affect identity', () => {
    const anchor = createIssueFieldEvidenceAnchor('scene-a', 'timeline_node', 'node-1449')
    const first = issueSuppressionFingerprintV2({
      schema_version: 2,
      checker: 'planning-integrity-rule',
      issue_code: 'EVENT_WITHOUT_TIME',
      target_ids: ['scene-b', 'scene-a'],
      evidence_anchors: [anchor]
    })
    const translatedOrRetitled = issueSuppressionFingerprintV2({
      schema_version: 2,
      checker: 'planning-integrity-rule',
      issue_code: 'EVENT_WITHOUT_TIME',
      target_ids: ['scene-a', 'scene-b'],
      evidence_anchors: [anchor]
    })
    const changedEvidence = issueSuppressionFingerprintV2({
      schema_version: 2,
      checker: 'planning-integrity-rule',
      issue_code: 'EVENT_WITHOUT_TIME',
      target_ids: ['scene-a', 'scene-b'],
      evidence_anchors: [createIssueFieldEvidenceAnchor('scene-a', 'timeline_node', 'node-1450')]
    })
    expect(translatedOrRetitled).toBe(first)
    expect(changedEvidence).not.toBe(first)
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

  it('reads a V1 ledger without rewriting it and lazily upgrades reconstructable entries on author action', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-issue-v1-ledger-'))
    roots.push(base)
    const root = (await createProjectAt(path.join(base, 'project'), { id: 'issues-v1', title: 'Issues V1' }))
      .root
    await createWorldEntry(
      root,
      'Source card',
      { id: 'world-source', status: 'active', entry_status: 'active', source_refs: [] },
      'Source body.'
    )
    const legacyFingerprint = issueSuppressionFingerprint({
      checker: 'planning-integrity-rule',
      issue_code: 'planning-missing-source-reference',
      target_ids: ['world-source'],
      key_evidence: 'Field: source_refs'
    })
    await createIssue(root, 'Legacy issue title', {
      id: 'issue-legacy',
      state: 'ignored',
      rule_id: 'planning-missing-source-reference',
      related_docs: ['world-source'],
      evidence: 'Field: source_refs',
      check_fingerprint: legacyFingerprint
    })
    const ledgerPath = path.join(root, 'issues', 'suppression-ledger.json')
    const rawV1 = `${JSON.stringify(
      {
        schema_version: 1,
        entries: [
          {
            schema_version: 1,
            fingerprint: legacyFingerprint,
            checker: 'planning-integrity-rule',
            issue_code: 'planning-missing-source-reference',
            target_ids: ['world-source'],
            key_evidence: 'field: source_refs',
            issue_id: 'issue-legacy',
            ignored_at: '2026-08-17T00:00:00.000Z'
          }
        ]
      },
      null,
      2
    )}\n`
    await writeText(ledgerPath, rawV1)

    expect((await loadIssueSuppressionLedger(root)).schema_version).toBe(1)
    expect(await readFile(ledgerPath, 'utf8')).toBe(rawV1)

    await applyIssueBatchAction(root, ['issue-legacy'], 'ignore', () => new Date('2026-08-18T00:00:00Z'))
    const upgraded = await loadIssueSuppressionLedger(root)
    expect(upgraded.schema_version).toBe(2)
    if (upgraded.schema_version !== 2) return
    expect(upgraded.entries).toEqual([
      expect.objectContaining({
        schema_version: 2,
        legacy_fingerprints: expect.arrayContaining([legacyFingerprint]),
        identity: expect.objectContaining({ schema_version: 2, target_ids: ['world-source'] })
      })
    ])
    expect(upgraded.legacy_entries).toEqual([])
    const upgradedIssue = (await listDocs<IssueDoc>(root, 'issue')).find(
      (issue) => issue.data.id === 'issue-legacy'
    )
    expect(upgradedIssue?.data.legacy_check_fingerprints).toContain(legacyFingerprint)
  })
})
