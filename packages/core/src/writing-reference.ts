export interface WritingReferenceDraft {
  title: string
  content: string
}

/** Reads a model draft. Nothing is written until the author confirms it. */
export function parseWritingReferenceDraft(response: string): WritingReferenceDraft | null {
  const start = response.indexOf('{')
  const end = response.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(response.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as { title?: unknown; content?: unknown }
  const title = String(record.title ?? '').trim()
  const content = String(record.content ?? '').trim()
  if (!title || !content) return null
  return { title, content }
}
