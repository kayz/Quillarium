const counters = new Map<string, number>()

export function slugify(input: string): string {
  const normalized = input
    .trim()
    .replace(/[\\/:*?"<>|#^[\]{}%`]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return normalized || 'untitled'
}

export function makeId(prefix: string, title: string): string {
  const slug = slugify(title).toLowerCase()
  const key = `${prefix}:${slug}`
  const next = (counters.get(key) ?? 0) + 1
  counters.set(key, next)
  return next === 1 ? `${prefix}-${slug}` : `${prefix}-${slug}-${next}`
}

export function timestampId(prefix = 'run', date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
  return `${prefix}-${stamp}`
}
