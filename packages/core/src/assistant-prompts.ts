import path from 'node:path'
import { readdir, rm } from 'node:fs/promises'
import { z } from 'zod'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { assertProjectPath } from './provenance.js'
import { projectIdSchema } from './schema.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { canonicalJson, sha256Text } from './versioned-yaml-store.js'

export const CREATOR_ASSISTANT_IDS = [
  'setting-organizer',
  'character-rehearsal',
  'continuity-review'
] as const

export const creatorAssistantIdSchema = z.enum(CREATOR_ASSISTANT_IDS)

export const assistantPromptVersionV1Schema = z
  .object({
    schema_version: z.literal(1),
    id: projectIdSchema,
    assistant_id: creatorAssistantIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u),
    name: z.string().min(1),
    instructions: z.string().min(1),
    created_at: z.string().datetime(),
    source: z.enum(['builtin', 'author']).default('author')
  })
  .strict()

export type CreatorAssistantId = z.infer<typeof creatorAssistantIdSchema>
export type AssistantPromptVersionV1 = z.infer<typeof assistantPromptVersionV1Schema>

export interface LoadedAssistantPromptVersion {
  value: AssistantPromptVersionV1
  source_path: string
  source_sha256: string
}

export interface SaveAssistantPromptVersionInput {
  assistant_id: CreatorAssistantId
  base_version?: string
  version?: string
  name?: string
  instructions: string
}

export function creatorAssistantIdForTask(taskId: string): CreatorAssistantId {
  if (taskId === 'organize-setting') return 'setting-organizer'
  if (taskId === 'character-rehearsal') return 'character-rehearsal'
  if (taskId === 'continuity-review') return 'continuity-review'
  throw new Error(`UNKNOWN_CREATOR_ASSISTANT_TASK: ${taskId}`)
}

const MAX_CONFIG_VERSIONS = 5

export async function ensureBuiltinAssistantPrompts(
  projectRoot: string
): Promise<LoadedAssistantPromptVersion[]> {
  return withProjectWriteLock(projectRoot, async () => {
    for (const assistantId of CREATOR_ASSISTANT_IDS) {
      const existing = await listAssistantPromptVersionsUnlocked(projectRoot, assistantId)
      if (existing.length) continue
      await writeAssistantPrompt(projectRoot, builtinAssistantPrompt(assistantId))
    }
    return (
      await Promise.all(
        CREATOR_ASSISTANT_IDS.map((assistantId) =>
          listAssistantPromptVersionsUnlocked(projectRoot, assistantId)
        )
      )
    ).flat()
  })
}

export async function listAssistantPromptVersions(
  projectRoot: string,
  assistantId: CreatorAssistantId
): Promise<LoadedAssistantPromptVersion[]> {
  return (await listAssistantPromptVersionsUnlocked(projectRoot, assistantId)).slice(0, MAX_CONFIG_VERSIONS)
}

export async function loadAssistantPromptVersion(
  projectRoot: string,
  assistantId: CreatorAssistantId,
  id: string
): Promise<LoadedAssistantPromptVersion> {
  projectIdSchema.parse(id)
  const file = assistantPromptPath(projectRoot, assistantId, id)
  const raw = await readText(file)
  const value = assistantPromptVersionV1Schema.parse(JSON.parse(raw)) as AssistantPromptVersionV1
  if (value.assistant_id !== assistantId) throw new Error('ASSISTANT_PROMPT_ROLE_MISMATCH')
  return {
    value,
    source_path: path.relative(projectRoot, file).replace(/\\/gu, '/'),
    source_sha256: sha256Text(raw)
  }
}

export async function saveAssistantPromptVersion(
  projectRoot: string,
  input: SaveAssistantPromptVersionInput,
  now: () => Date = () => new Date()
): Promise<LoadedAssistantPromptVersion> {
  return withProjectWriteLock(projectRoot, async () => {
    const versions = await listAssistantPromptVersionsUnlocked(projectRoot, input.assistant_id)
    const latest = versions[0]?.value.version ?? input.base_version ?? '1.0.0'
    const version = input.version?.trim() || nextPatchVersion(input.base_version ?? latest)
    const name = input.name?.trim() || `${displayAssistantName(input.assistant_id)} ${version}`
    const id = assistantPromptId(input.assistant_id, version, name)
    const value = assistantPromptVersionV1Schema.parse({
      schema_version: 1,
      id,
      assistant_id: input.assistant_id,
      version,
      name,
      instructions: input.instructions,
      created_at: now().toISOString(),
      source: 'author'
    }) as AssistantPromptVersionV1
    const file = assistantPromptPath(projectRoot, input.assistant_id, id)
    if (await pathExists(file)) throw new Error(`ASSISTANT_PROMPT_VERSION_EXISTS: ${id}`)
    await writeAssistantPrompt(projectRoot, value)
    await pruneAssistantPromptVersions(projectRoot, input.assistant_id)
    return loadAssistantPromptVersion(projectRoot, input.assistant_id, id)
  })
}

export function nextAssistantPromptPatchVersion(value: string): string {
  return nextPatchVersion(value)
}

function builtinAssistantPrompt(assistantId: CreatorAssistantId): AssistantPromptVersionV1 {
  const instructions: Record<CreatorAssistantId, string> = {
    'setting-organizer': [
      'Preserve uncertainty and source distinctions.',
      'Return editable planning proposals only; never claim that a proposal is accepted project fact.'
    ].join('\n'),
    'character-rehearsal': [
      'Follow the product workflow: character, time event, location, context preview, rehearsal candidate, diagnosis, then exploration and character-setting proposals.',
      'The rehearsal passage is exploration only and must never be treated as novel prose or Canon.',
      'Cite missing, contradictory, or behaviorally implausible character evidence.'
    ].join('\n'),
    'continuity-review': [
      'Review the selected section or legal contiguous same-chapter range in story order.',
      'Check transitions, viewpoint, time, place, character state, tone, repetition, and information gaps.',
      'Return issue proposals with evidence only; never rewrite accepted or finalized prose.'
    ].join('\n')
  }
  return assistantPromptVersionV1Schema.parse({
    schema_version: 1,
    id: `${assistantId}-1-0-0`,
    assistant_id: assistantId,
    version: '1.0.0',
    name: `${displayAssistantName(assistantId)} 1.0.0`,
    instructions: instructions[assistantId],
    created_at: '2026-08-17T00:00:00.000Z',
    source: 'builtin'
  }) as AssistantPromptVersionV1
}

async function listAssistantPromptVersionsUnlocked(
  projectRoot: string,
  assistantId: CreatorAssistantId
): Promise<LoadedAssistantPromptVersion[]> {
  const directory = assistantPromptDirectory(projectRoot, assistantId)
  if (!(await pathExists(directory))) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const loaded: LoadedAssistantPromptVersion[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const id = entry.name.slice(0, -'.json'.length)
    const candidate = await loadAssistantPromptVersion(projectRoot, assistantId, id)
    loaded.push(candidate)
  }
  return loaded.sort(
    (left, right) =>
      compareSemver(right.value.version, left.value.version) ||
      right.value.created_at.localeCompare(left.value.created_at) ||
      right.value.id.localeCompare(left.value.id, 'en')
  )
}

async function writeAssistantPrompt(projectRoot: string, value: AssistantPromptVersionV1): Promise<void> {
  const parsed = assistantPromptVersionV1Schema.parse(value)
  const file = assistantPromptPath(projectRoot, parsed.assistant_id, parsed.id)
  await ensureDir(path.dirname(file))
  await writeText(file, `${JSON.stringify(parsed, null, 2)}\n`)
}

async function pruneAssistantPromptVersions(
  projectRoot: string,
  assistantId: CreatorAssistantId
): Promise<void> {
  const versions = await listAssistantPromptVersionsUnlocked(projectRoot, assistantId)
  for (const version of versions.slice(MAX_CONFIG_VERSIONS)) {
    await rm(assertProjectPath(projectRoot, path.join(projectRoot, version.source_path)), { force: true })
  }
}

function assistantPromptDirectory(projectRoot: string, assistantId: CreatorAssistantId): string {
  return assertProjectPath(projectRoot, path.join(projectRoot, 'assistant-prompts', assistantId))
}

function assistantPromptPath(projectRoot: string, assistantId: CreatorAssistantId, id: string): string {
  projectIdSchema.parse(id)
  return assertProjectPath(
    projectRoot,
    path.join(assistantPromptDirectory(projectRoot, assistantId), `${id}.json`)
  )
}

function assistantPromptId(assistantId: CreatorAssistantId, version: string, name: string): string {
  const suffix = name
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  const versionSlug = version.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '-')
  const base = `${assistantId}-${versionSlug}${suffix ? `-${suffix}` : ''}`.slice(0, 76).replace(/-+$/gu, '')
  return base || `${assistantId}-${sha256Text(canonicalJson({ version, name })).slice(0, 12)}`
}

function nextPatchVersion(value: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value)
  if (!match) return '1.0.1'
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .split('-', 1)[0]!
      .split('.')
      .map((part) => Number(part))
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference) return difference
  }
  return left.localeCompare(right, 'en')
}

function displayAssistantName(id: CreatorAssistantId): string {
  if (id === 'character-rehearsal') return '人物试戏助手'
  if (id === 'continuity-review') return '连续性审阅助手'
  return '设定整理助手'
}
