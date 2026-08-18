import {
  applyDocumentReferenceMigration,
  formatObsidianDocumentLink,
  listDocs,
  planDocumentReferenceMigration,
  loadLocalDocumentLinkIndex,
  rebuildLocalDocumentLinkIndex
} from '@quillarium/core'
import type { DocumentIdentity } from '@quillarium/core'
import { typedHandle } from './contract.js'

export function registerReferenceHandlers(): void {
  typedHandle('references:index', async (_event, root) => loadLocalDocumentLinkIndex(root))
  typedHandle('references:format', async (_event, root, documentId, displayText) => {
    const document = (await listDocs<DocumentIdentity>(root)).find(
      (candidate) => candidate.data.id === documentId
    )
    if (!document) throw new Error(`Document not found: ${documentId}`)
    return formatObsidianDocumentLink(document, root, displayText ?? document.data.title)
  })
  typedHandle('references:migrationPlan', async (_event, root) => planDocumentReferenceMigration(root))
  typedHandle('references:migrationApply', async (_event, root, plan) => {
    const report = await applyDocumentReferenceMigration(root, plan)
    await rebuildLocalDocumentLinkIndex(root)
    return report
  })
}
