import { needsDisplayMigration, resetDisplayLayer, setDisplayLayerEnabled } from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerDisplayHandlers(): void {
  typedHandle('display:needsMigration', async (_event, root) => needsDisplayMigration(root))
  typedHandle('display:reset', async (_event, root) => resetDisplayLayer(root))
  typedHandle('display:setEnabled', async (_event, root, enabled) => setDisplayLayerEnabled(root, enabled))
}
