import type { ModuleName, OutlineHomeSection, PlanningDocumentKind, VolumeSection } from '../../app/types.js'

export const PLANNING_KIND_LABELS: Record<PlanningDocumentKind, { zh: string; en: string }> = {
  character: { zh: '人物', en: 'Character' },
  world_entry: { zh: '世界书', en: 'World entry' },
  timeline_event: { zh: '时间线', en: 'Timeline event' },
  location: { zh: '地点', en: 'Location' },
  foreshadowing: { zh: '伏笔', en: 'Foreshadowing' },
  strategy: { zh: '策略 / 文风', en: 'Strategy / style' },
  pattern: { zh: '模式', en: 'Pattern' },
  issue: { zh: '问题', en: 'Issue' },
  reference: { zh: '参考', en: 'Reference' }
}

export function planningKindForContext(
  context: ModuleName | OutlineHomeSection | VolumeSection
): PlanningDocumentKind | null {
  const map: Partial<Record<typeof context, PlanningDocumentKind>> = {
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    locations: 'location',
    foreshadowing: 'foreshadowing',
    strategy: 'strategy',
    style: 'strategy',
    patterns: 'pattern',
    issues: 'issue',
    references: 'reference'
  }
  return map[context] ?? null
}

export function isAIPlanningContext(context: ModuleName | OutlineHomeSection | VolumeSection): boolean {
  return planningKindForContext(context) !== null
}
