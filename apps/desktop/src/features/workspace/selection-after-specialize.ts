import type { DocumentIdentity } from '@quillarium/core'
import type { DocEntry, TargetSelection } from '../../app/types.js'

export interface SpecializePlanningCardResult {
  path: string
  data: DocumentIdentity
  content: string
}

export function selectionAfterSpecialize(result: SpecializePlanningCardResult): {
  selectedTarget: TargetSelection
  doc: DocEntry
} {
  return {
    selectedTarget: {
      type: String(result.data.type),
      id: String(result.data.id)
    },
    doc: {
      path: result.path,
      data: result.data as unknown as DocEntry['data'],
      content: result.content
    }
  }
}
