import path from 'node:path'
import { rm } from 'node:fs/promises'
import { z } from 'zod'
import { ensureDir, pathExists, readText, writeMarkdown, writeText } from './fs.js'
import { listDocs } from './documents.js'
import { issueSchema } from './schema.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { assertProjectPath } from './provenance.js'
import { canonicalJson, sha256Text } from './versioned-yaml-store.js'
import type { IssueDoc } from './types.js'

const portableSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u)

export const issueSuppressionEntryV1Schema = z
  .object({
    schema_version: z.literal(1),
    fingerprint: portableSha256Schema,
    checker: z.string().min(1),
    issue_code: z.string().min(1),
    target_ids: z.array(z.string().min(1)),
    key_evidence: z.string(),
    issue_id: z.string().min(1),
    ignored_at: z.string().datetime()
  })
  .strict()

export const issueSuppressionLedgerV1Schema = z
  .object({
    schema_version: z.literal(1),
    entries: z.array(issueSuppressionEntryV1Schema).default([])
  })
  .strict()

export type IssueSuppressionEntryV1 = z.infer<typeof issueSuppressionEntryV1Schema>
export type IssueSuppressionLedgerV1 = z.infer<typeof issueSuppressionLedgerV1Schema>
export type IssueBatchAction = 'ignore' | 'resolve' | 'reopen'

export interface IssueFingerprintInput {
  checker: string
  issue_code: string
  target_ids: string[]
  key_evidence: string
}

export interface IssueBatchResult {
  action: IssueBatchAction
  updated_issue_ids: string[]
  suppression_fingerprints: string[]
}

export function issueSuppressionFingerprint(input: IssueFingerprintInput): string {
  const stable = {
    checker: normalizeFingerprintText(input.checker),
    issue_code: normalizeFingerprintText(input.issue_code),
    target_ids: [...new Set(input.target_ids.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'en')
    ),
    key_evidence: normalizeFingerprintText(input.key_evidence)
  }
  return sha256Text(canonicalJson(stable))
}

export function issueFingerprintForDocument(issue: IssueDoc): string {
  const checker = issue.tags.includes('ai-check') ? 'planning-integrity-ai' : 'planning-integrity-rule'
  return issueSuppressionFingerprint({
    checker,
    issue_code: issue.rule_id || 'unknown-issue',
    target_ids: issue.related_docs,
    key_evidence: issue.evidence || issue.decision_needed
  })
}

export async function loadIssueSuppressionLedger(projectRoot: string): Promise<IssueSuppressionLedgerV1> {
  const file = issueSuppressionLedgerPath(projectRoot)
  if (!(await pathExists(file))) return { schema_version: 1, entries: [] }
  return issueSuppressionLedgerV1Schema.parse(JSON.parse(await readText(file)))
}

export async function isIssueFingerprintSuppressed(
  projectRoot: string,
  fingerprint: string
): Promise<boolean> {
  const ledger = await loadIssueSuppressionLedger(projectRoot)
  return ledger.entries.some((entry) => entry.fingerprint === fingerprint)
}

export async function applyIssueBatchAction(
  projectRoot: string,
  issueIds: string[],
  action: IssueBatchAction,
  now: () => Date = () => new Date()
): Promise<IssueBatchResult> {
  const selectedIds = [...new Set(issueIds.map((id) => id.trim()).filter(Boolean))]
  if (!selectedIds.length) return { action, updated_issue_ids: [], suppression_fingerprints: [] }
  return withProjectWriteLock(projectRoot, async () => {
    const allIssues = await listDocs<IssueDoc>(projectRoot, 'issue')
    const selected = selectedIds.map((id) => {
      const issue = allIssues.find((candidate) => candidate.data.id === id)
      if (!issue) throw new Error(`Issue card not found: ${id}`)
      return issue
    })
    const ledgerFile = issueSuppressionLedgerPath(projectRoot)
    const ledgerBefore = (await pathExists(ledgerFile)) ? await readText(ledgerFile) : null
    const ledger = await loadIssueSuppressionLedger(projectRoot)
    const backups = await Promise.all(
      selected.map(async (issue) => ({ path: issue.path, content: await readText(issue.path) }))
    )
    const fingerprints = selected.map((issue) =>
      /^[a-f0-9]{64}$/u.test(issue.data.check_fingerprint)
        ? issue.data.check_fingerprint
        : issueFingerprintForDocument(issue.data)
    )
    const selectedFingerprintSet = new Set(fingerprints)
    const nextEntries = ledger.entries.filter(
      (entry) => action === 'ignore' || !selectedFingerprintSet.has(entry.fingerprint)
    )
    if (action === 'ignore') {
      selected.forEach((issue, index) => {
        const fingerprint = fingerprints[index]!
        if (nextEntries.some((entry) => entry.fingerprint === fingerprint)) return
        nextEntries.push(
          issueSuppressionEntryV1Schema.parse({
            schema_version: 1,
            fingerprint,
            checker: issue.data.tags.includes('ai-check')
              ? 'planning-integrity-ai'
              : 'planning-integrity-rule',
            issue_code: issue.data.rule_id || 'unknown-issue',
            target_ids: [...new Set(issue.data.related_docs)].sort((a, b) => a.localeCompare(b, 'en')),
            key_evidence: normalizeFingerprintText(issue.data.evidence || issue.data.decision_needed),
            issue_id: issue.data.id,
            ignored_at: now().toISOString()
          })
        )
      })
    }
    try {
      for (const [index, issue] of selected.entries()) {
        const state = action === 'ignore' ? 'ignored' : action === 'resolve' ? 'resolved' : 'open'
        const data = issueSchema.parse({
          ...issue.data,
          status: state,
          state,
          check_fingerprint: fingerprints[index]
        })
        await writeMarkdown(issue.path, data as unknown as Record<string, unknown>, issue.content)
      }
      await ensureDir(path.dirname(ledgerFile))
      await writeText(
        ledgerFile,
        `${JSON.stringify(
          issueSuppressionLedgerV1Schema.parse({ schema_version: 1, entries: nextEntries }),
          null,
          2
        )}\n`
      )
      return {
        action,
        updated_issue_ids: selectedIds,
        suppression_fingerprints: action === 'ignore' ? fingerprints : []
      }
    } catch (error) {
      const rollbackErrors: unknown[] = []
      for (const backup of backups) {
        await writeText(backup.path, backup.content).catch((cause) => rollbackErrors.push(cause))
      }
      if (ledgerBefore === null) {
        await rm(ledgerFile, { force: true }).catch((cause) => rollbackErrors.push(cause))
      } else {
        await writeText(ledgerFile, ledgerBefore).catch((cause) => rollbackErrors.push(cause))
      }
      if (rollbackErrors.length) {
        throw new AggregateError([error, ...rollbackErrors], 'Issue batch update rollback was incomplete.', {
          cause: error
        })
      }
      throw error
    }
  })
}

function issueSuppressionLedgerPath(projectRoot: string): string {
  return assertProjectPath(projectRoot, path.join(projectRoot, 'issues', 'suppression-ledger.json'))
}

function normalizeFingerprintText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim()
}
