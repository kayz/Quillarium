import type { DocEntry, LanguageName, TargetSelection, WorkLevel } from '../app/types.js'
import { t } from '../app/i18n.js'

export function levelTasks(level: string): {
  summary: string
  items: string[]
  fieldTitle: string
  fields: Array<[string, string]>
} {
  if (level === 'book') {
    return {
      summary: '总纲阶段处理全书约束和素材入口。',
      items: ['检查 Canon 硬约束', '导入和整理世界书', '检查时间线主链', '梳理伏笔台账', '拆出叙事策略'],
      fieldTitle: '总纲字段',
      fields: [
        ['读者承诺', 'reader_promise'],
        ['核心爽点', 'core_appeal'],
        ['核心悬念', 'core_suspense'],
        ['类型边界', 'genre_boundary']
      ]
    }
  }
  if (level === 'volume') {
    return {
      summary: '卷纲阶段聚焦本卷内容、人物阶段和事件边界。',
      items: ['明确本卷目标和卷末状态', '筛选本卷时间线', '聚焦本卷人物', '细化关键事件', '检查本卷伏笔'],
      fieldTitle: '卷纲字段',
      fields: [
        ['本卷目标', 'volume_goal'],
        ['读者收益', 'reader_payoff'],
        ['事件链', 'event_chain'],
        ['人物成长', 'character_growth'],
        ['五循环', 'writer_cycles']
      ]
    }
  }
  if (level === 'arc') {
    return {
      summary: '段纲阶段围绕 20-30 章事件链做谋篇布局。',
      items: ['编排事件顺序', '锁定出场人物', '安排冲突推进', '标记伏笔埋设/揭示/回收', '检查是否服务卷纲'],
      fieldTitle: '段纲字段',
      fields: [
        ['冲突递进', 'conflict_ladder'],
        ['固定出场', 'cast_lock'],
        ['固定揭示', 'fixed_reveals'],
        ['埋设伏笔', 'foreshadowing_planted'],
        ['回收伏笔', 'foreshadowing_resolved']
      ]
    }
  }
  if (level === 'chapter') {
    return {
      summary: '章纲阶段由作者手写章纲，再组装约束生成草稿。',
      items: ['手写章纲', '检查最小充分上下文', '生成正文草稿', '作者修改正文', '事实核查直到定稿'],
      fieldTitle: '章纲字段',
      fields: [
        ['本章目标', 'chapter_goal'],
        ['本章冲突', 'chapter_conflict'],
        ['本章变化', 'chapter_change'],
        ['读者收益', 'reader_benefit'],
        ['章末钩子', 'ending_hook']
      ]
    }
  }
  return {
    summary: '场景阶段处理具体正文段落。',
    items: ['明确 POV', '绑定时间地点', '检查人物状态', '写作或改写正文'],
    fieldTitle: '节纲字段',
    fields: [
      ['叙事功能', 'narrative_function'],
      ['读者收益', 'reader_benefit'],
      ['章末钩子', 'ending_hook']
    ]
  }
}

export function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join(' / ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}

export function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

export function relatedDocs(docs: DocEntry[], ids: unknown): DocEntry[] {
  const set = new Set(asStringList(ids))
  return docs.filter((doc) => set.has(doc.data.id))
}

export interface OutlineHierarchy {
  outlines: DocEntry[]
  children: Map<string | null, DocEntry[]>
}

export function buildOutlineHierarchy(docs: DocEntry[]): OutlineHierarchy {
  const outlines = docs
    .filter((item) => item.data.type === 'outline')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  const children = new Map<string | null, DocEntry[]>()
  for (const outline of outlines) {
    const parent = (outline.data.parent as string | null | undefined) ?? null
    children.set(parent, [...(children.get(parent) ?? []), outline])
  }
  return { outlines, children }
}

export function outlineItemsForLevel(
  docs: DocEntry[],
  level: WorkLevel,
  selectedOutline: DocEntry | null,
  selectedTarget: TargetSelection | null
): DocEntry[] {
  const outlines = docs
    .filter((item) => item.data.type === 'outline')
    .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  if (level === 'book') return outlines.filter((item) => item.data.level === 'book')
  const selected =
    selectedTarget?.type === 'outline'
      ? outlines.find((item) => item.data.id === selectedTarget.id)
      : selectedOutline
  const parentLevel = previousWorkLevel(level)
  const parent =
    selected && selected.data.level === parentLevel
      ? selected
      : selected
        ? findAncestor(outlines, selected, parentLevel)
        : null
  if (!parent) return outlines.filter((item) => item.data.level === level)
  return outlines.filter((item) => item.data.level === level && item.data.parent === parent.data.id)
}

export function firstSelectableForLevel(
  docs: DocEntry[],
  level: WorkLevel,
  current: DocEntry | null
): DocEntry | null {
  const items = outlineItemsForLevel(
    docs,
    level,
    current,
    current ? { type: 'outline', id: current.data.id } : null
  )
  return items[0] ?? docs.find((item) => item.data.type === 'outline' && item.data.level === level) ?? null
}

export function findAncestor(
  outlines: DocEntry[],
  child: DocEntry,
  level: WorkLevel | null
): DocEntry | null {
  if (!level) return null
  let parent = child.data.parent as string | null | undefined
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const doc = outlines.find((item) => item.data.id === parent)
    if (!doc) return null
    if (doc.data.level === level) return doc
    parent = doc.data.parent as string | null | undefined
  }
  return null
}

export function filterDocs(items: DocEntry[], query: string): DocEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => {
    const haystack =
      `${item.data.title}\n${item.content}\n${Object.values(item.data).join('\n')}`.toLowerCase()
    return haystack.includes(needle)
  })
}

export function isWorkLevel(value: string): value is WorkLevel {
  return value === 'book' || value === 'volume' || value === 'arc' || value === 'chapter'
}

export function nextWorkLevel(level: WorkLevel): WorkLevel | null {
  if (level === 'book') return 'volume'
  if (level === 'volume') return 'arc'
  if (level === 'arc') return 'chapter'
  return null
}

export function previousWorkLevel(level: WorkLevel): WorkLevel | null {
  if (level === 'volume') return 'book'
  if (level === 'arc') return 'volume'
  if (level === 'chapter') return 'arc'
  return null
}

export function parentForNewLevel(
  docs: DocEntry[],
  level: WorkLevel,
  selected: DocEntry | null
): string | null {
  const parentLevel = previousWorkLevel(level)
  if (!parentLevel) return null
  const outlines = docs.filter((item) => item.data.type === 'outline')
  if (selected?.data.level === parentLevel) return selected.data.id
  if (selected) return findAncestor(outlines, selected, parentLevel)?.data.id ?? null
  return docs.find((item) => item.data.type === 'outline' && item.data.level === parentLevel)?.data.id ?? null
}

export function levelOverviewTitle(level: WorkLevel, selected: DocEntry | null): string {
  if (level === 'book') return selected?.data.title ?? '全书总览'
  return `${outlineLevelLabel(level)}总览`
}

export function structuredLine(item: DocEntry): string {
  if (item.data.type === 'scene') {
    return [
      item.data.chapter_number && `章 ${String(item.data.chapter_number)}`,
      item.data.location && `地点 ${String(item.data.location)}`,
      item.data.pov && `POV ${String(item.data.pov)}`
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const level = String(item.data.level)
  const tasks = levelTasks(level)
  return tasks.fields
    .map(([label, key]) => {
      const value = formatFieldValue(item.data[key])
      return value ? `${label}: ${value}` : ''
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ')
}

export function docTitle(docs: DocEntry[], id: unknown): string {
  if (!id) return ''
  return docs.find((item) => item.data.id === id)?.data.title ?? String(id)
}

export function buildScenePath(docs: DocEntry[], scene: DocEntry, language: LanguageName): string {
  const section = docs.find((doc) => doc.data.id === scene.data.section)
  return `${t(language, 'writing')} / ${section?.data.title ?? t(language, 'section')} / ${scene.data.title}`
}

export function buildOutlinePath(docs: DocEntry[], outline: DocEntry): string {
  const chain: string[] = [outline.data.title]
  let parent = outline.data.parent as string | null | undefined
  const seen = new Set<string>()
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const doc = docs.find((item) => item.data.id === parent && item.data.type === 'outline')
    if (!doc) break
    chain.unshift(doc.data.title)
    parent = doc.data.parent as string | null | undefined
  }
  return chain.join(' / ')
}

export function outlineLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    book: '总纲',
    volume: '卷纲',
    act: '幕纲',
    arc: '段纲',
    chapter: '章纲',
    section: '场景'
  }
  return labels[level] ?? '大纲'
}

export function outlineSortKey(outline: DocEntry): string {
  const rank: Record<string, number> = { book: 0, volume: 1, act: 2, arc: 3, chapter: 4, section: 5 }
  return `${rank[String(outline.data.level)] ?? 9}-${String(outline.data.parent ?? '')}-${String(
    outline.data.order ?? 0
  ).padStart(5, '0')}-${outline.data.title}`
}
