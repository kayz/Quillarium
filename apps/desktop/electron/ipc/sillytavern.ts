import { dialog, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import {
  importBookCharacterCardIntoProject,
  inspectBookCharacterCard,
  importCharacterCard,
  writeBookCharacterCardV3Png,
  writeCharacterCardV2File,
  writeWorldInfoFile,
  type CharacterCardImportResult,
  type CharacterCardWriteResult,
  type BookCharacterCardImportResult,
  type BookCharacterCardInspection,
  type WorldInfoWriteResult
} from '@quillarium/sillytavern'
import {
  createProjectAt,
  getWorkspaceDir,
  listDocs,
  loadProject,
  loadWorkspace,
  objectToYaml,
  pathExists,
  readText,
  registerWorkspaceProject,
  resolveWorkspacePath,
  stableProjectId,
  writeText,
  type DocumentIdentity
} from '@quillarium/core'
import { typedHandle, type ImportedBookProject } from './contract.js'
import { saveProjectCover } from './cover.js'

export interface SillyTavernDialog {
  showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>
}

export type CharacterCardImporter = (root: string, filePath: string) => Promise<CharacterCardImportResult>

export type CharacterCardWriter = (root: string, characterId: string) => Promise<CharacterCardWriteResult>

export type LorebookWriter = (root: string) => Promise<WorldInfoWriteResult>

export interface SillyTavernImportDependencies {
  dialog: SillyTavernDialog
  importer: CharacterCardImporter
}

const importDependencies: SillyTavernImportDependencies = {
  dialog,
  importer: importCharacterCard
}

export function registerSillyTavernHandlers(): void {
  typedHandle('st:importCard', async (_event, root, filePath) => importSillyTavernCard(root, filePath))
  typedHandle('st:exportCard', async (_event, root, characterId) => exportSillyTavernCard(root, characterId))
  typedHandle('st:exportLorebook', async (_event, root) => exportSillyTavernLorebook(root))
  typedHandle('st:chooseBookCard', async () => chooseBookCharacterCard())
  typedHandle('st:importBookProject', async (_event, sourcePath, title) => {
    const workspaceRoot = await getWorkspaceDir()
    if (!workspaceRoot) throw new Error('请先注册写作工作区，再从角色卡新建小说。')
    return importBookProjectFromCard(workspaceRoot, sourcePath, title)
  })
  typedHandle('st:exportBookCard', async (_event, root, options) =>
    writeBookCharacterCardV3Png(root, options)
  )
}

export interface BookProjectImportDependencies {
  inspect?: (sourcePath: string) => Promise<BookCharacterCardInspection>
  importCard?: (
    projectRoot: string,
    sourcePath: string,
    options: { title?: string }
  ) => Promise<BookCharacterCardImportResult>
  saveCover?: typeof saveProjectCover
  registerProject?: typeof registerWorkspaceProject
}

export async function importBookProjectFromCard(
  workspaceRoot: string,
  sourcePath: string,
  title: string,
  dependencies: BookProjectImportDependencies = {}
): Promise<ImportedBookProject> {
  const inspect = dependencies.inspect ?? inspectBookCharacterCard
  const importCard = dependencies.importCard ?? importBookCharacterCardIntoProject
  const saveCover = dependencies.saveCover ?? saveProjectCover
  const registerProject = dependencies.registerProject ?? registerWorkspaceProject
  const [workspace, inspection] = await Promise.all([loadWorkspace(workspaceRoot), inspect(sourcePath)])
  const chosenTitle = title.trim() || inspection.name.trim()
  if (!chosenTitle) throw new Error('CCV3_BOOK_TITLE_REQUIRED')
  const id = stableProjectId(chosenTitle)
  if (workspace.manifest.projects.some((project) => project.id === id)) {
    throw new Error(`Duplicate workspace project id: ${id}`)
  }
  const projectsDirectory = resolveWorkspacePath(
    workspace.root,
    workspace.manifest.projects_dir,
    'projects_dir'
  )
  const relativePath = path.posix.join(workspace.manifest.projects_dir.replace(/\\/gu, '/'), id)
  const finalRoot = resolveWorkspacePath(workspace.root, relativePath, `project ${id}`)
  if (await pathExists(finalRoot)) throw new Error(`Project already exists: ${finalRoot}`)

  const transactionId = randomUUID()
  const temporaryRoot = path.join(projectsDirectory, `.${id}.ccv3-import-${transactionId}`)
  const markerRelative = '.quillarium/ccv3-import-transaction.json'
  const markerPath = path.join(temporaryRoot, ...markerRelative.split('/'))
  const manifestBefore = await readText(workspace.manifest_path)
  let movedToFinal = false
  let registrationStarted = false
  let finalOwnershipVerified = false
  try {
    if (await pathExists(temporaryRoot)) throw new Error(`Temporary project already exists: ${temporaryRoot}`)
    await writeText(
      markerPath,
      `${JSON.stringify({ schema_version: 1, transaction_id: transactionId, project_id: id }, null, 2)}\n`
    )
    await createProjectAt(temporaryRoot, { id, title: chosenTitle })
    const imported = await importCard(temporaryRoot, sourcePath, { title: chosenTitle })
    if (inspection.hasPngCover) await saveCover(temporaryRoot, sourcePath)
    await verifyImportedBookProject(temporaryRoot, chosenTitle, inspection, imported)
    await rename(temporaryRoot, finalRoot)
    movedToFinal = true
    registrationStarted = true
    const registered = await registerProject(workspace.root, { id, path: relativePath })
    finalOwnershipVerified = await ownsImportTransaction(finalRoot, markerRelative, transactionId)
    if (!finalOwnershipVerified) throw new Error('CCV3_IMPORT_TRANSACTION_MARKER_MISMATCH')
    await rm(path.join(finalRoot, ...markerRelative.split('/')), { force: true })
    return {
      project: { root: registered.root, ...registered.config },
      import: {
        ...imported,
        projectRoot: finalRoot,
        archivePath: rebaseImportPath(imported.archivePath, temporaryRoot, finalRoot)
      }
    }
  } catch (error) {
    const cleanupErrors: unknown[] = []
    if (registrationStarted) {
      await removeFailedWorkspaceRegistration(
        workspace.root,
        workspace.manifest_path,
        manifestBefore,
        id,
        relativePath
      ).catch((cause) => cleanupErrors.push(cause))
    }
    const transactionRoot = movedToFinal ? finalRoot : temporaryRoot
    if (
      finalOwnershipVerified ||
      (await ownsImportTransaction(transactionRoot, markerRelative, transactionId))
    ) {
      await rm(transactionRoot, { recursive: true, force: true }).catch((cause) => cleanupErrors.push(cause))
    }
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], 'CCv3 project import rollback was incomplete.', {
        cause: error
      })
    }
    throw error
  }
}

async function removeFailedWorkspaceRegistration(
  workspaceRoot: string,
  manifestPath: string,
  manifestBefore: string,
  projectId: string,
  relativePath: string
): Promise<void> {
  const currentRaw = await readText(manifestPath)
  if (currentRaw === manifestBefore) return
  try {
    const current = await loadWorkspace(workspaceRoot)
    const projects = current.manifest.projects.filter(
      (project) => !(project.id === projectId && project.path.replace(/\\/gu, '/') === relativePath)
    )
    if (projects.length === current.manifest.projects.length) return
    await writeText(
      manifestPath,
      `${objectToYaml({ ...current.manifest, projects } as unknown as Record<string, unknown>)}\n`
    )
  } catch {
    await writeText(manifestPath, manifestBefore)
  }
}

async function verifyImportedBookProject(
  projectRoot: string,
  title: string,
  inspection: BookCharacterCardInspection,
  imported: BookCharacterCardImportResult
): Promise<void> {
  const project = await loadProject(projectRoot)
  if (project.title !== title) throw new Error('CCV3_BOOK_PROJECT_TITLE_VERIFICATION_FAILED')
  const documents = await listDocs<DocumentIdentity>(projectRoot)
  const documentIds = new Set(documents.map((document) => document.data.id))
  if (imported.candidateDocumentIds.some((id) => !documentIds.has(id))) {
    throw new Error('CCV3_BOOK_PROJECT_DOCUMENT_VERIFICATION_FAILED')
  }
  if (
    documents.some(
      (document) =>
        ['outline', 'scene', 'chapter_prose'].includes(document.data.type) ||
        !['draft', 'candidate'].includes(
          String((document.data as DocumentIdentity & { status?: string }).status ?? '')
        )
    )
  ) {
    throw new Error('CCV3_BOOK_PROJECT_MUST_CONTAIN_ONLY_REVIEWABLE_SETTINGS')
  }
  const archive = await readFile(imported.archivePath)
  const archiveSha256 = createHash('sha256').update(archive).digest('hex')
  if (archiveSha256 !== imported.sourceSha256) throw new Error('CCV3_BOOK_PROJECT_ARCHIVE_HASH_MISMATCH')
  if (inspection.hasPngCover) {
    const configuredCover = project.cover?.thumbnail_path
    if (!configuredCover || !(await pathExists(path.join(projectRoot, ...configuredCover.split('/'))))) {
      throw new Error('CCV3_BOOK_PROJECT_COVER_VERIFICATION_FAILED')
    }
  }
}

async function ownsImportTransaction(
  projectRoot: string,
  markerRelative: string,
  transactionId: string
): Promise<boolean> {
  const marker = path.join(projectRoot, ...markerRelative.split('/'))
  if (!(await pathExists(marker))) return false
  try {
    const parsed = JSON.parse(await readText(marker)) as { transaction_id?: string }
    return parsed.transaction_id === transactionId
  } catch {
    return false
  }
}

function rebaseImportPath(value: string, fromRoot: string, toRoot: string): string {
  const relative = path.relative(path.resolve(fromRoot), path.resolve(value))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return value
  return path.join(toRoot, relative)
}

export async function chooseBookCharacterCard() {
  const selection = await dialog.showOpenDialog({
    title: '从 SillyTavern CCv3 角色卡新建小说',
    properties: ['openFile'],
    filters: [{ name: 'CCv3 Character Card', extensions: ['json', 'png'] }]
  })
  if (selection.canceled || !selection.filePaths[0]) return null
  return inspectBookCharacterCard(selection.filePaths[0])
}

export async function importSillyTavernCard(
  root: string,
  filePath?: string,
  dependencies: SillyTavernImportDependencies = importDependencies
): Promise<CharacterCardImportResult | null> {
  let selectedPath = filePath
  if (selectedPath === undefined) {
    const selection = await dependencies.dialog.showOpenDialog({
      title: '导入 SillyTavern 角色卡',
      defaultPath: root,
      properties: ['openFile'],
      filters: [{ name: 'SillyTavern Character Card', extensions: ['json', 'png'] }]
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    selectedPath = selection.filePaths[0]
  }

  try {
    return await dependencies.importer(root, selectedPath)
  } catch (cause) {
    throw new Error(
      `Could not import SillyTavern Character Card from ${selectedPath}: ${errorMessage(cause)}`,
      { cause }
    )
  }
}

export async function exportSillyTavernCard(
  root: string,
  characterId: string,
  writer: CharacterCardWriter = writeCharacterCardV2File
): Promise<CharacterCardWriteResult> {
  return writer(root, characterId)
}

export async function exportSillyTavernLorebook(
  root: string,
  writer: LorebookWriter = writeWorldInfoFile
): Promise<WorldInfoWriteResult> {
  return writer(root)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
