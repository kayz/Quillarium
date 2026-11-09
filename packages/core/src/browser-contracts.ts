import { z } from 'zod'
import type { DisplayLayerConfigV1, ProjectConfig } from './types.js'

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

export function isSpecializationKind(type: string): type is SpecializationKind {
  return (SPECIALIZATION_KINDS as readonly string[]).includes(type)
}

export function specializationTargets(sourceType: string): SpecializationKind[] {
  if (sourceType === 'world_entry') return SPECIALIZATION_KINDS.filter((kind) => kind !== 'world_entry')
  if (sourceType === 'item') return ['foreshadowing']
  if (isSpecializationKind(sourceType)) return ['world_entry']
  return []
}

export function requiredSpecializationFields(targetType: string): string[] {
  if (targetType === 'character_relation') return ['from_character', 'to_character', 'relation_type']
  if (targetType === 'faction_relation') return ['from_faction', 'to_faction', 'relation_type']
  if (targetType === 'faction_membership') return ['faction_id', 'character_id']
  return []
}

export const TRACK_MISMATCH = '整理时间线的轨道与当前选中不一致。'
export const CHARACTER_MISMATCH = '分析关系的人物与当前选中不一致。'
export const RELATION_TYPES = ['character_relation', 'faction_relation', 'faction_membership'] as const
export type RelationExpertType = (typeof RELATION_TYPES)[number]

export const SETTING_CARD_DOCUMENT_TYPES = [
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

export const settingCardDocumentTypeSchema = z.enum(SETTING_CARD_DOCUMENT_TYPES)

export type SettingCardDocumentType = z.infer<typeof settingCardDocumentTypeSchema>

export const WRITER_DEFAULT_DISPLAY_LAYER: DisplayLayerConfigV1 = Object.freeze({
  enabled: false,
  migrated: true
})

export function resolveDisplayLayer(config: Pick<ProjectConfig, 'display_layer'>): DisplayLayerConfigV1 {
  return config.display_layer ?? { enabled: false, migrated: true }
}

export * from './location-canvas.js'
