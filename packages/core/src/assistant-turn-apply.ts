import { rm } from 'node:fs/promises'
import { applyConfigurationChangePlan, restoreConfigurationChange } from './assistant-config-proposals.js'
import { loadAgentSessionDetail, replaceAgentTurn, type AgentTurnV1 } from './assistant-sessions.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { loadContextBundle, type ContextBundleV1 } from './context-bundles.js'
import { loadCreatorRole, type CreatorRoleV1 } from './creator-roles.js'
import { createIssue, createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { isSpecializationKind, specializePlanningCard } from './planning-specialize.js'
import { withProjectWriteLock } from './project-write-lock.js'
import type { DocumentIdentity } from './types.js'

export const STALE_ASSISTANT_TURN = '本轮提案已过期，请重新打开确认。'
export const MISSING_ASSISTANT_PROPOSAL = (id: string) => `找不到本轮提案：${id}`
export const MISSING_UPDATE_CARD = '找不到要更新的设定卡。'
export const DISABLED_UPDATE_CARD = '不能更新已禁用的设定卡。'

const NON_UPDATEABLE_TYPES = new Set(['outline', 'scene', 'chapter_prose', 'canon', 'issue'])

export interface AssistantTurnDecisions {
  confirmed: boolean
  creates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  updates: Array<{ proposal_id: string; type?: string; fields?: Record<string, unknown> }>
  issues: string[]
  configs: string[]
}

export async function applyAssistantTurn(
  projectRoot: string,
  sessionId: string,
  turnId: string,
  decisions: AssistantTurnDecisions,
  expectedTurnSha256: string
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  issue_ids: string[]
  config_ids: string[]
  rejected_ids: string[]
}> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const detail = await loadAgentSessionDetail(projectRoot, sessionId)
    const turn = detail.turns.find((item) => item.id === turnId)
    if (!turn) throw new Error(`Turn not found: ${turnId}`)
    if (detail.turn_source_sha256[turnId] !== expectedTurnSha256) {
      throw new Error(STALE_ASSISTANT_TURN)
    }

    const pendingById = new Map(
      turn.proposals.filter((item) => item.status === 'pending').map((item) => [item.id, item])
    )
    const pendingConfigs = new Map(
      turn.configuration_proposals.filter((item) => item.status === 'pending').map((item) => [item.id, item])
    )
    const createdPaths: string[] = []
    const restorations: Array<{ path: string; before: string }> = []
    const configRestores: Array<{
      targetKind: 'creator_role' | 'context_bundle'
      before: { value: CreatorRoleV1 | ContextBundleV1 }
      applied: CreatorRoleV1 | ContextBundleV1
    }> = []
    const createdIds: string[] = []
    const updatedIds: string[] = []
    const issueIds: string[] = []
    const configIds: string[] = []
    const appliedByProposal = new Map<string, string>()
    const appliedConfigIds = new Set<string>()

    const rollback = async () => {
      for (const item of [...configRestores].reverse()) {
        await restoreConfigurationChange(projectRoot, item.targetKind, item.before, item.applied)
      }
      for (const item of [...restorations].reverse()) {
        await writeText(item.path, item.before)
      }
      for (const file of [...createdPaths].reverse()) {
        if (await pathExists(file)) await rm(file, { force: true })
      }
    }

    try {
      for (const decision of decisions.creates) {
        const proposal = pendingById.get(decision.proposal_id)
        if (!proposal || proposal.kind !== 'planning_record' || proposal.operation === 'update') {
          throw new Error(MISSING_ASSISTANT_PROPOSAL(decision.proposal_id))
        }
        pendingById.delete(decision.proposal_id)

        const file = await createWorldEntry(projectRoot, proposal.title, {}, proposal.content)
        createdPaths.push(file)
        const created = await readMarkdown<{ id: string }>(file)
        let settingId = created.data.id

        const targetType = decision.type ?? proposal.document_type
        if (isSpecializationKind(targetType) && targetType !== 'world_entry') {
          const specialized = await specializePlanningCard(
            projectRoot,
            settingId,
            targetType,
            decision.fields ?? {}
          )
          const trackedIndex = createdPaths.lastIndexOf(file)
          if (trackedIndex >= 0) createdPaths.splice(trackedIndex, 1)
          createdPaths.push(specialized.path)
          settingId = specialized.data.id
        }

        createdIds.push(settingId)
        appliedByProposal.set(decision.proposal_id, settingId)
      }

      for (const decision of decisions.updates) {
        const proposal = pendingById.get(decision.proposal_id)
        if (
          !proposal ||
          proposal.kind !== 'planning_record' ||
          proposal.operation !== 'update' ||
          !proposal.card_id
        ) {
          throw new Error(MISSING_ASSISTANT_PROPOSAL(decision.proposal_id))
        }
        pendingById.delete(decision.proposal_id)

        const documents = await listDocs<DocumentIdentity & { enabled?: boolean }>(projectRoot)
        const card = documents.find((item) => item.data.id === proposal.card_id)
        if (!card || NON_UPDATEABLE_TYPES.has(card.data.type)) {
          throw new Error(MISSING_UPDATE_CARD)
        }
        if (card.data.enabled === false) {
          throw new Error(DISABLED_UPDATE_CARD)
        }

        const before = await readText(card.path)
        restorations.push({ path: card.path, before })

        const nextTitle =
          typeof proposal.title === 'string' && proposal.title.trim() ? proposal.title : card.data.title
        await writeMarkdown(
          card.path,
          { ...card.data, title: nextTitle } as Record<string, unknown>,
          proposal.content
        )

        let settingId = proposal.card_id
        if (decision.type && decision.type !== card.data.type) {
          const specialized = await specializePlanningCard(
            projectRoot,
            settingId,
            decision.type,
            decision.fields ?? {}
          )
          if (specialized.path !== card.path) {
            createdPaths.push(specialized.path)
          }
          settingId = specialized.data.id
        }

        updatedIds.push(settingId)
        appliedByProposal.set(decision.proposal_id, settingId)
      }

      for (const proposalId of decisions.issues) {
        const proposal = pendingById.get(proposalId)
        if (!proposal || proposal.kind !== 'issue') {
          throw new Error(MISSING_ASSISTANT_PROPOSAL(proposalId))
        }
        pendingById.delete(proposalId)

        const target = detail.session.target
        const relatedDocs = target.document_type === 'project' ? [] : [target.document_id]
        const file = await createIssue(
          projectRoot,
          proposal.title,
          { related_docs: relatedDocs },
          proposal.content
        )
        createdPaths.push(file)
        const written = await readMarkdown<{ id: string }>(file)
        issueIds.push(written.data.id)
        appliedByProposal.set(proposalId, written.data.id)
      }

      for (const proposalId of decisions.configs) {
        const proposal = pendingConfigs.get(proposalId)
        if (!proposal) {
          throw new Error(MISSING_ASSISTANT_PROPOSAL(proposalId))
        }
        pendingConfigs.delete(proposalId)

        const before =
          proposal.plan.target_kind === 'creator_role'
            ? await loadCreatorRole(projectRoot, proposal.plan.target_id)
            : await loadContextBundle(projectRoot, proposal.plan.target_id)
        const applied = await applyConfigurationChangePlan(projectRoot, proposal.plan, true)
        configRestores.push({
          targetKind: proposal.plan.target_kind,
          before,
          applied
        })
        configIds.push(proposal.id)
        appliedConfigIds.add(proposal.id)
      }

      const rejectedIds: string[] = []
      const nextTurn: AgentTurnV1 = {
        ...turn,
        proposals: turn.proposals.map((item) => {
          const appliedId = appliedByProposal.get(item.id)
          if (appliedId) {
            return { ...item, status: 'applied' as const, applied_document_id: appliedId }
          }
          if (item.status === 'pending') {
            rejectedIds.push(item.id)
            return { ...item, status: 'rejected' as const }
          }
          return item
        }),
        configuration_proposals: turn.configuration_proposals.map((item) => {
          if (appliedConfigIds.has(item.id)) {
            return { ...item, status: 'applied' as const, applied_at: new Date().toISOString() }
          }
          if (item.status === 'pending') {
            rejectedIds.push(item.id)
            return { ...item, status: 'rejected' as const }
          }
          return item
        })
      }

      await replaceAgentTurn(projectRoot, sessionId, nextTurn)

      return {
        created_ids: createdIds,
        updated_ids: updatedIds,
        issue_ids: issueIds,
        config_ids: configIds,
        rejected_ids: rejectedIds
      }
    } catch (error) {
      await rollback()
      throw error
    }
  })
}
