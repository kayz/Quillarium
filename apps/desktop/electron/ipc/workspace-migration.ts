import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  loadProject,
  loadWorkspace,
  migrateProjectLayout,
  planProjectMigration,
  registerWorkspaceProject,
  resolveWorkspacePath,
  stableProjectId,
  type ProjectMigrationReport,
  type WorkspaceProjectRef
} from '@quillarium/core'

export interface PreparedLegacyProjectMigration {
  sourceRoot: string
  workspaceRoot: string
  projectRef: WorkspaceProjectRef
  targetRoot: string
  backupRoot: string
  title: string
  aliases: string[]
  dryRun: ProjectMigrationReport
}

export interface AppliedLegacyProjectMigration extends PreparedLegacyProjectMigration {
  applied: ProjectMigrationReport
  reportPath: string
}

export async function prepareLegacyProjectMigration(
  sourceRoot: string,
  workspaceRoot: string,
  options: { id?: string; aliases?: string[]; backupRoot?: string; timestamp?: number } = {}
): Promise<PreparedLegacyProjectMigration> {
  const source = path.resolve(sourceRoot)
  const workspace = await loadWorkspace(path.resolve(workspaceRoot))
  const legacy = await loadProject(source)
  const id = options.id ?? legacy.id ?? stableProjectId(legacy.title)
  if (stableProjectId(id) !== id) throw new Error(`项目 ID 必须是路径安全的小写 slug：${id}`)
  if (workspace.manifest.projects.some((item) => item.id === id)) {
    throw new Error(`写作工作区已注册同名项目 ID：${id}`)
  }

  const relativePath = path.posix.join(workspace.manifest.projects_dir.replace(/\\/g, '/'), id)
  const targetRoot = resolveWorkspacePath(workspace.root, relativePath, `project ${id}`)
  const timestamp = options.timestamp ?? Date.now()
  const backupRoot = path.resolve(
    options.backupRoot ??
      path.join(
        path.dirname(source),
        '.quillarium-migration-backups',
        `${path.basename(source)}-${timestamp}`
      )
  )
  const aliases = options.aliases ?? legacy.aliases
  const dryRun = await planProjectMigration({
    source_root: source,
    target_root: targetRoot,
    backup_root: backupRoot,
    id,
    aliases
  })

  return {
    sourceRoot: source,
    workspaceRoot: workspace.root,
    projectRef: { id, path: relativePath },
    targetRoot,
    backupRoot,
    title: legacy.title,
    aliases,
    dryRun
  }
}

export async function applyLegacyProjectMigration(
  prepared: PreparedLegacyProjectMigration
): Promise<AppliedLegacyProjectMigration> {
  const applied = await migrateProjectLayout({
    source_root: prepared.sourceRoot,
    target_root: prepared.targetRoot,
    backup_root: prepared.backupRoot,
    id: prepared.projectRef.id,
    aliases: prepared.aliases
  })

  const reportDir = path.join(prepared.targetRoot, 'imports', 'migrations')
  await mkdir(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, 'legacy-layout-migration.json')
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        schema_version: 1,
        project: prepared.projectRef,
        source_root: applied.source_root,
        target_root: applied.target_root,
        backup_root: applied.backup_root,
        stages: applied.stages,
        source_file_count: applied.source_file_count,
        managed_file_count: applied.managed_file_count,
        target_file_count: applied.target_file_count,
        excluded_paths: applied.excluded_paths,
        invariant_paths: applied.invariant_paths,
        source_files: applied.source_files,
        target_files: applied.target_files,
        verified: applied.verified
      },
      null,
      2
    )}\n`,
    { encoding: 'utf8', flag: 'wx' }
  )

  try {
    await registerWorkspaceProject(prepared.workspaceRoot, prepared.projectRef)
  } catch (error) {
    throw new Error(
      `项目内容已无损复制并验证，但写作工作区注册失败；源、备份和目标均已保留。目标：${prepared.targetRoot}。${String(error)}`,
      { cause: error }
    )
  }

  return { ...prepared, applied, reportPath }
}
