import { initializeDefaultWritingPreset, listWritingPresets, selectWritingPreset } from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerPresetHandlers(): void {
  typedHandle('preset:list', async (_event, root) => listWritingPresets(root))
  typedHandle('preset:initializeDefault', async (_event, root) => initializeDefaultWritingPreset(root))
  typedHandle('preset:select', async (_event, root, id) => selectWritingPreset(root, id))
}
