import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileForDoc, listDocs } from './documents.js'
import { pathExists, readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import { assertCardReferencesExist, validatePlanningCardGraph } from './planning-cards.js'
import { DOCUMENT_ORIGIN_FIELD } from './provenance.js'
import { withProjectWriteLock } from './project-write-lock.js'
import {
  canonSchema,
  characterRelationSchema,
  characterSchema,
  factionMembershipSchema,
  factionRelationSchema,
  factionSchema,
  foreshadowingSchema,
  locationSchema,
  narrativeSchema,
  timelineEventSchema,
  worldEntrySchema
} from './schema.js'
import type { DocumentIdentity } from './types.js'
import { sha256Text } from './versioned-yaml-store.js'

const UNSET_REFERENCE = '__quillarium_unset_reference__'
const EXCERPT_HEADER = '## 特化前摘录'
const SKIP_EXCERPT_KEYS = new Set(['id', 'type', 'schema_version', DOCUMENT_ORIGIN_FIELD])
const SHARED_PLANNING_KEYS = ['status', 'tags', 'enabled', 'source_refs', 'relations', 'image'] as const

export const SPECIALIZATION_KINDS = [
  'world_entry',
  'canon',
  'character',
  'character_relation',
  'location',
  'timeline_event',
  'faction',
  'faction_relation',
  'faction_membership',
  'foreshadowing',
  'narrative'
] as const

export type SpecializationKind = (typeof SPECIALIZATION_KINDS)[number]

const SPECIALIZATION_SCHEMAS = {
  world_entry: worldEntrySchema,
  canon: canonSchema,
  character: characterSchema,
  character_relation: characterRelationSchema,
  location: locationSchema,
  timeline_event: timelineEventSchema,
  faction: factionSchema,
  faction_relation: factionRelationSchema,
  faction_membership: factionMembershipSchema,
  foreshadowing: foreshadowingSchema,
  narrative: narrativeSchema
} as const

export function isSpecializationKind(type: string): type is SpecializationKind {
  return (SPECIALIZATION_KINDS as readonly string[]).includes(type)
}

export function specializationTargets(sourceType: string): SpecializationKind[] {
  if (sourceType === 'world_entry') return SPECIALIZATION_KINDS.filter((kind) => kind !== 'world_entry')
  if (isSpecializationKind(sourceType)) return ['world_entry']
  return []
}

export function requiredSpecializationFields(targetType: string): string[] {
  if (targetType === 'character_relation') return ['from_character', 'to_character', 'relation_type']
  if (targetType === 'faction_relation') return ['from_faction', 'to_faction', 'relation_type']
  if (targetType === 'faction_membership') return ['faction_id', 'character_id']
  return []
}

export async function specializePlanningCard(
  projectRoot: string,
  cardId: string,
  targetType: string,
  fields: Record<string, unknown>,
  options?: { content?: string; expectedSha256?: string }
): Promise<{ path: string; data: DocumentIdentity; content: string }> {
  return withProjectWriteLock(projectRoot, async () => {
    const documents = await listDocs<DocumentIdentity>(projectRoot)
    const source = documents.find((document) => document.data.id === cardId)
    if (!source) throw new Error(`找不到设定卡：${cardId}`)

    const originalRaw = await readText(source.path)
    if (options?.expectedSha256 && sha256Text(originalRaw) !== options.expectedSha256) {
      throw new Error('设定卡已被其它写入更改。')
    }

    if (source.data.type === targetType) throw new Error('目标类型与当前相同，请直接保存。')
    if (!isSpecializationKind(targetType) || !specializationTargets(source.data.type).includes(targetType)) {
      throw new Error(`当前类型不能特化为 ${targetType}。`)
    }

    const missing = requiredSpecializationFields(targetType).filter((key) => {
      const value = fields[key]
      return typeof value !== 'string' || !value.trim() || value === UNSET_REFERENCE
    })
    if (missing.length) throw new Error(`特化缺少必填字段：${missing.join('、')}`)

    const sourceData = source.data as DocumentIdentity & Record<string, unknown>
    const merged: Record<string, unknown> = {
      title: source.data.title,
      ...Object.fromEntries(SHARED_PLANNING_KEYS.map((key) => [key, sourceData[key]])),
      ...fields,
      id: source.data.id,
      type: targetType,
      schema_version: 1
    }
    const parsed = SPECIALIZATION_SCHEMAS[targetType].parse(merged) as DocumentIdentity &
      Record<string, unknown>
    const existingOrigin = sourceData[DOCUMENT_ORIGIN_FIELD]
    if (existingOrigin !== undefined && existingOrigin !== null) {
      parsed[DOCUMENT_ORIGIN_FIELD] = existingOrigin
    }

    if (targetType === 'character_relation' && parsed['from_character'] === parsed['to_character']) {
      throw new Error('人物关系必须连接两个不同的人物。')
    }
    if (targetType === 'faction_relation' && parsed['from_faction'] === parsed['to_faction']) {
      throw new Error('势力关系必须连接两个不同的势力。')
    }

    assertCardReferencesExist(parsed, documents)

    const nextPath = fileForDoc(projectRoot, targetType, parsed.id, parsed.title)
    const body = appendExcerpt(options?.content ?? source.content, specializationExcerpt(sourceData, parsed))
    const graphDocuments = documents.map((document) =>
      document.data.id === cardId ? { path: nextPath, data: parsed, content: body } : document
    )
    const inboundTypeConflicts = validatePlanningCardGraph(graphDocuments).filter(
      (issue) => issue.code === 'wrong-relation-target-type' && issue.resolved_target_id === cardId
    )
    if (inboundTypeConflicts.length) {
      throw new Error(
        [
          `卡片 ${cardId} 转换为 ${targetType} 会使现有类型化引用失效。`,
          ...inboundTypeConflicts.map((issue) => `${issue.card_id}.${issue.relation_field}`),
          '请先调整这些引用；本次未写入任何卡片。'
        ].join('\n')
      )
    }

    if (nextPath !== source.path && (await pathExists(nextPath))) {
      throw new Error(`特化目标文件已存在：${path.basename(nextPath)}`)
    }

    try {
      await writeMarkdown(nextPath, parsed, body)
      const written = await readMarkdown<Record<string, unknown>>(nextPath)
      if (written.data['id'] !== parsed.id || written.data['type'] !== targetType) {
        throw new Error('特化写入校验失败。')
      }
      if (nextPath !== source.path) await rm(source.path)
      return { path: nextPath, data: parsed, content: written.content }
    } catch (error) {
      const rollbackErrors: unknown[] = []
      await writeText(source.path, originalRaw).catch((cause) => rollbackErrors.push(cause))
      if (nextPath !== source.path && (await pathExists(nextPath))) {
        await rm(nextPath, { force: true }).catch((cause) => rollbackErrors.push(cause))
      }
      if (rollbackErrors.length) {
        throw new AggregateError([error, ...rollbackErrors], '特化失败且回滚不完整。', { cause: error })
      }
      throw error
    }
  })
}

function specializationExcerpt(source: Record<string, unknown>, parsed: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(source)) {
    if (SKIP_EXCERPT_KEYS.has(key) || Object.hasOwn(parsed, key) || !hasExcerptValue(value)) continue
    lines.push(`- ${key}: ${formatExcerptValue(value)}`)
  }
  if (!lines.length) return ''
  return `${EXCERPT_HEADER}\n\n${lines.join('\n')}`
}

function appendExcerpt(content: string, excerpt: string): string {
  if (!excerpt) return content
  const trimmed = content.replace(/\s+$/u, '')
  return trimmed ? `${trimmed}\n\n${excerpt}\n` : `${excerpt}\n`
}

function hasExcerptValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return false
}

function formatExcerptValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(', ')
  return JSON.stringify(value)
}
