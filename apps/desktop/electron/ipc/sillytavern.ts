import { dialog, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'
import {
  importBookCharacterCardIntoProject,
  inspectBookCharacterCard,
  importCharacterCard,
  writeBookCharacterCardV3Png,
  writeCharacterCardV2File,
  writeWorldInfoFile,
  type CharacterCardImportResult,
  type CharacterCardWriteResult,
  type WorldInfoWriteResult
} from '@quillarium/sillytavern'
import { getWorkspaceDir, updateProjectConfig } from '@quillarium/core'
import { typedHandle } from './contract.js'
import { createLocalWorkspaceProject } from './local-workspace.js'
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
    const inspection = await inspectBookCharacterCard(sourcePath)
    const chosenTitle = title.trim() || inspection.name.trim()
    if (!chosenTitle) throw new Error('CCV3_BOOK_TITLE_REQUIRED')
    const project = await createLocalWorkspaceProject(workspaceRoot, { title: chosenTitle })
    const imported = await importBookCharacterCardIntoProject(project.root, sourcePath)
    if (inspection.hasPngCover) await saveProjectCover(project.root, sourcePath)
    const configured = await updateProjectConfig(project.root, { title: chosenTitle })
    return { project: { root: project.root, ...configured }, import: imported }
  })
  typedHandle('st:exportBookCard', async (_event, root, options) =>
    writeBookCharacterCardV3Png(root, options)
  )
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
