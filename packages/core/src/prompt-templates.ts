import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireDoc } from './documents.js'
import { ensureDir, listMarkdownFiles, pathExists, readText, writeText } from './fs.js'
import type { SceneDoc } from './types.js'
import { parseMarkdown, stringifyFrontmatter } from './yaml.js'

export const DEFAULT_PROMPT_SEGMENT_KINDS = [
  'instruction',
  'outline',
  'scene-outline',
  'world',
  'reference',
  'foreshadowing',
  'finalized-prose'
] as const

export const STRUCTURAL_PROMPT_SEGMENT_KINDS = ['instruction', 'outline', 'scene-outline'] as const

const promptTemplateSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal('prompt_template'),
    schema_version: z.literal(1).default(1),
    title: z.string().min(1),
    current: z.boolean().default(false),
    segments: z.array(z.string().min(1)).min(1)
  })
  .strict()

export type PromptTemplate = z.infer<typeof promptTemplateSchema>

export interface PromptLayoutSegment {
  kind: string
  source_type: string
  source_id: string
}

interface OrderedPromptSource {
  id: string
  kind: string
  source_type?: string
  source_id?: string
}

function templateDirectory(projectRoot: string): string {
  return path.join(projectRoot, 'prompt-templates')
}

export function sceneOutlineIsEmpty(
  scene: Pick<
    SceneDoc,
    | 'outline_content'
    | 'scene_goal'
    | 'scene_conflict'
    | 'scene_change'
    | 'writing_focus'
    | 'writing_environment'
  >
): boolean {
  return [
    scene.outline_content,
    scene.scene_goal,
    scene.scene_conflict,
    scene.scene_change,
    scene.writing_focus,
    scene.writing_environment
  ].every((value) => !value.trim())
}

export function orderPromptSources<T extends OrderedPromptSource>(
  sources: T[],
  kinds: readonly string[]
): T[] {
  const used = new Set<string>()
  const ordered: T[] = []
  for (const kind of kinds) {
    for (const source of sources) {
      if (used.has(source.id) || source.kind !== kind) continue
      used.add(source.id)
      ordered.push(source)
    }
  }
  return ordered
}

export function refreshPromptLayout<T extends OrderedPromptSource>(
  sources: T[],
  layout: readonly PromptLayoutSegment[]
): T[] {
  const ordered: T[] = []
  const used = new Set<string>()
  for (const segment of layout) {
    const match = sources.find(
      (source) =>
        !used.has(source.id) &&
        source.kind === segment.kind &&
        source.source_type === segment.source_type &&
        source.source_id === segment.source_id
    )
    if (!match) continue
    used.add(match.id)
    ordered.push(match)
  }
  return ordered
}

export function promptLayoutFromSources(sources: readonly OrderedPromptSource[]): PromptLayoutSegment[] {
  return sources
    .filter((source) => source.source_type && source.source_id)
    .map((source) => ({
      kind: source.kind,
      source_type: source.source_type!,
      source_id: source.source_id!
    }))
}

export async function listPromptTemplates(projectRoot: string): Promise<PromptTemplate[]> {
  const directory = templateDirectory(projectRoot)
  if (!(await pathExists(directory))) return []
  const files = (await listMarkdownFiles(directory)).sort((left, right) => left.localeCompare(right, 'en'))
  const templates: PromptTemplate[] = []
  for (const file of files) {
    const parsed = promptTemplateSchema.safeParse(parseMarkdown(await readText(file)).data)
    if (parsed.success) templates.push(parsed.data)
  }
  return templates
}

export async function currentPromptTemplateKinds(projectRoot: string): Promise<readonly string[]> {
  const templates = await listPromptTemplates(projectRoot)
  return templates.find((template) => template.current)?.segments ?? DEFAULT_PROMPT_SEGMENT_KINDS
}

export async function savePromptTemplate(
  projectRoot: string,
  title: string,
  segments: readonly string[],
  makeCurrent = true
): Promise<PromptTemplate> {
  const parsed = promptTemplateSchema.parse({
    id: `prompt-template-${randomUUID()}`,
    type: 'prompt_template',
    schema_version: 1,
    title: title.trim(),
    current: makeCurrent,
    segments
  })
  const directory = templateDirectory(projectRoot)
  await ensureDir(directory)
  if (makeCurrent) {
    const existing = await listPromptTemplates(projectRoot)
    for (const template of existing.filter((item) => item.current)) {
      await writeTemplate({ ...template, current: false }, directory)
    }
  }
  await writeTemplate(parsed, directory)
  return parsed
}

/** Marks one template as the work default. Does not rewrite scene layouts or filled prompt text. */
export async function setCurrentPromptTemplate(
  projectRoot: string,
  templateId: string
): Promise<PromptTemplate> {
  const templates = await listPromptTemplates(projectRoot)
  const selected = templates.find((template) => template.id === templateId)
  if (!selected) throw new Error('找不到这份提示词模板。')
  const directory = templateDirectory(projectRoot)
  for (const template of templates) {
    const current = template.id === templateId
    if (template.current !== current) await writeTemplate({ ...template, current }, directory)
  }
  return { ...selected, current: true }
}

export async function saveScenePromptLayout(
  projectRoot: string,
  sceneId: string,
  layout: readonly PromptLayoutSegment[]
): Promise<void> {
  const scene = await requireDoc<SceneDoc>(projectRoot, sceneId)
  const next: SceneDoc = { ...scene.data, prompt_layout: layout.map((segment) => ({ ...segment })) }
  await writeText(scene.path, stringifyFrontmatter(next as unknown as Record<string, unknown>, scene.content))
}

async function writeTemplate(template: PromptTemplate, directory: string): Promise<void> {
  await writeText(
    path.join(directory, `${template.id}.md`),
    stringifyFrontmatter(template as unknown as Record<string, unknown>, '')
  )
}
