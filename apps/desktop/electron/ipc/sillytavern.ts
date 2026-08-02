import { dialog, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'
import {
  importCharacterCard,
  writeCharacterCardV2File,
  writeWorldInfoFile,
  type CharacterCardImportResult,
  type CharacterCardWriteResult,
  type WorldInfoWriteResult
} from '@quillarium/sillytavern'
import { typedHandle } from './contract.js'

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
