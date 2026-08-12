import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { migrateOutlineCycleRecord } from './compatibility.js'
import { listMarkdownFiles, pathExists, readText } from './fs.js'
import {
  loadProject,
  migrateProjectConfigV1,
  planProjectConfigMigration,
  projectPaths,
  stableProjectId
} from './project.js'
import type { ProjectConfig } from './types.js'
import { objectToYaml, parseMarkdown, stringifyFrontmatter } from './yaml.js'

export type MigrationStageName = 'dry-run' | 'backup' | 'apply' | 'verify' | 'report'
export type MigrationStageStatus = 'pending' | 'completed'

export interface MigrationStage {
  name: MigrationStageName
  status: MigrationStageStatus
}

export interface ProjectFileFingerprint {
  path: string
  bytes: number
  sha256: string
}

export interface ProjectMigrationOptions {
  source_root: string
  target_root: string
  id?: string
  aliases?: string[]
  backup_root?: string
}

export interface ProjectMigrationReport {
  mode: 'dry-run' | 'apply'
  source_root: string
  target_root: string
  backup_root: string | null
  project: ProjectConfig
  stages: MigrationStage[]
  source_files: ProjectFileFingerprint[]
  managed_source_files: ProjectFileFingerprint[]
  target_files: ProjectFileFingerprint[]
  source_file_count: number
  managed_file_count: number
  target_file_count: number
  file_count: number
  excluded_paths: string[]
  verified: boolean
  changed_paths: string[]
  invariant_paths: string[]
}

export interface AppliedProjectConfigMigration {
  changed: boolean
  backup_path: string | null
  config: ProjectConfig
}

export interface OutlineCycleMigrationReport {
  mode: 'dry-run' | 'apply'
  root: string
  changed_paths: string[]
  backup_root: string | null
  verified: boolean
}

export async function planProjectMigration(
  options: ProjectMigrationOptions
): Promise<ProjectMigrationReport> {
  const sourceRoot = path.resolve(options.source_root)
  const targetRoot = path.resolve(options.target_root)
  await assertProjectMigrationRoots(sourceRoot, targetRoot)
  const sourceFiles = await fingerprintTree(sourceRoot)
  const managedSourceFiles = sourceFiles.filter((file) => !isGitMetadataPath(file.path))
  const excludedPaths = sourceFiles.filter((file) => isGitMetadataPath(file.path)).map((file) => file.path)
  const configPlan = await planProjectConfigMigration(sourceRoot, {
    id: options.id,
    aliases: options.aliases
  })
  return {
    mode: 'dry-run',
    source_root: sourceRoot,
    target_root: targetRoot,
    backup_root: options.backup_root ? path.resolve(options.backup_root) : null,
    project: configPlan.config,
    stages: migrationStages(['dry-run', 'report']),
    source_files: sourceFiles,
    managed_source_files: managedSourceFiles,
    target_files: [],
    source_file_count: sourceFiles.length,
    managed_file_count: managedSourceFiles.length,
    target_file_count: 0,
    file_count: managedSourceFiles.length,
    excluded_paths: excludedPaths,
    verified: false,
    changed_paths: ['project.yaml'],
    invariant_paths: managedSourceFiles
      .filter((file) => file.path !== 'project.yaml')
      .map((file) => file.path)
  }
}

export async function migrateProjectLayout(
  options: ProjectMigrationOptions
): Promise<ProjectMigrationReport> {
  const dryRun = await planProjectMigration(options)
  const sourceRoot = dryRun.source_root
  const targetRoot = dryRun.target_root
  const backupRoot = path.resolve(options.backup_root ?? defaultBackupRoot(sourceRoot))
  assertSeparateRoots(sourceRoot, backupRoot, 'backup_root')
  assertSeparateRoots(targetRoot, backupRoot, 'backup_root')
  if (await pathExists(targetRoot)) throw new Error(`Migration target already exists: ${targetRoot}`)
  if (await pathExists(backupRoot)) throw new Error(`Migration backup already exists: ${backupRoot}`)

  await copyTree(sourceRoot, backupRoot)
  const backupFiles = await fingerprintTree(backupRoot)
  assertFingerprintsEqual(dryRun.source_files, backupFiles, new Set())

  const targetParent = path.dirname(targetRoot)
  await mkdir(targetParent, { recursive: true })
  const temporaryTarget = path.join(targetParent, `.${path.basename(targetRoot)}.migration-${randomUUID()}`)
  try {
    await copyTree(sourceRoot, temporaryTarget, sourceRoot, isGitMetadataPath)
    await writeMigratedProjectConfig(temporaryTarget, dryRun.project)
    const temporaryFiles = await fingerprintTree(temporaryTarget)
    assertFingerprintsEqual(dryRun.managed_source_files, temporaryFiles, new Set(['project.yaml']))
    if (temporaryFiles.length !== dryRun.managed_source_files.length) {
      throw new Error('Migration verification failed: file count changed')
    }
    await rename(temporaryTarget, targetRoot)
  } catch (error) {
    if (await pathExists(temporaryTarget)) await rm(temporaryTarget, { recursive: true, force: true })
    throw error
  }

  const targetFiles = await fingerprintTree(targetRoot)
  assertFingerprintsEqual(dryRun.managed_source_files, targetFiles, new Set(['project.yaml']))
  if (targetFiles.length !== dryRun.managed_source_files.length) {
    throw new Error('Migration verification failed after apply: file count changed')
  }
  const loaded = await loadProject(targetRoot)
  if (loaded.id !== dryRun.project.id || loaded.schema_version !== 2) {
    throw new Error('Migration verification failed: project configuration was not upgraded')
  }

  return {
    ...dryRun,
    mode: 'apply',
    backup_root: backupRoot,
    stages: migrationStages(['dry-run', 'backup', 'apply', 'verify', 'report']),
    target_files: targetFiles,
    target_file_count: targetFiles.length,
    verified: true
  }
}

export async function applyProjectConfigMigration(
  root: string,
  options: { id?: string; aliases?: string[]; backup_path?: string } = {}
): Promise<AppliedProjectConfigMigration> {
  const absoluteRoot = path.resolve(root)
  const plan = await planProjectConfigMigration(absoluteRoot, options)
  if (!plan.changed) return { changed: false, backup_path: null, config: plan.config }
  const projectFile = projectPaths(absoluteRoot).projectFile
  const raw = await readText(projectFile)
  const data = parseMarkdown<Record<string, unknown>>(`---\n${raw}\n---\n`).data
  const backupPath = path.resolve(
    options.backup_path ??
      path.join(absoluteRoot, '.quillarium', 'migrations', `project-v1-${Date.now()}.yaml.bak`)
  )
  assertPathOutside(projectFile, backupPath, 'Project config backup must not overwrite project.yaml')
  if (await pathExists(backupPath)) throw new Error(`Project config backup already exists: ${backupPath}`)
  await mkdir(path.dirname(backupPath), { recursive: true })
  await copyFile(projectFile, backupPath)
  await atomicWriteText(projectFile, `${objectToYaml({ ...data, ...plan.config })}\n`)
  const verified = await loadProject(absoluteRoot)
  if (verified.id !== plan.config.id || verified.schema_version !== 2) {
    throw new Error('Project config migration verification failed')
  }
  return { changed: true, backup_path: backupPath, config: verified }
}

export async function migrateOutlineCycleFields(
  root: string,
  options: { apply?: boolean; backup_root?: string } = {}
): Promise<OutlineCycleMigrationReport> {
  const absoluteRoot = path.resolve(root)
  const outlineRoot = path.join(absoluteRoot, 'outlines')
  const files = await listMarkdownFiles(outlineRoot)
  const changes: Array<{ file: string; relative: string; raw: string; migrated: string }> = []
  for (const file of files) {
    const raw = await readText(file)
    const parsed = parseMarkdown<Record<string, unknown>>(raw)
    const migrated = migrateOutlineCycleRecord(parsed.data)
    if (!migrated.changed) continue
    changes.push({
      file,
      relative: normalizeRelative(path.relative(absoluteRoot, file)),
      raw,
      migrated: stringifyFrontmatter(migrated.data, parsed.content)
    })
  }
  if (!options.apply) {
    return {
      mode: 'dry-run',
      root: absoluteRoot,
      changed_paths: changes.map((change) => change.relative),
      backup_root: options.backup_root ? path.resolve(options.backup_root) : null,
      verified: false
    }
  }

  const backupRoot = path.resolve(
    options.backup_root ??
      path.join(absoluteRoot, '.quillarium', 'migrations', `outline-cycles-${Date.now()}`)
  )
  assertSeparateRoots(outlineRoot, backupRoot, 'backup_root')
  if (await pathExists(backupRoot)) throw new Error(`Outline migration backup already exists: ${backupRoot}`)
  for (const change of changes) {
    const backupFile = path.join(backupRoot, change.relative)
    await mkdir(path.dirname(backupFile), { recursive: true })
    await writeFile(backupFile, change.raw, 'utf8')
  }
  for (const change of changes) await atomicWriteText(change.file, change.migrated)
  for (const change of changes) {
    const parsed = parseMarkdown<Record<string, unknown>>(await readText(change.file))
    if (migrateOutlineCycleRecord(parsed.data).changed) {
      throw new Error(`Outline cycle migration verification failed: ${change.relative}`)
    }
  }
  return {
    mode: 'apply',
    root: absoluteRoot,
    changed_paths: changes.map((change) => change.relative),
    backup_root: backupRoot,
    verified: true
  }
}

export async function fingerprintTree(root: string): Promise<ProjectFileFingerprint[]> {
  const absoluteRoot = path.resolve(root)
  if (!(await pathExists(absoluteRoot))) throw new Error(`Project root does not exist: ${absoluteRoot}`)
  const output: ProjectFileFingerprint[] = []
  await walk(absoluteRoot, async (file) => {
    const bytes = await readFile(file)
    output.push({
      path: normalizeRelative(path.relative(absoluteRoot, file)),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex')
    })
  })
  return output.sort((left, right) => left.path.localeCompare(right.path))
}

async function assertProjectMigrationRoots(sourceRoot: string, targetRoot: string): Promise<void> {
  if (!(await pathExists(projectPaths(sourceRoot).projectFile))) {
    throw new Error(`Legacy project is missing project.yaml: ${sourceRoot}`)
  }
  assertSeparateRoots(sourceRoot, targetRoot, 'target_root')
}

function assertSeparateRoots(root: string, candidate: string, label: string): void {
  const rootToCandidate = path.relative(root, candidate)
  const candidateToRoot = path.relative(candidate, root)
  if (
    !rootToCandidate ||
    (!rootToCandidate.startsWith(`..${path.sep}`) && rootToCandidate !== '..') ||
    (!candidateToRoot.startsWith(`..${path.sep}`) && candidateToRoot !== '..')
  ) {
    throw new Error(`${label} must be separate from the source and target roots: ${candidate}`)
  }
}

function assertPathOutside(left: string, right: string, message: string): void {
  if (path.resolve(left) === path.resolve(right)) throw new Error(message)
}

async function copyTree(
  source: string,
  target: string,
  sourceRoot = source,
  exclude?: (relativePath: string) => boolean
): Promise<void> {
  const relativePath = normalizeRelative(path.relative(sourceRoot, source))
  if (relativePath && exclude?.(relativePath)) return
  const info = await lstat(source)
  if (info.isSymbolicLink()) throw new Error(`Project migration does not follow symbolic links: ${source}`)
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true })
    const entries = await readdir(source)
    for (const entry of entries) {
      await copyTree(path.join(source, entry), path.join(target, entry), sourceRoot, exclude)
    }
    return
  }
  if (!info.isFile()) throw new Error(`Unsupported project entry during migration: ${source}`)
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
}

async function walk(root: string, visit: (file: string) => Promise<void>): Promise<void> {
  const info = await lstat(root)
  if (info.isSymbolicLink()) throw new Error(`Project inventory does not follow symbolic links: ${root}`)
  if (info.isFile()) {
    await visit(root)
    return
  }
  if (!info.isDirectory()) throw new Error(`Unsupported project entry: ${root}`)
  const entries = await readdir(root)
  for (const entry of entries) await walk(path.join(root, entry), visit)
}

async function writeMigratedProjectConfig(root: string, config: ProjectConfig): Promise<void> {
  const projectFile = projectPaths(root).projectFile
  const raw = await readText(projectFile)
  const data = parseMarkdown<Record<string, unknown>>(`---\n${raw}\n---\n`).data
  const id = config.id || stableProjectId(String(data['title'] ?? path.basename(root)))
  const upgraded = data['schema_version'] === 2 ? config : migrateProjectConfigV1(data, id, config.aliases)
  await atomicWriteText(projectFile, `${objectToYaml({ ...data, ...upgraded })}\n`)
}

async function atomicWriteText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  await writeFile(temporary, content, 'utf8')
  await rename(temporary, file)
}

function assertFingerprintsEqual(
  source: ProjectFileFingerprint[],
  target: ProjectFileFingerprint[],
  allowedChanges: Set<string>
): void {
  const targetByPath = new Map(target.map((item) => [item.path, item]))
  for (const sourceFile of source) {
    const targetFile = targetByPath.get(sourceFile.path)
    if (!targetFile) throw new Error(`Migration verification failed: missing ${sourceFile.path}`)
    if (
      !allowedChanges.has(sourceFile.path) &&
      (sourceFile.bytes !== targetFile.bytes || sourceFile.sha256 !== targetFile.sha256)
    ) {
      throw new Error(`Migration verification failed: content changed at ${sourceFile.path}`)
    }
  }
  for (const targetFile of target) {
    if (!source.some((sourceFile) => sourceFile.path === targetFile.path)) {
      throw new Error(`Migration verification failed: unexpected ${targetFile.path}`)
    }
  }
}

function migrationStages(completed: MigrationStageName[]): MigrationStage[] {
  const complete = new Set(completed)
  return (['dry-run', 'backup', 'apply', 'verify', 'report'] as const).map((name) => ({
    name,
    status: complete.has(name) ? 'completed' : 'pending'
  }))
}

function defaultBackupRoot(sourceRoot: string): string {
  return path.join(
    path.dirname(sourceRoot),
    '.quillarium-migration-backups',
    `${path.basename(sourceRoot)}-${Date.now()}`
  )
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, '/')
}

function isGitMetadataPath(relativePath: string): boolean {
  return normalizeRelative(relativePath)
    .split('/')
    .some((segment) => segment.toLocaleLowerCase('en-US') === '.git')
}
