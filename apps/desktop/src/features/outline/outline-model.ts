import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Library,
  MapPin,
  PenLine,
  Sparkles,
  UserRound,
  WandSparkles
} from 'lucide-react'
import type {
  DocEntry,
  LanguageName,
  OutlineHomeSection,
  ProjectListItem,
  VolumeSection,
  WorkLevel
} from '../../app/types.js'
import {
  asStringList,
  findAncestor,
  formatFieldValue,
  outlineLevelLabel,
  outlineSortKey
} from '../../shared/outline.js'

export interface OutlineSectionDefinition<T extends string> {
  id: T
  title: string
  short: string
  heading: string
  enTitle: string
  enShort: string
  enHeading: string
  icon: typeof BookOpen
}

export const OUTLINE_HOME_SECTIONS: Array<OutlineSectionDefinition<OutlineHomeSection>> = [
  {
    id: 'volumes',
    title: '卷纲',
    short: '卷',
    heading: '全书卷纲',
    enTitle: 'Volumes',
    enShort: 'V',
    enHeading: 'Volume outlines',
    icon: BookOpen
  },
  {
    id: 'canon',
    title: '正设',
    short: '正',
    heading: 'Canon 正设',
    enTitle: 'Canon',
    enShort: 'C',
    enHeading: 'Canon',
    icon: CheckCircle2
  },
  {
    id: 'world',
    title: '世界书',
    short: '世',
    heading: '世界书',
    enTitle: 'World',
    enShort: 'W',
    enHeading: 'World entries',
    icon: Library
  },
  {
    id: 'characters',
    title: '人物',
    short: '人',
    heading: '人物档案',
    enTitle: 'Characters',
    enShort: 'H',
    enHeading: 'Character records',
    icon: UserRound
  },
  {
    id: 'timeline',
    title: '时间线',
    short: '时',
    heading: '时间线',
    enTitle: 'Timeline',
    enShort: 'T',
    enHeading: 'Timeline',
    icon: Clock3
  },
  {
    id: 'locations',
    title: '地点',
    short: '地',
    heading: '地点与空间',
    enTitle: 'Locations',
    enShort: 'L',
    enHeading: 'Locations and spaces',
    icon: MapPin
  },
  {
    id: 'foreshadowing',
    title: '伏笔',
    short: '伏',
    heading: '伏笔台账',
    enTitle: 'Foreshadowing',
    enShort: 'F',
    enHeading: 'Foreshadowing ledger',
    icon: Sparkles
  },
  {
    id: 'style',
    title: '文风',
    short: '文',
    heading: '文笔与文风',
    enTitle: 'Style',
    enShort: 'S',
    enHeading: 'Prose and style',
    icon: PenLine
  },
  {
    id: 'patterns',
    title: '模式',
    short: '模',
    heading: '故事与提示词模式',
    enTitle: 'Patterns',
    enShort: 'P',
    enHeading: 'Story and prompt patterns',
    icon: WandSparkles
  },
  {
    id: 'issues',
    title: '问题',
    short: '问',
    heading: '待确认问题',
    enTitle: 'Issues',
    enShort: 'I',
    enHeading: 'Open issues',
    icon: Circle
  },
  {
    id: 'references',
    title: '参考',
    short: '参',
    heading: '参考资料',
    enTitle: 'References',
    enShort: 'R',
    enHeading: 'Reference materials',
    icon: FileText
  }
]

export const VOLUME_SECTIONS: Array<OutlineSectionDefinition<VolumeSection>> = [
  {
    id: 'arcs',
    title: '段纲',
    short: '段',
    heading: '本卷段纲',
    enTitle: 'Arcs',
    enShort: 'A',
    enHeading: 'Volume arcs',
    icon: BookOpen
  },
  {
    id: 'canon',
    title: '正设',
    short: '正',
    heading: '本卷正设',
    enTitle: 'Canon',
    enShort: 'C',
    enHeading: 'Volume canon',
    icon: CheckCircle2
  },
  {
    id: 'world',
    title: '世界书',
    short: '世',
    heading: '本卷世界书',
    enTitle: 'World',
    enShort: 'W',
    enHeading: 'Volume world entries',
    icon: Library
  },
  {
    id: 'characters',
    title: '人物',
    short: '人',
    heading: '本卷人物',
    enTitle: 'Characters',
    enShort: 'H',
    enHeading: 'Volume characters',
    icon: UserRound
  },
  {
    id: 'timeline',
    title: '时间线',
    short: '时',
    heading: '本卷时间线',
    enTitle: 'Timeline',
    enShort: 'T',
    enHeading: 'Volume timeline',
    icon: Clock3
  },
  {
    id: 'locations',
    title: '地点',
    short: '地',
    heading: '本卷地点',
    enTitle: 'Locations',
    enShort: 'L',
    enHeading: 'Volume locations',
    icon: MapPin
  },
  {
    id: 'foreshadowing',
    title: '伏笔',
    short: '伏',
    heading: '本卷伏笔',
    enTitle: 'Foreshadowing',
    enShort: 'F',
    enHeading: 'Volume foreshadowing',
    icon: Sparkles
  },
  {
    id: 'style',
    title: '文风',
    short: '文',
    heading: '本卷文笔与文风',
    enTitle: 'Style',
    enShort: 'S',
    enHeading: 'Volume prose and style',
    icon: PenLine
  },
  {
    id: 'patterns',
    title: '模式',
    short: '模',
    heading: '本卷故事与提示词模式',
    enTitle: 'Patterns',
    enShort: 'P',
    enHeading: 'Volume story and prompt patterns',
    icon: WandSparkles
  },
  {
    id: 'issues',
    title: '问题',
    short: '问',
    heading: '本卷待确认问题',
    enTitle: 'Issues',
    enShort: 'I',
    enHeading: 'Volume open issues',
    icon: Circle
  },
  {
    id: 'references',
    title: '参考',
    short: '参',
    heading: '本卷参考资料',
    enTitle: 'References',
    enShort: 'R',
    enHeading: 'Volume references',
    icon: FileText
  }
]

export function localizedOutlineSection(
  section: OutlineSectionDefinition<string>,
  language: LanguageName
): { title: string; short: string; heading: string } {
  return language === 'zh'
    ? { title: section.title, short: section.short, heading: section.heading }
    : { title: section.enTitle, short: section.enShort, heading: section.enHeading }
}

export function outlineSectionDocs(docs: DocEntry[], section: OutlineHomeSection): DocEntry[] {
  const typeMap: Partial<Record<OutlineHomeSection, string>> = {
    canon: 'canon',
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    locations: 'location',
    foreshadowing: 'foreshadowing',
    patterns: 'pattern',
    issues: 'issue',
    references: 'reference'
  }
  if (section === 'volumes') {
    return docs
      .filter((doc) => doc.data.type === 'outline' && doc.data.level === 'volume')
      .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  }
  if (section === 'style') {
    return docs.filter(
      (doc) =>
        (doc.data.type === 'pattern' && doc.data.kind === 'writing') ||
        (doc.data.type === 'strategy' && doc.data.category === 'style')
    )
  }
  const type = typeMap[section]
  return docs.filter((doc) => doc.data.type === type)
}

export function volumeSectionDocs(docs: DocEntry[], volume: DocEntry, section: VolumeSection): DocEntry[] {
  if (section === 'arcs') {
    return docs
      .filter(
        (doc) => doc.data.type === 'outline' && doc.data.level === 'arc' && doc.data.parent === volume.data.id
      )
      .sort((a, b) => outlineSortKey(a).localeCompare(outlineSortKey(b)))
  }
  return outlineSectionDocs(docs, section).filter((doc) => isDocUsedByVolume(docs, volume, doc))
}

export function countVolumeSection(docs: DocEntry[], volume: DocEntry, section: VolumeSection): number {
  return volumeSectionDocs(docs, volume, section).length
}

export function applyVolumeScope(data: Record<string, unknown>, volume: DocEntry): Record<string, unknown> {
  const tags = Array.isArray(data.tags) ? data.tags.map(String) : []
  return {
    ...data,
    scope: data.scope ?? 'volume',
    volume: data.volume ?? volume.data.id,
    tags: [...new Set([...tags, `volume:${volume.data.id}`])]
  }
}

export function isDocUsedByVolume(docs: DocEntry[], volume: DocEntry, doc: DocEntry): boolean {
  if (doc.data.type === 'outline')
    return (
      doc.data.id === volume.data.id || findAncestorOfDoc(docs, doc, 'volume')?.data.id === volume.data.id
    )
  if (doc.data.volume === volume.data.id || doc.data.scope === volume.data.id) return true
  if (asStringList(doc.data.tags).includes(`volume:${volume.data.id}`)) return true
  const volumeRelated = collectVolumeRelatedIds(docs, volume)
  return volumeRelated.has(doc.data.id)
}

export function collectVolumeRelatedIds(docs: DocEntry[], volume: DocEntry): Set<string> {
  const ids = new Set<string>()
  const outlines = docs.filter((item) => item.data.type === 'outline')
  const volumeTree = outlines.filter(
    (item) =>
      item.data.id === volume.data.id || findAncestor(outlines, item, 'volume')?.data.id === volume.data.id
  )
  const scenes = docs.filter(
    (item) =>
      item.data.type === 'scene' && volumeTree.some((outline) => outline.data.id === item.data.section)
  )
  for (const item of [...volumeTree, ...scenes]) {
    for (const key of [
      'related_timeline',
      'related_characters',
      'related_foreshadowing',
      'foreshadowing_planted',
      'foreshadowing_resolved',
      'world_entries_used',
      'related_patterns',
      'location',
      'timeline_node',
      'pov',
      'characters'
    ]) {
      const value = item.data[key]
      if (Array.isArray(value)) value.map(String).forEach((id) => ids.add(id))
      else if (value) ids.add(String(value))
    }
  }
  return ids
}

export function findAncestorOfDoc(
  docs: DocEntry[],
  child: DocEntry,
  level: WorkLevel | null
): DocEntry | null {
  return findAncestor(
    docs.filter((item) => item.data.type === 'outline'),
    child,
    level
  )
}

export function timelineBelongsToArc(docs: DocEntry[], arc: DocEntry, timeline: DocEntry): boolean {
  if (asStringList(arc.data.related_timeline).includes(timeline.data.id)) return true
  const chapters = docs.filter(
    (item) =>
      item.data.type === 'outline' && item.data.level === 'chapter' && item.data.parent === arc.data.id
  )
  const scenes = docs.filter(
    (item) => item.data.type === 'scene' && chapters.some((chapter) => chapter.data.id === item.data.section)
  )
  return [...chapters, ...scenes].some((item) => {
    if (item.data.timeline_node === timeline.data.id) return true
    return asStringList(item.data.related_timeline).includes(timeline.data.id)
  })
}

export function countSection(docs: DocEntry[], section: OutlineHomeSection): number {
  return outlineSectionDocs(docs, section).length
}

export function createInputForOutlineSection(
  section: OutlineHomeSection,
  title: string,
  docs: DocEntry[],
  project: ProjectListItem
): { kind: string; data: Record<string, unknown> } {
  const content = `## ${title}\n`
  if (section === 'volumes') {
    const siblings = docs.filter((doc) => doc.data.type === 'outline' && doc.data.level === 'volume')
    const book = docs.find((doc) => doc.data.type === 'outline' && doc.data.level === 'book')
    return {
      kind: 'outline',
      data: {
        title,
        level: 'volume',
        parent: book?.data.id ?? null,
        order: siblings.length,
        target_words: Math.max(project.chapter_words * 20, 1),
        content
      }
    }
  }
  if (section === 'canon')
    return { kind: 'canon', data: { title, content, status: 'confirmed', strength: 'hard' } }
  if (section === 'world') return { kind: 'world_entry', data: { title, content, entry_status: 'candidate' } }
  if (section === 'characters') return { kind: 'character', data: { title, content } }
  if (section === 'timeline') return { kind: 'timeline_event', data: { title, content } }
  if (section === 'locations') return { kind: 'location', data: { title, content } }
  if (section === 'foreshadowing') return { kind: 'foreshadowing', data: { title, content } }
  if (section === 'style') {
    return {
      kind: 'pattern',
      data: { title, content, kind: 'writing', scope: 'project', source: 'user', applies_to: ['style'] }
    }
  }
  if (section === 'patterns') return { kind: 'pattern', data: { title, content, kind: 'story' } }
  if (section === 'issues') return { kind: 'issue', data: { title, content, priority: 'medium' } }
  return { kind: 'reference', data: { title, content } }
}

export function docTypeLabel(doc: DocEntry): string {
  if (doc.data.type === 'outline') return outlineLevelLabel(String(doc.data.level))
  const labels: Record<string, string> = {
    canon: '正设',
    world_entry: '世界书',
    character: '人物',
    timeline_event: '时间线',
    location: '地点',
    foreshadowing: '伏笔',
    pattern: doc.data.kind === 'writing' ? '文风' : '模式',
    strategy: '策略',
    issue: '问题',
    reference: '参考',
    scene: '正文'
  }
  return labels[String(doc.data.type)] ?? String(doc.data.type)
}

export function structuredLineForSection(doc: DocEntry): string {
  const keysByType: Record<string, string[]> = {
    canon: ['strength', 'source'],
    world_entry: ['triggers', 'role', 'valid_from', 'importance'],
    character: ['role', 'desire', 'fear'],
    timeline_event: ['date', 'location', 'characters'],
    location: ['parent_location', 'description'],
    foreshadowing: ['level', 'state', 'planned_plant', 'planned_resolve'],
    pattern: ['kind', 'scope', 'source', 'applies_to'],
    strategy: ['category', 'scope', 'principles'],
    issue: ['priority', 'state', 'decision_needed'],
    reference: ['material_type', 'reading_status', 'location'],
    outline: ['volume_goal', 'reader_payoff', 'event_chain']
  }
  const keys = keysByType[String(doc.data.type)] ?? ['status']
  return keys
    .map((key) => {
      const value = formatFieldValue(doc.data[key])
      return value ? `${fieldLabel(key)}: ${value}` : ''
    })
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')
}

export function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    title: '标题',
    status: '状态',
    tags: '标签',
    strength: '强度',
    source: '来源',
    triggers: '触发词',
    role: '作用',
    valid_from: '起',
    importance: '重要度',
    desire: '欲望',
    fear: '恐惧',
    date: '日期',
    location: '地点',
    characters: '人物',
    parent_location: '上级地点',
    description: '描述',
    level: '级别',
    state: '状态',
    planned_plant: '计划埋设',
    planned_resolve: '计划回收',
    kind: '类型',
    scope: '范围',
    applies_to: '适用',
    category: '分类',
    principles: '原则',
    priority: '优先级',
    decision_needed: '待确认',
    material_type: '资料类型',
    reading_status: '阅读状态',
    volume_goal: '本卷目标',
    reader_payoff: '兑现',
    event_chain: '事件链'
  }
  return labels[key] ?? key
}
