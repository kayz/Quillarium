import path from 'node:path'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { objectToYaml, parseMarkdown } from './yaml.js'
import { projectConfigSchema } from './schema.js'
import type { ProjectConfig, ProjectPaths } from './types.js'

export const PROJECT_DIRS = [
  'canon',
  'characters',
  'timeline',
  'locations',
  'resources',
  'causality',
  'outlines',
  'scenes',
  'prompts',
  'runs',
  'exports',
  'sillytavern',
  '.quillarium'
] as const

export function projectPaths(root: string): ProjectPaths {
  return {
    root,
    projectFile: path.join(root, 'project.yaml'),
    indexFile: path.join(root, '.quillarium', 'index.json')
  }
}

export async function createProject(options: {
  vault: string
  title: string
  genre?: string
  targetWords?: number
  chapterWords?: number
  sectionWords?: number
  defaultTheme?: ProjectConfig['default_theme']
}): Promise<ProjectPaths> {
  const root = path.join(options.vault, 'novels', options.title)
  const paths = projectPaths(root)
  if (await pathExists(paths.projectFile)) throw new Error(`Project already exists: ${root}`)
  await ensureDir(root)
  for (const dir of PROJECT_DIRS) await ensureDir(path.join(root, dir))

  const config: ProjectConfig = {
    title: options.title,
    genre: options.genre ?? 'general',
    target_words: options.targetWords ?? 0,
    chapter_words: options.chapterWords ?? 3200,
    section_words: options.sectionWords ?? 1000,
    current_volume: 1,
    current_timeline_node: null,
    default_theme: options.defaultTheme ?? 'paper',
    schema_version: 1
  }
  await writeText(paths.projectFile, `${objectToYaml(config as unknown as Record<string, unknown>)}\n`)
  await writeText(
    path.join(root, 'README.md'),
    `# ${options.title}\n\nCreated by Quillarium.\n\nOpen this folder in Obsidian or manage it with the \`quill\` CLI.\n`
  )
  return paths
}

export async function loadProject(root: string): Promise<ProjectConfig> {
  const paths = projectPaths(root)
  if (!(await pathExists(paths.projectFile))) throw new Error(`project.yaml not found: ${paths.projectFile}`)
  const raw = await readText(paths.projectFile)
  const data = parseMarkdown<Record<string, unknown>>(`---\n${raw}\n---\n`).data
  return projectConfigSchema.parse(data) as ProjectConfig
}
