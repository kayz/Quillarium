export type { CheckReport } from '@quillarium/checks'

export type ThemeName = 'paper' | 'ink' | 'mist' | 'bamboo'
export type ModuleName =
  | 'write'
  | 'canon'
  | 'world'
  | 'characters'
  | 'timeline'
  | 'foreshadowing'
  | 'issues'
  | 'references'
  | 'narrative'
  | 'locations'
  | 'runs'
export type CenterTab = 'editor' | 'outline' | 'beats'
export type WorkLevel = 'overview' | 'book' | 'volume' | 'part' | 'act' | 'chapter' | 'ai'
export type ViewMode = 'list' | 'tile'
export type LeftMode = 'write' | 'read'
export type WorkspaceMode = 'planning' | 'writing'
export type WorkspacePage = 'outline' | 'volume'
export type OutlineHomeSection =
  | 'overview'
  | 'book'
  | 'volumes'
  | 'canon'
  | 'world'
  | 'characters'
  | 'timeline'
  | 'locations'
  | 'foreshadowing'
  | 'narrative'
  | 'issues'
  | 'references'
export type VolumeSection = OutlineHomeSection | 'parts'
export type DensityName = 'compact' | 'comfortable'
export type LanguageName = 'zh' | 'en'
export type AIProfileName = 'prose' | 'background' | 'check'
export type AIProviderName = 'openai-compatible' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'ollama'
export type PlanningDocumentKind =
  | 'character'
  | 'character_relation'
  | 'world_entry'
  | 'timeline_node'
  | 'timeline_event'
  | 'location'
  | 'foreshadowing'
  | 'strategy'
  | 'pattern'
  | 'narrative'
  | 'issue'
  | 'reference'

export interface PlanningChatMessage {
  role: 'author' | 'assistant'
  content: string
}

export interface PlanningDraft {
  kind: PlanningDocumentKind
  title: string
  fields: Record<string, unknown>
  content: string
}

export interface PlanningSession {
  schema_version: 1
  id: string
  module: string
  created_at: string
  updated_at: string
  messages: PlanningChatMessage[]
  proposal: PlanningDraft | null
  document?: {
    path: string
    id: string
    type: PlanningDocumentKind
  }
}

export interface AIProfileForm {
  provider: AIProviderName
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export interface AIStatus {
  prose: boolean
  background: boolean
  check: boolean
  ready: boolean
}

export interface GitHubSettings {
  token: string
  defaultOwner: string
  defaultVisibility: 'private' | 'public'
}

export interface ProjectListItem {
  root: string
  id: string
  aliases: string[]
  title: string
  genre: string
  target_words: number
  chapter_words: number
  section_words: number
  default_theme?: ThemeName
}

export interface DocEntry {
  path: string
  data: {
    id: string
    type: string
    title: string
    status?: string
    tags?: string[]
    [key: string]: unknown
  }
  content: string
}

export interface TargetSelection {
  type: string
  id: string
  view?: 'ai' | 'prose'
}

export interface ContextPacketSummary {
  target: { type: 'outline' | 'scene'; id: string; title: string; level: string }
  canon: DocEntry[]
  strategies: DocEntry[]
  patterns: DocEntry[]
  narratives: DocEntry[]
  timeline_nodes: DocEntry[]
  timeline: DocEntry[]
  characters: DocEntry[]
  character_states: DocEntry[]
  locations: DocEntry[]
  world_entries: DocEntry[]
  foreshadowing: DocEntry[]
  issues: DocEntry[]
  warnings: string[]
  included_ids: string[]
  excluded_ids: string[]
}

export interface RunSummary {
  id: string
  scene_id: string
  status: string
  model: string
  created_at: string
}

export interface WorkspaceData {
  project: ProjectListItem
  docs: DocEntry[]
  runs: RunSummary[]
}

export interface GitState {
  initialized: boolean
  dirty: boolean
  branch: string | null
  remote: string | null
  summary: string
  repositoryScope: 'standalone' | 'workspace'
  repositoryRoot: string
  projectPathspec: string
  canInitializeRepository: boolean
}
