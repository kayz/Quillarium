import { rm } from 'node:fs/promises'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { createOutline, listDocs } from './documents.js'
import { pathExists, readMarkdown } from './fs.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { OutlineDoc } from './types.js'

export const NO_OUTLINE_SELECTION = '没有选中大纲节点，不能整理。'
export const CHAPTER_IS_LEAF = '当前选中的是章，不能再创建下级。'
export const NO_SCENE_NODES = '整理大纲不能创建节。'
export const OUTLINE_OUTSIDE_SELECTION = '大纲节点不在整理选区内。'

export async function loadOutlineSubtreeForOrganize(
  projectRoot: string,
  outlineId: string
): Promise<{
  root: { id: string; level: string; title: string }
  member_ids: string[]
  members: Array<{
    path: string
    data: { id: string; level: string; parent: string | null; title: string }
    content: string
  }>
} | null> {
  const outlines = await listDocs<OutlineDoc>(projectRoot, 'outline')
  const rootDoc = outlines.find((item) => item.data.id === outlineId)
  if (!rootDoc) return null

  const byParent = new Map<string, typeof outlines>()
  for (const item of outlines) {
    if (item.data.level === 'section') continue
    const parentId = item.data.parent
    if (!parentId) continue
    const bucket = byParent.get(parentId)
    if (bucket) bucket.push(item)
    else byParent.set(parentId, [item])
  }

  const members: Array<{
    path: string
    data: { id: string; level: string; parent: string | null; title: string }
    content: string
  }> = []
  const memberIds: string[] = []
  const queue = [rootDoc]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current.data.id)) continue
    seen.add(current.data.id)

    members.push({
      path: current.path,
      data: {
        id: current.data.id,
        level: current.data.level,
        parent: current.data.parent ?? null,
        title: current.data.title
      },
      content: current.content
    })
    memberIds.push(current.data.id)

    for (const child of byParent.get(current.data.id) ?? []) {
      queue.push(child)
    }
  }

  return {
    root: {
      id: rootDoc.data.id,
      level: rootDoc.data.level,
      title: rootDoc.data.title
    },
    member_ids: memberIds,
    members
  }
}

export interface OutlineOrganizeProposalSet {
  eval_id: string
  outline_id: string
  creates: Array<{
    proposal_id: string
    title: string
    level: 'volume' | 'part' | 'act' | 'chapter'
    parent_id: string
  }>
}

export async function applyOutlineOrganize(
  projectRoot: string,
  proposals: OutlineOrganizeProposalSet,
  decisions: { confirmed: boolean; creates: string[] }
): Promise<{ outline_ids: string[] }> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const createdPaths: string[] = []
    const outlineIds: string[] = []

    const rollbackCreated = async () => {
      for (const file of [...createdPaths].reverse()) {
        if (await pathExists(file)) await rm(file, { force: true })
      }
    }

    try {
      const subtree = await loadOutlineSubtreeForOrganize(projectRoot, proposals.outline_id)
      if (!subtree) throw new Error(OUTLINE_OUTSIDE_SELECTION)
      const memberIds = new Set(subtree.member_ids)

      for (const proposalId of decisions.creates) {
        const proposal = proposals.creates.find((item) => item.proposal_id === proposalId)
        if (!proposal) throw new Error(`找不到大纲提案：${proposalId}`)

        const level = String(proposal.level)
        if (level === 'section' || level === 'scene') {
          throw new Error(NO_SCENE_NODES)
        }

        if (!memberIds.has(proposal.parent_id)) {
          throw new Error(OUTLINE_OUTSIDE_SELECTION)
        }

        const file = await createOutline(
          projectRoot,
          proposal.level,
          proposal.title,
          { parent: proposal.parent_id },
          ''
        )
        createdPaths.push(file)
        const written = await readMarkdown<{ id: string }>(file)
        outlineIds.push(written.data.id)
        memberIds.add(written.data.id)
      }

      return { outline_ids: outlineIds }
    } catch (error) {
      await rollbackCreated()
      throw error
    }
  })
}
