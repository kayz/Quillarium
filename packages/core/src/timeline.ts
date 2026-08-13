import type { TimelineEventDoc, TimelineNodeDoc, TimelinePrecision } from './types.js'

export interface StoryTimeInput {
  calendar?: string
  year: number
  month: number
  month_end?: number | null
  day?: number | null
  hour?: number | null
  minute?: number | null
  precision?: TimelinePrecision
  display_time?: string
  fuzzy?: boolean
}

export interface TimelineChainIssue {
  code:
    | 'duplicate-time-node'
    | 'missing-previous-node'
    | 'missing-next-node'
    | 'non-reciprocal-link'
    | 'multiple-heads'
    | 'multiple-tails'
    | 'timeline-cycle'
    | 'timeline-disconnected'
    | 'timeline-reversed'
  node_id: string
  related_id?: string
  message: string
}

const PRECISION_ORDER: Record<TimelinePrecision, number> = {
  month: 0,
  day: 1,
  hour: 2,
  minute: 3
}

export function parseStoryTime(value: string): StoryTimeInput {
  const raw = value.trim()
  if (!raw) throw new Error('Timeline time is required and must be precise to at least a month.')

  const season = raw.match(/^(-?\d{1,6})\s*年?\s*(春|夏|秋|冬)(?:季)?$/)
  if (season) {
    const months: Record<string, [number, number]> = {
      春: [3, 5],
      夏: [6, 8],
      秋: [9, 11],
      冬: [12, 12]
    }
    const [month, monthEnd] = months[season[2]]
    return {
      year: Number(season[1]),
      month,
      month_end: monthEnd,
      precision: 'month',
      display_time: raw,
      fuzzy: true
    }
  }

  const normalized = raw
    .replace(/[年/.]/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '')
    .replace(/\s+/g, ' ')
  const match = normalized.match(/^(-?\d{1,6})-(\d{1,2})(?:-(\d{1,2}))?(?:[ T](\d{1,2})(?::(\d{1,2}))?)?$/)
  if (!match) {
    throw new Error(
      `Unsupported timeline time “${raw}”. Use YYYY-MM, YYYY-MM-DD, YYYY-MM-DD HH:mm, or a season such as “20年秋”.`
    )
  }
  const [, year, month, day, hour, minute] = match
  const precision: TimelinePrecision = minute ? 'minute' : hour ? 'hour' : day ? 'day' : 'month'
  return validateStoryTime({
    year: Number(year),
    month: Number(month),
    day: day ? Number(day) : null,
    hour: hour ? Number(hour) : null,
    minute: minute ? Number(minute) : null,
    precision,
    display_time: raw,
    fuzzy: false
  })
}

export function validateStoryTime(input: StoryTimeInput): StoryTimeInput {
  if (!Number.isInteger(input.year)) throw new Error('Timeline year must be an integer.')
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    throw new Error('Timeline month must be between 1 and 12.')
  }
  if (input.month_end !== undefined && input.month_end !== null) {
    if (!Number.isInteger(input.month_end) || input.month_end < input.month || input.month_end > 12) {
      throw new Error('Timeline month range must end between its starting month and month 12.')
    }
  }
  const precision = input.precision ?? inferPrecision(input)
  if (PRECISION_ORDER[precision] >= PRECISION_ORDER.day) {
    if (!Number.isInteger(input.day) || Number(input.day) < 1 || Number(input.day) > 31) {
      throw new Error('Day precision requires a day between 1 and 31.')
    }
  }
  if (PRECISION_ORDER[precision] >= PRECISION_ORDER.hour) {
    if (!Number.isInteger(input.hour) || Number(input.hour) < 0 || Number(input.hour) > 23) {
      throw new Error('Hour precision requires an hour between 0 and 23.')
    }
  }
  if (precision === 'minute') {
    if (!Number.isInteger(input.minute) || Number(input.minute) < 0 || Number(input.minute) > 59) {
      throw new Error('Minute precision requires a minute between 0 and 59.')
    }
  }
  return {
    calendar: input.calendar ?? 'story',
    year: input.year,
    month: input.month,
    month_end: input.month_end ?? null,
    day: input.day ?? null,
    hour: input.hour ?? null,
    minute: input.minute ?? null,
    precision,
    display_time: input.display_time ?? formatStoryTime(input),
    fuzzy: input.fuzzy ?? false
  }
}

export function timelineNodeKey(
  node: Pick<TimelineNodeDoc, 'calendar' | 'year' | 'month' | 'day' | 'hour' | 'minute'>
): string {
  return [
    node.calendar,
    signedNumber(node.year, 8),
    numberPart(node.month, 2),
    numberPart(node.day ?? 0, 2),
    numberPart(node.hour ?? 0, 2),
    numberPart(node.minute ?? 0, 2)
  ].join(':')
}

export function compareTimelineNodes(a: TimelineNodeDoc, b: TimelineNodeDoc): number {
  return timelineNodeKey(a).localeCompare(timelineNodeKey(b)) || a.id.localeCompare(b.id)
}

export function validateTimelineChain(nodes: TimelineNodeDoc[]): TimelineChainIssue[] {
  if (!nodes.length) return []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const issues: TimelineChainIssue[] = []
  const byTime = new Map<string, string>()
  for (const node of nodes) {
    const key = timelineNodeKey(node)
    const duplicate = byTime.get(key)
    if (duplicate) {
      issues.push({
        code: 'duplicate-time-node',
        node_id: node.id,
        related_id: duplicate,
        message: `Timeline nodes ${duplicate} and ${node.id} represent the same moment; attach concurrent events to one node.`
      })
    } else {
      byTime.set(key, node.id)
    }
    if (node.previous && !byId.has(node.previous)) {
      issues.push({
        code: 'missing-previous-node',
        node_id: node.id,
        related_id: node.previous,
        message: `Timeline node ${node.id} points to missing previous node ${node.previous}.`
      })
    }
    if (node.next && !byId.has(node.next)) {
      issues.push({
        code: 'missing-next-node',
        node_id: node.id,
        related_id: node.next,
        message: `Timeline node ${node.id} points to missing next node ${node.next}.`
      })
    }
  }

  for (const node of nodes) {
    const previous = node.previous ? byId.get(node.previous) : null
    const next = node.next ? byId.get(node.next) : null
    if (previous && previous.next !== node.id) {
      issues.push({
        code: 'non-reciprocal-link',
        node_id: node.id,
        related_id: previous.id,
        message: `Timeline node ${node.id} names ${previous.id} as previous, but the reverse link does not match.`
      })
    }
    if (next && next.previous !== node.id) {
      issues.push({
        code: 'non-reciprocal-link',
        node_id: node.id,
        related_id: next.id,
        message: `Timeline node ${node.id} names ${next.id} as next, but the reverse link does not match.`
      })
    }
    if (next && compareTimelineNodes(node, next) >= 0) {
      issues.push({
        code: 'timeline-reversed',
        node_id: node.id,
        related_id: next.id,
        message: `Timeline node ${node.id} is not earlier than its next node ${next.id}.`
      })
    }
  }

  const heads = nodes.filter((node) => !node.previous)
  const tails = nodes.filter((node) => !node.next)
  if (heads.length !== 1) {
    for (const node of heads.length ? heads : nodes.slice(0, 1)) {
      issues.push({
        code: 'multiple-heads',
        node_id: node.id,
        message: `Timeline must have exactly one head; found ${heads.length}.`
      })
    }
  }
  if (tails.length !== 1) {
    for (const node of tails.length ? tails : nodes.slice(-1)) {
      issues.push({
        code: 'multiple-tails',
        node_id: node.id,
        message: `Timeline must have exactly one tail; found ${tails.length}.`
      })
    }
  }
  if (heads.length === 1) {
    const visited = new Set<string>()
    let current: TimelineNodeDoc | undefined = heads[0]
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      current = current.next ? byId.get(current.next) : undefined
    }
    if (current) {
      issues.push({
        code: 'timeline-cycle',
        node_id: current.id,
        message: `Timeline contains a cycle at ${current.id}.`
      })
    }
    for (const node of nodes.filter((candidate) => !visited.has(candidate.id))) {
      issues.push({
        code: 'timeline-disconnected',
        node_id: node.id,
        message: `Timeline node ${node.id} is disconnected from the main chain.`
      })
    }
  }
  return uniqueIssues(issues)
}

export function sortTimelineEvents(events: TimelineEventDoc[], nodes: TimelineNodeDoc[]): TimelineEventDoc[] {
  const nodeOrder = new Map(
    [...nodes].sort(compareTimelineNodes).map((node, index) => [node.id, index] as const)
  )
  return [...events].sort((a, b) => {
    const aOrder = a.timeline_node
      ? (nodeOrder.get(a.timeline_node) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER
    const bOrder = b.timeline_node
      ? (nodeOrder.get(b.timeline_node) ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER
    return aOrder - bOrder || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  })
}

function inferPrecision(input: StoryTimeInput): TimelinePrecision {
  if (input.minute !== undefined && input.minute !== null) return 'minute'
  if (input.hour !== undefined && input.hour !== null) return 'hour'
  if (input.day !== undefined && input.day !== null) return 'day'
  return 'month'
}

function formatStoryTime(input: StoryTimeInput): string {
  return [
    String(input.year),
    numberPart(input.month, 2),
    input.day === undefined || input.day === null ? null : numberPart(input.day, 2)
  ]
    .filter((part): part is string => part !== null)
    .join('-')
}

function signedNumber(value: number, width: number): string {
  const shifted = value + 10 ** (width - 1)
  return numberPart(shifted, width)
}

function numberPart(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

function uniqueIssues(issues: TimelineChainIssue[]): TimelineChainIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.code}\0${issue.node_id}\0${issue.related_id ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
