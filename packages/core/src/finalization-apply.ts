import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { dirForType, fileForDoc, findDoc, listDocs, parseKnownDocument } from './documents.js'
import { ensureDir, pathExists, readMarkdown, readText, writeText } from './fs.js'
import {
  loadFinalizeReviewSession,
  reviewSessionPath,
  type FinalizeImpact,
  type FinalizeReviewSession
} from './review.js'
import type { ChapterProseDoc, DocType, DocumentIdentity, OutlineDoc } from './types.js'
import { stringifyFrontmatter } from './yaml.js'

const SUPPORTED_FINALIZATION_TARGETS = new Set<DocType>([
  'canon',
  'character',
  'character_state',
  'timeline_event',
  'location',
  'world_entry',
  'resource',
  'foreshadowing',
  'narrative',
  'issue'
])

export type FinalizationApplicationState =
  'prepared' | 'applying' | 'verifying' | 'applied' | 'rolled_back' | 'recovered' | 'recovery_failed'

export interface FinalizationApplicationItem {
  impact_id: string
  target_type: DocType
  target_id: string
  operation: 'create' | 'update'
  path: string
  before_sha256: string | null
  after_sha256: string
  backup_path: string | null
  staged_path: string
}

export interface FinalizationApplicationReport {
  schema_version: 1
  id: string
  session_id: string
  source_chapter_id: string
  source_scene_ids: string[]
  source: {
    chapter_path: string
    chapter_sha256: string
    prose_path: string
    prose_id: string
    prose_status: 'final' | 'published'
    prose_sha256: string
  }
  started_at: string
  finished_at?: string
  state: FinalizationApplicationState
  items: FinalizationApplicationItem[]
  session: {
    path: string
    before_sha256: string
    after_sha256: string
    backup_path: string
    staged_path: string
  }
  restoration: {
    backups_retained: true
    automatic_recovery: string
  }
  error?: string
}

export interface FinalizationApplyDependencies {
  writeTarget: (filePath: string, content: string) => Promise<void>
  now: () => Date
  applicationId: () => string
}

interface PreparedApplicationItem {
  report: FinalizationApplicationItem
  target_path: string
  before_content: string | null
  after_content: string
  normalized_data: Record<string, unknown>
}

const defaultDependencies: FinalizationApplyDependencies = {
  writeTarget: writeText,
  now: () => new Date(),
  applicationId: () => `apply-${randomUUID()}`
}

export function finalizationApplicationReportPath(projectRoot: string, sessionId: string): string {
  return path.join(projectRoot, 'reviews', 'apply', sessionId, 'report.json')
}

export async function applyFinalizeReviewSession(
  projectRoot: string,
  sessionId: string,
  dependencies: Partial<FinalizationApplyDependencies> = {}
): Promise<FinalizationApplicationReport> {
  const deps = { ...defaultDependencies, ...dependencies }
  await recoverFinalizationApplications(projectRoot)
  const session = await loadFinalizeReviewSession(projectRoot, sessionId)
  if (session.status === 'applied') {
    const existing = finalizationApplicationReportPath(projectRoot, sessionId)
    if (!(await pathExists(existing))) {
      throw new Error(`Applied finalization review is missing its audit report: ${sessionId}`)
    }
    return JSON.parse(await readText(existing)) as FinalizationApplicationReport
  }
  assertSessionReady(session)
  const source = await requireFinalizedSource(projectRoot, session)

  const applicationId = deps.applicationId()
  assertSafeIdentifier(applicationId, 'application id')
  const applicationRoot = path.join(projectRoot, 'reviews', 'apply', session.id, applicationId)
  const prepared = await prepareApplicationItems(projectRoot, session, applicationRoot)
  validatePreparedReferences(await listDocs(projectRoot), prepared)

  const startedAt = deps.now().toISOString()
  const reportPath = finalizationApplicationReportPath(projectRoot, session.id)
  const reportRelative = relativeProjectPath(projectRoot, reportPath)
  const sessionPath = reviewSessionPath(projectRoot, session.id)
  await assertContainedPath(projectRoot, sessionPath)
  const sessionBefore = await readText(sessionPath)
  const appliedSession: FinalizeReviewSession = {
    ...session,
    impacts: session.impacts.map((impact) =>
      impact.state === 'confirmed' ? { ...impact, state: 'applied' as const } : impact
    ),
    status: 'applied',
    application: {
      id: applicationId,
      report_path: reportRelative,
      applied_at: startedAt
    }
  }
  const sessionAfter = `${JSON.stringify(appliedSession, null, 2)}\n`
  const sessionRelative = relativeProjectPath(projectRoot, sessionPath)
  const sessionBackupPath = artifactPath(applicationRoot, 'backup', sessionRelative)
  const sessionStagedPath = artifactPath(applicationRoot, 'staged', sessionRelative)
  const report: FinalizationApplicationReport = {
    schema_version: 1,
    id: applicationId,
    session_id: session.id,
    source_chapter_id: session.chapter_id,
    source_scene_ids: [...session.scene_ids],
    source,
    started_at: startedAt,
    state: 'prepared',
    items: prepared.map((item) => item.report),
    session: {
      path: sessionRelative,
      before_sha256: sha256(sessionBefore),
      after_sha256: sha256(sessionAfter),
      backup_path: relativeProjectPath(projectRoot, sessionBackupPath),
      staged_path: relativeProjectPath(projectRoot, sessionStagedPath)
    },
    restoration: {
      backups_retained: true,
      automatic_recovery:
        'Call recoverFinalizationApplications(projectRoot); incomplete transactions restore every before hash.'
    }
  }

  // Prepare every recovery artifact before publishing the transaction journal. If the
  // process exits before the exclusive journal write, the orphaned staging directory is
  // inert. Once report.json exists, recovery is guaranteed to have every before image.
  await persistApplicationArtifacts(projectRoot, prepared, sessionBefore, sessionAfter, report)
  await assertContainedPath(projectRoot, reportPath)
  await ensureDir(path.dirname(reportPath))
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx'
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') {
      throw new Error(`A finalization apply transaction already exists: ${session.id}`)
    }
    throw error
  })

  try {
    report.state = 'applying'
    await saveReport(reportPath, report)
    await assertBeforeHashes(projectRoot, report)
    for (const item of prepared) {
      await deps.writeTarget(item.target_path, await readVerifiedStage(projectRoot, item.report))
    }
    await deps.writeTarget(sessionPath, await readVerifiedStage(projectRoot, report.session))
    report.state = 'verifying'
    await saveReport(reportPath, report)
    await verifyAppliedState(projectRoot, report)
    report.state = 'applied'
    report.finished_at = deps.now().toISOString()
    await saveReport(reportPath, report)
    return report
  } catch (error) {
    const message = errorMessage(error)
    try {
      await rollbackApplication(projectRoot, report)
      report.state = 'rolled_back'
    } catch (rollbackError) {
      report.state = 'recovery_failed'
      report.error = `${message} Rollback failed: ${errorMessage(rollbackError)}`
      report.finished_at = deps.now().toISOString()
      await saveReport(reportPath, report)
      throw new AggregateError([error, rollbackError], report.error, { cause: rollbackError })
    }
    report.error = message
    report.finished_at = deps.now().toISOString()
    await saveReport(reportPath, report)
    const archived = await archiveFailedReport(projectRoot, reportPath, report)
    throw new Error(`Finalization apply failed and was rolled back. Audit: ${archived}. ${message}`, {
      cause: error
    })
  }
}

export async function recoverFinalizationApplications(
  projectRoot: string
): Promise<FinalizationApplicationReport[]> {
  const root = path.join(projectRoot, 'reviews', 'apply')
  if (!(await pathExists(root))) return []
  const recovered: FinalizationApplicationReport[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const reportPath = path.join(root, entry.name, 'report.json')
    if (!(await pathExists(reportPath))) continue
    const report = JSON.parse(await readText(reportPath)) as FinalizationApplicationReport
    if (report.state === 'applied') continue
    if (report.state === 'rolled_back' || report.state === 'recovered') {
      await archiveFailedReport(projectRoot, reportPath, report)
      continue
    }
    try {
      await rollbackApplication(projectRoot, report)
      report.state = 'recovered'
      report.finished_at = new Date().toISOString()
      report.error = report.error ?? 'Recovered an incomplete finalization apply transaction.'
      await saveReport(reportPath, report)
      await archiveFailedReport(projectRoot, reportPath, report)
      recovered.push(report)
    } catch (error) {
      report.state = 'recovery_failed'
      report.finished_at = new Date().toISOString()
      report.error = errorMessage(error)
      await saveReport(reportPath, report)
      throw new Error(`Could not recover finalization application ${report.id}: ${report.error}`, {
        cause: error
      })
    }
  }
  return recovered
}

function assertSessionReady(session: FinalizeReviewSession): void {
  if (session.status !== 'ready-to-apply') {
    throw new Error(`Finalization review is not ready to apply: ${session.id} (${session.status})`)
  }
  const openImpacts = session.impacts.filter((impact) => impact.state === 'open')
  const openQuestions = session.questions.filter((question) => question.state === 'open')
  if (openImpacts.length || openQuestions.length) {
    throw new Error(
      `Finalization review still has open decisions: ${openImpacts.length} impacts, ${openQuestions.length} questions.`
    )
  }
}

async function requireFinalizedSource(
  projectRoot: string,
  session: FinalizeReviewSession
): Promise<FinalizationApplicationReport['source']> {
  const chapter = await findDoc<OutlineDoc>(projectRoot, session.chapter_id)
  if (!chapter || chapter.data.type !== 'outline' || chapter.data.level !== 'chapter') {
    throw new Error(`Finalization source chapter not found: ${session.chapter_id}`)
  }
  const prose = (await listDocs<ChapterProseDoc>(projectRoot, 'chapter_prose')).find(
    (document) => document.data.chapter_id === session.chapter_id
  )
  if (!prose) throw new Error(`Finalization source chapter prose not found: ${session.chapter_id}`)
  if (prose.data.status !== 'final' && prose.data.status !== 'published') {
    throw new Error(`Finalization source chapter prose is not final: ${session.chapter_id}`)
  }
  if (!session.source_snapshot) {
    throw new Error(`Finalization review lacks a source snapshot: ${session.id}`)
  }
  const chapterHash = sha256(await readText(chapter.path))
  const proseHash = sha256(await readText(prose.path))
  if (
    session.source_snapshot.chapter_sha256 !== chapterHash ||
    session.source_snapshot.prose_id !== prose.data.id ||
    session.source_snapshot.prose_sha256 !== proseHash ||
    session.source_snapshot.prose_status !== prose.data.status
  ) {
    throw new Error(`Finalization source changed after review: ${session.chapter_id}`)
  }
  return {
    chapter_path: relativeProjectPath(projectRoot, chapter.path),
    chapter_sha256: chapterHash,
    prose_path: relativeProjectPath(projectRoot, prose.path),
    prose_id: prose.data.id,
    prose_status: prose.data.status,
    prose_sha256: proseHash
  }
}

async function prepareApplicationItems(
  projectRoot: string,
  session: FinalizeReviewSession,
  applicationRoot: string
): Promise<PreparedApplicationItem[]> {
  const confirmed = session.impacts.filter((impact) => impact.state === 'confirmed')
  const seenIds = new Set<string>()
  const items: PreparedApplicationItem[] = []
  for (const impact of confirmed) {
    const item = await prepareImpact(projectRoot, session, impact, applicationRoot)
    const key = `${item.report.target_type}:${item.report.target_id}`
    if (seenIds.has(key)) throw new Error(`Finalization change set targets a document twice: ${key}`)
    seenIds.add(key)
    items.push(item)
  }
  return items
}

async function prepareImpact(
  projectRoot: string,
  session: FinalizeReviewSession,
  impact: FinalizeImpact,
  applicationRoot: string
): Promise<PreparedApplicationItem> {
  if (!SUPPORTED_FINALIZATION_TARGETS.has(impact.target_type)) {
    throw new Error(`Unsupported finalization target type: ${impact.target_type}`)
  }
  if (impact.operation !== 'create' && impact.operation !== 'update') {
    throw new Error(`Finalize impact lacks an explicit create/update operation: ${impact.id}`)
  }
  if (!impact.target_id) throw new Error(`Finalize impact lacks a stable target_id: ${impact.id}`)
  assertSafeIdentifier(impact.target_id, 'target id')
  if (!impact.frontmatter && impact.content === undefined) {
    throw new Error(`Finalize impact has no structured frontmatter or content change: ${impact.id}`)
  }

  const existing = await findDoc(projectRoot, impact.target_id)
  let targetPath: string
  let beforeContent: string | null
  let rawData: Record<string, unknown>
  let body: string
  if (impact.operation === 'update') {
    if (!existing) throw new Error(`Finalization update target not found: ${impact.target_id}`)
    if (existing.data.type !== impact.target_type) {
      throw new Error(
        `Finalization target type mismatch for ${impact.target_id}: expected ${impact.target_type}, found ${existing.data.type}`
      )
    }
    targetPath = existing.path
    await assertDocumentTargetPath(projectRoot, impact.target_type, targetPath)
    beforeContent = await readText(targetPath)
    const beforeHash = sha256(beforeContent)
    if (!impact.expected_sha256 || impact.expected_sha256 !== beforeHash) {
      throw new Error(
        `Finalization target changed after review: ${impact.target_id}; expected ${impact.expected_sha256 ?? 'missing hash'}, found ${beforeHash}`
      )
    }
    const parsed = await readMarkdown<Record<string, unknown>>(targetPath)
    rawData = parsed.data
    body = impact.content === undefined ? parsed.content : impact.content
  } else {
    if (existing) throw new Error(`Finalization create target already exists: ${impact.target_id}`)
    if (impact.expected_sha256 !== null) {
      throw new Error(`Finalization create target was not locked as absent: ${impact.target_id}`)
    }
    targetPath = fileForDoc(projectRoot, impact.target_type, impact.target_id, impact.title)
    await assertDocumentTargetPath(projectRoot, impact.target_type, targetPath)
    if (await pathExists(targetPath))
      throw new Error(`Finalization create path already exists: ${targetPath}`)
    beforeContent = null
    rawData = defaultDocumentData(session, impact)
    if (impact.content === undefined) {
      throw new Error(`Finalization create impact requires explicit content: ${impact.id}`)
    }
    body = impact.content
  }

  const patch = impact.frontmatter ?? {}
  assertProtectedIdentity(patch, impact)
  const proposed = {
    ...rawData,
    ...patch,
    id: impact.target_id,
    type: impact.target_type,
    schema_version: Number(rawData.schema_version ?? 1)
  }
  const normalized = parseKnownDocument(proposed, targetPath)
  const afterContent = stringifyFrontmatter(normalized, body)
  const relative = relativeProjectPath(projectRoot, targetPath)
  const backupPath =
    beforeContent === null
      ? null
      : relativeProjectPath(projectRoot, artifactPath(applicationRoot, 'backup', relative))
  const stagedPath = relativeProjectPath(projectRoot, artifactPath(applicationRoot, 'staged', relative))
  return {
    report: {
      impact_id: impact.id,
      target_type: impact.target_type,
      target_id: impact.target_id,
      operation: impact.operation,
      path: relative,
      before_sha256: beforeContent === null ? null : sha256(beforeContent),
      after_sha256: sha256(afterContent),
      backup_path: backupPath,
      staged_path: stagedPath
    },
    target_path: targetPath,
    before_content: beforeContent,
    after_content: afterContent,
    normalized_data: normalized
  }
}

function defaultDocumentData(
  session: FinalizeReviewSession,
  impact: FinalizeImpact
): Record<string, unknown> {
  const status: Partial<Record<DocType, string>> = {
    canon: 'confirmed',
    character: 'active',
    character_state: 'active',
    timeline_event: 'confirmed',
    location: 'active',
    world_entry: 'candidate',
    resource: 'active',
    foreshadowing: 'planned',
    narrative: 'active',
    issue: 'open'
  }
  return {
    id: impact.target_id,
    type: impact.target_type,
    schema_version: 1,
    title: impact.title,
    status: status[impact.target_type] ?? 'active',
    tags: [],
    enabled: true,
    source_refs: [session.chapter_id],
    relations: []
  }
}

function assertProtectedIdentity(patch: Record<string, unknown>, impact: FinalizeImpact): void {
  if (patch.id !== undefined && patch.id !== impact.target_id) {
    throw new Error(`Finalize impact cannot change document id: ${impact.id}`)
  }
  if (patch.type !== undefined && patch.type !== impact.target_type) {
    throw new Error(`Finalize impact cannot change document type: ${impact.id}`)
  }
  if (patch.schema_version !== undefined && Number(patch.schema_version) !== 1) {
    throw new Error(`Finalize impact cannot change schema_version: ${impact.id}`)
  }
}

function validatePreparedReferences(
  existingDocs: Array<{ data: DocumentIdentity }>,
  prepared: PreparedApplicationItem[]
): void {
  const ids = new Set(existingDocs.map((document) => document.data.id))
  for (const item of prepared) ids.add(item.report.target_id)
  const requireId = (value: unknown, label: string) => {
    if (typeof value === 'string' && value && !ids.has(value)) {
      throw new Error(`Finalization change set references a missing ${label}: ${value}`)
    }
  }
  for (const item of prepared) {
    const data = item.normalized_data
    if (Array.isArray(data.relations)) {
      for (const relation of data.relations) {
        if (relation && typeof relation === 'object') {
          requireId((relation as Record<string, unknown>).target_id, 'related document')
        }
      }
    }
    if (item.report.target_type === 'character_state') {
      requireId(data.character, 'character')
      requireId(data.scope_id, 'scope')
      requireId(data.timeline_node, 'timeline node')
    } else if (item.report.target_type === 'timeline_event') {
      requireId(data.timeline_node, 'timeline node')
      requireId(data.location, 'location')
      if (Array.isArray(data.characters)) {
        for (const character of data.characters) requireId(character, 'character')
      }
    } else if (item.report.target_type === 'foreshadowing') {
      if (Array.isArray(data.related_characters)) {
        for (const character of data.related_characters) requireId(character, 'character')
      }
      requireId(data.related_arc, 'outline')
    } else if (item.report.target_type === 'issue' && Array.isArray(data.related_docs)) {
      for (const related of data.related_docs) requireId(related, 'issue-related document')
    }
  }
}

async function persistApplicationArtifacts(
  projectRoot: string,
  prepared: PreparedApplicationItem[],
  sessionBefore: string,
  sessionAfter: string,
  report: FinalizationApplicationReport
): Promise<void> {
  for (const item of prepared) {
    if (item.before_content !== null && item.report.backup_path) {
      const backupPath = resolveProjectPath(projectRoot, item.report.backup_path)
      await assertContainedPath(projectRoot, backupPath)
      await writeText(backupPath, item.before_content)
    }
    const stagedPath = resolveProjectPath(projectRoot, item.report.staged_path)
    await assertContainedPath(projectRoot, stagedPath)
    await writeText(stagedPath, item.after_content)
  }
  const sessionBackupPath = resolveProjectPath(projectRoot, report.session.backup_path)
  const sessionStagedPath = resolveProjectPath(projectRoot, report.session.staged_path)
  await assertContainedPath(projectRoot, sessionBackupPath)
  await assertContainedPath(projectRoot, sessionStagedPath)
  await writeText(sessionBackupPath, sessionBefore)
  await writeText(sessionStagedPath, sessionAfter)
}

async function assertBeforeHashes(projectRoot: string, report: FinalizationApplicationReport): Promise<void> {
  const sourceChapterHash = sha256(
    await readText(resolveProjectPath(projectRoot, report.source.chapter_path))
  )
  const sourceProseHash = sha256(await readText(resolveProjectPath(projectRoot, report.source.prose_path)))
  if (sourceChapterHash !== report.source.chapter_sha256 || sourceProseHash !== report.source.prose_sha256) {
    throw new Error(`Finalization source changed during apply: ${report.source_chapter_id}`)
  }
  for (const item of report.items) {
    const target = resolveProjectPath(projectRoot, item.path)
    await assertDocumentTargetPath(projectRoot, item.target_type, target)
    if (item.before_sha256 === null) {
      if (await pathExists(target)) throw new Error(`Create target appeared during apply: ${item.path}`)
    } else {
      const actual = sha256(await readText(target))
      if (actual !== item.before_sha256) {
        throw new Error(`Target hash changed during apply: ${item.path}`)
      }
    }
  }
  const sessionActual = sha256(await readText(resolveProjectPath(projectRoot, report.session.path)))
  if (sessionActual !== report.session.before_sha256) {
    throw new Error(`Review session changed during apply: ${report.session_id}`)
  }
}

async function readVerifiedStage(
  projectRoot: string,
  item: { staged_path: string; after_sha256: string }
): Promise<string> {
  const content = await readText(resolveProjectPath(projectRoot, item.staged_path))
  if (sha256(content) !== item.after_sha256) throw new Error(`Staged file hash mismatch: ${item.staged_path}`)
  return content
}

async function verifyAppliedState(projectRoot: string, report: FinalizationApplicationReport): Promise<void> {
  const sourceChapterHash = sha256(
    await readText(resolveProjectPath(projectRoot, report.source.chapter_path))
  )
  const sourceProseHash = sha256(await readText(resolveProjectPath(projectRoot, report.source.prose_path)))
  if (sourceChapterHash !== report.source.chapter_sha256 || sourceProseHash !== report.source.prose_sha256) {
    throw new Error(`Finalization source changed before verification: ${report.source_chapter_id}`)
  }
  for (const item of report.items) {
    const target = resolveProjectPath(projectRoot, item.path)
    const content = await readText(target)
    if (sha256(content) !== item.after_sha256) {
      throw new Error(`Applied file hash mismatch: ${item.path}`)
    }
    const parsed = await readMarkdown<Record<string, unknown>>(target)
    const validated = parseKnownDocument(parsed.data, target)
    if (validated.id !== item.target_id || validated.type !== item.target_type) {
      throw new Error(`Applied document identity mismatch: ${item.path}`)
    }
  }
  const sessionRaw = await readText(resolveProjectPath(projectRoot, report.session.path))
  if (sha256(sessionRaw) !== report.session.after_sha256) {
    throw new Error(`Applied review session hash mismatch: ${report.session_id}`)
  }
  const session = JSON.parse(sessionRaw) as FinalizeReviewSession
  if (session.status !== 'applied' || session.application?.id !== report.id) {
    throw new Error(`Review session was not marked applied after verification: ${report.session_id}`)
  }
}

async function rollbackApplication(
  projectRoot: string,
  report: FinalizationApplicationReport
): Promise<void> {
  for (const item of [...report.items].reverse()) {
    const target = resolveProjectPath(projectRoot, item.path)
    await assertDocumentTargetPath(projectRoot, item.target_type, target)
    if (item.before_sha256 === null) {
      await rm(target, { force: true })
    } else {
      if (!item.backup_path) throw new Error(`Missing backup reference: ${item.path}`)
      const backup = await readText(resolveProjectPath(projectRoot, item.backup_path))
      if (sha256(backup) !== item.before_sha256) throw new Error(`Backup hash mismatch: ${item.path}`)
      await writeText(target, backup)
    }
  }
  const sessionBackup = await readText(resolveProjectPath(projectRoot, report.session.backup_path))
  if (sha256(sessionBackup) !== report.session.before_sha256) {
    throw new Error(`Review session backup hash mismatch: ${report.session_id}`)
  }
  await writeText(resolveProjectPath(projectRoot, report.session.path), sessionBackup)
  await verifyRollback(projectRoot, report)
}

async function verifyRollback(projectRoot: string, report: FinalizationApplicationReport): Promise<void> {
  for (const item of report.items) {
    const target = resolveProjectPath(projectRoot, item.path)
    if (item.before_sha256 === null) {
      if (await pathExists(target)) throw new Error(`Created file remained after rollback: ${item.path}`)
    } else if (sha256(await readText(target)) !== item.before_sha256) {
      throw new Error(`Rollback hash mismatch: ${item.path}`)
    }
  }
  const sessionHash = sha256(await readText(resolveProjectPath(projectRoot, report.session.path)))
  if (sessionHash !== report.session.before_sha256) {
    throw new Error(`Review session rollback hash mismatch: ${report.session_id}`)
  }
}

async function archiveFailedReport(
  projectRoot: string,
  reportPath: string,
  report: FinalizationApplicationReport
): Promise<string> {
  const archive = path.join(path.dirname(reportPath), 'attempts', `${report.id}-${report.state}.json`)
  await assertContainedPath(projectRoot, archive)
  await ensureDir(path.dirname(archive))
  await rename(reportPath, archive)
  return relativeProjectPath(projectRoot, archive)
}

async function saveReport(filePath: string, report: FinalizationApplicationReport): Promise<void> {
  await writeText(filePath, `${JSON.stringify(report, null, 2)}\n`)
}

function artifactPath(root: string, bucket: 'backup' | 'staged', relative: string): string {
  return path.join(root, bucket, ...relative.split('/'))
}

function relativeProjectPath(projectRoot: string, candidate: string): string {
  const relative = path.relative(path.resolve(projectRoot), path.resolve(candidate))
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escapes the project root: ${candidate}`)
  }
  return relative.replace(/\\/gu, '/')
}

function resolveProjectPath(projectRoot: string, relative: string): string {
  if (path.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    throw new Error(`Audit path must be project-relative: ${relative}`)
  }
  if (relative.replace(/\\/gu, '/').split('/').includes('..')) {
    throw new Error(`Audit path contains traversal: ${relative}`)
  }
  const resolved = path.resolve(projectRoot, ...relative.replace(/\\/gu, '/').split('/'))
  relativeProjectPath(projectRoot, resolved)
  return resolved
}

async function assertDocumentTargetPath(
  projectRoot: string,
  type: DocType,
  candidate: string
): Promise<void> {
  const typeRoot = path.resolve(dirForType(projectRoot, type))
  const relative = path.relative(typeRoot, path.resolve(candidate))
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Finalization target is outside its managed ${type} directory: ${candidate}`)
  }
  await assertContainedPath(projectRoot, candidate)
}

async function assertContainedPath(projectRoot: string, candidate: string): Promise<void> {
  const root = path.resolve(projectRoot)
  const resolved = path.resolve(candidate)
  const relative = path.relative(root, resolved)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe finalization path outside project: ${candidate}`)
  }
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    if (!(await pathExists(current))) continue
    const details = await lstat(current)
    if (details.isSymbolicLink()) throw new Error(`Finalization paths cannot traverse symlinks: ${current}`)
  }
}

function assertSafeIdentifier(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value) || value === '.' || value === '..') {
    throw new Error(`Unsafe ${label}: ${value}`)
  }
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
