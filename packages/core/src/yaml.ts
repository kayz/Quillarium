import matter from 'gray-matter'

export function toYamlValue(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') {
    if (value === '') return '""'
    if (/[:#\n\r]|^\s|\s$|^-|^\[|^\{|,/.test(value)) return JSON.stringify(value)
    return value
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return `${pad}-\n${objectToYaml(item as Record<string, unknown>, indent + 2)}`
        }
        return `${pad}- ${toYamlValue(item, indent + 2)}`
      })
      .join('\n')
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (!entries.length) return '{}'
    return `\n${objectToYaml(value as Record<string, unknown>, indent + 2)}`
  }
  return JSON.stringify(value)
}

export function objectToYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = ' '.repeat(indent)
  return Object.entries(obj)
    .map(([key, value]) => {
      if (Array.isArray(value) && value.length) {
        const rendered = toYamlValue(value, indent + 2)
        return `${pad}${key}:\n${rendered}`
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const rendered = toYamlValue(value, indent)
        return `${pad}${key}:${rendered}`
      }
      return `${pad}${key}: ${toYamlValue(value, indent)}`
    })
    .join('\n')
}

export function stringifyFrontmatter(data: Record<string, unknown>, content = ''): string {
  return matter.stringify(content.trimStart(), stripUndefined(data) as Record<string, unknown>)
}

export function parseMarkdown<T extends Record<string, unknown>>(raw: string): { data: T; content: string } {
  const parsed = matter(raw)
  return { data: parsed.data as T, content: parsed.content.trimStart() }
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((v) => v !== undefined)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripUndefined(inner)
      if (cleaned !== undefined) out[key] = cleaned
    }
    return out
  }
  return value
}
