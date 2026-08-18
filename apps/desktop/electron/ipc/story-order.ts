import { reorderStorySiblings } from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerStoryOrderHandlers(): void {
  typedHandle('story:reorder', async (_event, root, input) => reorderStorySiblings(root, input))
}
