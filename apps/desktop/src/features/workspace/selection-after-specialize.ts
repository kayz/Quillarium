import type { DocEntry, TargetSelection } from '../../app/types.js'

export interface SpecializePlanningCardResult {
  path: string
  data: Record<string, unknown> & { id: string; type: string }
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
      data: result.data as DocEntry['data'],
      content: result.content
    }
  }
}
