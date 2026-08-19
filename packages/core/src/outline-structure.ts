import { listDocs } from './documents.js'
import { loadProject } from './project.js'
import {
  allowedParentLevels,
  assertOutlinePlacementAgainst,
  inferUniqueLegacyOutlineParent,
  normalizeOutlineLevel,
  type CurrentOutlineLevel
} from './outline-rules.js'
import type { OutlineDoc, OutlineLevelInput } from './types.js'

export {
  allowedParentLevels,
  assertOutlinePlacementAgainst,
  inferUniqueLegacyOutlineParent,
  normalizeOutlineLevel
}
export type { CurrentOutlineLevel }

export async function assertOutlinePlacement(
  projectRoot: string,
  levelInput: OutlineLevelInput,
  parentId: string | null,
  currentId?: string
): Promise<void> {
  const [outlines, project] = await Promise.all([
    listDocs<OutlineDoc>(projectRoot, 'outline'),
    loadProject(projectRoot)
  ])
  assertOutlinePlacementAgainst(
    outlines.map((item) => item.data),
    levelInput,
    parentId,
    currentId,
    project.story_structure
  )
}
