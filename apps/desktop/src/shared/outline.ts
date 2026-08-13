import type { DocEntry, LanguageName, TargetSelection, WorkLevel } from '../app/types.js'
import { t } from '../app/i18n.js'

export function levelTasks(level: string): {
  summary: string
  items: string[]
  fieldTitle: string
  fields: Array<[string, string]>
} {
  if (level === 'overview') {
    return {
      summary: '总览用一句话锁定作品目的、核心人物、主要矛盾与最终方向。',
      items: ['明确故事目的', '锁定核心人物', '写清主要矛盾', '指向最终方向'],
      fieldTitle: '总览字段',
      fields: [
        ['一句话目的', 'story_purpose'],
        ['核心人物', 'core_characters'],
        ['主要矛盾', 'central_conflict'],
        ['最终方向', 'final_direction']
      ]
    }
  }
  if (level === 'book') {
    return {
      summary: '总纲阶段处理全书约束和素材入口。',
      items: ['检查 Canon 硬约束', '导入和整理世界书', '检查时间线主链', '梳理伏笔台账', '拆出叙事策略'],
      fieldTitle: '总纲字段',
      fields: [
        ['世界线主轴', 'worldline_axis'],
        ['人物命运线', 'character_destiny_axis'],
        ['关键阶段', 'key_stages'],
        ['因果链', 'causal_chain'],
        ['最终状态', 'final_state']
      ]
    }
  }
  if (level === 'volume') {
    return {
      summary: '卷阶段聚焦本卷内容、人物阶段和事件边界。',
      items: ['明确本卷目标和卷末状态', '筛选本卷时间线', '聚焦本卷人物', '细化关键事件', '检查本卷伏笔'],
      fieldTitle: '卷字段',
      fields: [
        ['本卷目标', 'volume_goal'],
        ['读者收益', 'reader_payoff'],
        ['事件链', 'event_chain'],
        ['人物成长', 'character_growth'],
        ['五循环', 'story_cycles']
      ]
    }
  }
  if (level === 'part' || level === 'arc') {
    return {
      summary: '篇围绕一个中期目标推动本卷，并在完成时形成重要且通常不可逆的变化。',
      items: ['编排事件顺序', '锁定出场人物', '安排冲突推进', '标记伏笔埋设/揭示/回收', '检查是否服务本卷'],
      fieldTitle: '篇字段',
      fields: [
        ['冲突递进', 'conflict_ladder'],
        ['固定出场', 'cast_lock'],
        ['固定揭示', 'fixed_reveals'],
        ['埋设伏笔', 'foreshadowing_planted'],
        ['回收伏笔', 'foreshadowing_resolved']
      ]
    }
  }
  if (level === 'act') {
    return {
      summary: '幕是可选的完整故事单元，具备发生、发展、转折与结果。',
      items: ['明确具体目标', '建立核心矛盾', '安排转折', '写清结果'],
      fieldTitle: '幕字段',
      fields: [
        ['故事目标', 'stage_goal'],
        ['冲突递进', 'conflict_ladder'],
        ['开始状态', 'start_state'],
        ['结束状态', 'end_state']
      ]
    }
  }
  if (level === 'chapter') {
    return {
      summary: '章阶段由作者手写本章规划，再组装约束生成各节草稿。',
      items: ['手写本章规划', '检查最小充分上下文', '生成节草稿', '作者修改正文', '事实核查直到定稿'],
      fieldTitle: '章字段',
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
    fieldTitle: '节字段',
    fields: [
      ['叙事功能', 'narrative_function'],
      ['读者收益', 'reader_benefit'],
      ['章末钩子', 'ending_hook']
    ]
  }
}

export function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatFieldValue).filter(Boolean).join(' / ')
  if (value && typeof value === 'object') return JSON.stringify(value, null, 0)
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
    const explicitParent = (outline.data.parent as string | null | undefined) ?? null
    const parent = explicitParent ?? inferLegacyOutlineParent(outlines, outline)
    children.set(parent, [...(children.get(parent) ?? []), outline])
  }
  return { outlines, children }
}

function inferLegacyOutlineParent(outlines: DocEntry[], outline: DocEntry): string | null {
  const level = String(outline.data.level ?? '')
  if (level === 'overview' || level === 'book') return null
  if (level === 'arc') {
    const volume = outlines.find((candidate) => candidate.data.level === 'volume')
    return volume?.data.id ?? null
  }
  const parentLevel = previousWorkLevel(level as WorkLevel)
  if (!parentLevel || parentLevel === 'ai') return null
  const parents = outlines.filter((candidate) => candidate.data.level === parentLevel)
  if (parents.length === 1) return parents[0].data.id
  const label = outlineLevelLabel(parentLevel)
  const preferred = parents.filter((candidate) => String(candidate.data.title).includes(label))
  return (preferred[0] ?? parents[0])?.data.id ?? null
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
  if (level === 'ai') {
    const chapter =
      selectedTarget?.type === 'outline'
        ? outlines.find((item) => item.data.id === selectedTarget.id && item.data.level === 'chapter')
        : selectedOutline?.data.level === 'chapter'
          ? selectedOutline
          : null
    return chapter ? [chapter] : outlines.filter((item) => item.data.level === 'chapter')
  }
  if (level === 'overview' || level === 'book') return outlines.filter((item) => item.data.level === level)
  const selected =
    selectedTarget?.type === 'outline'
      ? outlines.find((item) => item.data.id === selectedTarget.id)
      : selectedOutline
  if (level === 'chapter' && selected) {
    const directParent = ['act', 'part', 'arc'].includes(String(selected.data.level))
      ? selected
      : (findAncestor(outlines, selected, 'act') ?? findAncestor(outlines, selected, 'part'))
    if (directParent) {
      return outlines.filter(
        (item) => item.data.level === 'chapter' && item.data.parent === directParent.data.id
      )
    }
  }
  const parentLevel = previousWorkLevel(level)
  const parent =
    selected && selected.data.level === parentLevel
      ? selected
      : selected
        ? findAncestor(outlines, selected, parentLevel)
        : null
  const matches = (item: DocEntry) =>
    item.data.level === level || (level === 'part' && item.data.level === 'arc')
  if (!parent) return outlines.filter(matches)
  return outlines.filter((item) => matches(item) && item.data.parent === parent.data.id)
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
  const hierarchy = buildOutlineHierarchy(docs)
  return (
    items.find((item) => (hierarchy.children.get(item.data.id) ?? []).length > 0) ??
    items[0] ??
    docs.find((item) => item.data.type === 'outline' && item.data.level === level) ??
    null
  )
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
      `${item.data.title}\n${item.content}\n${Object.values(item.data).map(formatFieldValue).join('\n')}`.toLowerCase()
    return haystack.includes(needle)
  })
}

export function isWorkLevel(value: string): value is WorkLevel {
  return (
    value === 'overview' ||
    value === 'book' ||
    value === 'volume' ||
    value === 'part' ||
    value === 'act' ||
    value === 'chapter' ||
    value === 'ai'
  )
}

export function nextWorkLevel(level: WorkLevel): WorkLevel | null {
  if (level === 'book') return 'volume'
  if (level === 'volume') return 'part'
  if (level === 'part') return 'act'
  if (level === 'act') return 'chapter'
  if (level === 'chapter') return 'ai'
  return null
}

export function previousWorkLevel(level: WorkLevel): WorkLevel | null {
  if (level === 'volume') return 'book'
  if (level === 'part') return 'volume'
  if (level === 'act') return 'part'
  if (level === 'chapter') return 'act'
  if (level === 'ai') return 'chapter'
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
  if (level === 'chapter') {
    if (selected && ['act', 'part', 'arc'].includes(String(selected.data.level))) return selected.data.id
    if (selected) {
      return (
        findAncestor(outlines, selected, 'act')?.data.id ??
        findAncestor(outlines, selected, 'part')?.data.id ??
        null
      )
    }
  }
  if (selected?.data.level === parentLevel) return selected.data.id
  if (selected) return findAncestor(outlines, selected, parentLevel)?.data.id ?? null
  return docs.find((item) => item.data.type === 'outline' && item.data.level === parentLevel)?.data.id ?? null
}

export function childWorkLevels(level: WorkLevel): WorkLevel[] {
  if (level === 'part') return ['act', 'chapter']
  const next = nextWorkLevel(level)
  return next && next !== 'ai' ? [next] : []
}

export function parentLevelsForWorkLevel(level: WorkLevel): WorkLevel[] {
  if (level === 'chapter') return ['act', 'part']
  const previous = previousWorkLevel(level)
  return previous ? [previous] : []
}

export function levelOverviewTitle(level: WorkLevel, selected: DocEntry | null): string {
  if (level === 'overview') return selected?.data.title ?? '作品总览'
  if (level === 'book') return selected?.data.title ?? '全书总纲'
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
  const section = docs.find((doc) => doc.data.id === (scene.data.chapter_id ?? scene.data.section))
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
    overview: '总览',
    book: '总纲',
    volume: '卷',
    act: '幕',
    part: '篇',
    arc: '篇',
    chapter: '章',
    section: '节',
    ai: 'AI 编写'
  }
  return labels[level] ?? '大纲'
}

export function outlineSortKey(outline: DocEntry): string {
  const rank: Record<string, number> = {
    overview: 0,
    book: 1,
    volume: 2,
    part: 3,
    arc: 3,
    act: 4,
    chapter: 5,
    section: 6
  }
  return `${rank[String(outline.data.level)] ?? 9}-${String(outline.data.parent ?? '')}-${String(
    outline.data.order ?? 0
  ).padStart(5, '0')}-${outline.data.title}`
}
