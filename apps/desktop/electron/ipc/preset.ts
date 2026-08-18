import {
  clearBookGenerationHeader,
  initializeDefaultWritingPreset,
  listWritingPresets,
  loadBookGenerationHeader,
  saveBookGenerationHeader,
  selectWritingPreset
} from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerPresetHandlers(): void {
  typedHandle('preset:list', async (_event, root) => listWritingPresets(root))
  typedHandle('preset:initializeDefault', async (_event, root) => initializeDefaultWritingPreset(root))
  typedHandle('preset:select', async (_event, root, id) => selectWritingPreset(root, id))
  typedHandle('prompt:bookHeaderGet', async (_event, root) => loadBookGenerationHeader(root))
  typedHandle('prompt:bookHeaderSave', async (_event, root, text) => saveBookGenerationHeader(root, text))
  typedHandle('prompt:bookHeaderClear', async (_event, root) => clearBookGenerationHeader(root))
}
