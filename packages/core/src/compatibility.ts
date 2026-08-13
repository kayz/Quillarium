import type { OutlineDoc } from './types.js'

const LEGACY_CYCLE_KEY = 'writer_cycles'
const CURRENT_CYCLE_KEY = 'story_cycles'

export function normalizeLegacyOutlineCycleFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  const normalized = { ...source }
  if (!(CURRENT_CYCLE_KEY in normalized) && LEGACY_CYCLE_KEY in normalized) {
    normalized[CURRENT_CYCLE_KEY] = normalized[LEGACY_CYCLE_KEY]
  }
  if (normalized['level'] === 'arc') normalized['level'] = 'part'
  if (
    normalized['level'] === 'book' &&
    typeof normalized['title'] === 'string' &&
    /(?:总览|overview)/iu.test(normalized['title'])
  ) {
    normalized['level'] = 'overview'
  }
  delete normalized[LEGACY_CYCLE_KEY]
  return normalized
}

export function normalizeLegacySceneFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const normalized = { ...(value as Record<string, unknown>) }
  if (!normalized['chapter_id'] && typeof normalized['section'] === 'string') {
    normalized['chapter_id'] = normalized['section']
  }
  if (!normalized['section'] && typeof normalized['chapter_id'] === 'string') {
    normalized['section'] = normalized['chapter_id']
  }
  return normalized
}

export function readStoryCycleInput(data: Record<string, unknown>): unknown {
  return data[CURRENT_CYCLE_KEY] ?? data[LEGACY_CYCLE_KEY] ?? data['五循环']
}

export function migrateOutlineCycleRecord(data: Record<string, unknown>): {
  data: Record<string, unknown>
  changed: boolean
} {
  const normalized = normalizeLegacyOutlineCycleFields(data) as Record<string, unknown>
  return {
    data: normalized,
    changed: LEGACY_CYCLE_KEY in data
  }
}

export type StoryCycle = OutlineDoc['story_cycles'][number]
