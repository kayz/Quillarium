import { createHash } from 'node:crypto'
import path from 'node:path'
import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import type { ZodType } from 'zod'
import { ensureDir, pathExists, readText, writeText } from './fs.js'
import { projectIdSchema } from './schema.js'
import { objectToYaml, parseMarkdown } from './yaml.js'

export interface LoadedVersionedYaml<T> {
  value: T
  source_path: string
  source_sha256: string
}

export class StaleProjectWriteError extends Error {
  readonly code = 'STALE_PROJECT_WRITE'

  constructor(relativePath: string) {
    super(`STALE_PROJECT_WRITE: Project data changed after it was loaded: ${relativePath}`)
    this.name = 'StaleProjectWriteError'
  }
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export async function listVersionedYaml<T>(
  projectRoot: string,
  directoryName: string,
  schema: ZodType<T>
): Promise<Array<LoadedVersionedYaml<T>>> {
  const directory = await ensureContainedDirectory(projectRoot, directoryName, false)
  if (!directory) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const loaded: Array<LoadedVersionedYaml<T>> = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) {
      throw new Error(`${directoryName} cannot contain symbolic links: ${entry.name}`)
    }
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
    loaded.push(
      await loadVersionedYaml(projectRoot, directoryName, entry.name.slice(0, -'.yaml'.length), schema)
    )
  }
  return loaded
}

export async function loadVersionedYaml<T>(
  projectRoot: string,
  directoryName: string,
  id: string,
  schema: ZodType<T>
): Promise<LoadedVersionedYaml<T>> {
  const safeId = projectIdSchema.parse(id)
  const directory = await ensureContainedDirectory(projectRoot, directoryName, false)
  if (!directory) throw new Error(`Project data not found: ${directoryName}/${safeId}.yaml`)
  const filePath = path.join(directory, `${safeId}.yaml`)
  if (!(await pathExists(filePath))) {
    throw new Error(`Project data not found: ${directoryName}/${safeId}.yaml`)
  }
  const fileStats = await lstat(filePath)
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw new Error(`Project data must be a regular file: ${directoryName}/${safeId}.yaml`)
  }
  const fileReal = await realpath(filePath)
  assertDirectChild(directory, fileReal, `${directoryName}/${safeId}.yaml`)
  const raw = await readText(fileReal)
  const parsed = parseMarkdown<Record<string, unknown>>(`---\n${raw.trimEnd()}\n---\n`).data
  const value = schema.parse(parsed)
  const declaredId = (value as { id?: unknown }).id
  if (declaredId !== safeId) {
    throw new Error(`${directoryName}/${safeId}.yaml declares a different id: ${String(declaredId)}`)
  }
  return {
    value,
    source_path: `${directoryName}/${safeId}.yaml`,
    source_sha256: sha256Text(raw)
  }
}

export async function createVersionedYaml<T extends { id: string }>(
  projectRoot: string,
  directoryName: string,
  value: T,
  schema: ZodType<T>
): Promise<LoadedVersionedYaml<T>> {
  const parsed = schema.parse(value)
  const directory = await ensureContainedDirectory(projectRoot, directoryName, true)
  const filePath = path.join(directory!, `${projectIdSchema.parse(parsed.id)}.yaml`)
  if (await pathExists(filePath))
    throw new Error(`Project data already exists: ${directoryName}/${parsed.id}`)
  await writeText(filePath, `${objectToYaml(parsed as unknown as Record<string, unknown>)}\n`)
  return loadVersionedYaml(projectRoot, directoryName, parsed.id, schema)
}

export async function updateVersionedYaml<T extends { id: string }>(
  projectRoot: string,
  directoryName: string,
  value: T,
  expectedSha256: string,
  schema: ZodType<T>
): Promise<LoadedVersionedYaml<T>> {
  const parsed = schema.parse(value)
  const current = await loadVersionedYaml(projectRoot, directoryName, parsed.id, schema)
  if (current.source_sha256 !== expectedSha256) throw new StaleProjectWriteError(current.source_path)
  const filePath = path.join(projectRoot, current.source_path)
  await writeText(filePath, `${objectToYaml(parsed as unknown as Record<string, unknown>)}\n`)
  return loadVersionedYaml(projectRoot, directoryName, parsed.id, schema)
}

export async function deleteVersionedYaml<T>(
  projectRoot: string,
  directoryName: string,
  id: string,
  expectedSha256: string,
  schema: ZodType<T>
): Promise<void> {
  const loaded = await loadVersionedYaml(projectRoot, directoryName, id, schema)
  if (loaded.source_sha256 !== expectedSha256) throw new StaleProjectWriteError(loaded.source_path)
  const directory = await ensureContainedDirectory(projectRoot, directoryName, false)
  if (!directory) throw new Error(`Project data not found: ${directoryName}/${id}.yaml`)
  const filePath = path.join(directory, `${projectIdSchema.parse(id)}.yaml`)
  const stats = await lstat(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Project data must be a regular file: ${loaded.source_path}`)
  }
  const fileReal = await realpath(filePath)
  assertDirectChild(directory, fileReal, loaded.source_path)
  if (sha256Text(await readText(fileReal)) !== expectedSha256) {
    throw new StaleProjectWriteError(loaded.source_path)
  }
  await rm(filePath, { force: false })
}

export async function assertVersionedYamlHash(
  projectRoot: string,
  relativePath: string,
  expectedSha256: string
): Promise<void> {
  const resolved = path.resolve(projectRoot, relativePath)
  const relative = path.relative(path.resolve(projectRoot), resolved)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Project data path is outside the project: ${relativePath}`)
  }
  const stats = await lstat(resolved)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Project data must be a regular file: ${relativePath}`)
  }
  const [projectReal, fileReal] = await Promise.all([realpath(projectRoot), realpath(resolved)])
  const realRelative = path.relative(projectReal, fileReal)
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error(`Project data resolves outside the project: ${relativePath}`)
  }
  if (sha256Text(await readText(fileReal)) !== expectedSha256) {
    throw new StaleProjectWriteError(relativePath.replace(/\\/gu, '/'))
  }
}

async function ensureContainedDirectory(
  projectRoot: string,
  directoryName: string,
  create: boolean
): Promise<string | null> {
  if (path.isAbsolute(directoryName) || directoryName.replace(/\\/gu, '/').split('/').includes('..')) {
    throw new Error(`Project data directory must be project-relative: ${directoryName}`)
  }
  const projectReal = await realpath(projectRoot)
  const directoryPath = path.join(projectReal, directoryName)
  if (!(await pathExists(directoryPath))) {
    if (!create) return null
    await ensureDir(directoryPath)
  }
  const stats = await lstat(directoryPath)
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Project data directory cannot be a symbolic link: ${directoryName}`)
  }
  const directoryReal = await realpath(directoryPath)
  const relative = path.relative(projectReal, directoryReal)
  if (
    relative !== directoryName.replace(/\//gu, path.sep) ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Project data directory resolves outside the project: ${directoryName}`)
  }
  return directoryReal
}

function assertDirectChild(directoryReal: string, fileReal: string, label: string): void {
  const relative = path.relative(directoryReal, fileReal)
  if (!relative || path.dirname(relative) !== '.' || path.isAbsolute(relative)) {
    throw new Error(`Project data resolves outside its directory: ${label}`)
  }
}
