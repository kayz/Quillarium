export type DocType =
  | 'canon'
  | 'character'
  | 'timeline_event'
  | 'location'
  | 'route'
  | 'foreshadowing'
  | 'world_entry'
  | 'reference'
  | 'issue'
  | 'strategy'
  | 'pattern'
  | 'character_state'
  | 'resource'
  | 'causality'
  | 'outline'
  | 'scene'
  | 'prompt'

export type DocumentStatus =
  | 'draft'
  | 'confirmed'
  | 'deprecated'
  | 'active'
  | 'archived'
  | 'final'
  | 'candidate'
  | 'planned'
  | 'planted'
  | 'reinforced'
  | 'resolved'
  | 'abandoned'
  | 'open'
  | 'deferred'

export interface BaseDoc {
  id: string
  type: DocType
  schema_version: number
  title: string
  status: DocumentStatus
  tags: string[]
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

export type SharedGuidanceScope = 'book' | 'volume' | 'arc' | 'chapter' | 'scene' | 'finalization'

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

export interface CanonDoc extends BaseDoc {
  type: 'canon'
  strength: 'hard' | 'soft'
  source: 'user' | 'ai' | 'imported' | 'historical'
}

export interface CharacterDoc extends BaseDoc {
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
  scene_state: {
    current_location?: string
    outfit_layers?: string[]
    wounds?: string[]
    carried_items?: string[]
    known_facts?: string[]
    emotional_state?: string
  }
}

export interface ForeshadowingDoc extends BaseDoc {
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
}

export interface WorldEntryDoc extends BaseDoc {
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

export interface ReferenceDoc extends BaseDoc {
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

export interface IssueDoc extends BaseDoc {
  type: 'issue'
  priority: 'high' | 'medium' | 'low'
  state: 'open' | 'resolved' | 'deferred'
  due: string
  decision_needed: string
  related_docs: string[]
}

export interface StrategyDoc extends BaseDoc {
  type: 'strategy'
  category: 'narrative' | 'style' | 'pacing' | 'reader_expectation' | 'genre_boundary' | 'other'
  scope: string
  principles: string[]
  avoid: string[]
}

export interface PatternDoc extends BaseDoc {
  type: 'pattern'
  kind: 'story' | 'writing' | 'prompt'
  scope: 'book' | 'volume' | 'arc' | 'chapter' | 'section' | 'agent' | 'project'
  applies_to: string[]
  source: 'user' | 'ai' | 'accepted_prose' | 'imported'
}

export interface CharacterStateDoc extends BaseDoc {
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

export interface TimelineEventDoc extends BaseDoc {
  type: 'timeline_event'
  date: string
  previous: string | null
  next: string | null
  duration: string
  location: string | null
  characters: string[]
  flashback_reference?: string | null
}

export interface LocationDoc extends BaseDoc {
  type: 'location'
  parent_location: string | null
  description: string
}

export interface RouteDoc extends BaseDoc {
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
  level: 'book' | 'volume' | 'act' | 'arc' | 'chapter' | 'section'
  parent: string | null
  order: number
  target_words?: number
  chapter_hook?: boolean
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

export interface SceneDoc extends BaseDoc {
  type: 'scene'
  chapter_number: string
  volume: string
  act: string
  section: string
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
  status: string
  path: string
  tags: string[]
}

export interface ProjectIndex {
  generated_at: string
  project_title: string
  entries: ProjectIndexEntry[]
}
