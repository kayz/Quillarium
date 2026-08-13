export type DocType =
  | 'canon'
  | 'character'
  | 'character_relation'
  | 'timeline_node'
  | 'timeline_event'
  | 'location'
  | 'route'
  | 'foreshadowing'
  | 'world_entry'
  | 'reference'
  | 'issue'
  | 'strategy'
  | 'pattern'
  | 'narrative'
  | 'character_state'
  | 'resource'
  | 'causality'
  | 'outline'
  | 'chapter_prose'
  | 'scene'
  | 'prompt'

export type DocumentStatus =
  | 'draft'
  | 'confirmed'
  | 'deprecated'
  | 'active'
  | 'archived'
  | 'final'
  | 'published'
  | 'candidate'
  | 'planned'
  | 'planted'
  | 'reinforced'
  | 'resolved'
  | 'abandoned'
  | 'open'
  | 'deferred'

export interface DocumentIdentity {
  id: string
  type: DocType
  schema_version: number
  title: string
  tags: string[]
}

export interface BaseDoc extends DocumentIdentity {
  status: DocumentStatus
}

export type CardRelationKind =
  | 'related'
  | 'supports'
  | 'contradicts'
  | 'depends_on'
  | 'located_in'
  | 'layout_of'
  | 'involves'
  | 'triggers'
  | 'resolves'
  | 'explains'

export interface CardRelation {
  kind: CardRelationKind
  target_id: string
  note: string
}

export interface PlanningCardDoc extends BaseDoc {
  enabled: boolean
  source_refs: string[]
  relations: CardRelation[]
}

export interface ProjectConfig {
  id: string
  aliases: string[]
  title: string
  genre: string
  target_words: number
  chapter_words: number
  section_words: number
  current_volume: number
  current_timeline_node: string | null
  default_theme: 'paper' | 'ink' | 'mist' | 'bamboo'
  schema_version: 2
}

export type SharedGuidanceScope =
  'overview' | 'book' | 'volume' | 'part' | 'act' | 'arc' | 'chapter' | 'scene' | 'finalization'

export interface WorkspaceProjectRef {
  id: string
  path: string
}

export interface SharedGuidanceRef {
  id: string
  path: string
  scopes: SharedGuidanceScope[]
}

export interface WorkspaceManifestV1 {
  schema_version: 1
  id: string
  projects_dir: string
  projects: WorkspaceProjectRef[]
  shared_guidance: SharedGuidanceRef[]
}

export interface WorkspaceProject {
  ref: WorkspaceProjectRef
  root: string
  config: ProjectConfig
}

export interface LoadedWorkspace {
  root: string
  manifest_path: string
  manifest: WorkspaceManifestV1
}

export interface SharedGuidanceContent {
  id: string
  path: string
  scope: SharedGuidanceScope
  content: string
  sha256: string
  read_at: string
}

export interface ContextTraceEntry {
  source_type: 'accepted_prose' | 'canon' | 'project_guidance' | 'shared_guidance'
  source_id: string
  priority: number
  selected: boolean
  reason: string
}

export interface ProjectPaths {
  root: string
  projectFile: string
  indexFile: string
}

export interface CanonDoc extends PlanningCardDoc {
  type: 'canon'
  strength: 'hard' | 'soft'
  source: 'user' | 'ai' | 'imported' | 'historical'
}

export interface CharacterDoc extends PlanningCardDoc {
  type: 'character'
  aliases: string[]
  role: string
  speech_style: string
  desire: string
  fear: string
  bottom_line: string
  motivation_anchors: string[]
  relationships: Record<string, string>
  arc: Record<string, { start?: string; end?: string; notes?: string }>
  ooc_guardrails: string[]
  active_flags: string[]
  disclosure: Array<{ segment: string; reveal_after?: string }>
  born_at: string | null
  died_at: string | null
  introduced_at: string | null
  exited_at: string | null
  scene_state: {
    current_location?: string
    outfit_layers?: string[]
    wounds?: string[]
    carried_items?: string[]
    known_facts?: string[]
    emotional_state?: string
  }
}

export interface CharacterRelationDoc extends PlanningCardDoc {
  type: 'character_relation'
  from_character: string
  to_character: string
  relation_type: string
  direction: 'directed' | 'mutual'
  starts_at: string | null
  ends_at: string | null
  visibility: 'public' | 'private' | 'secret'
}

export interface ForeshadowingTriggerCondition {
  kind: 'timeline_reached' | 'outline_reached' | 'keyword' | 'card_enabled'
  target_id: string
  keyword: string
}

export interface ForeshadowingDoc extends PlanningCardDoc {
  type: 'foreshadowing'
  code: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  summary: string
  planned_plant: string
  planted_at: string | null
  reinforced_at: string[]
  planned_resolve: string
  expires_at: string
  state: 'planned' | 'planted' | 'reinforced' | 'resolved' | 'abandoned'
  related_characters: string[]
  related_arc: string
  trigger_conditions: ForeshadowingTriggerCondition[]
  reminder_window: string
  reminded_at: string[]
}

export interface WorldEntryDoc extends PlanningCardDoc {
  type: 'world_entry'
  code: string
  triggers: string[]
  category_tags: string[]
  role: 'constraint' | 'texture' | 'both'
  valid_from: string
  valid_until: string
  entry_status: 'candidate' | 'active' | 'inactive'
  importance: 'high' | 'medium' | 'low'
  historical_reference: string
  story_setting: string
  used_in: Array<{ scene: string; usage: string }>
  links: string[]
  source: string
}

export interface ReferenceDoc extends DocumentIdentity {
  type: 'reference'
  source_title: string
  author: string
  material_type: 'book' | 'paper' | 'article' | 'webpage' | 'video' | 'other'
  location: string
  reading_status: 'unread' | 'reading' | 'read'
  topic_tags: string[]
  extracted_entries: string[]
  value_assessment: string
}

export interface IssueDoc extends PlanningCardDoc {
  type: 'issue'
  priority: 'high' | 'medium' | 'low'
  state: 'open' | 'resolved' | 'deferred'
  due: string
  decision_needed: string
  related_docs: string[]
  rule_id: string
  evidence: string
  check_fingerprint: string
  checked_at: string
}

export interface StrategyDoc extends PlanningCardDoc {
  type: 'strategy'
  category: 'narrative' | 'style' | 'pacing' | 'reader_expectation' | 'genre_boundary' | 'other'
  scope: string
  principles: string[]
  avoid: string[]
}

export interface PatternDoc extends PlanningCardDoc {
  type: 'pattern'
  kind: 'story' | 'writing' | 'prompt'
  scope: 'book' | 'volume' | 'arc' | 'chapter' | 'section' | 'agent' | 'project'
  applies_to: string[]
  source: 'user' | 'ai' | 'accepted_prose' | 'imported'
}

export interface NarrativeDoc extends PlanningCardDoc {
  type: 'narrative'
  category: 'style' | 'structure' | 'pacing' | 'dialogue' | 'description' | 'genre_boundary' | 'other'
  scope: 'book' | 'volume' | 'part' | 'act' | 'chapter' | 'scene' | 'project'
  applies_to: string[]
  principles: string[]
  avoid: string[]
  source: 'user' | 'ai' | 'accepted_prose' | 'imported'
  sample: string
}

export interface CharacterStateDoc extends PlanningCardDoc {
  type: 'character_state'
  character: string
  scope_type: 'timeline_event' | 'outline' | 'scene'
  scope_id: string
  timeline_node: string | null
  motivation: string
  emotion: string
  knowledge: string[]
  relationship_delta: Record<string, string>
  public_disclosure: string[]
  notes: string
}

export type TimelinePrecision = 'month' | 'day' | 'hour' | 'minute'

export interface TimelineNodeDoc extends PlanningCardDoc {
  type: 'timeline_node'
  calendar: string
  year: number
  month: number
  month_end: number | null
  day: number | null
  hour: number | null
  minute: number | null
  precision: TimelinePrecision
  display_time: string
  fuzzy: boolean
  previous: string | null
  next: string | null
}

export interface TimelineEventDoc extends PlanningCardDoc {
  type: 'timeline_event'
  timeline_node: string | null
  /** Legacy display value retained until the event is migrated onto a timeline node. */
  date: string
  /** Legacy event-chain fields; new writes use TimelineNodeDoc.previous/next. */
  previous: string | null
  next: string | null
  duration: string
  location: string | null
  characters: string[]
  flashback_reference?: string | null
}

export type LocationScale = 'global' | 'region' | 'city' | 'district' | 'estate' | 'interior'

export interface LocationDiagramNode {
  id: string
  label: string
  x: number
  y: number
  floor: string
  target_location: string | null
}

export interface LocationDiagramEdge {
  from: string
  to: string
  label: string
}

export interface LocationDoc extends PlanningCardDoc {
  type: 'location'
  kind: 'position' | 'layout'
  scale: LocationScale
  parent_location: string | null
  layout_of: string | null
  relative_direction: string
  floor: string
  diagram_nodes: LocationDiagramNode[]
  diagram_edges: LocationDiagramEdge[]
  description: string
}

export interface RouteDoc extends PlanningCardDoc {
  type: 'route'
  from: string
  to: string
  distance_li: number | null
  travel_time_days: number | null
  route_type: string
  restriction: string
}

export interface OutlineDoc extends BaseDoc {
  type: 'outline'
  /** `section` remains readable for pre-0.2 projects, but is never created by the desktop UI. */
  level: 'overview' | 'book' | 'volume' | 'part' | 'act' | 'chapter' | 'section' | 'arc'
  parent: string | null
  order: number
  target_words?: number
  chapter_hook?: boolean
  story_purpose?: string
  core_characters?: string[]
  central_conflict?: string
  final_direction?: string
  worldline_axis?: string
  character_destiny_axis?: string
  key_stages?: string[]
  causal_chain?: string[]
  final_state?: string
  stage_goal?: string
  irreversible_change?: string
  reader_promise: string
  reader_payoff: string
  reader_benefit: string
  core_appeal: string[]
  core_suspense: string[]
  genre_boundary: string[]
  volume_goal: string
  event_chain: string[]
  character_growth: string[]
  story_cycles: Array<'desire' | 'pressure' | 'growth' | 'reveal' | 'relationship'>
  conflict_ladder: string[]
  cast_lock: string[]
  fixed_reveals: string[]
  chapter_goal: string
  chapter_conflict: string
  chapter_change: string
  ending_hook: string
  invariants: string[]
  narrative_function: string
  emotional_curve: string
  povs: string[]
  start_state: string
  end_state: string
  context_pins: string[]
  context_exclusions: string[]
  related_timeline: string[]
  related_characters: string[]
  related_events: string[]
  related_foreshadowing: string[]
  world_entries_used: string[]
  foreshadowing_planted: string[]
  foreshadowing_resolved: string[]
  related_patterns: string[]
}

export type OutlineLevel = OutlineDoc['level']
export type OutlineLevelInput = OutlineLevel | 'arc'

export interface SceneDoc extends BaseDoc {
  type: 'scene'
  chapter_id: string
  /** Legacy alias retained for pre-0.2 consumers; it always equals `chapter_id`. */
  section: string
  order: number
  writing_focus: string
  /** Durable scene-outline Markdown, kept after generated artifacts are purged. */
  outline_content: string
  accepted_at: string | null
  purged_at: string | null
  chapter_number: string
  volume: string
  act: string
  timeline_node: string
  location: string
  pov: string
  characters: string[]
  world_time: string
  chapter_break_hook: string
  narrative_function: string
  writing_environment: string
  scene_goal: string
  scene_conflict: string
  scene_change: string
  reader_benefit: string
  ending_hook: string
  foreshadowing_planted: string[]
  foreshadowing_resolved: string[]
  foreshadowing_reinforced: string[]
  world_entries_used: string[]
  impact: string[]
  target_words: number
  chapter_hook: boolean
  previous_scene: string | null
  context_pins: string[]
  context_exclusions: string[]
  related_patterns: string[]
}

export interface ChapterProseDoc extends BaseDoc {
  type: 'chapter_prose'
  status: 'draft' | 'final' | 'published'
  chapter_id: string
  scene_ids: string[]
  finalized_at: string | null
  published_at: string | null
}

export interface RunMetadata {
  id: string
  scene_id: string
  target_type: 'scene' | 'outline'
  target_id: string
  source_outline?: string
  created_at: string
  provider: string
  model: string
  status: 'created' | 'generated' | 'checked' | 'accepted'
  run_dir: string
}

export interface ProjectIndexEntry {
  id: string
  type: DocType
  title: string
  status?: string
  path: string
  tags: string[]
}

export interface ProjectIndex {
  generated_at: string
  project_title: string
  entries: ProjectIndexEntry[]
}
