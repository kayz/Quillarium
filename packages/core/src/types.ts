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
  synopsis: string
  genre: string
  target_words: number
  chapter_words: number
  section_words: number
  current_volume: number
  current_timeline_node: string | null
  writing_preset: string | null
  default_theme: 'paper' | 'ink' | 'mist' | 'bamboo'
  cover: {
    original_path: string
    thumbnail_path: string
    export_png_path: string
    focus_x: number
    focus_y: number
    source_width: number
    source_height: number
  } | null
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

export type PromptBlockKind =
  | 'packet_header'
  | 'target'
  | 'project'
  | 'accepted_prose'
  | 'canon'
  | 'outline'
  | 'project_guidance'
  | 'timeline'
  | 'character'
  | 'location'
  | 'world'
  | 'foreshadowing'
  | 'issue'
  | 'shared_guidance'
  | 'warning'
  | 'generation_target'

export type PromptBlockAuthority = 'system' | 'accepted_prose' | 'hard_canon' | 'project' | 'advisory'

export type PromptBlockTruncation = 'none' | 'head' | 'tail'

export interface PromptBlockSource {
  type: string
  id: string
  /** Always project/workspace relative. Absolute machine paths are forbidden. */
  path?: string
}

export interface PromptBlock {
  id: string
  kind: PromptBlockKind
  role: 'system' | 'user'
  title: string
  content: string
  content_sha256: string
  source: PromptBlockSource
  scope: string
  purpose: string
  authority: PromptBlockAuthority
  authority_rank: number
  priority: number
  order: number
  token_count: number
  original_token_count: number
  tokenizer_id: string
  retained_token_range: { start: number; end: number }
  truncated: boolean
  truncation: PromptBlockTruncation
  selection_reason: string
  trigger_chain: string[]
}

export interface ContextPolicy {
  schema_version: 1
  id: string
  /** Exact tokenizer count for the rendered Context Packet, including packet framing. */
  token_budget: number
  max_block_tokens: number
  min_truncated_block_tokens: number
  max_candidates: number
  max_recursion_depth: number
}

export type WritingPresetProvider =
  'openai-compatible' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'ollama'

export interface WritingPresetModelConfig {
  profile: 'prose' | 'background' | 'check'
  provider?: WritingPresetProvider
  model?: string
  temperature?: number
  max_output_tokens?: number
  tokenizer_id?: 'deepseek-v4' | 'o200k' | 'cl100k'
}

export interface WritingPresetPromptStack {
  system_prompt: string
  user_instructions: string[]
  block_order: PromptBlockKind[]
}

export interface WritingPresetCheckPolicy {
  deterministic: true
  semantic: 'off' | 'on-demand' | 'required'
  profile: 'check'
}

export interface WritingPresetV2 {
  schema_version: 2
  id: string
  version: string
  title: string
  description: string
  model: WritingPresetModelConfig
  prompt_stack: WritingPresetPromptStack
  context_policy: ContextPolicy
  check_policy: WritingPresetCheckPolicy
}

export interface LoadedWritingPreset {
  preset: WritingPresetV2
  source_path: string
  source_sha256: string
  source_schema_version: 1 | 2
}

export interface ResolvedWritingPresetModel {
  profile: WritingPresetModelConfig['profile']
  provider: WritingPresetProvider
  model: string
  temperature: number
  max_output_tokens: number
  tokenizer_id?: WritingPresetModelConfig['tokenizer_id']
}

export interface WritingPresetSnapshot {
  schema_version: 1
  preset_id: string
  preset_version: string
  title: string
  description: string
  source: {
    path: string
    sha256: string
    schema_version: 1 | 2
  }
  model: ResolvedWritingPresetModel
  prompt_stack: WritingPresetPromptStack
  context_policy: ContextPolicy
  check_policy: WritingPresetCheckPolicy
  snapshot_sha256: string
}

export interface WritingPresetListItem {
  id: string
  version: string
  title: string
  description: string
  selected: boolean
  source_path: string
  source_schema_version: 1 | 2
}

export interface ContextTokenizerTrace {
  id: string
  provider: string
  model: string
  exact: true
  source_revision: string
  source_sha256: string
  vocabulary_sha256: string
}

export type ContextTraceOutcome = 'included' | 'excluded' | 'truncated'

export interface ContextReferenceResolution {
  raw_reference: string
  resolved_target_id: string
  matched_by: string
  source_path: string
  origin: string
}

export interface ContextTraceEntry {
  block_id: string
  source_type: string
  source_id: string
  source_path?: string
  authority: PromptBlockAuthority
  authority_rank: number
  priority: number
  /** Explicit source mode for new traces; absent only in legacy persisted traces. */
  required?: boolean
  outcome: ContextTraceOutcome
  reason: string
  trigger_chain: string[]
  reference_resolutions?: ContextReferenceResolution[]
  token_count: number
  original_token_count: number
  content_sha256: string
  tokenizer_id: string
  retained_token_range: { start: number; end: number }
}

export interface ContextTrace {
  schema_version: 1
  compiler_version: string
  target: { type: 'outline' | 'scene' | 'assistant'; id: string }
  preset?: { id: string; version: string; snapshot_sha256: string }
  policy: ContextPolicy
  tokenizer: ContextTokenizerTrace
  budget: {
    total_token_budget: number
    reserved_output_tokens: number
    framing_tokens: number
    available_input_tokens: number
    selected_tokens: number
    unused_input_tokens: number
    /** Compatibility aliases for available/selected/unused input tokens. */
    token_budget: number
    used_tokens: number
    remaining_tokens: number
  }
  candidates: {
    discovered: number
    eligible: number
    limit: number
    max_recursion_depth: number
    reached_recursion_depth: number
  }
  entries: ContextTraceEntry[]
  final_block_ids: string[]
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

export interface ForeshadowingTimePosition {
  timeline_id: string
  target_type: 'timeline' | 'timeline_node' | 'timeline_event'
  target_id: string
  /** Display snapshot only. Never use this value as identity. */
  display_name: string
  /** Optional chapter/section association; story time remains the primary location. */
  outline_id: string | null
}

export interface ForeshadowingDoc extends PlanningCardDoc {
  type: 'foreshadowing'
  code: string
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  summary: string
  /** Legacy free text retained until explicit author migration. */
  planned_plant: string
  planned_plant_ref: ForeshadowingTimePosition | null
  planted_at: string | null
  reinforced_at: string[]
  /** Legacy free text retained until explicit author migration. */
  planned_resolve: string
  planned_resolve_ref: ForeshadowingTimePosition | null
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
  state: 'open' | 'resolved' | 'ignored' | 'deferred'
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

export interface TimeUnitDefinitionV1 {
  id: string
  label: string
  order: number
  radix: number | null
  aliases: string[]
}

export interface TimeSystemV1 {
  schema_version: 1
  id: string
  version: number
  title: string
  kind: 'gregorian' | 'fictional' | 'relative' | 'cyclic'
  units: TimeUnitDefinitionV1[]
  conversion: { epoch: number | null; unit_factors: Record<string, number> } | null
}

export interface TimelineTrackV1 {
  schema_version: 1
  id: string
  version: number
  title: string
  time_system_id: string
  display_order: number
  purpose: string
}

export interface TimelineCoordinateV2 {
  schema_version: 2
  time_system_id: string
  components: Record<string, number | string>
  precision: string
  display_text: string
  sort_value: number | null
  explicit_order: number | null
  uncertain: boolean
  fuzzy: boolean
  cycle: number | null
  occurrence: number
}

export interface TimelineNodeTrackPlacementV1 {
  timeline_id: string
  order: number
  narrative_order: number
}

export interface TimelinePlacementV1 {
  timeline_id: string
  start_node_id: string
  end_node_id: string | null
  order: number
  narrative_order: number
  occurrence: number
}

export interface TimelineEventIntervalV1 {
  start_node_id: string
  end_node_id: string
}

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
  coordinate_v2?: TimelineCoordinateV2 | null
  timeline_tracks?: TimelineNodeTrackPlacementV1[]
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
  placements?: TimelinePlacementV1[]
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
  /** Stable identifier shared by candidates created by one generation request. */
  candidate_group_id?: string
  /** Zero-based display order within a candidate group. */
  candidate_index?: number
  /** Run used as the source of a newly branched candidate group. */
  parent_run_id?: string
  /** Stable branch lineage. Base generation uses `main`; new branches receive a new id. */
  branch_id?: string
  /** Present only on the currently selected candidate in a group. Selection is not acceptance. */
  selected_at?: string
  created_at: string
  provider: string
  model: string
  preset_id?: string
  preset_version?: string
  preset_sha256?: string
  status: 'created' | 'generated' | 'checked' | 'accepted'
  run_dir: string
}

export interface CandidateGroupSummary {
  id: string
  branch_id: string
  parent_run_id?: string
  selected_run_id?: string
  runs: RunMetadata[]
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
