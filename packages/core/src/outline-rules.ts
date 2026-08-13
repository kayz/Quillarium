import type { OutlineDoc, OutlineLevelInput } from './types.js'

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

export function normalizeOutlineLevel(level: OutlineLevelInput): NormalizedOutlineLevel {
  return level === 'arc' ? 'part' : level
}

export function allowedParentLevels(level: OutlineLevelInput): Array<OutlineDoc['level'] | null> {
  return ALLOWED_PARENTS[normalizeOutlineLevel(level)]
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
  currentId?: string
): string | null {
  if (parentId) return parentId
  const accepted = allowedParentLevels(levelInput).filter(
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
  currentId?: string
): void {
  const level = normalizeOutlineLevel(levelInput)
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
  const accepted = allowedParentLevels(level)
  if (!accepted.includes(parent.level)) {
    throw new Error(`${level} outline cannot belong to ${parent.level}; expected ${accepted.join(' or ')}.`)
  }
  if (parent.id === currentId) throw new Error('An outline cannot be its own parent.')
}
