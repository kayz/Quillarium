import { createHash, randomUUID } from 'node:crypto'
import { realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, pathExists, readText } from './fs.js'
import { loadProject, stableProjectId } from './project.js'
import { workspaceManifestV1Schema } from './schema.js'
import type {
  LoadedWorkspace,
  SharedGuidanceContent,
  SharedGuidanceScope,
  WorkspaceManifestV1,
  WorkspaceProject,
  WorkspaceProjectRef
} from './types.js'
import { objectToYaml, parseMarkdown } from './yaml.js'

export const WORKSPACE_MANIFEST_FILE = 'quillarium-workspace.yaml'

export interface EnsureWorkspaceOptions {
  id?: string
  projects_dir?: string
}

/**
 * Register an ordinary local directory as a Quillarium writing workspace.
 * Existing manifests are only loaded and never rewritten. A new workspace
 * contains no credentials or Git/GitHub configuration.
 */
export async function ensureWorkspaceAt(
  root: string,
  options: EnsureWorkspaceOptions = {}
): Promise<LoadedWorkspace> {
  const absoluteRoot = path.resolve(root)
  await ensureDir(absoluteRoot)
  const rootInfo = await stat(absoluteRoot)
  if (!rootInfo.isDirectory()) throw new Error(`Workspace root is not a directory: ${absoluteRoot}`)

  const manifestPath = path.join(absoluteRoot, WORKSPACE_MANIFEST_FILE)
  if (await pathExists(manifestPath)) return loadWorkspace(absoluteRoot)

  const projectsDir = options.projects_dir ?? 'projects'
  const projectsRoot = resolveWorkspacePath(absoluteRoot, projectsDir, 'projects_dir')
  await ensureDir(projectsRoot)
  const rootReal = await realpath(absoluteRoot)
  const projectsReal = await realpath(projectsRoot)
  assertPathWithin(rootReal, projectsReal, 'projects_dir resolves outside the workspace')

  const manifest = workspaceManifestV1Schema.parse({
    schema_version: 1,
    id: options.id ?? stableProjectId(path.basename(absoluteRoot) || 'local-workspace'),
    projects_dir: normalizeManifestPath(projectsDir),
    projects: [],
    shared_guidance: []
  }) as WorkspaceManifestV1
  const content = `${objectToYaml(manifest as unknown as Record<string, unknown>)}\n`
  let created = false
  try {
    await writeFile(manifestPath, content, { encoding: 'utf8', flag: 'wx' })
    created = true
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) throw error
  }

  try {
    return await loadWorkspace(absoluteRoot)
  } catch (error) {
    if (created) await rm(manifestPath, { force: true })
    throw error
  }
}

export async function loadWorkspace(root: string): Promise<LoadedWorkspace> {
  const absoluteRoot = path.resolve(root)
  const manifestPath = path.join(absoluteRoot, WORKSPACE_MANIFEST_FILE)
  if (!(await pathExists(manifestPath))) throw new Error(`Workspace manifest not found: ${manifestPath}`)
  const rootInfo = await stat(absoluteRoot)
  if (!rootInfo.isDirectory()) throw new Error(`Workspace root is not a directory: ${absoluteRoot}`)

  const rootReal = await realpath(absoluteRoot)
  const manifestReal = await realpath(manifestPath)
  assertPathWithin(rootReal, manifestReal, 'Workspace manifest resolves outside the workspace')
  if (!(await stat(manifestReal)).isFile())
    throw new Error(`Workspace manifest is not a file: ${manifestPath}`)

  const raw = await readText(manifestPath)
  const data = parseMarkdown<Record<string, unknown>>(`---\n${raw}\n---\n`).data
  const manifest = workspaceManifestV1Schema.parse(data) as WorkspaceManifestV1
  assertUniqueIds(
    manifest.projects.map((item) => item.id),
    'workspace project'
  )
  assertUniqueIds(
    manifest.shared_guidance.map((item) => item.id),
    'shared guidance'
  )

  const projectsDir = await resolveExistingWorkspacePath(
    absoluteRoot,
    rootReal,
    manifest.projects_dir,
    'projects_dir',
    'directory'
  )

  for (const project of manifest.projects) {
    const projectRoot = await resolveExistingWorkspacePath(
      absoluteRoot,
      rootReal,
      project.path,
      `project ${project.id}`,
      'directory'
    )
    assertPathWithin(projectsDir, projectRoot, `Project ${project.id} must be inside projects_dir`)
    if (!(await pathExists(path.join(projectRoot, 'project.yaml')))) {
      throw new Error(`Workspace project is missing project.yaml: ${project.path}`)
    }
    const config = await loadProject(projectRoot)
    if (config.id !== project.id) {
      throw new Error(`Workspace project id mismatch: manifest=${project.id}, project.yaml=${config.id}`)
    }
  }

  for (const guidance of manifest.shared_guidance) {
    await resolveExistingWorkspacePath(
      absoluteRoot,
      rootReal,
      guidance.path,
      `shared guidance ${guidance.id}`,
      'file'
    )
  }

  return {
    root: absoluteRoot,
    manifest_path: manifestPath,
    manifest
  }
}

export async function listWorkspaceProjects(root: string): Promise<WorkspaceProject[]> {
  const workspace = await loadWorkspace(root)
  return Promise.all(
    workspace.manifest.projects.map(async (ref) => {
      const projectRoot = resolveWorkspacePath(workspace.root, ref.path, `project ${ref.id}`)
      return {
        ref,
        root: projectRoot,
        config: await loadProject(projectRoot)
      }
    })
  )
}

export async function registerWorkspaceProject(
  root: string,
  ref: WorkspaceProjectRef
): Promise<WorkspaceProject> {
  const workspace = await loadWorkspace(root)
  if (workspace.manifest.projects.some((item) => item.id === ref.id)) {
    throw new Error(`Duplicate workspace project id: ${ref.id}`)
  }
  const rootReal = await realpath(workspace.root)
  const projectRoot = await resolveExistingWorkspacePath(
    workspace.root,
    rootReal,
    ref.path,
    `project ${ref.id}`,
    'directory'
  )
  const projectsRoot = await resolveExistingWorkspacePath(
    workspace.root,
    rootReal,
    workspace.manifest.projects_dir,
    'projects_dir',
    'directory'
  )
  assertPathWithin(projectsRoot, projectRoot, `Project ${ref.id} must be inside projects_dir`)
  for (const item of workspace.manifest.projects) {
    const registeredRoot = await realpath(
      resolveWorkspacePath(workspace.root, item.path, `project ${item.id}`)
    )
    if (samePath(registeredRoot, projectRoot)) {
      throw new Error(`Workspace project path is already registered: ${ref.path}`)
    }
  }
  if (!(await pathExists(path.join(projectRoot, 'project.yaml')))) {
    throw new Error(`Workspace project is missing project.yaml: ${ref.path}`)
  }
  const config = await loadProject(projectRoot)
  if (config.id !== ref.id) {
    throw new Error(`Workspace project id mismatch: manifest=${ref.id}, project.yaml=${config.id}`)
  }

  const nextManifest: WorkspaceManifestV1 = {
    ...workspace.manifest,
    projects: [...workspace.manifest.projects, ref]
  }
  const original = await readText(workspace.manifest_path)
  const next = `${objectToYaml(nextManifest as unknown as Record<string, unknown>)}\n`
  await atomicReplaceText(workspace.manifest_path, next)
  try {
    const verified = await loadWorkspace(workspace.root)
    const verifiedRef = verified.manifest.projects.find((item) => item.id === ref.id)
    if (!verifiedRef) throw new Error(`Workspace registration verification failed: ${ref.id}`)
    return { ref: verifiedRef, root: projectRoot, config }
  } catch (error) {
    await atomicReplaceText(workspace.manifest_path, original)
    throw error
  }
}

export async function findWorkspaceForProject(projectRoot: string): Promise<LoadedWorkspace | null> {
  const projectReal = await realpath(path.resolve(projectRoot))
  let candidate = projectReal
  while (true) {
    if (await pathExists(path.join(candidate, WORKSPACE_MANIFEST_FILE))) {
      const workspace = await loadWorkspace(candidate)
      for (const ref of workspace.manifest.projects) {
        const listedReal = await realpath(resolveWorkspacePath(workspace.root, ref.path, `project ${ref.id}`))
        if (samePath(listedReal, projectReal)) return workspace
      }
      return null
    }
    const parent = path.dirname(candidate)
    if (parent === candidate) return null
    candidate = parent
  }
}

export async function loadSharedGuidance(
  projectRoot: string,
  scope: SharedGuidanceScope,
  readAt = new Date().toISOString()
): Promise<SharedGuidanceContent[]> {
  const workspace = await findWorkspaceForProject(projectRoot)
  if (!workspace) return []
  const selected = workspace.manifest.shared_guidance.filter((item) => item.scopes.includes(scope))
  const results: SharedGuidanceContent[] = []
  for (const item of selected) {
    const absolutePath = resolveWorkspacePath(workspace.root, item.path, `shared guidance ${item.id}`)
    // Intentionally read exactly once per generation so content and hash describe the same bytes.
    const content = await readText(absolutePath)
    results.push({
      id: item.id,
      path: normalizeManifestPath(item.path),
      scope,
      content,
      sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
      read_at: readAt
    })
  }
  return results
}

export function resolveWorkspacePath(root: string, relativePath: string, label = 'manifest path'): string {
  assertSafeManifestPath(relativePath, label)
  const absoluteRoot = path.resolve(root)
  const candidate = path.resolve(absoluteRoot, relativePath)
  assertPathWithin(absoluteRoot, candidate, `${label} escapes the workspace`)
  return candidate
}

export function assertSafeManifestPath(relativePath: string, label = 'manifest path'): void {
  if (!relativePath.trim()) throw new Error(`${label} must not be empty`)
  if (
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath) ||
    /^[a-zA-Z]:/.test(relativePath)
  ) {
    throw new Error(`${label} must be relative to the workspace: ${relativePath}`)
  }
  const segments = relativePath.replace(/\\/g, '/').split('/')
  if (segments.some((segment) => segment === '..' || segment === '.' || segment === '')) {
    throw new Error(`${label} contains unsafe path traversal: ${relativePath}`)
  }
}

async function resolveExistingWorkspacePath(
  root: string,
  rootReal: string,
  relativePath: string,
  label: string,
  expected: 'file' | 'directory'
): Promise<string> {
  const candidate = resolveWorkspacePath(root, relativePath, label)
  if (!(await pathExists(candidate))) throw new Error(`${label} does not exist: ${relativePath}`)
  const candidateReal = await realpath(candidate)
  assertPathWithin(rootReal, candidateReal, `${label} resolves outside the workspace`)
  const info = await stat(candidateReal)
  if (expected === 'file' && !info.isFile()) throw new Error(`${label} is not a file: ${relativePath}`)
  if (expected === 'directory' && !info.isDirectory()) {
    throw new Error(`${label} is not a directory: ${relativePath}`)
  }
  return candidateReal
}

function assertUniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${label} id: ${id}`)
    seen.add(id)
  }
}

function assertPathWithin(root: string, candidate: string, message: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${message}: ${candidate}`)
  }
}

function normalizeManifestPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function atomicReplaceText(file: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  try {
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}
