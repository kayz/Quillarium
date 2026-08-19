import path from 'node:path'
import { rm } from 'node:fs/promises'
import { z } from 'zod'
import { ensureDir, pathExists, readText, writeMarkdown, writeText } from './fs.js'
import { listDocs } from './documents.js'
import type { ReferenceDocument } from './document-references.js'
import { issueEvidenceAnchorV2Schema, issueIdentityV2Schema, issueSchema } from './schema.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { assertProjectPath } from './provenance.js'
import { canonicalJson, sha256Text } from './versioned-yaml-store.js'
import type { DocumentIdentity, IssueDoc, IssueEvidenceAnchorV2, IssueIdentityV2 } from './types.js'

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

export const issueSuppressionEntryV2Schema = z
  .object({
    schema_version: z.literal(2),
    fingerprint: portableSha256Schema,
    identity: issueIdentityV2Schema,
    legacy_fingerprints: z.array(portableSha256Schema).default([]),
    issue_id: z.string().min(1),
    ignored_at: z.string().datetime()
  })
  .strict()

export const issueSuppressionLedgerV2Schema = z
  .object({
    schema_version: z.literal(2),
    entries: z.array(issueSuppressionEntryV2Schema).default([]),
    legacy_entries: z.array(issueSuppressionEntryV1Schema).default([])
  })
  .strict()

export type IssueSuppressionEntryV1 = z.infer<typeof issueSuppressionEntryV1Schema>
export type IssueSuppressionLedgerV1 = z.infer<typeof issueSuppressionLedgerV1Schema>
export type IssueSuppressionEntryV2 = z.infer<typeof issueSuppressionEntryV2Schema>
export type IssueSuppressionLedgerV2 = z.infer<typeof issueSuppressionLedgerV2Schema>
export type IssueSuppressionLedger = IssueSuppressionLedgerV1 | IssueSuppressionLedgerV2
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

export function createIssueFieldEvidenceAnchor(
  documentId: string,
  fieldPath: string,
  value: unknown
): IssueEvidenceAnchorV2 {
  return issueEvidenceAnchorV2Schema.parse({
    document_id: documentId,
    kind: 'field',
    field_path: fieldPath,
    evidence_sha256: sha256Text(canonicalJson(value))
  }) as IssueEvidenceAnchorV2
}

export function createIssueBodyEvidenceAnchor(
  documentId: string,
  body: string,
  quote: string
): IssueEvidenceAnchorV2 | null {
  if (!quote) return null
  const start = body.indexOf(quote)
  if (start < 0) return null
  return issueEvidenceAnchorV2Schema.parse({
    document_id: documentId,
    kind: 'body',
    start,
    end: start + quote.length,
    evidence_sha256: sha256Text(quote)
  }) as IssueEvidenceAnchorV2
}

export function normalizeIssueIdentityV2(identity: IssueIdentityV2): IssueIdentityV2 {
  const parsed = issueIdentityV2Schema.parse(identity) as IssueIdentityV2
  const anchors = new Map(
    parsed.evidence_anchors.map((anchor) => {
      const normalized = issueEvidenceAnchorV2Schema.parse(anchor) as IssueEvidenceAnchorV2
      return [canonicalJson(normalized), normalized] as const
    })
  )
  return {
    schema_version: 2,
    checker: normalizeFingerprintText(parsed.checker),
    issue_code: normalizeFingerprintText(parsed.issue_code),
    target_ids: [...new Set(parsed.target_ids.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'en')
    ),
    evidence_anchors: [...anchors.values()].sort((left, right) =>
      canonicalJson(left).localeCompare(canonicalJson(right), 'en')
    )
  }
}

export function issueSuppressionFingerprintV2(identity: IssueIdentityV2): string {
  return sha256Text(canonicalJson(normalizeIssueIdentityV2(identity)))
}

export function issueFingerprintForDocument(issue: IssueDoc): string {
  if (issue.issue_identity_v2) return issueSuppressionFingerprintV2(issue.issue_identity_v2)
  const checker = issue.tags.includes('ai-check') ? 'planning-integrity-ai' : 'planning-integrity-rule'
  return issueSuppressionFingerprint({
    checker,
    issue_code: issue.rule_id || 'unknown-issue',
    target_ids: issue.related_docs,
    key_evidence: issue.evidence || issue.decision_needed
  })
}

export async function loadIssueSuppressionLedger(projectRoot: string): Promise<IssueSuppressionLedger> {
  const file = issueSuppressionLedgerPath(projectRoot)
  if (!(await pathExists(file))) return { schema_version: 1, entries: [] }
  const parsed = JSON.parse(await readText(file)) as { schema_version?: unknown }
  return parsed.schema_version === 2
    ? issueSuppressionLedgerV2Schema.parse(parsed)
    : issueSuppressionLedgerV1Schema.parse(parsed)
}

export async function isIssueFingerprintSuppressed(
  projectRoot: string,
  fingerprint: string
): Promise<boolean> {
  const ledger = await loadIssueSuppressionLedger(projectRoot)
  return issueLedgerFingerprints(ledger).has(fingerprint)
}

export function issueLedgerFingerprints(ledger: IssueSuppressionLedger): Set<string> {
  if (ledger.schema_version === 1) return new Set(ledger.entries.map((entry) => entry.fingerprint))
  return new Set([
    ...ledger.entries.flatMap((entry) => [entry.fingerprint, ...entry.legacy_fingerprints]),
    ...ledger.legacy_entries.map((entry) => entry.fingerprint)
  ])
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
    const allDocuments = await listDocs<DocumentIdentity>(projectRoot)
    const allIssues: Array<ReferenceDocument<IssueDoc> & { path: string }> = allDocuments
      .filter((document) => document.data.type === 'issue')
      .map((document) => ({ ...document, data: document.data as IssueDoc }))
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
    const rebuiltIdentities = new Map(
      allIssues.map((issue) => [
        issue.data.id,
        rebuildIssueIdentityV2(
          issue,
          allDocuments,
          action === 'ignore' && selectedIds.includes(issue.data.id)
        )
      ])
    )
    const fingerprints = selected.map((issue) => {
      const identity = rebuiltIdentities.get(issue.data.id)
      if (identity) return issueSuppressionFingerprintV2(identity)
      return /^[a-f0-9]{64}$/u.test(issue.data.check_fingerprint)
        ? issue.data.check_fingerprint
        : issueFingerprintForDocument(issue.data)
    })
    const selectedAliases = new Set(
      selected.flatMap((issue, index) => [
        fingerprints[index]!,
        issue.data.check_fingerprint,
        ...(issue.data.legacy_check_fingerprints ?? [])
      ])
    )
    const migrated = migrateLedgerToV2(ledger, allIssues, rebuiltIdentities)
    const nextEntries = migrated.entries.filter(
      (entry) =>
        action === 'ignore' ||
        ![entry.fingerprint, ...entry.legacy_fingerprints].some((fingerprint) =>
          selectedAliases.has(fingerprint)
        )
    )
    const nextLegacyEntries = migrated.legacy_entries.filter(
      (entry) => action === 'ignore' || !selectedAliases.has(entry.fingerprint)
    )
    if (action === 'ignore') {
      selected.forEach((issue, index) => {
        const fingerprint = fingerprints[index]!
        const identity = rebuiltIdentities.get(issue.data.id)
        if (identity) {
          if (nextEntries.some((entry) => entry.fingerprint === fingerprint)) return
          nextEntries.push(
            issueSuppressionEntryV2Schema.parse({
              schema_version: 2,
              fingerprint,
              identity,
              legacy_fingerprints: [
                issue.data.check_fingerprint,
                ...(issue.data.legacy_check_fingerprints ?? [])
              ].filter((value) => /^[a-f0-9]{64}$/u.test(value)),
              issue_id: issue.data.id,
              ignored_at: now().toISOString()
            })
          )
          return
        }
        if (nextLegacyEntries.some((entry) => entry.fingerprint === fingerprint)) return
        nextLegacyEntries.push(legacySuppressionEntry(issue.data, fingerprint, now().toISOString()))
      })
    }
    try {
      for (const [index, issue] of selected.entries()) {
        const state = action === 'ignore' ? 'ignored' : action === 'resolve' ? 'resolved' : 'open'
        const identity = rebuiltIdentities.get(issue.data.id)
        const legacyFingerprints = [
          ...(issue.data.legacy_check_fingerprints ?? []),
          issue.data.check_fingerprint
        ].filter(
          (fingerprint, aliasIndex, aliases) =>
            /^[a-f0-9]{64}$/u.test(fingerprint) &&
            fingerprint !== fingerprints[index] &&
            aliases.indexOf(fingerprint) === aliasIndex
        )
        const data = issueSchema.parse({
          ...issue.data,
          status: state,
          state,
          check_fingerprint: fingerprints[index],
          legacy_check_fingerprints: legacyFingerprints,
          ...(identity ? { issue_identity_v2: identity } : {})
        })
        await writeMarkdown(issue.path, data as unknown as Record<string, unknown>, issue.content)
      }
      await ensureDir(path.dirname(ledgerFile))
      await writeText(
        ledgerFile,
        `${JSON.stringify(
          issueSuppressionLedgerV2Schema.parse({
            schema_version: 2,
            entries: nextEntries,
            legacy_entries: nextLegacyEntries
          }),
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

function migrateLedgerToV2(
  ledger: IssueSuppressionLedger,
  issues: ReferenceDocument<IssueDoc>[],
  identities: Map<string, IssueIdentityV2 | null>
): IssueSuppressionLedgerV2 {
  const existingV2 = ledger.schema_version === 2 ? [...ledger.entries] : []
  const legacy = ledger.schema_version === 2 ? [...ledger.legacy_entries] : [...ledger.entries]
  const remainingLegacy: IssueSuppressionEntryV1[] = []
  for (const entry of legacy) {
    const issue = issues.find((candidate) => candidate.data.id === entry.issue_id)
    const identity = issue ? identities.get(issue.data.id) : null
    if (!issue || !identity) {
      remainingLegacy.push(entry)
      continue
    }
    const fingerprint = issueSuppressionFingerprintV2(identity)
    const duplicate = existingV2.find((candidate) => candidate.fingerprint === fingerprint)
    if (duplicate) {
      duplicate.legacy_fingerprints = [...new Set([...duplicate.legacy_fingerprints, entry.fingerprint])]
      continue
    }
    existingV2.push(
      issueSuppressionEntryV2Schema.parse({
        schema_version: 2,
        fingerprint,
        identity,
        legacy_fingerprints: [entry.fingerprint],
        issue_id: issue.data.id,
        ignored_at: entry.ignored_at
      })
    )
  }
  return issueSuppressionLedgerV2Schema.parse({
    schema_version: 2,
    entries: existingV2,
    legacy_entries: remainingLegacy
  })
}

function rebuildIssueIdentityV2(
  issue: ReferenceDocument<IssueDoc>,
  documents: ReferenceDocument<DocumentIdentity>[],
  allowExplicitIssueAnchor: boolean
): IssueIdentityV2 | null {
  const stored = issueIdentityV2Schema.safeParse(issue.data.issue_identity_v2)
  if (stored.success) return normalizeIssueIdentityV2(stored.data as IssueIdentityV2)
  const checker = issue.data.tags.includes('ai-check') ? 'planning-integrity-ai' : 'planning-integrity-rule'
  const targets = [...new Set(issue.data.related_docs)].filter(Boolean)
  const byId = new Map(documents.map((document) => [document.data.id, document]))
  const anchors: IssueEvidenceAnchorV2[] = []
  if (checker === 'planning-integrity-rule') {
    const relatedDocuments = targets.map((id) => byId.get(id)).filter((value) => value !== undefined)
    for (const document of relatedDocuments) {
      const fieldPaths = deterministicEvidenceFieldPaths(issue.data.rule_id, issue.data.evidence)
      for (const fieldPath of fieldPaths) {
        const field = readFieldPath(document.data as unknown as Record<string, unknown>, fieldPath)
        if (field.found) {
          anchors.push(createIssueFieldEvidenceAnchor(document.data.id, fieldPath, field.value))
        }
      }
    }
    const primary = relatedDocuments[0]
    if (!anchors.length && primary)
      anchors.push(createIssueFieldEvidenceAnchor(primary.data.id, 'id', primary.data.id))
  } else {
    for (const target of targets) {
      const document = byId.get(target)
      if (!document) continue
      const bodyAnchor = createIssueBodyEvidenceAnchor(target, document.content, issue.data.evidence)
      if (bodyAnchor) anchors.push(bodyAnchor)
      anchors.push(...matchingFieldAnchors(document, issue.data.evidence))
    }
  }
  if (!anchors.length && allowExplicitIssueAnchor) {
    const fieldPath = issue.data.evidence ? 'evidence' : 'decision_needed'
    const value = issue.data.evidence || issue.data.decision_needed
    anchors.push(createIssueFieldEvidenceAnchor(issue.data.id, fieldPath, value))
  }
  if (!anchors.length) return null
  return normalizeIssueIdentityV2({
    schema_version: 2,
    checker,
    issue_code: issue.data.rule_id || 'unknown-issue',
    target_ids: targets.length ? targets : [issue.data.id],
    evidence_anchors: anchors
  })
}

function deterministicEvidenceFieldPaths(code: string, evidence: string): string[] {
  const explicit = /^Field:\s*(.+)$/iu.exec(evidence)?.[1]?.trim()
  if (explicit) return [explicit]
  const assignments = [...evidence.matchAll(/(?:^|;\s*)([a-z][a-z0-9_.-]*)=/giu)].map((match) => match[1]!)
  if (assignments.length) return assignments
  const fields: Record<string, string[]> = {
    'planning-event-without-time-node': ['timeline_node'],
    'planning-character-relation-missing-start': ['starts_at'],
    'planning-layout-without-position': ['layout_of'],
    'planning-position-has-layout-target': ['layout_of'],
    'planning-layout-target-not-position': ['layout_of'],
    'planning-location-scale-order': ['parent_location', 'scale'],
    'planning-foreshadowing-without-trigger': ['trigger_conditions'],
    'planning-empty-narrative-card': ['principles', 'sample'],
    'planning-duplicate-time-node': ['date'],
    'planning-timeline-cycle': ['previous', 'next'],
    'planning-missing-previous-node': ['previous'],
    'planning-missing-next-node': ['next'],
    'planning-non-reciprocal-link': ['previous', 'next'],
    'planning-timeline-reversed': ['previous', 'next', 'coordinate_v2'],
    'planning-multiple-heads': ['previous'],
    'planning-multiple-tails': ['next'],
    'planning-timeline-disconnected': ['previous', 'next'],
    'planning-isolated-card': ['source_refs', 'relations'],
    'planning-timeline-legacy-chain': ['previous', 'next'],
    'planning-timeline-missing-track': ['timeline_tracks', 'placements'],
    'planning-timeline-missing-node': ['placements'],
    'planning-timeline-duplicate-node': [
      'calendar',
      'year',
      'month',
      'month_end',
      'day',
      'hour',
      'minute',
      'coordinate_v2',
      'timeline_tracks'
    ],
    'planning-timeline-duplicate-event-order': ['placements'],
    'planning-timeline-invalid-interval': ['placements'],
    'planning-timeline-character-not-active': [
      'placements',
      'characters',
      'born_at',
      'introduced_at',
      'exited_at',
      'died_at'
    ],
    'planning-timeline-causality-reversed': ['placements', 'relations'],
    'planning-timeline-event-unplaced': ['placements', 'timeline_node'],
    'planning-character-time-order': ['born_at', 'introduced_at', 'exited_at', 'died_at'],
    'planning-character-relation-time-order': ['starts_at', 'ends_at']
  }
  return fields[code] ?? []
}

function matchingFieldAnchors(
  document: ReferenceDocument<DocumentIdentity>,
  evidence: string
): IssueEvidenceAnchorV2[] {
  if (!evidence) return []
  const matches: IssueEvidenceAnchorV2[] = []
  const visit = (value: unknown, fieldPath: string): void => {
    if (['id', 'type', 'title', 'schema_version'].includes(fieldPath)) return
    if (typeof value === 'string' && value && (value === evidence || evidence.includes(value))) {
      matches.push(createIssueFieldEvidenceAnchor(document.data.id, fieldPath, value))
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${fieldPath}.${index}`))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      visit(child, fieldPath ? `${fieldPath}.${key}` : key)
    }
  }
  visit(document.data, '')
  return matches
}

function readFieldPath(
  value: Record<string, unknown>,
  fieldPath: string
): { found: boolean; value: unknown } {
  if (fieldPath === '$document') return { found: true, value }
  let current: unknown = value
  for (const segment of fieldPath.split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return { found: false, value: undefined }
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return { found: true, value: current }
}

function legacySuppressionEntry(
  issue: IssueDoc,
  fingerprint: string,
  ignoredAt: string
): IssueSuppressionEntryV1 {
  return issueSuppressionEntryV1Schema.parse({
    schema_version: 1,
    fingerprint,
    checker: issue.tags.includes('ai-check') ? 'planning-integrity-ai' : 'planning-integrity-rule',
    issue_code: issue.rule_id || 'unknown-issue',
    target_ids: [...new Set(issue.related_docs)].sort((a, b) => a.localeCompare(b, 'en')),
    key_evidence: normalizeFingerprintText(issue.evidence || issue.decision_needed),
    issue_id: issue.id,
    ignored_at: ignoredAt
  })
}

function issueSuppressionLedgerPath(projectRoot: string): string {
  return assertProjectPath(projectRoot, path.join(projectRoot, 'issues', 'suppression-ledger.json'))
}

function normalizeFingerprintText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim()
}
