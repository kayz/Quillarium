export type SettingCardStyleSource =
  { kind: 'builtin'; id: string } | { kind: 'workspace'; id: string; version: string }

export function settingCardStyleSource(value: string): SettingCardStyleSource | null {
  if (value.startsWith('builtin:')) return { kind: 'builtin', id: value.slice('builtin:'.length) }
  if (!value.startsWith('workspace:')) return null
  const reference = value.slice('workspace:'.length)
  const separator = reference.lastIndexOf('@')
  if (separator <= 0 || separator === reference.length - 1) return null
  return {
    kind: 'workspace',
    id: reference.slice(0, separator),
    version: reference.slice(separator + 1)
  }
}

export function appendSettingCardCandidate<T>(
  history: T[],
  candidate: T
): {
  history: T[]
  selectedIndex: number
} {
  const next = [...history, candidate]
  return { history: next, selectedIndex: next.length - 1 }
}

export function moveSettingCardCandidateIndex(current: number, count: number, offset: number): number {
  if (count <= 0) return 0
  return (current + offset + count) % count
}
