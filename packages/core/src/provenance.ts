import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathExists, readMarkdown, readText, writeMarkdown } from './fs.js'
import type { DocType } from './types.js'

export const DOCUMENT_ORIGIN_FIELD = 'quillarium_origin'

export interface OriginSourceFile {
  path: string
  sha256: string
}

interface OriginBase {
  schema_version: 1
  created_at: string
  updated_at: string
}

export interface AIConversationOrigin extends OriginBase {
  kind: 'ai-conversation'
  session_id: string
}

export interface DocumentImportOrigin extends OriginBase {
  kind: 'document-import'
  sources: OriginSourceFile[]
  item_index: number
  item_title: string
  options?: {
    strategy?: 'auto' | 'single' | 'sections'
    default_type?: DocType
  }
}

export interface AIImportOrigin extends OriginBase {
  kind: 'ai-import'
  session_id: string
  candidate_index: number
  sources: OriginSourceFile[]
}

export type DocumentOrigin = AIConversationOrigin | DocumentImportOrigin | AIImportOrigin

export interface OriginSourceStatus extends OriginSourceFile {
  exists: boolean
  current_sha256: string | null
  changed: boolean
}

export interface DocumentOriginResolution {
  origin: DocumentOrigin
  sources: OriginSourceStatus[]
  can_reimport: boolean
}

export function readDocumentOrigin(data: Record<string, unknown>): DocumentOrigin | null {
  const value = data[DOCUMENT_ORIGIN_FIELD]
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.kind !== 'string') return null
  if (value.kind === 'ai-conversation' && typeof value.session_id === 'string') {
    return {
      schema_version: 1,
      kind: 'ai-conversation',
      session_id: value.session_id,
      created_at: stringValue(value.created_at),
      updated_at: stringValue(value.updated_at)
    }
  }
  if (value.kind === 'document-import') {
    const options = isRecord(value.options)
      ? cleanImportOptions(value.options.strategy, value.options.default_type)
      : undefined
    return {
      schema_version: 1,
      kind: 'document-import',
      sources: sourceFiles(value.sources),
      item_index: nonNegativeInteger(value.item_index),
      item_title: stringValue(value.item_title),
      options,
      created_at: stringValue(value.created_at),
      updated_at: stringValue(value.updated_at)
    }
  }
  if (
    value.kind === 'ai-import' &&
    typeof value.session_id === 'string' &&
    Number.isInteger(value.candidate_index)
  ) {
    return {
      schema_version: 1,
      kind: 'ai-import',
      session_id: value.session_id,
      candidate_index: nonNegativeInteger(value.candidate_index),
      sources: sourceFiles(value.sources),
      created_at: stringValue(value.created_at),
      updated_at: stringValue(value.updated_at)
    }
  }
  return null
}

export async function attachDocumentOrigin(filePath: string, origin: DocumentOrigin): Promise<void> {
  const document = await readMarkdown<Record<string, unknown>>(filePath)
  await writeMarkdown(filePath, { ...document.data, [DOCUMENT_ORIGIN_FIELD]: origin }, document.content)
}

export async function makeOriginSourceFile(filePath: string): Promise<OriginSourceFile> {
  const resolved = path.resolve(filePath)
  return { path: resolved, sha256: (await sourceHash(resolved)) ?? '' }
}

export async function resolveDocumentOrigin(
  projectRoot: string,
  filePath: string
): Promise<DocumentOriginResolution | null> {
  const target = assertProjectPath(projectRoot, filePath)
  const document = await readMarkdown<Record<string, unknown>>(target)
  let origin = readDocumentOrigin(document.data)
  if (!origin) origin = await findLegacyAIImportOrigin(projectRoot, target)
  if (!origin) return null
  const sources = await inspectOriginSources(origin)
  const sessionAvailable =
    origin.kind !== 'ai-import' ||
    (await pathExists(path.join(projectRoot, 'imports', `${origin.session_id}.json`)))
  return {
    origin,
    sources,
    can_reimport:
      origin.kind !== 'ai-conversation' && sessionAvailable && sources.some((source) => source.exists)
  }
}

export async function refreshOriginSources(sources: OriginSourceFile[]): Promise<OriginSourceFile[]> {
  return Promise.all(
    sources.map(async (source) => ({
      path: source.path,
      sha256: (await sourceHash(source.path)) ?? source.sha256
    }))
  )
}

export function assertProjectPath(projectRoot: string, candidate: string): string {
  const root = path.resolve(projectRoot)
  const resolved = path.resolve(candidate)
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Document path must be a file inside the current project.')
  }
  return resolved
}

async function inspectOriginSources(origin: DocumentOrigin): Promise<OriginSourceStatus[]> {
  if (origin.kind === 'ai-conversation') return []
  return Promise.all(
    origin.sources.map(async (source) => {
      const current = await sourceHash(source.path)
      return {
        ...source,
        exists: current !== null,
        current_sha256: current,
        changed: current !== null && Boolean(source.sha256) && current !== source.sha256
      }
    })
  )
}

async function findLegacyAIImportOrigin(
  projectRoot: string,
  targetPath: string
): Promise<AIImportOrigin | null> {
  const importsRoot = path.join(projectRoot, 'imports')
  if (!(await pathExists(importsRoot))) return null
  const entries = await readdir(importsRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    let session: Record<string, unknown>
    try {
      session = JSON.parse(await readText(path.join(importsRoot, entry.name))) as Record<string, unknown>
    } catch {
      continue
    }
    if (!Array.isArray(session.landed)) continue
    const landedIndex = session.landed.findIndex((item) => {
      if (!isRecord(item) || typeof item.path !== 'string') return false
      return path.resolve(item.path) === targetPath
    })
    if (landedIndex < 0 || typeof session.id !== 'string') continue
    const landed = session.landed[landedIndex]
    const candidateIndex =
      isRecord(landed) && Number.isInteger(landed.candidate_index)
        ? nonNegativeInteger(landed.candidate_index)
        : landedIndex
    const now = new Date().toISOString()
    return {
      schema_version: 1,
      kind: 'ai-import',
      session_id: session.id,
      candidate_index: candidateIndex,
      sources: Array.isArray(session.sources)
        ? session.sources.flatMap((source) =>
            isRecord(source) && typeof source.source === 'string'
              ? [{ path: source.source, sha256: stringValue(source.sha256) }]
              : []
          )
        : [],
      created_at: stringValue(session.created_at) || now,
      updated_at: now
    }
  }
  return null
}

async function sourceHash(filePath: string): Promise<string | null> {
  if (!path.isAbsolute(filePath) || !(await pathExists(filePath))) return null
  try {
    return createHash('sha256')
      .update(await readText(filePath))
      .digest('hex')
  } catch {
    return null
  }
}

function sourceFiles(value: unknown): OriginSourceFile[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    isRecord(item) && typeof item.path === 'string'
      ? [{ path: item.path, sha256: stringValue(item.sha256) }]
      : []
  )
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
}

function importStrategy(value: unknown): 'auto' | 'single' | 'sections' | undefined {
  return value === 'auto' || value === 'single' || value === 'sections' ? value : undefined
}

function cleanImportOptions(
  strategyValue: unknown,
  typeValue: unknown
): DocumentImportOrigin['options'] | undefined {
  const strategy = importStrategy(strategyValue)
  const default_type = docType(typeValue)
  return strategy || default_type
    ? { ...(strategy ? { strategy } : {}), ...(default_type ? { default_type } : {}) }
    : undefined
}

function docType(value: unknown): DocType | undefined {
  return typeof value === 'string' ? (value as DocType) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
