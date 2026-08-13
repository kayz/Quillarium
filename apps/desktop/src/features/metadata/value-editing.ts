export function updateArrayItem<T>(values: T[], index: number, value: T): T[] {
  return values.map((item, itemIndex) => (itemIndex === index ? value : item))
}

export function removeArrayItem<T>(values: T[], index: number): T[] {
  return values.filter((_, itemIndex) => itemIndex !== index)
}

export function addUniqueTag(values: string[], value: string): string[] {
  const clean = value.trim().replace(/^#+\s*/u, '')
  if (!clean) return values
  const normalized = clean.normalize('NFKC').toLocaleLowerCase()
  return values.some(
    (item) =>
      item
        .trim()
        .replace(/^#+\s*/u, '')
        .normalize('NFKC')
        .toLocaleLowerCase() === normalized
  )
    ? values
    : [...values, clean]
}

export function renameRecordKey(
  value: Record<string, unknown>,
  previousKey: string,
  nextKey: string
): Record<string, unknown> {
  const clean = nextKey.trim()
  if (!clean || clean === previousKey || Object.hasOwn(value, clean)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key === previousKey ? clean : key, item])
  )
}
