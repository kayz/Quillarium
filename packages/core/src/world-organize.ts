import { rm } from 'node:fs/promises'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { specializePlanningCard } from './planning-specialize.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { DocumentIdentity, WorldEntryDoc } from './types.js'

export const WORLD_ENTRY_ONLY = '只能整理已启用的世界书。'

export interface WorldOrganizeProposalSet {
  eval_id: string
  creates: Array<{ proposal_id: string; title: string; content: string }>
  updates: Array<{ proposal_id: string; card_id: string; content: string }>
}

export async function applyWorldOrganize(
  projectRoot: string,
  proposals: WorldOrganizeProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  }
): Promise<{ created_ids: string[]; updated_ids: string[] }> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const createdPaths: string[] = []
    const restorations: Array<{ path: string; before: string }> = []
    const createdIds: string[] = []
    const updatedIds: string[] = []

    const rollback = async () => {
      for (const item of [...restorations].reverse()) {
        await writeText(item.path, item.before)
      }
      for (const file of [...createdPaths].reverse()) {
        if (await pathExists(file)) await rm(file, { force: true })
      }
    }

    try {
      for (const decision of decisions.creates) {
        const proposal = proposals.creates.find((item) => item.proposal_id === decision.proposal_id)
        if (!proposal) throw new Error(`找不到世界书提案：${decision.proposal_id}`)

        const targetType = decision.type ?? 'world_entry'
        const fields = decision.fields ?? {}
        const file = await createWorldEntry(projectRoot, proposal.title, {}, proposal.content)
        createdPaths.push(file)
        const created = await readMarkdown<{ id: string }>(file)
        let settingId = created.data.id

        if (targetType !== 'world_entry') {
          const specialized = await specializePlanningCard(projectRoot, settingId, targetType, fields)
          const trackedIndex = createdPaths.lastIndexOf(file)
          if (trackedIndex >= 0) createdPaths.splice(trackedIndex, 1)
          createdPaths.push(specialized.path)
          settingId = specialized.data.id
        }

        createdIds.push(settingId)
      }

      for (const decision of decisions.updates) {
        const proposal = proposals.updates.find((item) => item.proposal_id === decision.proposal_id)
        if (!proposal) throw new Error(`找不到世界书提案：${decision.proposal_id}`)

        const documents = await listDocs<DocumentIdentity>(projectRoot)
        const card = documents.find((item) => item.data.id === proposal.card_id)
        const world =
          card?.data.type === 'world_entry'
            ? (card as { path: string; data: WorldEntryDoc; content: string })
            : null
        if (!world || world.data.enabled === false) {
          throw new Error(WORLD_ENTRY_ONLY)
        }

        const originalPath = world.path
        const originalRaw = await readText(originalPath)
        await writeMarkdown(originalPath, world.data as unknown as Record<string, unknown>, proposal.content)
        restorations.push({ path: originalPath, before: originalRaw })

        let updatedId = proposal.card_id
        const targetType = decision.type
        if (targetType && targetType !== 'world_entry') {
          const fields = decision.fields ?? {}
          const specialized = await specializePlanningCard(projectRoot, updatedId, targetType, fields)
          if (specialized.path !== originalPath) {
            createdPaths.push(specialized.path)
          }
          updatedId = specialized.data.id
        }

        updatedIds.push(updatedId)
      }

      return { created_ids: createdIds, updated_ids: updatedIds }
    } catch (error) {
      await rollback()
      throw error
    }
  })
}
