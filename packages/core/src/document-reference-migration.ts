import { createHash } from 'node:crypto'
import path from 'node:path'
import { lstat, realpath, rm } from 'node:fs/promises'
import {
  createLocalDocumentReferenceResolver,
  extractLocalDocumentReferences,
  formatObsidianDocumentLink,
  parseLocalReference,
  relativeDocumentPath,
  type LocalDocumentReferenceResult,
  type LocalReferenceOrigin,
  type ReferenceDocument
} from './document-references.js'
import { listDocs } from './documents.js'
import { ensureDir, pathExists, readText, writeMarkdown, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { DocumentIdentity } from './types.js'
import { parseMarkdown } from './yaml.js'

export interface DocumentReferenceReplacementV1 {
  field_path: string
  raw_reference: string
  canonical_reference: string
  target_id: string
  matched_by: string
  origin: LocalReferenceOrigin
}

export interface DocumentReferenceMigrationFileV1 {
  relative_path: string
  expected_sha256: string
  replacements: DocumentReferenceReplacementV1[]
  data: Record<string, unknown>
  content: string
}

export interface DocumentReferenceMigrationPlanV1 {
  schema_version: 1
  migration_id: string
  created_at: string
  project_root: string
  files: DocumentReferenceMigrationFileV1[]
  ambiguous: LocalDocumentReferenceResult[]
  missing: LocalDocumentReferenceResult[]
}

export interface DocumentReferenceMigrationReportV1 {
  schema_version: 1
  migration_id: string
  applied_at: string
  backup_path: string
  changed_files: number
  replacement_count: number
  verified: boolean
}

export interface ApplyDocumentReferenceMigrationOptions {
  /** Test seam for simulating a failed atomic write. */
  write_document?: typeof writeMarkdown
  now?: Date
}

const STRUCTURED_LINK_FIELDS = new Set([
  'links',
  'source_refs',
  'target_id',
  'scene',
  'born_at',
  'died_at',
  'introduced_at',
  'exited_at',
  'from_character',
  'to_character',
  'starts_at',
  'ends_at',
  'planted_at',
  'related_arc',
  'reinforced_at',
  'related_characters',
  'related_docs',
  'character',
  'scope_id',
  'timeline_node',
  'previous',
  'next',
  'location',
  'flashback_reference',
  'characters',
  'parent_location',
  'layout_of',
  'target_location',
  'from',
  'to'
])

export async function planDocumentReferenceMigration(
  projectRoot: string,
  now: Date = new Date()
): Promise<DocumentReferenceMigrationPlanV1> {
  const root = await realpath(projectRoot)
  const documents = await listDocs<DocumentIdentity>(root)
  const resolver = createLocalDocumentReferenceResolver(documents, root)
  const byId = new Map(documents.map((document) => [document.data.id, document] as const))
  const files: DocumentReferenceMigrationFileV1[] = []
  const ambiguous: LocalDocumentReferenceResult[] = []
  const missing: LocalDocumentReferenceResult[] = []

  for (const document of [...documents].sort((left, right) =>
    relativeDocumentPath(left.path, root).localeCompare(relativeDocumentPath(right.path, root), 'en')
  )) {
    const relativePath = relativeDocumentPath(document.path, root)
    const raw = await readText(document.path)
    const replacements: DocumentReferenceReplacementV1[] = []
    const data = rewriteStructuredData(
      document.data as unknown as Record<string, unknown>,
      '',
      relativePath,
      resolver,
      byId,
      replacements,
      ambiguous,
      missing,
      root
    )
    const content = rewriteMarkdownContent(
      document.content,
      relativePath,
      resolver,
      byId,
      replacements,
      ambiguous,
      missing,
      root
    )
    if (!replacements.length) continue
    files.push({
      relative_path: relativePath,
      expected_sha256: sha256(raw),
      replacements,
      data,
      content
    })
  }

  return {
    schema_version: 1,
    migration_id: `document-references-${compactTimestamp(now)}`,
    created_at: now.toISOString(),
    project_root: root,
    files,
    ambiguous: uniqueResults(ambiguous),
    missing: uniqueResults(missing)
  }
}

export async function applyDocumentReferenceMigration(
  projectRoot: string,
  plan: DocumentReferenceMigrationPlanV1,
  options: ApplyDocumentReferenceMigrationOptions = {}
): Promise<DocumentReferenceMigrationReportV1> {
  const root = await realpath(projectRoot)
  if (path.resolve(plan.project_root) !== path.resolve(root)) {
    throw new Error('Document reference migration plan belongs to a different project.')
  }
  const writeDocument = options.write_document ?? writeMarkdown
  const now = options.now ?? new Date()
  return withProjectWriteLock(root, async () => {
    const backupRoot = path.join(root, '.quillarium', 'migrations', plan.migration_id, 'backup')
    const snapshots = new Map<string, string>()
    for (const file of plan.files) {
      const absolute = await containedRegularFile(root, file.relative_path)
      const current = await readText(absolute)
      if (sha256(current) !== file.expected_sha256) {
        throw new Error(`STALE_PROJECT_WRITE: Project data changed: ${file.relative_path}`)
      }
      snapshots.set(file.relative_path, current)
    }

    await ensureDir(backupRoot)
    for (const [relativePath, raw] of snapshots) {
      const target = path.join(backupRoot, ...relativePath.split('/'))
      await writeText(target, raw)
    }

    const written: string[] = []
    try {
      for (const file of plan.files) {
        const absolute = await containedRegularFile(root, file.relative_path)
        await writeDocument(absolute, file.data, file.content)
        written.push(file.relative_path)
      }
      for (const file of plan.files) {
        const absolute = await containedRegularFile(root, file.relative_path)
        const parsed = parseMarkdown<Record<string, unknown>>(await readText(absolute))
        if (JSON.stringify(parsed.data) !== JSON.stringify(file.data) || parsed.content !== file.content) {
          throw new Error(`Document reference migration verification failed: ${file.relative_path}`)
        }
      }
    } catch (error) {
      const rollbackErrors: Error[] = []
      for (const relativePath of [...written].reverse()) {
        try {
          await writeText(path.join(root, ...relativePath.split('/')), snapshots.get(relativePath)!)
        } catch (rollbackError) {
          rollbackErrors.push(
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
          )
        }
      }
      if (rollbackErrors.length) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          'Reference migration failed and rollback was incomplete.',
          { cause: error }
        )
      }
      throw error
    }

    const report: DocumentReferenceMigrationReportV1 = {
      schema_version: 1,
      migration_id: plan.migration_id,
      applied_at: now.toISOString(),
      backup_path: relativeDocumentPath(backupRoot, root),
      changed_files: plan.files.length,
      replacement_count: plan.files.reduce((sum, file) => sum + file.replacements.length, 0),
      verified: true
    }
    await writeText(
      path.join(root, '.quillarium', 'migrations', plan.migration_id, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`
    )
    return report
  })
}

export async function discardDocumentReferenceMigrationBackup(
  projectRoot: string,
  migrationId: string
): Promise<void> {
  const root = await realpath(projectRoot)
  const target = path.resolve(root, '.quillarium', 'migrations', migrationId)
  const relative = path.relative(root, target)
  if (!relative.startsWith(`.quillarium${path.sep}migrations${path.sep}`)) {
    throw new Error('Invalid migration backup path.')
  }
  if (await pathExists(target)) await rm(target, { recursive: true, force: false })
}

function rewriteStructuredData(
  value: Record<string, unknown>,
  fieldPath: string,
  sourcePath: string,
  resolver: ReturnType<typeof createLocalDocumentReferenceResolver>,
  byId: Map<string, ReferenceDocument>,
  replacements: DocumentReferenceReplacementV1[],
  ambiguous: LocalDocumentReferenceResult[],
  missing: LocalDocumentReferenceResult[],
  projectRoot: string
): Record<string, unknown> {
  const visit = (current: unknown, currentPath: string): unknown => {
    if (typeof current === 'string') {
      const field =
        currentPath
          .split('.')
          .filter((segment) => !/^\d+$/u.test(segment))
          .at(-1) ?? ''
      if (!STRUCTURED_LINK_FIELDS.has(field) || !current.trim()) return current
      const resolution = resolver.resolve(current, { sourcePath, origin: 'structured_link' })
      if (resolution.status === 'ambiguous') ambiguous.push(resolution)
      if (resolution.status === 'missing') missing.push(resolution)
      if (resolution.status !== 'resolved' || !resolution.target_id) return current
      const resolved = { ...resolution, target_id: resolution.target_id }
      const target = byId.get(resolution.target_id)
      if (!target) return current
      const canonical =
        field === 'links'
          ? formatObsidianDocumentLink(target, projectRoot, target.data.title, resolution.fragment)
          : resolution.target_id
      if (canonical === current) return current
      replacements.push(replacement(currentPath, current, canonical, resolved))
      return canonical
    }
    if (Array.isArray(current)) return current.map((item, index) => visit(item, `${currentPath}.${index}`))
    if (!current || typeof current !== 'object') return current
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).map(([key, item]) => [
        key,
        visit(item, currentPath ? `${currentPath}.${key}` : key)
      ])
    )
  }
  return visit(value, fieldPath) as Record<string, unknown>
}

function rewriteMarkdownContent(
  content: string,
  sourcePath: string,
  resolver: ReturnType<typeof createLocalDocumentReferenceResolver>,
  byId: Map<string, ReferenceDocument>,
  replacements: DocumentReferenceReplacementV1[],
  ambiguous: LocalDocumentReferenceResult[],
  missing: LocalDocumentReferenceResult[],
  projectRoot: string
): string {
  let rewritten = content
  for (const token of extractLocalDocumentReferences(content)) {
    const resolution = resolver.resolve(token.target, { sourcePath, origin: token.origin })
    if (resolution.status === 'ambiguous') ambiguous.push(resolution)
    if (resolution.status === 'missing') missing.push(resolution)
    if (resolution.status !== 'resolved' || !resolution.target_id) continue
    const resolved = { ...resolution, target_id: resolution.target_id }
    const target = byId.get(resolution.target_id)
    if (!target) continue
    const parsed = parseLocalReference(token.target)
    const canonical = formatObsidianDocumentLink(
      target,
      projectRoot,
      parsed.displayText ?? target.data.title,
      parsed.fragment
    )
    if (canonical === token.raw_reference) continue
    rewritten = rewritten.split(token.raw_reference).join(canonical)
    replacements.push(replacement('content', token.raw_reference, canonical, resolved))
  }
  return rewritten
}

function replacement(
  fieldPath: string,
  raw: string,
  canonical: string,
  resolution: LocalDocumentReferenceResult & { target_id: string }
): DocumentReferenceReplacementV1 {
  return {
    field_path: fieldPath,
    raw_reference: raw,
    canonical_reference: canonical,
    target_id: resolution.target_id,
    matched_by: resolution.matched_by ?? 'unknown',
    origin: resolution.origin
  }
}

async function containedRegularFile(root: string, relativePath: string): Promise<string> {
  const absolute = path.resolve(root, ...relativePath.replace(/\\/gu, '/').split('/'))
  const relative = path.relative(root, absolute)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Migration target escapes the project: ${relativePath}`)
  }
  const stats = await lstat(absolute)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Migration target must be a regular file: ${relativePath}`)
  }
  const resolved = await realpath(absolute)
  const realRelative = path.relative(root, resolved)
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`Migration target resolves outside the project: ${relativePath}`)
  }
  return resolved
}

function uniqueResults(results: LocalDocumentReferenceResult[]): LocalDocumentReferenceResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    const key = `${result.source_path}\0${result.origin}\0${result.raw_reference}\0${result.status}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compactTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:.TZ]/gu, '')
    .slice(0, 14)
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
