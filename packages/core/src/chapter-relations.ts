import type { OutlineDoc, TimelineEventDoc } from './types.js'

export interface ContentDoc<T> {
  data: T
  content: string
}

export function chapterNumberForOutline(outline: OutlineDoc): number | null {
  if (outline.level !== 'chapter') return null
  return parseChapterNumber(outline.title) ?? outline.order + 1
}

export function timelineIdsForOutline(
  outline: OutlineDoc,
  events: Array<ContentDoc<TimelineEventDoc>>
): string[] {
  const explicit = outline.related_timeline ?? []
  if (explicit.length) return [...new Set(explicit)]
  const chapter = chapterNumberForOutline(outline)
  if (chapter === null) return []
  return events
    .filter((event) => timelineEventCoversChapter(event.content, chapter))
    .map((event) => event.data.id)
}

export function timelineEventCoversChapter(content: string, chapter: number): boolean {
  for (const reference of chapterReferences(content)) {
    if (chapter >= reference.start && chapter <= reference.end) return true
  }
  return false
}

export function parseChapterNumber(value: string): number | null {
  const arabic = value.match(/(?:第\s*)?(\d+)\s*(?:章|$)/u)
  if (arabic) return Number(arabic[1])
  const chinese = value.match(/第\s*([零〇一二两三四五六七八九十百千]+)\s*章/u)
  return chinese ? chineseNumber(chinese[1]) : null
}

function chapterReferences(content: string): Array<{ start: number; end: number }> {
  const references: Array<{ start: number; end: number }> = []
  const pattern = /(?:关联章节|章节|chapter(?:s)?)\s*[:：]\s*([^\r\n]+)/giu
  for (const match of content.matchAll(pattern)) {
    const value = match[1]
    const ranges = value.matchAll(
      /第?\s*([零〇一二两三四五六七八九十百千]+|\d+)\s*(?:章)?\s*(?:[-–—~～至到]\s*第?\s*([零〇一二两三四五六七八九十百千]+|\d+)\s*(?:章)?)?/gu
    )
    for (const range of ranges) {
      const start = numericChapter(range[1])
      const end = numericChapter(range[2] ?? range[1])
      if (start !== null && end !== null)
        references.push({ start: Math.min(start, end), end: Math.max(start, end) })
    }
  }
  return references
}

function numericChapter(value: string): number | null {
  return /^\d+$/u.test(value) ? Number(value) : chineseNumber(value)
}

function chineseNumber(value: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }
  let total = 0
  let current = 0
  for (const char of value) {
    if (char in digits) current = digits[char]
    else if (char in units) {
      total += (current || 1) * units[char]
      current = 0
    } else return null
  }
  return total + current || null
}
