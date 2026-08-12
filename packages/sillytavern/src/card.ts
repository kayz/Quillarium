import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import {
  createCharacter,
  loadProject,
  pathExists,
  readMarkdown,
  requireDoc,
  slugify,
  writeText,
  type CharacterDoc
} from '@quillarium/core'
import { z } from 'zod'
import { SillyTavernFormatError } from './errors.js'
import { extractCharacterCardJsonFromPng, hasPngSignature } from './png.js'
import type {
  CharacterCardData,
  CharacterCardFormat,
  CharacterCardImportOptions,
  CharacterCardImportResult,
  CharacterCardV2,
  ParsedCharacterCard,
  SupportedCharacterCard
} from './types.js'

const MAX_CARD_JSON_BYTES = 16 * 1024 * 1024

const cardDataSchema = z
  .object({
    name: z.string().refine((value) => value.trim().length > 0, 'must not be blank'),
    description: z.string(),
    personality: z.string(),
    scenario: z.string(),
    first_mes: z.string(),
    mes_example: z.string(),
    creator_notes: z.string().default(''),
    system_prompt: z.string().default(''),
    post_history_instructions: z.string().default(''),
    alternate_greetings: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    creator: z.string().default(''),
    character_version: z.string().default(''),
    extensions: z.record(z.unknown()).default({}),
    character_book: z.record(z.unknown()).optional()
  })
  .passthrough()

const cardEnvelopeSchema = z
  .object({
    spec: z.string(),
    spec_version: z.string(),
    data: cardDataSchema
  })
  .passthrough()

const exportMetadataSchema = z.object({
  alternate_greetings: z.array(z.string()).default([]),
  creator: z.string().default(''),
  character_version: z.string().default(''),
  extensions: z.record(z.unknown()).default({}),
  character_book: z.record(z.unknown()).optional()
})

const quillariumCharacterExtensionSchema = z.object({
  schema_version: z.literal(1),
  source_id: z.string(),
  aliases: z.array(z.string()).default([]),
  role: z.string().default('supporting'),
  speech_style: z.string().default(''),
  desire: z.string().default(''),
  fear: z.string().default(''),
  bottom_line: z.string().default(''),
  motivation_anchors: z.array(z.string()).default([]),
  relationships: z.record(z.string()).default({}),
  arc: z
    .record(
      z.object({
        start: z.string().optional(),
        end: z.string().optional(),
        notes: z.string().optional()
      })
    )
    .default({}),
  ooc_guardrails: z.array(z.string()).default([]),
  active_flags: z.array(z.string()).default([]),
  disclosure: z.array(z.object({ segment: z.string(), reveal_after: z.string().optional() })).default([]),
  scene_state: z
    .object({
      current_location: z.string().optional(),
      outfit_layers: z.array(z.string()).optional(),
      wounds: z.array(z.string()).optional(),
      carried_items: z.array(z.string()).optional(),
      known_facts: z.array(z.string()).optional(),
      emotional_state: z.string().optional()
    })
    .default({})
})

const EMBEDDED_FIELDS = [
  ['description', 'Description'],
  ['personality', 'Personality'],
  ['scenario', 'Scenario'],
  ['first_mes', 'First Message'],
  ['mes_example', 'Message Examples'],
  ['creator_notes', 'Creator Notes'],
  ['system_prompt', 'System Prompt'],
  ['post_history_instructions', 'Post-History Instructions']
] as const

export function parseCharacterCardJson(rawJson: string): ParsedCharacterCard {
  const size = Buffer.byteLength(rawJson, 'utf8')
  if (size > MAX_CARD_JSON_BYTES) {
    throw new SillyTavernFormatError(
      `Character Card JSON is too large (${size} bytes; maximum ${MAX_CARD_JSON_BYTES}).`
    )
  }

  let value: unknown
  try {
    value = JSON.parse(rawJson.charCodeAt(0) === 0xfeff ? rawJson.slice(1) : rawJson)
  } catch (cause) {
    throw new SillyTavernFormatError(`Invalid Character Card JSON: ${errorMessage(cause)}`, { cause })
  }

  const parsed = cardEnvelopeSchema.safeParse(value)
  if (!parsed.success) {
    throw new SillyTavernFormatError(
      `Invalid Character Card: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'card'}: ${issue.message}`)
        .join('; ')}`
    )
  }

  let format: CharacterCardFormat
  if (parsed.data.spec === 'chara_card_v2' && parsed.data.spec_version === '2.0') {
    format = 'v2'
  } else if (parsed.data.spec === 'chara_card_v3' && parsed.data.spec_version === '3.0') {
    format = 'v3'
  } else {
    throw new SillyTavernFormatError(
      `Unsupported Character Card spec/version: ${parsed.data.spec}/${parsed.data.spec_version}; expected chara_card_v2/2.0 or chara_card_v3/3.0.`
    )
  }

  return {
    format,
    card: parsed.data as SupportedCharacterCard,
    rawJson
  }
}

export function parseCharacterCardPng(bytes: Uint8Array): ParsedCharacterCard {
  const extracted = extractCharacterCardJsonFromPng(bytes)
  const parsed = parseCharacterCardJson(extracted.rawJson)
  if (extracted.keyword === 'ccv3' && parsed.format !== 'v3') {
    throw new SillyTavernFormatError(
      `PNG ccv3 payload must contain chara_card_v3/3.0, received ${parsed.card.spec}/${parsed.card.spec_version}.`
    )
  }
  return { ...parsed, pngKeyword: extracted.keyword }
}

export async function importCharacterCard(
  projectRoot: string,
  inputPath: string
): Promise<CharacterCardImportResult> {
  let bytes: Buffer
  try {
    bytes = await readFile(path.resolve(inputPath))
  } catch (cause) {
    throw new SillyTavernFormatError(
      `Could not read Character Card file ${inputPath}: ${errorMessage(cause)}`,
      {
        cause
      }
    )
  }

  const looksLikePng = hasPngSignature(bytes) || path.extname(inputPath).toLowerCase() === '.png'
  if (looksLikePng) {
    return persistCharacterCard(projectRoot, parseCharacterCardPng(bytes), 'png', {
      sourceName: path.basename(inputPath)
    })
  }
  return persistCharacterCard(
    projectRoot,
    parseCharacterCardJson(decodeUtf8(bytes, `Character Card file ${inputPath}`)),
    'json',
    { sourceName: path.basename(inputPath) }
  )
}

export async function importCharacterCardJson(
  projectRoot: string,
  rawJson: string,
  options: CharacterCardImportOptions = {}
): Promise<CharacterCardImportResult> {
  return persistCharacterCard(projectRoot, parseCharacterCardJson(rawJson), 'json', options)
}

export async function importCharacterCardPng(
  projectRoot: string,
  bytes: Uint8Array,
  options: CharacterCardImportOptions = {}
): Promise<CharacterCardImportResult> {
  return persistCharacterCard(projectRoot, parseCharacterCardPng(bytes), 'png', options)
}

export async function exportCharacterCardV2(
  projectRoot: string,
  characterId: string
): Promise<CharacterCardV2> {
  const character = await requireDoc<CharacterDoc>(projectRoot, characterId)
  const metadata = readEmbeddedMetadata(character.content)
  const data: CharacterCardData = {
    name: character.data.title,
    description: readEmbeddedField(character.content, 'description') ?? character.content.trim(),
    personality: readEmbeddedField(character.content, 'personality') ?? character.data.speech_style ?? '',
    scenario: readEmbeddedField(character.content, 'scenario') ?? '',
    first_mes: readEmbeddedField(character.content, 'first_mes') ?? '',
    mes_example: readEmbeddedField(character.content, 'mes_example') ?? '',
    creator_notes: readEmbeddedField(character.content, 'creator_notes') ?? '',
    system_prompt: readEmbeddedField(character.content, 'system_prompt') ?? '',
    post_history_instructions: readEmbeddedField(character.content, 'post_history_instructions') ?? '',
    alternate_greetings: metadata?.alternate_greetings ?? [],
    tags: character.data.tags,
    creator: metadata?.creator ?? 'Quillarium',
    character_version: metadata?.character_version ?? '1.0',
    extensions: {
      ...(metadata?.extensions ?? {}),
      quillarium: buildQuillariumCharacterExtension(character.data)
    }
  }
  if (metadata?.character_book) data.character_book = metadata.character_book

  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data
  }
}

export async function exportCharacterCardV2Json(projectRoot: string, characterId: string): Promise<string> {
  return JSON.stringify(await exportCharacterCardV2(projectRoot, characterId), null, 2)
}

async function persistCharacterCard(
  projectRoot: string,
  parsed: ParsedCharacterCard,
  source: 'json' | 'png',
  options: CharacterCardImportOptions
): Promise<CharacterCardImportResult> {
  const root = path.resolve(projectRoot)
  await loadProject(root)
  const data = parsed.card.data
  const quillarium = readQuillariumCharacterExtension(data.extensions)
  const characterPath = await createCharacter(
    root,
    data.name,
    {
      aliases: quillarium?.aliases ?? [],
      role: quillarium?.role ?? 'supporting',
      tags: data.tags,
      speech_style: quillarium?.speech_style ?? data.personality,
      desire: quillarium?.desire ?? '',
      fear: quillarium?.fear ?? '',
      bottom_line: quillarium?.bottom_line ?? '',
      motivation_anchors: quillarium?.motivation_anchors ?? [],
      relationships: quillarium?.relationships ?? {},
      arc: quillarium?.arc ?? {},
      ooc_guardrails: quillarium?.ooc_guardrails ?? [],
      active_flags: [...new Set([...(quillarium?.active_flags ?? []), 'sillytavern-import'])],
      disclosure: quillarium?.disclosure ?? [],
      scene_state: quillarium?.scene_state ?? {}
    },
    renderCharacterMarkdown(data)
  )
  const character = await readMarkdown<Record<string, unknown>>(characterPath)
  if (typeof character.data.id !== 'string') {
    throw new SillyTavernFormatError(`Imported character is missing an id: ${characterPath}`)
  }
  const rawPath = await nextRawPath(root, options.sourceName ?? data.name, parsed.format)
  await writeText(rawPath, parsed.rawJson)

  return {
    format: parsed.format,
    source,
    ...(parsed.pngKeyword ? { pngKeyword: parsed.pngKeyword } : {}),
    characterId: character.data.id,
    characterPath,
    rawPath
  }
}

function buildQuillariumCharacterExtension(
  character: CharacterDoc
): z.infer<typeof quillariumCharacterExtensionSchema> {
  return {
    schema_version: 1,
    source_id: character.id,
    aliases: character.aliases,
    role: character.role,
    speech_style: character.speech_style,
    desire: character.desire,
    fear: character.fear,
    bottom_line: character.bottom_line,
    motivation_anchors: character.motivation_anchors,
    relationships: character.relationships,
    arc: character.arc,
    ooc_guardrails: character.ooc_guardrails,
    active_flags: character.active_flags,
    disclosure: character.disclosure,
    scene_state: character.scene_state
  }
}

function readQuillariumCharacterExtension(
  extensions: Record<string, unknown>
): z.infer<typeof quillariumCharacterExtensionSchema> | undefined {
  const result = quillariumCharacterExtensionSchema.safeParse(extensions.quillarium)
  return result.success ? result.data : undefined
}

function renderCharacterMarkdown(data: CharacterCardData): string {
  const values: Record<(typeof EMBEDDED_FIELDS)[number][0], string> = {
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    first_mes: data.first_mes,
    mes_example: data.mes_example,
    creator_notes: data.creator_notes,
    system_prompt: data.system_prompt,
    post_history_instructions: data.post_history_instructions
  }
  const fields = EMBEDDED_FIELDS.map(([key, heading]) => renderEmbeddedField(key, heading, values[key]))
  const metadata = {
    alternate_greetings: data.alternate_greetings,
    creator: data.creator,
    character_version: data.character_version,
    extensions: data.extensions,
    ...(data.character_book ? { character_book: data.character_book } : {})
  }
  return [
    ...fields,
    [
      '## SillyTavern Metadata',
      '<!-- quillarium:sillytavern:metadata:start -->',
      JSON.stringify(metadata, null, 2),
      '<!-- quillarium:sillytavern:metadata:end -->'
    ].join('\n')
  ].join('\n\n')
}

function renderEmbeddedField(key: string, heading: string, value: string): string {
  return [
    `## ${heading}`,
    `<!-- quillarium:sillytavern:${key}:start -->`,
    value,
    `<!-- quillarium:sillytavern:${key}:end -->`
  ].join('\n')
}

function readEmbeddedField(content: string, key: string): string | undefined {
  return readMarkerBody(
    content,
    `<!-- quillarium:sillytavern:${key}:start -->`,
    `<!-- quillarium:sillytavern:${key}:end -->`
  )
}

function readEmbeddedMetadata(content: string): z.infer<typeof exportMetadataSchema> | undefined {
  const raw = readMarkerBody(
    content,
    '<!-- quillarium:sillytavern:metadata:start -->',
    '<!-- quillarium:sillytavern:metadata:end -->'
  )
  if (raw === undefined) return undefined
  try {
    const result = exportMetadataSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function readMarkerBody(content: string, startMarker: string, endMarker: string): string | undefined {
  const start = content.indexOf(startMarker)
  if (start === -1) return undefined
  const valueStart = start + startMarker.length
  const end = content.indexOf(endMarker, valueStart)
  if (end === -1) return undefined
  return content
    .slice(valueStart, end)
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '')
}

async function nextRawPath(
  projectRoot: string,
  sourceName: string,
  format: CharacterCardFormat
): Promise<string> {
  const safeSource = [...sourceName]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 31 && code !== 127
    })
    .join('')
  const basename = path.basename(safeSource, path.extname(safeSource))
  const stem = slugify(basename || 'character-card')
  for (let sequence = 1; sequence <= 10_000; sequence += 1) {
    const suffix = sequence === 1 ? '' : `-${sequence}`
    const candidate = safeProjectPath(projectRoot, 'sillytavern', `${stem}-${format}-raw${suffix}.json`)
    if (!(await pathExists(candidate))) return candidate
  }
  throw new SillyTavernFormatError(`Could not allocate a raw Character Card path for ${sourceName}.`)
}

function safeProjectPath(projectRoot: string, ...segments: string[]): string {
  const root = path.resolve(projectRoot)
  const candidate = path.resolve(root, ...segments)
  const relative = path.relative(root, candidate)
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new SillyTavernFormatError(`Unsafe output path outside project root: ${candidate}`)
  }
  return candidate
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (cause) {
    throw new SillyTavernFormatError(`${label} is not valid UTF-8.`, { cause })
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
