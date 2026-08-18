import path from 'node:path'
import {
  createProjectAt,
  ensureWorkspaceAt,
  loadProject,
  loadWorkspace,
  registerWorkspaceProject,
  setWorkspaceDir,
  stableProjectId
} from '@quillarium/core'
import type { ProjectCreateInput, ProjectSummary } from './contract.js'

export async function registerLocalWorkspace(root: string): Promise<string> {
  const workspace = await ensureWorkspaceAt(root)
  return (await setWorkspaceDir(workspace.root)).workspaceDir ?? workspace.root
}

export async function createLocalWorkspaceProject(
  workspaceRoot: string,
  input: ProjectCreateInput
): Promise<ProjectSummary> {
  const workspace = await loadWorkspace(workspaceRoot)
  const id = input.id ?? stableProjectId(input.title)
  const relativePath = path.posix.join(workspace.manifest.projects_dir.replace(/\\/g, '/'), id)
  const root = path.join(workspace.root, ...relativePath.split('/'))
  const paths = await createProjectAt(root, {
    id,
    title: input.title,
    genre: input.genre,
    target_words: input.targetWords,
    chapter_words: input.chapterWords,
    section_words: input.sectionWords,
    default_theme: input.defaultTheme
  })
  await registerWorkspaceProject(workspace.root, { id, path: relativePath })
  return { root: paths.root, ...(await loadProject(paths.root)) }
}
