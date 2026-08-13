import { createHash } from 'node:crypto'
import path from 'node:path'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { objectToYaml, parseMarkdown } from './yaml.js'
import { projectConfigSchema, projectConfigV1Schema } from './schema.js'
import type { ProjectConfig, ProjectPaths } from './types.js'
import { ensureDefaultPrompts } from './prompts.js'

export const PROJECT_DIRS = [
  '.obsidian',
  'canon',
  'characters',
  'timeline',
  'locations',
  'foreshadowing',
  'world',
  'references',
  'issues',
  'strategy',
  'patterns',
  'narrative',
  'character-states',
  'resources',
  'causality',
  'outlines',
  'chapters',
  'scenes',
  'prompts',
  'runs',
  'imports',
  'reviews',
  'style',
  'exports',
  'sillytavern',
  '.quillarium'
] as const

export interface ProjectConfigInput {
  id: string
  title: string
  aliases?: string[]
  genre?: string
  target_words?: number
  chapter_words?: number
  section_words?: number
  current_volume?: number
  current_timeline_node?: string | null
  default_theme?: ProjectConfig['default_theme']
  schema_version?: 2
}

export interface ProjectConfigMigrationPlan {
  root: string
  from_version: 1 | 2
  to_version: 2
  changed: boolean
  config: ProjectConfig
}

export function projectPaths(root: string): ProjectPaths {
  return {
    root,
    projectFile: path.join(root, 'project.yaml'),
    indexFile: path.join(root, '.quillarium', 'index.json')
  }
}

export function stableProjectId(value: string): string {
  const slug = value
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug) return slug.slice(0, 80).replace(/-+$/g, '')
  return `project-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
}

export function migrateProjectConfigV1(value: unknown, id: string, aliases: string[] = []): ProjectConfig {
  const legacy = projectConfigV1Schema.parse(value)
  return projectConfigSchema.parse({
    ...legacy,
    id,
    aliases,
    schema_version: 2
  }) as ProjectConfig
}

export async function createProjectAt(root: string, configInput: ProjectConfigInput): Promise<ProjectPaths> {
  const absoluteRoot = path.resolve(root)
  const paths = projectPaths(absoluteRoot)
  if (await pathExists(paths.projectFile)) throw new Error(`Project already exists: ${absoluteRoot}`)
  const config = projectConfigSchema.parse({
    ...configInput,
    aliases: configInput.aliases ?? [],
    schema_version: 2
  }) as ProjectConfig

  await ensureDir(absoluteRoot)
  for (const dir of PROJECT_DIRS) await ensureDir(path.join(absoluteRoot, dir))
  await writeText(paths.projectFile, `${objectToYaml(config as unknown as Record<string, unknown>)}\n`)
  await writeText(
    path.join(absoluteRoot, 'README.md'),
    `# ${config.title}\n\nCreated by Quillarium.\n\nOpen this folder in Obsidian or manage it with the \`quill\` CLI.\n`
  )
  await ensureDefaultPrompts(absoluteRoot)
  return paths
}

/**
 * Legacy project creator for the historical `<vault>/novels/<title>` layout.
 * New workspace projects should call createProjectAt instead.
 */
export async function createProject(options: {
  vault: string
  title: string
  id?: string
  aliases?: string[]
  genre?: string
  targetWords?: number
  chapterWords?: number
  sectionWords?: number
  defaultTheme?: ProjectConfig['default_theme']
}): Promise<ProjectPaths> {
  const root = path.join(options.vault, 'novels', options.title)
  return createProjectAt(root, {
    id: options.id ?? stableProjectId(options.title),
    aliases: options.aliases ?? [],
    title: options.title,
    genre: options.genre,
    target_words: options.targetWords,
    chapter_words: options.chapterWords,
    section_words: options.sectionWords,
    default_theme: options.defaultTheme
  })
}

export async function loadProject(root: string): Promise<ProjectConfig> {
  const { data } = await readRawProjectConfig(root)
  if (data['schema_version'] === 2) return projectConfigSchema.parse(data) as ProjectConfig
  return migrateProjectConfigV1(data, stableProjectId(String(data['title'] ?? path.basename(root))))
}

export async function planProjectConfigMigration(
  root: string,
  options: { id?: string; aliases?: string[] } = {}
): Promise<ProjectConfigMigrationPlan> {
  const { data } = await readRawProjectConfig(root)
  if (data['schema_version'] === 2) {
    return {
      root: path.resolve(root),
      from_version: 2,
      to_version: 2,
      changed: false,
      config: projectConfigSchema.parse(data) as ProjectConfig
    }
  }
  return {
    root: path.resolve(root),
    from_version: 1,
    to_version: 2,
    changed: true,
    config: migrateProjectConfigV1(
      data,
      options.id ?? stableProjectId(String(data['title'] ?? path.basename(root))),
      options.aliases ?? []
    )
  }
}

async function readRawProjectConfig(
  root: string
): Promise<{ path: string; raw: string; data: Record<string, unknown> }> {
  const paths = projectPaths(root)
  if (!(await pathExists(paths.projectFile))) throw new Error(`project.yaml not found: ${paths.projectFile}`)
  const raw = await readText(paths.projectFile)
  const data = parseMarkdown<Record<string, unknown>>(`---\n${raw}\n---\n`).data
  return { path: paths.projectFile, raw, data }
}
