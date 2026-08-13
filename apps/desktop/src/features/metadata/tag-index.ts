import type { DocEntry } from '../../app/types.js'

export const TAG_FIELD_NAMES = new Set([
  'tags',
  'active_flags',
  'triggers',
  'category_tags',
  'topic_tags',
  'applies_to',
  'story_cycles',
  'core_appeal',
  'core_suspense',
  'genre_boundary'
])

export const INDEXED_CATEGORY_FIELDS = new Set(['category', 'kind', 'scope'])

export interface TagMatch {
  doc: DocEntry
  fields: string[]
}

export function normalizeTag(value: string): string {
  return value
    .trim()
    .replace(/^#+\s*/u, '')
    .normalize('NFKC')
    .toLocaleLowerCase()
}

export function displayTag(value: string): string {
  const clean = value.trim().replace(/^#+\s*/u, '')
  return clean ? `#${clean}` : '#'
}

export function isTagField(name: string): boolean {
  return TAG_FIELD_NAMES.has(name) || name === 'tag' || name.endsWith('_tags')
}

export function indexableValues(data: Record<string, unknown>): Array<{ field: string; value: string }> {
  const result: Array<{ field: string; value: string }> = []
  for (const [field, raw] of Object.entries(data)) {
    if (isTagField(field) && Array.isArray(raw)) {
      for (const value of raw) {
        if (typeof value === 'string' && normalizeTag(value)) result.push({ field, value })
      }
      continue
    }
    if (INDEXED_CATEGORY_FIELDS.has(field) && typeof raw === 'string' && normalizeTag(raw)) {
      result.push({ field, value: raw })
    }
  }
  return result
}

export function collectTagSuggestions(docs: DocEntry[]): string[] {
  const unique = new Map<string, string>()
  for (const doc of docs) {
    for (const { field, value } of indexableValues(doc.data)) {
      if (!isTagField(field)) continue
      const normalized = normalizeTag(value)
      if (!unique.has(normalized)) unique.set(normalized, value.trim().replace(/^#+\s*/u, ''))
    }
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

export function findTagMatches(docs: DocEntry[], tag: string): TagMatch[] {
  const needle = normalizeTag(tag)
  if (!needle) return []
  return docs
    .map((doc) => ({
      doc,
      fields: [
        ...new Set(
          indexableValues(doc.data)
            .filter(({ value }) => normalizeTag(value) === needle)
            .map(({ field }) => field)
        )
      ]
    }))
    .filter((match) => match.fields.length > 0)
    .sort((left, right) => {
      const byType = left.doc.data.type.localeCompare(right.doc.data.type)
      return byType || left.doc.data.title.localeCompare(right.doc.data.title, 'zh-CN')
    })
}
