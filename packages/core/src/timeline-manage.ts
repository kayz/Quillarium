import { rm } from 'node:fs/promises'
import { DISABLED_UPDATE_CARD } from './assistant-turn-apply.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { specializePlanningCard } from './planning-specialize.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { timelineEventSchema } from './schema.js'
import {
  eventStartNode,
  listTimelineCatalog,
  nodeBelongsToTrack,
  placeTimelineEvent,
  reorderTimelineEvents
} from './timeline-model.js'
import type { TimelineEventDoc, TimelineNodeDoc } from './types.js'
import { sha256Text } from './versioned-yaml-store.js'

export const NO_TRACK_SELECTION = '没有选中时间轨道，不能整理时间线。'
export const MISSING_TRACK = '找不到时间轨道，不能整理时间线。'
export const TRACK_MISMATCH = '整理时间线的轨道与当前选中不一致。'
export const MISSING_TIMELINE_EVENT_CARD = '找不到要更新的事件卡。'
export const NODE_NOT_ON_TRACK = '节点不在当前轨道上。'
export const EVENT_OUT_OF_SCOPE = '事件不在当前轨道整理范围内。'
export const MISSING_TIMELINE_PROPOSAL = (id: string) => `找不到时间线提案：${id}`

const UPDATE_FIELD_KEYS = ['date', 'duration', 'location', 'characters', 'flashback_reference'] as const

export interface TimelineManageProposalSet {
  eval_id: string
  track_id: string
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
    title?: string
  }>
  placements: Array<{
    proposal_id: string
    node_id: string
    event_id?: string
    create_proposal_id?: string
  }>
  orders: Array<{
    proposal_id: string
    node_id: string
    event_ids: string[]
  }>
}

export async function loadTrackForTimelineManage(
  projectRoot: string,
  trackId: string
): Promise<{ id: string; title: string } | null> {
  if (!trackId.trim()) return null
  const catalog = await listTimelineCatalog(projectRoot)
  const found = catalog.tracks.find((item) => item.value.id === trackId)
  if (!found) return null
  return { id: found.value.id, title: found.value.title }
}

function isFullyUnattached(event: TimelineEventDoc): boolean {
  return !event.timeline_node && (event.placements ?? []).length === 0
}

export async function applyTimelineManage(
  projectRoot: string,
  proposals: TimelineManageProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
    placements: string[]
    orders: string[]
  }
): Promise<{
  created_ids: string[]
  updated_ids: string[]
  placed_event_ids: string[]
  ordered_node_ids: string[]
}> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const createdPaths: string[] = []
    const restorations: Array<{ path: string; before: string }> = []
    const createdIds: string[] = []
    const updatedIds: string[] = []
    const placedEventIds: string[] = []
    const orderedNodeIds: string[] = []
    const createIdByProposal = new Map<string, string>()

    const rollback = async () => {
      for (const item of [...restorations].reverse()) {
        await writeText(item.path, item.before)
      }
      for (const file of [...createdPaths].reverse()) {
        if (await pathExists(file)) await rm(file, { force: true })
      }
    }

    try {
      if (!proposals.track_id.trim()) throw new Error(NO_TRACK_SELECTION)
      const track = await loadTrackForTimelineManage(projectRoot, proposals.track_id)
      if (!track) throw new Error(MISSING_TRACK)

      for (const decision of decisions.creates) {
        const proposal = proposals.creates.find((item) => item.proposal_id === decision.proposal_id)
        if (!proposal) throw new Error(MISSING_TIMELINE_PROPOSAL(decision.proposal_id))

        const fields = { ...proposal.fields, ...decision.fields }
        const file = await createWorldEntry(projectRoot, proposal.title, {}, proposal.content)
        createdPaths.push(file)
        const created = await readMarkdown<{ id: string }>(file)
        const specialized = await specializePlanningCard(
          projectRoot,
          created.data.id,
          'timeline_event',
          fields
        )
        const trackedIndex = createdPaths.lastIndexOf(file)
        if (trackedIndex >= 0) createdPaths.splice(trackedIndex, 1)
        createdPaths.push(specialized.path)
        createdIds.push(specialized.data.id)
        createIdByProposal.set(decision.proposal_id, specialized.data.id)
      }

      for (const decision of decisions.updates) {
        const proposal = proposals.updates.find((item) => item.proposal_id === decision.proposal_id)
        if (!proposal) throw new Error(MISSING_TIMELINE_PROPOSAL(decision.proposal_id))

        const documents = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
        const card = documents.find((item) => item.data.id === proposal.card_id)
        if (!card || card.data.type !== 'timeline_event') {
          throw new Error(MISSING_TIMELINE_EVENT_CARD)
        }
        if (card.data.enabled === false) {
          throw new Error(DISABLED_UPDATE_CARD)
        }

        const fields = { ...proposal.fields, ...decision.fields }
        const nextData: Record<string, unknown> = { ...(card.data as unknown as Record<string, unknown>) }
        for (const key of UPDATE_FIELD_KEYS) {
          if (Object.prototype.hasOwnProperty.call(fields, key)) {
            nextData[key] = fields[key]
          }
        }
        nextData.id = card.data.id
        nextData.type = card.data.type

        const proposalTitle = proposal.title
        if (typeof proposalTitle === 'string' && proposalTitle.trim()) {
          nextData.title = proposalTitle.trim()
        }

        const parsed = timelineEventSchema.parse(nextData)
        const originalRaw = await readText(card.path)
        await writeMarkdown(card.path, parsed, proposal.content)
        restorations.push({ path: card.path, before: originalRaw })
        updatedIds.push(proposal.card_id)
      }

      for (const proposalId of decisions.placements) {
        const proposal = proposals.placements.find((item) => item.proposal_id === proposalId)
        if (!proposal) throw new Error(MISSING_TIMELINE_PROPOSAL(proposalId))

        const hasEventId = Boolean(proposal.event_id)
        const hasCreateProposalId = Boolean(proposal.create_proposal_id)
        if (hasEventId === hasCreateProposalId) {
          throw new Error(MISSING_TIMELINE_PROPOSAL(proposalId))
        }

        let eventId: string
        let fromCreate = false
        if (proposal.create_proposal_id) {
          const mapped = createIdByProposal.get(proposal.create_proposal_id)
          if (!mapped) throw new Error(MISSING_TIMELINE_PROPOSAL(proposal.create_proposal_id))
          eventId = mapped
          fromCreate = true
        } else {
          eventId = proposal.event_id!
        }

        const nodes = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
        const node = nodes.find((item) => item.data.id === proposal.node_id)
        if (!node || !nodeBelongsToTrack(node.data, track.id)) {
          throw new Error(NODE_NOT_ON_TRACK)
        }

        const events = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
        const event = events.find((item) => item.data.id === eventId)
        if (!event) throw new Error(EVENT_OUT_OF_SCOPE)

        const onTrack = eventStartNode(event.data, track.id) !== null
        const unattached = isFullyUnattached(event.data)
        if (!fromCreate && !onTrack && !unattached) {
          throw new Error(EVENT_OUT_OF_SCOPE)
        }

        const originalRaw = await readText(event.path)
        const expectedHash = sha256Text(originalRaw)
        await placeTimelineEvent(projectRoot, {
          event_id: eventId,
          timeline_id: track.id,
          start_node_id: proposal.node_id,
          mode: 'add',
          expected_hash: expectedHash
        })
        restorations.push({ path: event.path, before: originalRaw })
        placedEventIds.push(eventId)
      }

      for (const proposalId of decisions.orders) {
        const proposal = proposals.orders.find((item) => item.proposal_id === proposalId)
        if (!proposal) throw new Error(MISSING_TIMELINE_PROPOSAL(proposalId))

        const nodes = await listDocs<TimelineNodeDoc>(projectRoot, 'timeline_node')
        const node = nodes.find((item) => item.data.id === proposal.node_id)
        if (!node || !nodeBelongsToTrack(node.data, track.id)) {
          throw new Error(NODE_NOT_ON_TRACK)
        }

        const events = await listDocs<TimelineEventDoc>(projectRoot, 'timeline_event')
        const eligible = events.filter((item) => eventStartNode(item.data, track.id) === proposal.node_id)
        const expectedHashes: Record<string, string> = {}
        for (const item of eligible) {
          const raw = await readText(item.path)
          restorations.push({ path: item.path, before: raw })
          expectedHashes[item.data.id] = sha256Text(raw)
        }

        await reorderTimelineEvents(projectRoot, {
          track_id: track.id,
          node_id: proposal.node_id,
          ordered_event_ids: proposal.event_ids,
          expected_hashes: expectedHashes,
          order_kind: 'display'
        })
        orderedNodeIds.push(proposal.node_id)
      }

      return {
        created_ids: createdIds,
        updated_ids: updatedIds,
        placed_event_ids: placedEventIds,
        ordered_node_ids: orderedNodeIds
      }
    } catch (error) {
      await rollback()
      throw error
    }
  })
}
