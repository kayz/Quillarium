import type {
  ModuleName,
  OutlineHomeSection,
  PlanningCheckScope,
  PlanningDocumentKind,
  VolumeSection
} from '../../app/types.js'

export const PLANNING_KIND_LABELS: Record<PlanningDocumentKind, { zh: string; en: string }> = {
  character: { zh: '人物', en: 'Character' },
  character_relation: { zh: '人物关系', en: 'Character relationship' },
  world_entry: { zh: '世界书', en: 'World entry' },
  timeline_node: { zh: '时间节点', en: 'Timeline node' },
  timeline_event: { zh: '时间线', en: 'Timeline event' },
  location: { zh: '地点', en: 'Location' },
  foreshadowing: { zh: '伏笔', en: 'Foreshadowing' },
  strategy: { zh: '旧策略（兼容）', en: 'Legacy strategy' },
  pattern: { zh: '旧模式（兼容）', en: 'Legacy pattern' },
  narrative: { zh: '叙事', en: 'Narrative' },
  issue: { zh: '问题', en: 'Issue' },
  reference: { zh: '参考', en: 'Reference' }
}

export const CREATABLE_PLANNING_KINDS: PlanningDocumentKind[] = (
  Object.keys(PLANNING_KIND_LABELS) as PlanningDocumentKind[]
).filter((kind) => kind !== 'strategy' && kind !== 'pattern')

export function planningKindForContext(
  context: ModuleName | OutlineHomeSection | VolumeSection
): PlanningDocumentKind | null {
  const map: Partial<Record<typeof context, PlanningDocumentKind>> = {
    world: 'world_entry',
    characters: 'character',
    timeline: 'timeline_event',
    locations: 'location',
    foreshadowing: 'foreshadowing',
    narrative: 'narrative',
    issues: 'issue',
    references: 'reference'
  }
  return map[context] ?? null
}

export function isAIPlanningContext(context: ModuleName | OutlineHomeSection | VolumeSection): boolean {
  return planningKindForContext(context) !== null
}

export function planningCheckScopeForContext(
  context: ModuleName | OutlineHomeSection | VolumeSection
): PlanningCheckScope {
  const map: Partial<Record<typeof context, PlanningCheckScope>> = {
    canon: 'canon',
    world: 'world',
    characters: 'characters',
    timeline: 'timeline',
    locations: 'locations',
    foreshadowing: 'foreshadowing',
    narrative: 'narrative',
    issues: 'issues',
    references: 'references'
  }
  return map[context] ?? 'outline'
}

export function planningKindsForContext(
  context: ModuleName | OutlineHomeSection | VolumeSection | string,
  anchorKind?: PlanningDocumentKind
): PlanningDocumentKind[] {
  const map: Partial<Record<string, PlanningDocumentKind[]>> = {
    world: ['world_entry'],
    characters: ['character', 'character_relation'],
    timeline: ['timeline_node', 'timeline_event'],
    locations: ['location'],
    foreshadowing: ['foreshadowing'],
    narrative: ['narrative'],
    references: ['reference']
  }
  const scoped = map[context] ?? CREATABLE_PLANNING_KINDS
  return anchorKind && !scoped.includes(anchorKind) ? [anchorKind, ...scoped] : [...scoped]
}
