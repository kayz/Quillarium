import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  canonSchema,
  characterRelationSchema,
  characterSchema,
  characterStateSchema,
  ensureDir,
  fileForDoc,
  listDocs,
  loadProject,
  locationSchema,
  pathExists,
  stableProjectId,
  timelineEventSchema,
  updateProjectConfig,
  worldEntrySchema,
  writeBinary,
  writeMarkdown,
  writeText,
  type DocType,
  type DocumentIdentity
} from '@quillarium/core'
import { parseCharacterCardJson, parseCharacterCardPng } from './card.js'
import { embedCharacterCardJsonInPng, hasPngSignature, pngDimensions } from './png.js'
import { SillyTavernFormatError } from './errors.js'
import type {
  BookCharacterCardExportOptions,
  BookCharacterCardImportResult,
  BookCharacterCardInspection,
  BookCharacterCardWriteResult,
  CharacterCardData,
  CharacterCardV3,
  ParsedCharacterCard
} from './types.js'

const BOOK_EXPORT_TYPES = new Set(['canon', 'world_entry', 'character', 'character_relation', 'location'])

const BOOK_IMPORT_TYPES = new Set([
  'canon',
  'world_entry',
  'character',
  'character_relation',
  'location',
  'timeline_event',
  'character_state'
])

const EXPORTED_SETTING_FIELDS = new Set([
  'status',
  'tags',
  'enabled',
  'source_refs',
  'relations',
  'strength',
  'source',
  'code',
  'triggers',
  'category_tags',
  'role',
  'valid_from',
  'valid_until',
  'entry_status',
  'importance',
  'historical_reference',
  'story_setting',
  'used_in',
  'links',
  'aliases',
  'speech_style',
  'desire',
  'fear',
  'bottom_line',
  'motivation_anchors',
  'relationships',
  'arc',
  'ooc_guardrails',
  'active_flags',
  'disclosure',
  'born_at',
  'died_at',
  'introduced_at',
  'exited_at',
  'scene_state',
  'from_character',
  'to_character',
  'relation_type',
  'direction',
  'starts_at',
  'ends_at',
  'visibility',
  'kind',
  'scale',
  'parent_location',
  'layout_of',
  'relative_direction',
  'floor',
  'diagram_nodes',
  'diagram_edges',
  'description',
  'timeline_node',
  'date',
  'previous',
  'next',
  'duration',
  'location',
  'characters',
  'placements',
  'character',
  'scope_type',
  'scope_id',
  'motivation',
  'emotion',
  'knowledge',
  'relationship_delta',
  'public_disclosure',
  'notes'
])

export async function exportBookCharacterCardV3(
  projectRoot: string,
  options: BookCharacterCardExportOptions = {}
): Promise<CharacterCardV3> {
  const [project, documents] = await Promise.all([
    loadProject(projectRoot),
    listDocs<DocumentIdentity>(projectRoot)
  ])
  const selectedBackground = new Set(options.background_event_ids ?? [])
  const selectedStates = new Set(options.current_state_ids ?? [])
  const exported = documents
    .filter(
      (document) =>
        (BOOK_EXPORT_TYPES.has(document.data.type) && isExportableSetting(document.data)) ||
        (document.data.type === 'timeline_event' && selectedBackground.has(document.data.id)) ||
        (document.data.type === 'character_state' && selectedStates.has(document.data.id))
    )
    .sort(
      (left, right) =>
        Number((left.data as DocumentIdentity & { order?: number }).order ?? Number.MAX_SAFE_INTEGER) -
          Number((right.data as DocumentIdentity & { order?: number }).order ?? Number.MAX_SAFE_INTEGER) ||
        left.data.type.localeCompare(right.data.type, 'en') ||
        left.data.id.localeCompare(right.data.id, 'en')
    )
  const entries = exported.map((document, order) => {
    const fields = sanitizeExportValue(
      Object.fromEntries(Object.entries(document.data).filter(([key]) => EXPORTED_SETTING_FIELDS.has(key)))
    ) as Record<string, unknown>
    const hash = sha256(JSON.stringify({ data: document.data, content: document.content }))
    return {
      keys: worldBookKeys(document.data),
      secondary_keys: [],
      content: renderWorldBookContent(document.data, fields, sanitizeExportText(document.content)),
      enabled: true,
      insertion_order: order,
      case_sensitive: false,
      name: document.data.title,
      priority: 100,
      id: order + 1,
      comment: `${document.data.type}:${document.data.id}`,
      selective: false,
      constant: document.data.type === 'canon',
      position: 'before_char',
      use_regex: false,
      extensions: {
        quillarium: {
          schema_version: 1,
          stable_id: document.data.id,
          type: document.data.type,
          order,
          content_sha256: hash,
          fields
        }
      }
    }
  })
  const data: CharacterCardData = {
    name: project.title,
    description: sanitizeExportText(project.synopsis),
    personality: '',
    scenario: sanitizeExportText(project.synopsis),
    first_mes: '',
    mes_example: '',
    creator_notes: 'Novel setting exported by Quillarium. Story plans and prose are intentionally excluded.',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: [project.genre].filter(Boolean),
    creator: 'Quillarium',
    character_version: '1.0.0',
    extensions: {
      quillarium: {
        schema_version: 1,
        project_id: project.id,
        export_scope: 'novel-setting-only',
        entry_count: entries.length
      }
    },
    character_book: {
      name: `${project.title} setting`,
      description: 'Confirmed setting and explicitly selected background state.',
      scan_depth: 100,
      token_budget: 4096,
      recursive_scanning: false,
      extensions: { quillarium: { schema_version: 1 } },
      entries
    }
  }
  return { spec: 'chara_card_v3', spec_version: '3.0', data }
}

export async function writeBookCharacterCardV3Png(
  projectRoot: string,
  options: BookCharacterCardExportOptions = {}
): Promise<BookCharacterCardWriteResult> {
  const project = await loadProject(projectRoot)
  if (!project.cover) throw new Error('BOOK_COVER_REQUIRED_FOR_CCV3_EXPORT')
  const coverPath = containedProjectFile(projectRoot, project.cover.export_png_path)
  const cover = await readFile(coverPath)
  if (!hasPngSignature(cover)) throw new Error('BOOK_COVER_EXPORT_MUST_BE_PNG')
  const card = await exportBookCharacterCardV3(projectRoot, options)
  const raw = JSON.stringify(card)
  const output = embedCharacterCardJsonInPng(cover, raw, 'ccv3')
  const outputPath = containedProjectFile(
    projectRoot,
    `exports/${safeFileName(project.title || project.id)}.png`
  )
  await ensureDir(path.dirname(outputPath))
  await writeBinary(outputPath, output)
  const entries = (card.data.character_book?.['entries'] as unknown[]) ?? []
  return {
    format: 'v3-png',
    projectId: project.id,
    outputPath,
    entryCount: entries.length,
    cardSha256: sha256(raw)
  }
}

export async function inspectBookCharacterCard(sourcePath: string): Promise<BookCharacterCardInspection> {
  const bytes = await readFile(path.resolve(sourcePath))
  const parsed = parseBookCard(bytes)
  const entries = characterBookEntries(parsed.card.data.character_book)
  return {
    format: 'v3',
    sourcePath: path.resolve(sourcePath),
    name: parsed.card.data.name,
    description: [...new Set([parsed.card.data.description, parsed.card.data.scenario].filter(Boolean))].join(
      '\n\n'
    ),
    hasPngCover: hasPngSignature(bytes),
    worldBookEntryCount: entries.length
  }
}

export async function importBookCharacterCardIntoProject(
  projectRoot: string,
  sourcePath: string
): Promise<BookCharacterCardImportResult> {
  const absoluteSource = path.resolve(sourcePath)
  const bytes = await readFile(absoluteSource)
  const parsed = parseBookCard(bytes)
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex')
  const archiveDirectory = containedProjectFile(projectRoot, 'imports/archive')
  await ensureDir(archiveDirectory)
  const extension = hasPngSignature(bytes) ? '.png' : '.json'
  const archivePath = containedProjectFile(
    projectRoot,
    `imports/archive/${sourceSha256.slice(0, 16)}-${safeFileName(path.basename(sourcePath, path.extname(sourcePath)))}${extension}`
  )
  if (!(await pathExists(archivePath))) await writeBinary(archivePath, bytes)
  await writeText(
    `${archivePath}.source.json`,
    `${JSON.stringify(
      {
        schema_version: 1,
        source_name: path.basename(sourcePath),
        source_sha256: sourceSha256,
        imported_at: new Date().toISOString(),
        spec: parsed.card.spec,
        spec_version: parsed.card.spec_version
      },
      null,
      2
    )}\n`
  )
  const synopsis = [...new Set([parsed.card.data.description, parsed.card.data.scenario])]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n\n')
  const candidateDocumentIds: string[] = []
  for (const [index, entry] of characterBookEntries(parsed.card.data.character_book).entries()) {
    const imported = importedDocumentFromEntry(entry, index)
    if (!imported) continue
    const file = fileForDoc(projectRoot, imported.type as DocType, imported.id, imported.title)
    if (await pathExists(file)) throw new Error(`CCV3_IMPORT_STABLE_ID_CONFLICT: ${imported.id}`)
    await writeMarkdown(file, imported.data, imported.content)
    candidateDocumentIds.push(imported.id)
  }
  let coverPath: string | undefined
  if (hasPngSignature(bytes)) {
    const coverDirectory = containedProjectFile(projectRoot, 'assets/cover')
    await ensureDir(coverDirectory)
    const original = containedProjectFile(projectRoot, 'assets/cover/imported-card.png')
    const thumbnail = containedProjectFile(projectRoot, 'assets/cover/thumbnail.png')
    const exportPng = containedProjectFile(projectRoot, 'assets/cover/export.png')
    await Promise.all([
      writeBinary(original, bytes),
      writeBinary(thumbnail, bytes),
      writeBinary(exportPng, bytes)
    ])
    const dimensions = pngDimensions(bytes)
    coverPath = 'assets/cover/imported-card.png'
    await updateProjectConfig(projectRoot, {
      title: parsed.card.data.name,
      synopsis,
      cover: {
        original_path: coverPath,
        thumbnail_path: 'assets/cover/thumbnail.png',
        export_png_path: 'assets/cover/export.png',
        focus_x: 0.5,
        focus_y: 0.5,
        source_width: dimensions.width,
        source_height: dimensions.height
      }
    })
  } else {
    await updateProjectConfig(projectRoot, { title: parsed.card.data.name, synopsis })
  }
  return {
    format: 'v3',
    projectRoot: path.resolve(projectRoot),
    archivePath,
    sourceSha256,
    candidateDocumentIds,
    ...(coverPath ? { coverPath } : {})
  }
}

function parseBookCard(bytes: Uint8Array): ParsedCharacterCard & { card: CharacterCardV3 } {
  const parsed = hasPngSignature(bytes)
    ? parseCharacterCardPng(bytes)
    : parseCharacterCardJson(Buffer.from(bytes).toString('utf8'))
  if (parsed.format !== 'v3') throw new SillyTavernFormatError('Book import requires CCv3.')
  return parsed as ParsedCharacterCard & { card: CharacterCardV3 }
}

function importedDocumentFromEntry(
  entry: Record<string, unknown>,
  order: number
): { id: string; type: string; title: string; data: Record<string, unknown>; content: string } | null {
  const extension =
    isRecord(entry['extensions']) && isRecord(entry['extensions']['quillarium'])
      ? entry['extensions']['quillarium']
      : null
  const requestedType = String(extension?.['type'] ?? 'world_entry')
  const type = BOOK_IMPORT_TYPES.has(requestedType) ? requestedType : 'world_entry'
  const title = String(entry['name'] ?? entry['comment'] ?? `Imported setting ${order + 1}`).trim()
  const requestedId = String(extension?.['stable_id'] ?? '')
  const id = /^[a-z0-9][a-z0-9._-]*$/u.test(requestedId)
    ? requestedId
    : stableProjectId(`${type}-${title}-${order + 1}`)
  const rawFields = isRecord(extension?.['fields']) ? (extension!['fields'] as Record<string, unknown>) : {}
  const fields = {
    ...rawFields,
    id,
    type,
    schema_version: 1,
    title: title || id,
    status: type === 'canon' ? 'draft' : 'candidate',
    enabled: false,
    tags: [...new Set([...(Array.isArray(rawFields['tags']) ? rawFields['tags'] : []), 'ccv3-import'])]
  }
  const data = parseImportedDocument(type, fields)
  return {
    id,
    type,
    title: title || id,
    data: data as unknown as Record<string, unknown>,
    content: String(entry['content'] ?? '')
  }
}

function parseImportedDocument(type: string, fields: Record<string, unknown>) {
  if (type === 'canon') return canonSchema.parse({ ...fields, source: 'imported' })
  if (type === 'character') return characterSchema.parse(fields)
  if (type === 'character_relation') return characterRelationSchema.parse(fields)
  if (type === 'location') return locationSchema.parse(fields)
  if (type === 'timeline_event') return timelineEventSchema.parse(fields)
  if (type === 'character_state') return characterStateSchema.parse(fields)
  return worldEntrySchema.parse({ ...fields, entry_status: 'candidate' })
}

function worldBookKeys(data: DocumentIdentity): string[] {
  const record = data as DocumentIdentity & Record<string, unknown>
  const candidates = [
    data.title,
    data.id,
    ...(Array.isArray(record['aliases']) ? record['aliases'] : []),
    ...(Array.isArray(record['triggers']) ? record['triggers'] : []),
    ...(Array.isArray(record['tags']) ? record['tags'] : [])
  ]
  return [
    ...new Set(
      candidates.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    )
  ]
}

function renderWorldBookContent(
  data: DocumentIdentity,
  fields: Record<string, unknown>,
  content: string
): string {
  return [
    `# ${data.title}`,
    '',
    `Type: ${data.type}`,
    '',
    JSON.stringify(fields, null, 2),
    '',
    content.trim()
  ]
    .filter((value, index, values) => value || values[index - 1] !== '')
    .join('\n')
}

function characterBookEntries(value: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!value || !Array.isArray(value['entries'])) return []
  return value['entries'].filter(isRecord)
}

function containedProjectFile(projectRoot: string, relativePath: string): string {
  if (path.isAbsolute(relativePath) || relativePath.replace(/\\/gu, '/').split('/').includes('..')) {
    throw new SillyTavernFormatError(`Unsafe project-relative path: ${relativePath}`)
  }
  const root = path.resolve(projectRoot)
  const candidate = path.resolve(root, relativePath)
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new SillyTavernFormatError(`Path escapes project root: ${relativePath}`)
  }
  return candidate
}

function safeFileName(value: string): string {
  return (
    value
      .replace(/[<>:"/\\|?*]/gu, '-')
      .replace(/\p{Cc}/gu, '-')
      .replace(/[. ]+$/gu, '')
      .slice(0, 100) || 'book'
  )
}

function isExportableSetting(data: DocumentIdentity): boolean {
  const record = data as DocumentIdentity & Record<string, unknown>
  if (record['enabled'] === false) return false
  if (['candidate', 'draft', 'inactive'].includes(String(record['status'] ?? ''))) return false
  if (data.type === 'world_entry' && String(record['entry_status'] ?? '') !== 'active') return false
  return true
}

function sanitizeExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeExportValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key]) =>
            !/^(?:authorization|api[_-]?key|access[_-]?token|secret|credential|endpoint|base[_-]?url|path)$/iu.test(
              key
            )
        )
        .map(([key, child]) => [key, sanitizeExportValue(child)])
    )
  }
  return typeof value === 'string' ? sanitizeExportText(value) : value
}

function sanitizeExportText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/giu, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, '[REDACTED_CREDENTIAL]')
    .replace(
      /\b(api[_ -]?key|authorization|access[_ -]?token|credential)\s*[:=]\s*["']?[^\s"',;]+/giu,
      '$1: [REDACTED]'
    )
    .replace(/[A-Za-z]:\\(?:[^\\\s\r\n]+\\)*[^\\\s\r\n]*/gu, '[LOCAL_PATH_REDACTED]')
    .replace(/\/(?:Users|home|private|tmp|var|opt|mnt)\/[^\s"'<>]+/gu, '[LOCAL_PATH_REDACTED]')
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
