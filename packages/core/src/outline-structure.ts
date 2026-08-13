import { listDocs } from './documents.js'
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
  const outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
  assertOutlinePlacementAgainst(
    outlines.map((item) => item.data),
    levelInput,
    parentId,
    currentId
  )
}
