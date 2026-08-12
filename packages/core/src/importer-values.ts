export function asStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string' || typeof item === 'number') return [String(item)]
        if (item && typeof item === 'object') return [Object.values(item).map(String).join(': ')]
        return []
      })
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    if (!value.trim()) return []
    return value
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return [String(value)]
}

export function normalizeLevel(value?: string): 'L1' | 'L2' | 'L3' | 'L4' | 'L5' {
  const upper = value?.toUpperCase()
  return upper === 'L1' || upper === 'L2' || upper === 'L3' || upper === 'L4' || upper === 'L5' ? upper : 'L4'
}

export function normalizeForeshadowingState(
  value?: string
): 'planned' | 'planted' | 'reinforced' | 'resolved' | 'abandoned' {
  if (value === '已埋设') return 'planted'
  if (value === '已强化') return 'reinforced'
  if (value === '已回收') return 'resolved'
  if (value === '已废弃') return 'abandoned'
  if (value === 'planted' || value === 'reinforced' || value === 'resolved' || value === 'abandoned')
    return value
  return 'planned'
}

export function normalizeWorldRole(value?: string): 'constraint' | 'texture' | 'both' {
  if (value === '约束' || value === 'constraint') return 'constraint'
  if (value === '血肉' || value === 'texture') return 'texture'
  return 'both'
}

export function normalizeEntryStatus(value?: string): 'candidate' | 'active' | 'inactive' {
  if (value === '启用' || value === 'active') return 'active'
  if (value === '停用' || value === 'inactive') return 'inactive'
  return 'candidate'
}

export function normalizeImportance(value?: string): 'high' | 'medium' | 'low' {
  if (value === '高' || value === 'high') return 'high'
  if (value === '低' || value === 'low') return 'low'
  return 'medium'
}

export function normalizeMaterialType(
  value?: string
): 'book' | 'paper' | 'article' | 'webpage' | 'video' | 'other' {
  if (value === '书籍' || value === 'book') return 'book'
  if (value === '论文' || value === 'paper') return 'paper'
  if (value === '文章' || value === 'article') return 'article'
  if (value === '网页' || value === 'webpage') return 'webpage'
  if (value === '影像' || value === 'video') return 'video'
  return 'other'
}

export function normalizeReadingStatus(value?: string): 'unread' | 'reading' | 'read' {
  if (value === '在读' || value === 'reading') return 'reading'
  if (value === '已读' || value === 'read') return 'read'
  return 'unread'
}

export function normalizePriority(value?: string): 'high' | 'medium' | 'low' {
  if (value === '高' || value === 'high') return 'high'
  if (value === '低' || value === 'low') return 'low'
  return 'medium'
}

export function normalizeIssueState(value?: string): 'open' | 'resolved' | 'deferred' {
  if (value === '已解决' || value === 'resolved') return 'resolved'
  if (value === '暂缓' || value === 'deferred') return 'deferred'
  return 'open'
}

export function normalizeStrategyCategory(
  value?: string
): 'narrative' | 'style' | 'pacing' | 'reader_expectation' | 'genre_boundary' | 'other' {
  if (value === '文风' || value === 'style') return 'style'
  if (value === '节奏' || value === 'pacing') return 'pacing'
  if (value === '读者预期' || value === 'reader_expectation') return 'reader_expectation'
  if (value === '题材边界' || value === 'genre_boundary') return 'genre_boundary'
  if (value === '其他' || value === 'other') return 'other'
  return 'narrative'
}

export function normalizePatternKind(value?: string): 'story' | 'writing' | 'prompt' {
  if (value === 'writing' || value === '写法') return 'writing'
  if (value === 'prompt' || value === '提示词') return 'prompt'
  return 'story'
}

export function normalizePatternScope(
  value?: string
): 'book' | 'volume' | 'arc' | 'chapter' | 'section' | 'agent' | 'project' {
  if (value === 'book' || value === '总纲' || value === '全书') return 'book'
  if (value === 'volume' || value === '卷纲' || value === '卷') return 'volume'
  if (value === 'arc' || value === '段纲' || value === '段') return 'arc'
  if (value === 'chapter' || value === '章纲' || value === '章') return 'chapter'
  if (value === 'section' || value === '节纲' || value === '节') return 'section'
  if (value === 'agent' || value === 'Agent') return 'agent'
  return 'project'
}

export function normalizePatternSource(value?: string): 'user' | 'ai' | 'accepted_prose' | 'imported' {
  if (value === 'ai' || value === 'AI') return 'ai'
  if (value === 'accepted_prose' || value === '定稿正文') return 'accepted_prose'
  if (value === 'imported' || value === '导入') return 'imported'
  return 'user'
}

export function normalizeStoryCycles(
  value: unknown
): Array<'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship'> {
  const allowed = new Set(['desire', 'pressure', 'growth', 'reveal', 'relationship'])
  const translated: Record<string, 'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship'> = {
    欲望: 'desire',
    压力: 'pressure',
    成长: 'growth',
    揭秘: 'reveal',
    关系: 'relationship'
  }
  return asStringArray(value)
    .map((item) => translated[item] ?? item)
    .filter((item): item is 'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship' => allowed.has(item))
}

export function normalizeStateScope(value?: string): 'timeline_event' | 'outline' | 'scene' {
  if (value === '时间线' || value === 'timeline_event') return 'timeline_event'
  if (value === '场景' || value === 'scene') return 'scene'
  return 'outline'
}

export function normalizeIssuePriority(value?: string): 'high' | 'medium' | 'low' {
  if (value === 'P0' || value === 'P1' || value === '高' || value === 'high') return 'high'
  if (value === 'P2' || value === '低' || value === 'low') return 'low'
  return 'medium'
}

export function normalizeIssueLedgerState(value?: string): 'open' | 'resolved' | 'deferred' {
  if (value?.includes('已解决') || value === 'resolved') return 'resolved'
  if (value?.includes('暂缓') || value === 'deferred') return 'deferred'
  return 'open'
}

export function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const match = value.match(/\d+/)
    if (match) return Number(match[0])
  }
  return undefined
}

export function booleanOrUndefined(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim() ? true : undefined
  return undefined
}
