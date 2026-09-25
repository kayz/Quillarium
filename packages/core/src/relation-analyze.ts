import { rm } from 'node:fs/promises'
import { DISABLED_UPDATE_CARD } from './assistant-turn-apply.js'
import { UNCONFIRMED_EVAL } from './chapter-eval.js'
import { createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { assertCardReferencesExist, isEnabledPlanningCard } from './planning-cards.js'
import { specializePlanningCard } from './planning-specialize.js'
import { withProjectWriteLock } from './project-write-lock.js'
import { characterRelationSchema, factionMembershipSchema, factionRelationSchema } from './schema.js'
import type { DocumentIdentity } from './types.js'

const RELATION_UPDATE_FIELD_KEYS = [
  'relation_type',
  'direction',
  'starts_at',
  'ends_at',
  'visibility',
  'role',
  'rank',
  'primary',
  'from_character',
  'to_character',
  'from_faction',
  'to_faction',
  'character_id',
  'faction_id'
] as const

const RELATION_UPDATE_SCHEMAS = {
  character_relation: characterRelationSchema,
  faction_relation: factionRelationSchema,
  faction_membership: factionMembershipSchema
} as const

export const NO_CHARACTER_SELECTION = '没有选中人物，不能分析关系。'
export const MISSING_CHARACTER = '找不到人物，不能分析关系。'
export const CHARACTER_MISMATCH = '分析关系的人物与当前选中不一致。'
export const MISSING_RELATION_CARD = '找不到要更新的关系卡。'
export const MISSING_RELATION_PROPOSAL = (id: string) => `找不到关系提案：${id}`
export const RELATION_TYPES = ['character_relation', 'faction_relation', 'faction_membership'] as const
export type RelationExpertType = (typeof RELATION_TYPES)[number]

type ExtraMembership = { character_id: string; faction_id: string }

export async function loadCharacterForRelationAnalyze(
  projectRoot: string,
  characterId: string
): Promise<{ id: string; title: string } | null> {
  if (!characterId.trim()) return null
  const characters = await listDocs<DocumentIdentity>(projectRoot, 'character')
  const found = characters.find((item) => item.data.id === characterId)
  if (!found) return null
  return { id: found.data.id, title: found.data.title }
}

export interface RelationAnalyzeProposalSet {
  eval_id: string
  character_id: string
  creates: Array<{
    proposal_id: string
    title: string
    content: string
    type: RelationExpertType
    fields: Record<string, unknown>
  }>
  updates: Array<{
    proposal_id: string
    card_id: string
    content: string
    fields: Record<string, unknown>
  }>
}

function isRelationExpertType(value: string): value is RelationExpertType {
  return (RELATION_TYPES as readonly string[]).includes(value)
}

async function assertRelationInvolvesCharacter(
  projectRoot: string,
  characterId: string,
  targetType: RelationExpertType,
  fields: Record<string, unknown>,
  extraMemberships: ExtraMembership[]
): Promise<void> {
  if (targetType === 'character_relation') {
    const fromId = typeof fields.from_character === 'string' ? fields.from_character : ''
    const toId = typeof fields.to_character === 'string' ? fields.to_character : ''
    if (fromId !== characterId && toId !== characterId) {
      throw new Error(MISSING_RELATION_CARD)
    }
    const characters = await listDocs(projectRoot, 'character')
    const characterIds = new Set(characters.map((item) => item.data.id))
    if (fromId && !characterIds.has(fromId)) throw new Error(MISSING_RELATION_CARD)
    if (toId && !characterIds.has(toId)) throw new Error(MISSING_RELATION_CARD)
    return
  }

  if (targetType === 'faction_membership') {
    const memberCharacterId = typeof fields.character_id === 'string' ? fields.character_id : ''
    const factionId = typeof fields.faction_id === 'string' ? fields.faction_id : ''
    if (memberCharacterId !== characterId) throw new Error(MISSING_RELATION_CARD)
    if (!factionId) throw new Error(MISSING_RELATION_CARD)
    const factions = await listDocs(projectRoot, 'faction')
    if (!factions.some((item) => item.data.id === factionId)) throw new Error(MISSING_RELATION_CARD)
    return
  }

  const fromFaction = typeof fields.from_faction === 'string' ? fields.from_faction : ''
  const toFaction = typeof fields.to_faction === 'string' ? fields.to_faction : ''
  if (!fromFaction || !toFaction) throw new Error(MISSING_RELATION_CARD)

  const factions = await listDocs(projectRoot, 'faction')
  const factionIds = new Set(factions.map((item) => item.data.id))
  if (!factionIds.has(fromFaction) || !factionIds.has(toFaction)) {
    throw new Error(MISSING_RELATION_CARD)
  }

  const memberships = await listDocs<{ character_id: string; faction_id: string } & DocumentIdentity>(
    projectRoot,
    'faction_membership'
  )
  const involvedFactionIds = new Set<string>()
  for (const item of memberships) {
    if (!isEnabledPlanningCard(item.data)) continue
    if (item.data.character_id !== characterId) continue
    involvedFactionIds.add(item.data.faction_id)
  }
  for (const extra of extraMemberships) {
    if (extra.character_id === characterId) involvedFactionIds.add(extra.faction_id)
  }

  if (!involvedFactionIds.has(fromFaction) && !involvedFactionIds.has(toFaction)) {
    throw new Error(MISSING_RELATION_CARD)
  }
}

export async function applyRelationAnalyze(
  projectRoot: string,
  proposals: RelationAnalyzeProposalSet,
  decisions: {
    confirmed: boolean
    creates: Array<{ proposal_id: string; type?: RelationExpertType; fields?: Record<string, unknown> }>
    updates: Array<{ proposal_id: string; fields?: Record<string, unknown> }>
  }
): Promise<{ created_ids: string[]; updated_ids: string[] }> {
  if (!decisions.confirmed) throw new Error(UNCONFIRMED_EVAL)

  return withProjectWriteLock(projectRoot, async () => {
    const characterId = proposals.character_id
    if (!characterId.trim()) throw new Error(NO_CHARACTER_SELECTION)
    const character = await loadCharacterForRelationAnalyze(projectRoot, characterId)
    if (!character) throw new Error(MISSING_CHARACTER)
    if (proposals.character_id !== character.id) throw new Error(CHARACTER_MISMATCH)

    const createdPaths: string[] = []
    const restorations: Array<{ path: string; before: string }> = []
    const createdIds: string[] = []
    const updatedIds: string[] = []
    const extraMemberships: ExtraMembership[] = []

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
        if (!proposal) throw new Error(MISSING_RELATION_PROPOSAL(decision.proposal_id))

        const targetType = decision.type ?? proposal.type
        if (!isRelationExpertType(targetType)) {
          throw new Error(MISSING_RELATION_PROPOSAL(decision.proposal_id))
        }

        const fields = { ...proposal.fields, ...decision.fields }
        await assertRelationInvolvesCharacter(projectRoot, character.id, targetType, fields, extraMemberships)

        const file = await createWorldEntry(projectRoot, proposal.title, {}, proposal.content)
        createdPaths.push(file)
        const created = await readMarkdown<{ id: string }>(file)
        const specialized = await specializePlanningCard(projectRoot, created.data.id, targetType, fields)
        const trackedIndex = createdPaths.lastIndexOf(file)
        if (trackedIndex >= 0) createdPaths.splice(trackedIndex, 1)
        createdPaths.push(specialized.path)
        createdIds.push(specialized.data.id)

        if (targetType === 'faction_membership') {
          const memberCharacterId =
            typeof fields.character_id === 'string' ? fields.character_id : character.id
          const factionId = typeof fields.faction_id === 'string' ? fields.faction_id : ''
          if (factionId) {
            extraMemberships.push({ character_id: memberCharacterId, faction_id: factionId })
          }
        }
      }

      for (const decision of decisions.updates) {
        const proposal = proposals.updates.find((item) => item.proposal_id === decision.proposal_id)
        if (!proposal) throw new Error(MISSING_RELATION_PROPOSAL(decision.proposal_id))

        const documents = await listDocs<DocumentIdentity & { enabled?: boolean }>(projectRoot)
        const card = documents.find((item) => item.data.id === proposal.card_id)
        if (!card || !isRelationExpertType(card.data.type)) {
          throw new Error(MISSING_RELATION_CARD)
        }
        if (card.data.enabled === false) {
          throw new Error(DISABLED_UPDATE_CARD)
        }

        const fields = { ...proposal.fields, ...decision.fields }
        const nextData: Record<string, unknown> = { ...(card.data as unknown as Record<string, unknown>) }
        for (const key of RELATION_UPDATE_FIELD_KEYS) {
          if (key in fields) {
            nextData[key] = fields[key]
          }
        }
        nextData.id = card.data.id
        nextData.type = card.data.type

        const proposalTitle = (proposal as { title?: string }).title
        if (typeof proposalTitle === 'string' && proposalTitle.trim()) {
          nextData.title = proposalTitle.trim()
        }

        await assertRelationInvolvesCharacter(
          projectRoot,
          character.id,
          card.data.type,
          nextData,
          extraMemberships
        )

        const parsed = RELATION_UPDATE_SCHEMAS[card.data.type].parse(nextData) as DocumentIdentity &
          Record<string, unknown>
        if (card.data.type === 'character_relation' && parsed['from_character'] === parsed['to_character']) {
          throw new Error('人物关系必须连接两个不同的人物。')
        }
        if (card.data.type === 'faction_relation' && parsed['from_faction'] === parsed['to_faction']) {
          throw new Error('势力关系必须连接两个不同的势力。')
        }
        assertCardReferencesExist(parsed, documents)

        const originalRaw = await readText(card.path)
        await writeMarkdown(card.path, parsed, proposal.content)
        restorations.push({ path: card.path, before: originalRaw })
        updatedIds.push(proposal.card_id)
      }

      return { created_ids: createdIds, updated_ids: updatedIds }
    } catch (error) {
      await rollback()
      throw error
    }
  })
}
