import type { OutlineDoc, OutlineLevelInput, StoryStructureConfigV1 } from './types.js'

export type CurrentOutlineLevel = Exclude<OutlineDoc['level'], 'section' | 'arc'>
export type NormalizedOutlineLevel = Exclude<OutlineDoc['level'], 'arc'>

const ALLOWED_PARENTS: Record<CurrentOutlineLevel | 'section', Array<OutlineDoc['level'] | null>> = {
  overview: [null],
  book: [null],
  volume: ['book'],
  part: ['volume'],
  act: ['part'],
  chapter: ['part', 'act'],
  section: ['chapter']
}

export const DEFAULT_STORY_STRUCTURE: StoryStructureConfigV1 = Object.freeze({
  part_enabled: true,
  act_enabled: true,
  scene_enabled: true
})

export function normalizeOutlineLevel(level: OutlineLevelInput): NormalizedOutlineLevel {
  return level === 'arc' ? 'part' : level
}

export function allowedParentLevels(
  level: OutlineLevelInput,
  structure: StoryStructureConfigV1 = DEFAULT_STORY_STRUCTURE
): Array<OutlineDoc['level'] | null> {
  const normalized = normalizeOutlineLevel(level)
  if (normalized === 'part' && !structure.part_enabled) return []
  if (normalized === 'act' && (!structure.part_enabled || !structure.act_enabled)) return []
  if (normalized === 'chapter') {
    if (!structure.part_enabled) return ['volume']
    if (!structure.act_enabled) return ['part']
    return ['part', 'act']
  }
  return ALLOWED_PARENTS[normalized]
}

/**
 * Older imported outlines may predate explicit parent links. During an explicit
 * human save, a missing link can be repaired only when the project contains one
 * unambiguous legal parent. Ambiguous structures still require a user choice.
 */
export function inferUniqueLegacyOutlineParent(
  outlines: OutlineDoc[],
  levelInput: OutlineLevelInput,
  parentId: string | null,
  currentId?: string,
  structure: StoryStructureConfigV1 = DEFAULT_STORY_STRUCTURE
): string | null {
  if (parentId) return parentId
  const accepted = allowedParentLevels(levelInput, structure).filter(
    (level): level is OutlineDoc['level'] => level !== null
  )
  if (!accepted.length) return null
  const candidates = outlines.filter((item) => item.id !== currentId && accepted.includes(item.level))
  return candidates.length === 1 ? candidates[0].id : null
}

export function assertOutlinePlacementAgainst(
  outlines: OutlineDoc[],
  levelInput: OutlineLevelInput,
  parentId: string | null,
  currentId?: string,
  structure: StoryStructureConfigV1 = DEFAULT_STORY_STRUCTURE
): void {
  const level = normalizeOutlineLevel(levelInput)
  if (level === 'part' && !structure.part_enabled) {
    throw new Error('Part level is disabled for this project.')
  }
  if (level === 'act' && !structure.act_enabled) {
    throw new Error('Act level is disabled for this project.')
  }
  if ((level === 'overview' || level === 'book') && parentId !== null) {
    throw new Error(`${level} outline must be a top-level document.`)
  }
  if (level === 'overview' || level === 'book') {
    const duplicate = outlines.find((item) => item.level === level && item.id !== currentId)
    if (duplicate) throw new Error(`This project already has a ${level} document: ${duplicate.title}`)
    return
  }
  if (!parentId) throw new Error(`${level} outline requires a parent.`)
  const parent = outlines.find((item) => item.id === parentId)
  if (!parent) throw new Error(`Outline parent not found: ${parentId}`)
  const accepted = allowedParentLevels(level, structure)
  if (!accepted.includes(parent.level)) {
    throw new Error(`${level} outline cannot belong to ${parent.level}; expected ${accepted.join(' or ')}.`)
  }
  if (parent.id === currentId) throw new Error('An outline cannot be its own parent.')
}
