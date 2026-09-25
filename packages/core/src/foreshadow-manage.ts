import { rm } from 'node:fs/promises'
import { DISABLED_UPDATE_CARD } from './assistant-turn-apply.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { specializePlanningCard } from './planning-specialize.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { DocumentIdentity } from './types.js'

export const MISSING_FORESHADOW_CARD = '找不到要更新的伏笔卡。'
export const FORESHADOW_UNREFERENCED = '伏笔尚未被该节点引用，不能改埋设或回收。'
export const MISSING_FORESHADOW_PROPOSAL = (id: string) => `找不到伏笔提案：${id}`

export interface ForeshadowManageProposalSet {
  eval_id: string
  creates: Array<{
    proposal_id: string
    title: string
    content: string
    fields: Record<string, unknown>
  }>
  updates: Array<{
    proposal_id: string
    card_id: string
    content: string
    fields: Record<string, unknown>
  }>
  bindings: Array<{
    proposal_id: string
    foreshadowing_id: string
    document_id: string
    plant?: 'add' | 'remove'
    resolve?: 'add' | 'remove'
  }>
}

type BindingTargetData = DocumentIdentity & {
  enabled?: boolean
  related_foreshadowing?: string[]
  foreshadowing_planted?: string[]
  foreshadowing_resolved?: string[]
}

function referencesForeshadowing(data: BindingTargetData, id: string): boolean {
  return (
    (data.related_foreshadowing ?? []).includes(id) ||
    (data.foreshadowing_planted ?? []).includes(id) ||
    (data.foreshadowing_resolved ?? []).includes(id)
  )
}

function patchIdArray(values: string[] | undefined, id: string, action: 'add' | 'remove'): string[] {
  const current = values ?? []
  if (action === 'add') {
    if (current.includes(id)) return current
    return [...current, id]
  }
  return current.filter((item) => item !== id)
}

export async function applyForeshadowManage(
  projectRoot: string,
  proposals: ForeshadowManageProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    bindings: string[]
  }
): Promise<{ created_ids: string[]; updated_ids: string[]; binding_document_ids: string[] }> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const createdPaths: string[] = []
    const restorations: Array<{ path: string; before: string }> = []
    const createdIds: string[] = []
    const updatedIds: string[] = []
    const bindingDocumentIds: string[] = []

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
        if (!proposal) throw new Error(MISSING_FORESHADOW_PROPOSAL(decision.proposal_id))

        const fields = { ...proposal.fields, ...decision.fields }
        const file = await createWorldEntry(projectRoot, proposal.title, {}, proposal.content)
        createdPaths.push(file)
        const created = await readMarkdown<{ id: string }>(file)
        const specialized = await specializePlanningCard(
          projectRoot,
          created.data.id,
          'foreshadowing',
          fields
        )
        const trackedIndex = createdPaths.lastIndexOf(file)
        if (trackedIndex >= 0) createdPaths.splice(trackedIndex, 1)
        createdPaths.push(specialized.path)
        createdIds.push(specialized.data.id)
      }

      for (const decision of decisions.updates) {
        const proposal = proposals.updates.find((item) => item.proposal_id === decision.proposal_id)
        if (!proposal) throw new Error(MISSING_FORESHADOW_PROPOSAL(decision.proposal_id))

        const documents = await listDocs<DocumentIdentity & { enabled?: boolean }>(projectRoot)
        const card = documents.find((item) => item.data.id === proposal.card_id)
        if (!card || card.data.type !== 'foreshadowing') {
          throw new Error(MISSING_FORESHADOW_CARD)
        }
        if (card.data.enabled === false) {
          throw new Error(DISABLED_UPDATE_CARD)
        }

        const fields = { ...proposal.fields, ...decision.fields }
        const nextData: Record<string, unknown> = { ...(card.data as Record<string, unknown>) }
        for (const [key, value] of Object.entries(fields)) {
          if (key === 'id' || key === 'type') continue
          nextData[key] = value
        }
        nextData.id = card.data.id
        nextData.type = card.data.type

        const proposalTitle = (proposal as { title?: string }).title
        if (typeof proposalTitle === 'string' && proposalTitle.trim()) {
          nextData.title = proposalTitle.trim()
        }

        const originalRaw = await readText(card.path)
        await writeMarkdown(card.path, nextData, proposal.content)
        restorations.push({ path: card.path, before: originalRaw })
        updatedIds.push(proposal.card_id)
      }

      const updatedIdSet = new Set(updatedIds)
      const createdIdSet = new Set(createdIds)

      for (const proposalId of decisions.bindings) {
        const proposal = proposals.bindings.find((item) => item.proposal_id === proposalId)
        if (!proposal) throw new Error(MISSING_FORESHADOW_PROPOSAL(proposalId))

        if (proposal.plant === undefined && proposal.resolve === undefined) {
          throw new Error(MISSING_FORESHADOW_PROPOSAL(proposalId))
        }
        if (proposal.plant !== undefined && proposal.plant !== 'add' && proposal.plant !== 'remove') {
          throw new Error(MISSING_FORESHADOW_PROPOSAL(proposalId))
        }
        if (
          proposal.resolve !== undefined &&
          proposal.resolve !== 'add' &&
          proposal.resolve !== 'remove'
        ) {
          throw new Error(MISSING_FORESHADOW_PROPOSAL(proposalId))
        }

        if (createdIdSet.has(proposal.foreshadowing_id)) {
          throw new Error(FORESHADOW_UNREFERENCED)
        }

        const documents = await listDocs<BindingTargetData>(projectRoot)
        const foreshadowing = documents.find((item) => item.data.id === proposal.foreshadowing_id)
        const isEnabledForeshadowing =
          foreshadowing?.data.type === 'foreshadowing' && foreshadowing.data.enabled !== false
        const isUpdateTarget = updatedIdSet.has(proposal.foreshadowing_id)
        if (!isEnabledForeshadowing && !isUpdateTarget) {
          throw new Error(FORESHADOW_UNREFERENCED)
        }
        if (foreshadowing?.data.type === 'foreshadowing' && foreshadowing.data.enabled === false) {
          throw new Error(FORESHADOW_UNREFERENCED)
        }

        const target = documents.find((item) => item.data.id === proposal.document_id)
        if (!target || (target.data.type !== 'outline' && target.data.type !== 'scene')) {
          throw new Error(FORESHADOW_UNREFERENCED)
        }
        if (!referencesForeshadowing(target.data, proposal.foreshadowing_id)) {
          throw new Error(FORESHADOW_UNREFERENCED)
        }

        const nextData: Record<string, unknown> = { ...(target.data as Record<string, unknown>) }
        if (proposal.plant !== undefined) {
          nextData.foreshadowing_planted = patchIdArray(
            target.data.foreshadowing_planted,
            proposal.foreshadowing_id,
            proposal.plant
          )
        }
        if (proposal.resolve !== undefined) {
          nextData.foreshadowing_resolved = patchIdArray(
            target.data.foreshadowing_resolved,
            proposal.foreshadowing_id,
            proposal.resolve
          )
        }

        const originalRaw = await readText(target.path)
        await writeMarkdown(target.path, nextData, target.content)
        restorations.push({ path: target.path, before: originalRaw })
        bindingDocumentIds.push(proposal.document_id)
      }

      return {
        created_ids: createdIds,
        updated_ids: updatedIds,
        binding_document_ids: bindingDocumentIds
      }
    } catch (error) {
      await rollback()
      throw error
    }
  })
}
