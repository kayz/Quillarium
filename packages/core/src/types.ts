export type DocType =
  | 'canon'
  | 'character'
  | 'timeline_event'
  | 'location'
  | 'route'
  | 'resource'
  | 'causality'
  | 'outline'
  | 'scene'
  | 'prompt'

export type DocumentStatus = 'draft' | 'confirmed' | 'deprecated' | 'active' | 'archived'

export interface BaseDoc {
  id: string
  type: DocType
  schema_version: number
  title: string
  status: DocumentStatus
  tags: string[]
}

export interface ProjectConfig {
  title: string
  genre: string
  target_words: number
  chapter_words: number
  section_words: number
  current_volume: number
  current_timeline_node: string | null
  schema_version: number
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
  relationships: Record<string, string>
  arc: Record<string, { start?: string; end?: string; notes?: string }>
  ooc_guardrails: string[]
  scene_state: {
    current_location?: string
    outfit_layers?: string[]
    wounds?: string[]
    carried_items?: string[]
    known_facts?: string[]
    emotional_state?: string
  }
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
  level: 'book' | 'volume' | 'arc' | 'chapter' | 'section'
  parent: string | null
  order: number
  target_words?: number
  chapter_hook?: boolean
}

export interface SceneDoc extends BaseDoc {
  type: 'scene'
  section: string
  timeline_node: string
  location: string
  pov: string
  characters: string[]
  target_words: number
  chapter_hook: boolean
  previous_scene: string | null
}

export interface RunMetadata {
  id: string
  scene_id: string
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
