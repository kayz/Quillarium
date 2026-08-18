import { createHash } from 'node:crypto'
import { listDocs } from './documents.js'
import { readText, writeMarkdown, writeText } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { OutlineDoc, SceneDoc } from './types.js'

export type StoryNodeKind = 'outline' | 'scene'

export interface StoryNodeRef {
  kind: StoryNodeKind
  id: string
}

export interface StorySiblingExpectation extends StoryNodeRef {
  order: number
}

export type ReorderStorySiblingsRequest = {
  node: StoryNodeRef
  expected_siblings: StorySiblingExpectation[]
} & ({ direction: 'up' | 'down' } | { target: StoryNodeRef; placement: 'before' | 'after' })

export interface StoryOrderResult {
  parent_id: string | null
  siblings: StorySiblingExpectation[]
}

export interface StoryOrderDependencies {
  /** Test-only fault injection. Production callers must omit it. */
  beforeWrite?: (entry: StorySiblingExpectation, index: number) => void | Promise<void>
}

interface StoredStoryNode {
  kind: StoryNodeKind
  id: string
  parentId: string | null
  order: number
  title: string
  path: string
  data: OutlineDoc | SceneDoc
  content: string
  raw: string
  sha256: string
}

const REORDERABLE_OUTLINE_LEVELS = new Set<OutlineDoc['level']>(['volume', 'part', 'arc', 'act', 'chapter'])

export function compareStoryOrder(
  left: { order?: number; id: string; path?: string },
  right: { order?: number; id: string; path?: string }
): number {
  const order = normalizedOrder(left.order) - normalizedOrder(right.order)
  if (order) return order
  const id = left.id.localeCompare(right.id, 'en', { numeric: true })
  return id || String(left.path ?? '').localeCompare(String(right.path ?? ''), 'en', { numeric: true })
}

export function compareOutlineStoryPosition(
  left: Pick<OutlineDoc, 'id' | 'parent' | 'order'>,
  right: Pick<OutlineDoc, 'id' | 'parent' | 'order'>,
  byId: ReadonlyMap<string, Pick<OutlineDoc, 'id' | 'parent' | 'order'>>
): number {
  const leftPath = outlineStoryPath(left, byId)
  const rightPath = outlineStoryPath(right, byId)
  const sharedLength = Math.min(leftPath.length, rightPath.length)
  for (let index = 0; index < sharedLength; index += 1) {
    const compared = compareStoryOrder(leftPath[index]!, rightPath[index]!)
    if (compared) return compared
  }
  return leftPath.length - rightPath.length || left.id.localeCompare(right.id, 'en', { numeric: true })
}

export async function nextStorySiblingOrder(projectRoot: string, parentId: string | null): Promise<number> {
  const nodes = await loadStoryNodes(projectRoot)
  const siblings = nodes.filter((node) => node.parentId === parentId && isReorderable(node))
  return siblings.length ? Math.max(...siblings.map((node) => normalizedOrder(node.order))) + 1 : 0
}

export async function reorderStorySiblings(
  projectRoot: string,
  request: ReorderStorySiblingsRequest,
  dependencies: StoryOrderDependencies = {}
): Promise<StoryOrderResult> {
  return withProjectWriteLock(projectRoot, async () => {
    const all = await loadStoryNodes(projectRoot)
    const node = requireReorderableNode(all, request.node)
    const siblings = all
      .filter((candidate) => candidate.parentId === node.parentId && isReorderable(candidate))
      .sort(compareStoredStoryNodes)
    assertExpectedSiblings(siblings, request.expected_siblings)

    const from = siblings.findIndex((candidate) => sameRef(candidate, request.node))
    if (from < 0) throw new Error('STORY_ORDER_NODE_NOT_FOUND: selected node is not a direct sibling.')
    const reordered = [...siblings]
    const [moving] = reordered.splice(from, 1)
    if (!moving) throw new Error('STORY_ORDER_NODE_NOT_FOUND: selected node is unavailable.')
    let insertAt: number
    if ('direction' in request) {
      insertAt = request.direction === 'up' ? Math.max(0, from - 1) : Math.min(reordered.length, from + 1)
    } else {
      const target = requireReorderableNode(all, request.target)
      if (target.parentId !== node.parentId) {
        throw new Error('STORY_ORDER_CROSS_PARENT: nodes must share the same direct parent.')
      }
      const targetIndex = reordered.findIndex((candidate) => sameRef(candidate, request.target))
      if (targetIndex < 0) throw new Error('STORY_ORDER_TARGET_NOT_FOUND: drop target is not a sibling.')
      insertAt = request.placement === 'before' ? targetIndex : targetIndex + 1
    }
    reordered.splice(insertAt, 0, moving)

    const written: StoredStoryNode[] = []
    try {
      for (const [index, candidate] of reordered.entries()) {
        if (candidate.order === index) continue
        const currentRaw = await readText(candidate.path)
        if (sha256(currentRaw) !== candidate.sha256) {
          throw new Error(`STORY_ORDER_HASH_CONFLICT: ${candidate.kind}:${candidate.id} changed on disk.`)
        }
        await dependencies.beforeWrite?.(
          { kind: candidate.kind, id: candidate.id, order: index },
          written.length
        )
        await writeMarkdown(
          candidate.path,
          { ...candidate.data, order: index } as unknown as Record<string, unknown>,
          candidate.content
        )
        written.push(candidate)
      }
      const verified = await loadStoryNodes(projectRoot)
      const verifiedSiblings = verified
        .filter((candidate) => candidate.parentId === node.parentId && isReorderable(candidate))
        .sort(compareStoredStoryNodes)
      const expectedIds = reordered.map(storyRefKey)
      const actualIds = verifiedSiblings.map(storyRefKey)
      if (
        expectedIds.join('\n') !== actualIds.join('\n') ||
        verifiedSiblings.some((candidate, index) => candidate.order !== index)
      ) {
        throw new Error('STORY_ORDER_VERIFY_FAILED: persisted sibling order did not verify.')
      }
      return {
        parent_id: node.parentId,
        siblings: verifiedSiblings.map((candidate) => ({
          kind: candidate.kind,
          id: candidate.id,
          order: candidate.order
        }))
      }
    } catch (cause) {
      const rollbackFailures: unknown[] = []
      for (const candidate of [...written].reverse()) {
        await writeText(candidate.path, candidate.raw).catch((error) => rollbackFailures.push(error))
      }
      if (rollbackFailures.length) {
        throw new AggregateError(
          [cause, ...rollbackFailures],
          'STORY_ORDER_ROLLBACK_FAILED: reorder failed and rollback was incomplete.',
          { cause }
        )
      }
      throw cause
    }
  })
}

async function loadStoryNodes(projectRoot: string): Promise<StoredStoryNode[]> {
  const [outlines, scenes] = await Promise.all([
    listDocs<OutlineDoc>(projectRoot, 'outline'),
    listDocs<SceneDoc>(projectRoot, 'scene')
  ])
  return Promise.all([
    ...outlines.map(async (document): Promise<StoredStoryNode> => {
      const raw = await readText(document.path)
      return {
        kind: 'outline',
        id: document.data.id,
        parentId: document.data.parent ?? null,
        order: normalizedOrder(document.data.order),
        title: document.data.title,
        path: document.path,
        data: document.data,
        content: document.content,
        raw,
        sha256: sha256(raw)
      }
    }),
    ...scenes.map(async (document): Promise<StoredStoryNode> => {
      const raw = await readText(document.path)
      return {
        kind: 'scene',
        id: document.data.id,
        parentId: document.data.chapter_id || document.data.section || null,
        order: normalizedOrder(document.data.order),
        title: document.data.title,
        path: document.path,
        data: document.data,
        content: document.content,
        raw,
        sha256: sha256(raw)
      }
    })
  ])
}

function requireReorderableNode(nodes: StoredStoryNode[], ref: StoryNodeRef): StoredStoryNode {
  const node = nodes.find((candidate) => sameRef(candidate, ref))
  if (!node) throw new Error(`STORY_ORDER_NODE_NOT_FOUND: ${ref.kind}:${ref.id}`)
  if (!isReorderable(node)) throw new Error(`STORY_ORDER_NODE_TYPE_INVALID: ${ref.kind}:${ref.id}`)
  return node
}

function isReorderable(node: StoredStoryNode): boolean {
  return node.kind === 'scene' || REORDERABLE_OUTLINE_LEVELS.has((node.data as OutlineDoc).level)
}

function assertExpectedSiblings(actual: StoredStoryNode[], expected: StorySiblingExpectation[]): void {
  const actualState = actual
    .map((node) => `${storyRefKey(node)}:${node.order}`)
    .sort((left, right) => left.localeCompare(right, 'en'))
  const expectedState = expected
    .map((node) => `${storyRefKey(node)}:${normalizedOrder(node.order)}`)
    .sort((left, right) => left.localeCompare(right, 'en'))
  if (actualState.join('\n') !== expectedState.join('\n')) {
    throw new Error('STORY_ORDER_CONFLICT: sibling membership or order changed; reload before reordering.')
  }
}

function compareStoredStoryNodes(left: StoredStoryNode, right: StoredStoryNode): number {
  return compareStoryOrder(left, right)
}

function sameRef(left: Pick<StoredStoryNode, 'kind' | 'id'>, right: StoryNodeRef): boolean {
  return left.kind === right.kind && left.id === right.id
}

function storyRefKey(value: { kind: StoryNodeKind; id: string }): string {
  return `${value.kind}:${value.id}`
}

function normalizedOrder(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function outlineStoryPath(
  node: Pick<OutlineDoc, 'id' | 'parent' | 'order'>,
  byId: ReadonlyMap<string, Pick<OutlineDoc, 'id' | 'parent' | 'order'>>
): Array<Pick<OutlineDoc, 'id' | 'parent' | 'order'>> {
  const path: Array<Pick<OutlineDoc, 'id' | 'parent' | 'order'>> = []
  const seen = new Set<string>()
  let current: Pick<OutlineDoc, 'id' | 'parent' | 'order'> | undefined = node
  while (current && !seen.has(current.id)) {
    path.unshift(current)
    seen.add(current.id)
    current = current.parent ? byId.get(current.parent) : undefined
  }
  return path
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
