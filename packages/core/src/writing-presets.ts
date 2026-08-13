import path from 'node:path'
import { createHash } from 'node:crypto'
import { copyFile, readdir, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { z } from 'zod'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { DEFAULT_CONTEXT_POLICY } from './context-compiler.js'
import { projectIdSchema, projectConfigSchema } from './schema.js'
import { objectToYaml, parseMarkdown } from './yaml.js'
import type {
  LoadedWritingPreset,
  PromptBlockKind,
  ResolvedWritingPresetModel,
  WritingPresetListItem,
  WritingPresetSnapshot,
  WritingPresetV2
} from './types.js'

export const DEFAULT_WRITING_SYSTEM_PROMPT =
  'You are Quillarium, a continuity-aware fiction writing assistant.'

export const DEFAULT_WRITING_USER_INSTRUCTIONS = Object.freeze([
  'You are assisting with a long-form novel project.',
  'Write only the requested prose section unless the context explicitly asks for notes.',
  'Respect canon, time, location, character state, and style guardrails.',
  'If a fact is uncertain, avoid inventing hard canon.'
])

export const PROMPT_BLOCK_KINDS = [
  'packet_header',
  'target',
  'project',
  'accepted_prose',
  'canon',
  'outline',
  'project_guidance',
  'timeline',
  'character',
  'location',
  'world',
  'foreshadowing',
  'issue',
  'shared_guidance',
  'warning',
  'generation_target'
] as const satisfies readonly PromptBlockKind[]

export const DEFAULT_PROMPT_BLOCK_ORDER = Object.freeze([...PROMPT_BLOCK_KINDS])

const providerSchema = z.enum(['openai-compatible', 'openai', 'claude', 'gemini', 'deepseek', 'ollama'])

const profileSchema = z.enum(['prose', 'background', 'check'])
const tokenizerSchema = z.enum(['deepseek-v4', 'o200k', 'cl100k'])
const promptBlockKindSchema = z.enum(PROMPT_BLOCK_KINDS)
const semanticVersionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, 'Preset version must be a semantic version')

const contextPolicyObjectSchema = z.object({
  schema_version: z.literal(1).default(1),
  id: projectIdSchema,
  token_budget: z.number().int().positive(),
  max_block_tokens: z.number().int().positive(),
  min_truncated_block_tokens: z.number().int().positive(),
  max_candidates: z.number().int().positive(),
  max_recursion_depth: z.number().int().nonnegative()
})

const contextPolicySchema = contextPolicyObjectSchema
  .strict()
  .refine((value) => value.min_truncated_block_tokens <= value.max_block_tokens, {
    message: 'min_truncated_block_tokens cannot exceed max_block_tokens',
    path: ['min_truncated_block_tokens']
  })

const writingPresetModelSchema = z
  .object({
    profile: profileSchema.default('prose'),
    provider: providerSchema.optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_output_tokens: z.number().int().positive().optional(),
    tokenizer_id: tokenizerSchema.optional()
  })
  .strict()

const writingPresetPromptStackSchema = z
  .object({
    system_prompt: z.string().min(1),
    user_instructions: z.array(z.string().min(1)).min(1),
    block_order: z
      .array(promptBlockKindSchema)
      .min(1)
      .refine((items) => new Set(items).size === items.length, 'Prompt block order cannot contain duplicates')
      .refine(
        (items) =>
          items.length === PROMPT_BLOCK_KINDS.length &&
          PROMPT_BLOCK_KINDS.every((kind) => items.includes(kind)),
        'Prompt block order must contain every supported block kind exactly once'
      )
  })
  .strict()

const writingPresetCheckPolicySchema = z
  .object({
    deterministic: z.literal(true),
    semantic: z.enum(['off', 'on-demand', 'required']),
    profile: z.literal('check')
  })
  .strict()

export const writingPresetV2Schema = z
  .object({
    schema_version: z.literal(2),
    id: projectIdSchema,
    version: semanticVersionSchema,
    title: z.string().min(1),
    description: z.string().default(''),
    model: writingPresetModelSchema,
    prompt_stack: writingPresetPromptStackSchema,
    context_policy: contextPolicySchema,
    check_policy: writingPresetCheckPolicySchema
  })
  .strict()

export const writingPresetV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    version: z.union([z.number().int().positive(), semanticVersionSchema]).default(1),
    title: z.string().min(1),
    description: z.string().default(''),
    profile: profileSchema.default('prose'),
    provider: providerSchema.optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().positive().optional(),
    tokenizer_id: tokenizerSchema.optional(),
    system_prompt: z.string().min(1).default(DEFAULT_WRITING_SYSTEM_PROMPT),
    user_instructions: z
      .array(z.string().min(1))
      .min(1)
      .default([...DEFAULT_WRITING_USER_INSTRUCTIONS]),
    prompt_block_order: z
      .array(promptBlockKindSchema)
      .min(1)
      .default([...DEFAULT_PROMPT_BLOCK_ORDER]),
    context_policy: contextPolicyObjectSchema.partial().strict().default({}),
    semantic_checks: z.boolean().default(false)
  })
  .strict()

const resolvedWritingPresetModelSchema = z
  .object({
    profile: profileSchema,
    provider: providerSchema,
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    max_output_tokens: z.number().int().positive(),
    tokenizer_id: tokenizerSchema.optional()
  })
  .strict()

const writingPresetSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    preset_id: projectIdSchema,
    preset_version: semanticVersionSchema,
    title: z.string().min(1),
    description: z.string(),
    source: z
      .object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        schema_version: z.union([z.literal(1), z.literal(2)])
      })
      .strict(),
    model: resolvedWritingPresetModelSchema,
    prompt_stack: writingPresetPromptStackSchema,
    context_policy: contextPolicySchema,
    check_policy: writingPresetCheckPolicySchema,
    snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/u)
  })
  .strict()

export interface WritingPresetMigrationPlan {
  id: string
  path: string
  from_version: 1 | 2
  to_version: 2
  changed: boolean
  source_sha256: string
  preset: WritingPresetV2
}

export class WritingPresetNotFoundError extends Error {
  constructor(id: string) {
    super(`Writing preset not found: ${id}. Create or select an existing preset before generation.`)
    this.name = 'WritingPresetNotFoundError'
  }
}

export class WritingPresetSelectionError extends Error {
  constructor() {
    super('No writing preset is selected. Select a project writing preset before generation.')
    this.name = 'WritingPresetSelectionError'
  }
}

export function defaultWritingPreset(id = 'default', title = 'Default Writing Preset'): WritingPresetV2 {
  return writingPresetV2Schema.parse({
    schema_version: 2,
    id,
    version: '1.0.0',
    title,
    description: 'Deterministic structured-fiction generation defaults.',
    model: { profile: 'prose' },
    prompt_stack: {
      system_prompt: DEFAULT_WRITING_SYSTEM_PROMPT,
      user_instructions: [...DEFAULT_WRITING_USER_INSTRUCTIONS],
      block_order: [...DEFAULT_PROMPT_BLOCK_ORDER]
    },
    context_policy: { ...DEFAULT_CONTEXT_POLICY },
    check_policy: { deterministic: true, semantic: 'on-demand', profile: 'check' }
  }) as WritingPresetV2
}

export function migrateWritingPresetV1(value: unknown): WritingPresetV2 {
  const legacy = writingPresetV1Schema.parse(value)
  const version = typeof legacy.version === 'number' ? `${legacy.version}.0.0` : legacy.version
  const legacyOrder = [...new Set(legacy.prompt_block_order)]
  const blockOrder = [...legacyOrder, ...PROMPT_BLOCK_KINDS.filter((kind) => !legacyOrder.includes(kind))]
  return writingPresetV2Schema.parse({
    schema_version: 2,
    id: legacy.id,
    version,
    title: legacy.title,
    description: legacy.description,
    model: {
      profile: legacy.profile,
      ...(legacy.provider ? { provider: legacy.provider } : {}),
      ...(legacy.model ? { model: legacy.model } : {}),
      ...(legacy.temperature !== undefined ? { temperature: legacy.temperature } : {}),
      ...(legacy.max_tokens !== undefined ? { max_output_tokens: legacy.max_tokens } : {}),
      ...(legacy.tokenizer_id ? { tokenizer_id: legacy.tokenizer_id } : {})
    },
    prompt_stack: {
      system_prompt: legacy.system_prompt,
      user_instructions: legacy.user_instructions,
      block_order: blockOrder
    },
    context_policy: { ...DEFAULT_CONTEXT_POLICY, ...legacy.context_policy, schema_version: 1 },
    check_policy: {
      deterministic: true,
      semantic: legacy.semantic_checks ? 'on-demand' : 'off',
      profile: 'check'
    }
  }) as WritingPresetV2
}

export async function createWritingPreset(
  projectRoot: string,
  preset: WritingPresetV2
): Promise<LoadedWritingPreset> {
  const parsed = writingPresetV2Schema.parse(preset) as WritingPresetV2
  const filePath = presetPath(projectRoot, parsed.id)
  await ensureDir(path.dirname(filePath))
  await assertContainedPresetDirectory(projectRoot)
  if (await pathExists(filePath)) throw new Error(`Writing preset already exists: ${parsed.id}`)
  await writeText(filePath, `${objectToYaml(parsed as unknown as Record<string, unknown>)}\n`)
  return loadWritingPreset(projectRoot, parsed.id)
}

export async function ensureDefaultWritingPreset(
  projectRoot: string,
  id = 'default',
  title = 'Default Writing Preset'
): Promise<LoadedWritingPreset> {
  if (await pathExists(presetPath(projectRoot, id))) return loadWritingPreset(projectRoot, id)
  return createWritingPreset(projectRoot, defaultWritingPreset(id, title))
}

export async function initializeDefaultWritingPreset(projectRoot: string): Promise<LoadedWritingPreset> {
  const loaded = await ensureDefaultWritingPreset(projectRoot)
  return selectWritingPreset(projectRoot, loaded.preset.id)
}

export async function loadWritingPreset(projectRoot: string, id: string): Promise<LoadedWritingPreset> {
  const safeId = projectIdSchema.parse(id)
  const filePath = presetPath(projectRoot, safeId)
  if (!(await pathExists(filePath))) throw new WritingPresetNotFoundError(safeId)
  await assertContainedPresetPath(projectRoot, filePath)
  const raw = await readText(filePath)
  const parsed = parsePresetYaml(raw)
  const schemaVersion = parsed['schema_version']
  const preset =
    schemaVersion === 1
      ? migrateWritingPresetV1(parsed)
      : schemaVersion === 2
        ? (writingPresetV2Schema.parse(parsed) as WritingPresetV2)
        : (() => {
            throw new Error(
              `Unsupported writing preset schema_version ${String(schemaVersion)} for ${safeId}.`
            )
          })()
  if (preset.id !== safeId) {
    throw new Error(`Writing preset file ${safeId}.yaml declares a different id: ${preset.id}`)
  }
  return {
    preset,
    source_path: relativePresetPath(projectRoot, filePath),
    source_sha256: sha256(raw),
    source_schema_version: schemaVersion as 1 | 2
  }
}

export async function listWritingPresets(projectRoot: string): Promise<WritingPresetListItem[]> {
  const directory = path.join(projectRoot, 'presets')
  if (!(await pathExists(directory))) return []
  const selectedId = await selectedWritingPresetId(projectRoot)
  const entries = await readdir(directory, { withFileTypes: true })
  const presets: WritingPresetListItem[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
    const id = entry.name.slice(0, -'.yaml'.length)
    const loaded = await loadWritingPreset(projectRoot, id)
    presets.push({
      id: loaded.preset.id,
      version: loaded.preset.version,
      title: loaded.preset.title,
      description: loaded.preset.description,
      selected: loaded.preset.id === selectedId,
      source_path: loaded.source_path,
      source_schema_version: loaded.source_schema_version
    })
  }
  return presets
}

export async function loadSelectedWritingPreset(
  projectRoot: string,
  explicitId?: string
): Promise<LoadedWritingPreset> {
  const id = explicitId ?? (await selectedWritingPresetId(projectRoot))
  if (!id) throw new WritingPresetSelectionError()
  return loadWritingPreset(projectRoot, id)
}

export async function selectWritingPreset(projectRoot: string, id: string): Promise<LoadedWritingPreset> {
  const loaded = await loadWritingPreset(projectRoot, id)
  const projectPath = path.join(projectRoot, 'project.yaml')
  const raw = await readText(projectPath)
  const data = parsePresetYaml(raw)
  projectConfigSchema.parse({ ...data, writing_preset: loaded.preset.id })
  await writeText(
    projectPath,
    `${objectToYaml({ ...data, writing_preset: loaded.preset.id } as Record<string, unknown>)}\n`
  )
  const selected = await selectedWritingPresetId(projectRoot)
  if (selected !== loaded.preset.id) throw new Error(`Failed to select writing preset: ${loaded.preset.id}`)
  return loaded
}

export async function planWritingPresetMigration(
  projectRoot: string,
  id: string
): Promise<WritingPresetMigrationPlan> {
  const loaded = await loadWritingPreset(projectRoot, id)
  return {
    id: loaded.preset.id,
    path: path.join(projectRoot, loaded.source_path),
    from_version: loaded.source_schema_version,
    to_version: 2,
    changed: loaded.source_schema_version !== 2,
    source_sha256: loaded.source_sha256,
    preset: loaded.preset
  }
}

export async function applyWritingPresetMigration(
  projectRoot: string,
  plan: WritingPresetMigrationPlan
): Promise<{ preset: LoadedWritingPreset; backup_path: string | null }> {
  const current = await planWritingPresetMigration(projectRoot, plan.id)
  if (current.source_sha256 !== plan.source_sha256) {
    throw new Error(`Writing preset changed after migration planning: ${plan.id}`)
  }
  if (!current.changed) return { preset: await loadWritingPreset(projectRoot, plan.id), backup_path: null }
  const backupDirectory = path.join(projectRoot, 'imports', 'backups', 'writing-presets')
  const backupPath = path.join(
    backupDirectory,
    `${plan.id}.schema-v${plan.from_version}.${plan.source_sha256.slice(0, 12)}.yaml`
  )
  await ensureDir(backupDirectory)
  await assertContainedDirectory(projectRoot, backupDirectory, 'Writing preset backup directory')
  await copyFile(current.path, backupPath, constants.COPYFILE_EXCL)
  await writeText(current.path, `${objectToYaml(current.preset as unknown as Record<string, unknown>)}\n`)
  const verified = await loadWritingPreset(projectRoot, plan.id)
  if (verified.source_schema_version !== 2 || verified.preset.version !== plan.preset.version) {
    throw new Error(`Writing preset migration verification failed: ${plan.id}`)
  }
  return { preset: verified, backup_path: relativePresetPath(projectRoot, backupPath) }
}

export function createWritingPresetSnapshot(
  loaded: LoadedWritingPreset,
  model: ResolvedWritingPresetModel
): WritingPresetSnapshot {
  const resolvedModel = resolvedWritingPresetModelSchema.parse(model) as ResolvedWritingPresetModel
  const withoutHash = {
    schema_version: 1 as const,
    preset_id: loaded.preset.id,
    preset_version: loaded.preset.version,
    title: loaded.preset.title,
    description: loaded.preset.description,
    source: {
      path: loaded.source_path,
      sha256: loaded.source_sha256,
      schema_version: loaded.source_schema_version
    },
    model: resolvedModel,
    prompt_stack: loaded.preset.prompt_stack,
    context_policy: loaded.preset.context_policy,
    check_policy: loaded.preset.check_policy
  }
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: sha256(canonicalJson(withoutHash))
  }
  return assertWritingPresetSnapshot(snapshot)
}

export function assertWritingPresetSnapshot(value: unknown): WritingPresetSnapshot {
  const snapshot = writingPresetSnapshotSchema.parse(value) as WritingPresetSnapshot
  if (isUnsafePortablePath(snapshot.source.path)) {
    throw new Error(`Writing preset snapshot source path must be project-relative: ${snapshot.source.path}`)
  }
  assertNoSensitiveOrMachineLocalValues(snapshot)
  const { snapshot_sha256: claimed, ...withoutHash } = snapshot
  const actual = sha256(canonicalJson(withoutHash))
  if (claimed !== actual) throw new Error('Writing preset snapshot hash does not match its content.')
  return snapshot
}

export function writingPresetSnapshotHash(snapshot: WritingPresetSnapshot): string {
  return assertWritingPresetSnapshot(snapshot).snapshot_sha256
}

async function selectedWritingPresetId(projectRoot: string): Promise<string | null> {
  const raw = await readText(path.join(projectRoot, 'project.yaml'))
  const config = projectConfigSchema.parse(parsePresetYaml(raw))
  return config.writing_preset
}

function presetPath(projectRoot: string, id: string): string {
  return path.join(projectRoot, 'presets', `${projectIdSchema.parse(id)}.yaml`)
}

async function assertContainedPresetPath(projectRoot: string, filePath: string): Promise<void> {
  const presetsReal = await assertContainedPresetDirectory(projectRoot)
  const fileReal = await realpath(filePath)
  const relative = path.relative(presetsReal, fileReal)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    path.dirname(relative) !== '.'
  ) {
    throw new Error(`Writing preset resolves outside the project preset directory: ${filePath}`)
  }
}

async function assertContainedPresetDirectory(projectRoot: string): Promise<string> {
  const presetsReal = await assertContainedDirectory(
    projectRoot,
    path.join(projectRoot, 'presets'),
    'Writing preset directory'
  )
  const projectReal = await realpath(projectRoot)
  const relative = path.relative(projectReal, presetsReal)
  if (relative !== 'presets' || path.isAbsolute(relative)) {
    throw new Error(`Writing preset directory resolves outside the project root: ${presetsReal}`)
  }
  return presetsReal
}

async function assertContainedDirectory(
  projectRoot: string,
  directory: string,
  label: string
): Promise<string> {
  const [projectReal, directoryReal] = await Promise.all([realpath(projectRoot), realpath(directory)])
  const relative = path.relative(projectReal, directoryReal)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the project root: ${directoryReal}`)
  }
  return directoryReal
}

function relativePresetPath(projectRoot: string, filePath: string): string {
  const relative = path.relative(projectRoot, filePath)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Writing preset path is outside the project root: ${filePath}`)
  }
  return relative.replace(/\\/gu, '/')
}

function parsePresetYaml(raw: string): Record<string, unknown> {
  return parseMarkdown<Record<string, unknown>>(`---\n${raw.trimEnd()}\n---\n`).data
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isUnsafePortablePath(value: string): boolean {
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) return true
  return value.replace(/\\/gu, '/').split('/').includes('..')
}

function assertNoSensitiveOrMachineLocalValues(value: unknown, key = ''): void {
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoSensitiveOrMachineLocalValues(item, key))
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (/(?:api.?key|access.?token|secret|password|base.?url)/iu.test(childKey)) {
        throw new Error(
          `Writing preset snapshots cannot contain credentials or connection secrets: ${childKey}`
        )
      }
      assertNoSensitiveOrMachineLocalValues(childValue, childKey)
    }
    return
  }
  if (typeof value !== 'string') return
  if (path.win32.isAbsolute(value) || path.isAbsolute(value)) {
    throw new Error(`Writing preset snapshots cannot contain machine-local absolute paths: ${value}`)
  }
}
