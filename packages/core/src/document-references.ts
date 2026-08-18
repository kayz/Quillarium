import { createHash } from 'node:crypto'
import path from 'node:path'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { listDocs } from './documents.js'
import type { DocumentIdentity } from './types.js'

export type LocalReferenceStatus = 'resolved' | 'ambiguous' | 'missing'

export type LocalReferenceMatchBasis =
  'stable_id' | 'code' | 'relative_path' | 'filename' | 'wikilink_target' | 'title' | 'alias'

export type LocalReferenceOrigin = 'wikilink' | 'markdown_link' | 'structured_link' | 'backlink'

export interface LocalReferenceFragment {
  kind: 'heading' | 'block'
  value: string
}

export interface LocalReferenceCandidate {
  id: string
  type: string
  title: string
  relative_path: string
  matched_by: LocalReferenceMatchBasis
}

export interface LocalDocumentReferenceResult {
  raw_reference: string
  source_path: string
  origin: LocalReferenceOrigin
  status: LocalReferenceStatus
  target_id?: string
  target_relative_path?: string
  matched_by?: LocalReferenceMatchBasis
  fragment?: LocalReferenceFragment
  display_text?: string
  candidates: LocalReferenceCandidate[]
}

export interface ExtractedLocalReference {
  raw_reference: string
  target: string
  origin: Exclude<LocalReferenceOrigin, 'backlink'>
  field_path?: string
}

export interface ReferenceDocument<T extends DocumentIdentity = DocumentIdentity> {
  path?: string
  data: T
  content: string
}

export interface LocalDocumentLinkIndexV1 {
  schema_version: 1
  generated_at: string
  source_sha256: string
  forward: Record<string, LocalDocumentReferenceResult[]>
  backlinks: Record<string, LocalDocumentReferenceResult[]>
  unresolved: LocalDocumentReferenceResult[]
}

interface IndexedDocument {
  document: ReferenceDocument
  relativePath: string
  normalizedRelativePath: string
  filename: string
  filenameStem: string
  stableId: string
  code: string | null
  title: string
  aliases: string[]
}

interface ParsedReference {
  target: string
  displayText?: string
  fragment?: LocalReferenceFragment
  syntax: 'plain' | 'wikilink' | 'markdown_link'
}

const STRUCTURED_REFERENCE_FIELDS = new Set([
  'source_refs',
  'target_id',
  'links',
  'used_in.scene',
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
  'diagram_nodes.target_location',
  'from',
  'to'
])

export class LocalDocumentReferenceResolver {
  private readonly documents: IndexedDocument[]

  constructor(
    documents: ReferenceDocument[],
    private readonly projectRoot?: string
  ) {
    this.documents = documents.map((document) => indexDocument(document, projectRoot))
  }

  resolve(
    rawReference: string,
    options: { sourcePath?: string; origin?: LocalReferenceOrigin } = {}
  ): LocalDocumentReferenceResult {
    const parsed = parseLocalReference(rawReference)
    const sourcePath = normalizeSourcePath(options.sourcePath, this.projectRoot)
    const base = {
      raw_reference: rawReference,
      source_path: sourcePath,
      origin: options.origin ?? originFromSyntax(parsed.syntax),
      ...(parsed.fragment ? { fragment: parsed.fragment } : {}),
      ...(parsed.displayText ? { display_text: parsed.displayText } : {})
    }
    const target = parsed.target
    if (!target || isExternalReference(target)) return { ...base, status: 'missing', candidates: [] }

    const stages: Array<{
      basis: LocalReferenceMatchBasis
      candidates: () => IndexedDocument[]
    }> = [
      {
        basis: 'stable_id',
        candidates: () => this.documents.filter((candidate) => candidate.stableId === normalizeExact(target))
      },
      {
        basis: 'code',
        candidates: () =>
          this.documents.filter(
            (candidate) => candidate.code !== null && candidate.code === normalizeLookup(target)
          )
      },
      {
        basis: 'relative_path',
        candidates: () => this.matchRelativePath(target, sourcePath)
      },
      {
        basis: 'filename',
        candidates: () => this.matchFilename(target)
      },
      {
        basis: 'wikilink_target',
        candidates: () =>
          parsed.syntax === 'wikilink'
            ? this.documents.filter(
                (candidate) => candidate.filenameStem === normalizeLookup(stripMarkdownExtension(target))
              )
            : []
      },
      {
        basis: 'title',
        candidates: () => this.documents.filter((candidate) => candidate.title === normalizeLookup(target))
      },
      {
        basis: 'alias',
        candidates: () =>
          this.documents.filter((candidate) => candidate.aliases.includes(normalizeLookup(target)))
      }
    ]

    for (const stage of stages) {
      const matches = uniqueDocuments(stage.candidates())
      if (!matches.length) continue
      const candidates = matches.map((candidate) => candidateResult(candidate, stage.basis))
      if (matches.length > 1) return { ...base, status: 'ambiguous', candidates }
      const [match] = matches
      return {
        ...base,
        status: 'resolved',
        target_id: match.stableId,
        target_relative_path: match.relativePath,
        matched_by: stage.basis,
        candidates
      }
    }
    return { ...base, status: 'missing', candidates: [] }
  }

  private matchRelativePath(target: string, sourcePath: string): IndexedDocument[] {
    const normalizedTarget = normalizeVaultPath(target)
    const possible = new Set<string>([normalizedTarget, stripMarkdownExtension(normalizedTarget)])
    if (sourcePath && !path.posix.isAbsolute(normalizedTarget)) {
      const fromSource = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourcePath), normalizedTarget)
      )
      if (!fromSource.startsWith('../')) {
        possible.add(fromSource)
        possible.add(stripMarkdownExtension(fromSource))
      }
    }
    return this.documents.filter((candidate) => {
      const withExtension = candidate.normalizedRelativePath
      const withoutExtension = stripMarkdownExtension(withExtension)
      return [...possible].some(
        (item) => normalizeLookup(item) === withExtension || normalizeLookup(item) === withoutExtension
      )
    })
  }

  private matchFilename(target: string): IndexedDocument[] {
    const basename = path.posix.basename(normalizeVaultPath(target))
    if (!basename.toLocaleLowerCase('en-US').endsWith('.md')) return []
    const key = normalizeLookup(basename)
    return this.documents.filter((candidate) => candidate.filename === key)
  }
}

export function createLocalDocumentReferenceResolver(
  documents: ReferenceDocument[],
  projectRoot?: string
): LocalDocumentReferenceResolver {
  return new LocalDocumentReferenceResolver(documents, projectRoot)
}

export function extractLocalDocumentReferences(text: string): ExtractedLocalReference[] {
  const references: ExtractedLocalReference[] = []
  const wikilinkRanges: Array<{ start: number; end: number }> = []
  for (const match of text.matchAll(/!?\[\[([^\]]+)\]\]/gu)) {
    const raw = match[0]
    const start = match.index ?? 0
    wikilinkRanges.push({ start, end: start + raw.length })
    references.push({ raw_reference: raw, target: raw, origin: 'wikilink' })
  }
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)) {
    const start = match.index ?? 0
    if (wikilinkRanges.some((range) => start >= range.start && start < range.end)) continue
    const raw = match[0]
    references.push({ raw_reference: raw, target: raw, origin: 'markdown_link' })
  }
  return references
}

export function extractStructuredDocumentReferences(
  data: Record<string, unknown>
): ExtractedLocalReference[] {
  const references: ExtractedLocalReference[] = []
  const visit = (value: unknown, fieldPath: string): void => {
    if (typeof value === 'string') {
      const embedded = extractLocalDocumentReferences(value)
      if (embedded.length) {
        references.push(...embedded.map((item) => ({ ...item, field_path: fieldPath })))
      } else if (
        STRUCTURED_REFERENCE_FIELDS.has(fieldPath) ||
        STRUCTURED_REFERENCE_FIELDS.has(fieldPath.split('.').at(-1) ?? '')
      ) {
        references.push({
          raw_reference: value,
          target: value,
          origin: 'structured_link',
          field_path: fieldPath
        })
      }
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, fieldPath)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = fieldPath ? `${fieldPath}.${key}` : key
      visit(item, nextPath.replace(/\.\d+(?=\.|$)/gu, ''))
    }
  }
  for (const [key, value] of Object.entries(data)) visit(value, key)
  return references.filter((item) => item.raw_reference.trim())
}

export function buildLocalDocumentLinkIndex(
  documents: ReferenceDocument[],
  projectRoot?: string,
  now: Date = new Date()
): LocalDocumentLinkIndexV1 {
  const resolver = createLocalDocumentReferenceResolver(documents, projectRoot)
  const forward: Record<string, LocalDocumentReferenceResult[]> = {}
  const backlinks: Record<string, LocalDocumentReferenceResult[]> = {}
  const unresolved: LocalDocumentReferenceResult[] = []

  for (const document of [...documents].sort((left, right) =>
    left.data.id.localeCompare(right.data.id, 'en')
  )) {
    const sourcePath = relativeDocumentPath(document.path, projectRoot)
    const tokens = [
      ...extractLocalDocumentReferences(document.content),
      ...extractStructuredDocumentReferences(document.data as unknown as Record<string, unknown>)
    ]
    const resolved = uniqueReferenceTokens(tokens).map((token) =>
      resolver.resolve(token.target, { sourcePath, origin: token.origin })
    )
    forward[document.data.id] = resolved
    for (const reference of resolved) {
      if (reference.status !== 'resolved' || !reference.target_id) {
        unresolved.push(reference)
        continue
      }
      const backlink: LocalDocumentReferenceResult = {
        ...reference,
        origin: 'backlink',
        target_id: document.data.id,
        target_relative_path: sourcePath,
        candidates: []
      }
      ;(backlinks[reference.target_id] ??= []).push(backlink)
    }
  }
  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    source_sha256: documentSetSha256(documents, projectRoot),
    forward,
    backlinks,
    unresolved
  }
}

export function localDocumentLinkIndexPath(projectRoot: string): string {
  return path.join(projectRoot, '.quillarium', 'cache', 'document-links.json')
}

export async function readLocalDocumentLinkIndex(
  projectRoot: string
): Promise<LocalDocumentLinkIndexV1 | null> {
  const cachePath = localDocumentLinkIndexPath(projectRoot)
  if (!(await pathExists(cachePath))) return null
  try {
    const parsed = JSON.parse(await readText(cachePath)) as Partial<LocalDocumentLinkIndexV1>
    if (
      parsed.schema_version !== 1 ||
      typeof parsed.forward !== 'object' ||
      parsed.forward === null ||
      typeof parsed.backlinks !== 'object' ||
      parsed.backlinks === null
    ) {
      return null
    }
    return parsed as LocalDocumentLinkIndexV1
  } catch {
    return null
  }
}

export async function loadLocalDocumentLinkIndex(projectRoot: string): Promise<LocalDocumentLinkIndexV1> {
  return (await readLocalDocumentLinkIndex(projectRoot)) ?? rebuildLocalDocumentLinkIndex(projectRoot)
}

export async function rebuildLocalDocumentLinkIndex(projectRoot: string): Promise<LocalDocumentLinkIndexV1> {
  const documents = await listDocs<DocumentIdentity>(projectRoot)
  const index = buildLocalDocumentLinkIndex(documents, projectRoot)
  await ensureDir(path.dirname(localDocumentLinkIndexPath(projectRoot)))
  await writeText(localDocumentLinkIndexPath(projectRoot), `${JSON.stringify(index, null, 2)}\n`)
  return index
}

export function formatObsidianDocumentLink(
  document: Pick<ReferenceDocument, 'path' | 'data'>,
  projectRoot?: string,
  displayText: string = document.data.title,
  fragment?: LocalReferenceFragment
): string {
  const relativePath = stripMarkdownExtension(relativeDocumentPath(document.path, projectRoot))
  if (!relativePath)
    throw new Error(`Cannot create an Obsidian link without a project-relative path: ${document.data.id}`)
  const suffix = fragment ? `#${fragment.kind === 'block' ? '^' : ''}${sanitizeLinkPart(fragment.value)}` : ''
  const label = sanitizeLinkPart(displayText)
  return `[[${relativePath}${suffix}|${label}]]`
}

export function relativeDocumentPath(documentPath: string | undefined, projectRoot?: string): string {
  if (!documentPath) return ''
  const absolute = normalizeVaultPath(documentPath)
  if (!projectRoot) return absolute
  const root = normalizeVaultPath(projectRoot).replace(/\/$/u, '')
  const key = normalizeLookup(absolute)
  const rootKey = normalizeLookup(root)
  if (key === rootKey) return ''
  if (key.startsWith(`${rootKey}/`)) return absolute.slice(root.length + 1)
  return absolute
}

export function parseLocalReference(rawReference: string): ParsedReference {
  let raw = normalizeExact(rawReference)
  let syntax: ParsedReference['syntax'] = 'plain'
  let displayText: string | undefined
  const wikilink = /^!?\[\[([\s\S]*)\]\]$/u.exec(raw)
  if (wikilink) {
    syntax = 'wikilink'
    raw = wikilink[1] ?? ''
    const separator = raw.indexOf('|')
    if (separator >= 0) {
      displayText = raw.slice(separator + 1).trim() || undefined
      raw = raw.slice(0, separator)
    }
  } else {
    const markdown = /^!?\[[^\]]*\]\(([^)]+)\)$/u.exec(raw)
    if (markdown) {
      syntax = 'markdown_link'
      raw = markdown[1] ?? ''
      const quotedTitle = /^(.*?)(?:\s+["'][^"']*["'])$/u.exec(raw)
      raw = quotedTitle?.[1] ?? raw
      if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1)
    }
  }
  try {
    raw = decodeURIComponent(raw)
  } catch {
    // Keep malformed percent-encoding deterministic and let it resolve as missing.
  }
  raw = raw.split('?')[0]?.trim() ?? ''
  const fragmentIndex = raw.indexOf('#')
  let fragment: LocalReferenceFragment | undefined
  if (fragmentIndex >= 0) {
    const value = raw.slice(fragmentIndex + 1).trim()
    raw = raw.slice(0, fragmentIndex).trim()
    if (value)
      fragment = value.startsWith('^') ? { kind: 'block', value: value.slice(1) } : { kind: 'heading', value }
  }
  return {
    target: normalizeVaultPath(raw),
    syntax,
    ...(displayText ? { displayText } : {}),
    ...(fragment ? { fragment } : {})
  }
}

function indexDocument(document: ReferenceDocument, projectRoot?: string): IndexedDocument {
  const relativePath = relativeDocumentPath(document.path, projectRoot)
  const filename = path.posix.basename(normalizeVaultPath(relativePath || document.path || ''))
  const data = document.data as unknown as Record<string, unknown>
  const aliases = [
    ...(Array.isArray(data['aliases']) ? data['aliases'] : []),
    ...(Array.isArray(data['alias']) ? data['alias'] : []),
    ...(typeof data['alias'] === 'string' ? [data['alias']] : [])
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(normalizeLookup)
  return {
    document,
    relativePath,
    normalizedRelativePath: normalizeLookup(normalizeVaultPath(relativePath)),
    filename: normalizeLookup(filename),
    filenameStem: normalizeLookup(stripMarkdownExtension(filename)),
    stableId: normalizeExact(document.data.id),
    code: typeof data['code'] === 'string' && data['code'].trim() ? normalizeLookup(data['code']) : null,
    title: normalizeLookup(document.data.title),
    aliases: [...new Set(aliases)]
  }
}

function candidateResult(
  candidate: IndexedDocument,
  matchedBy: LocalReferenceMatchBasis
): LocalReferenceCandidate {
  return {
    id: candidate.stableId,
    type: candidate.document.data.type,
    title: candidate.document.data.title,
    relative_path: candidate.relativePath,
    matched_by: matchedBy
  }
}

function uniqueDocuments(documents: IndexedDocument[]): IndexedDocument[] {
  const seen = new Set<string>()
  return documents.filter((document) => {
    const key = `${document.stableId}\0${document.relativePath}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function uniqueReferenceTokens(tokens: ExtractedLocalReference[]): ExtractedLocalReference[] {
  const seen = new Set<string>()
  return tokens.filter((token) => {
    const key = `${token.origin}\0${token.field_path ?? ''}\0${token.raw_reference}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function documentSetSha256(documents: ReferenceDocument[], projectRoot?: string): string {
  const canonical = [...documents]
    .sort((left, right) => left.data.id.localeCompare(right.data.id, 'en'))
    .map((document) => ({
      id: document.data.id,
      path: relativeDocumentPath(document.path, projectRoot),
      data: document.data,
      content: document.content
    }))
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex')
}

function normalizeSourcePath(sourcePath: string | undefined, projectRoot?: string): string {
  return relativeDocumentPath(sourcePath, projectRoot)
}

function normalizeExact(value: string): string {
  return value.normalize('NFC').trim()
}

function normalizeLookup(value: string): string {
  return normalizeExact(value).toLocaleLowerCase('en-US')
}

function normalizeVaultPath(value: string): string {
  return normalizeExact(value).replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/^\//u, '')
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/iu, '')
}

function originFromSyntax(syntax: ParsedReference['syntax']): LocalReferenceOrigin {
  if (syntax === 'wikilink') return 'wikilink'
  if (syntax === 'markdown_link') return 'markdown_link'
  return 'structured_link'
}

function isExternalReference(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/iu.test(value)
}

function sanitizeLinkPart(value: string): string {
  return value.replace(/[\]|]/gu, ' ').trim()
}
