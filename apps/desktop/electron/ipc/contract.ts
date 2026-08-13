import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  AIProfileConfig,
  CandidateGroupSummary,
  ChapterLifecycleSnapshot,
  ChapterPublicationResult,
  ChapterPromptPlan,
  ContextPacket,
  DocumentIdentity,
  DocumentOriginResolution,
  EditableScenePromptPlan,
  FinalizeReviewSession,
  GitHubConfig,
  ImportPlanInput,
  ImportCandidate,
  ImportSession,
  ManuscriptExportOptions,
  ManuscriptExportResult,
  MarkdownImportResult,
  ProjectConfig,
  PromptAsset,
  PromptName,
  QuillariumConfig,
  RunMetadata,
  SceneDoc,
  ScenePromptInput,
  LoadedWritingPreset,
  WritingPresetListItem
} from '@quillarium/core'
import type { CheckReport, CheckScore } from '@quillarium/checks'
import type {
  CharacterCardImportResult,
  CharacterCardWriteResult,
  WorldInfoWriteResult
} from '@quillarium/sillytavern'

export type AIProfileName = 'prose' | 'background' | 'check'

export interface AIKeyStorageStatus {
  mode: 'encrypted' | 'plaintext-fallback'
  encryptionAvailable: boolean
  warning: string | null
}

export interface DesktopAIProfileConfig extends Omit<AIProfileConfig, 'apiKeyEncrypted'> {
  apiKey: string
  hasKey: boolean
  keyStatus: 'available' | 'unavailable' | 'none'
}

export interface DesktopGitHubConfig extends Omit<GitHubConfig, 'token' | 'tokenEncrypted'> {
  /** A non-secret mask when a token is stored, otherwise an empty string. */
  token: string
  hasToken: boolean
}

export type DesktopConfig = Omit<QuillariumConfig, 'aiProfiles' | 'github'> & {
  aiProfiles?: Partial<Record<AIProfileName, DesktopAIProfileConfig>>
  github?: DesktopGitHubConfig
  aiKeyStorage: AIKeyStorageStatus
}

export type DesktopAIProfileInput = Partial<Omit<AIProfileConfig, 'apiKeyEncrypted'>> & {
  clearApiKey?: boolean
}

export type DesktopGitHubInput = Partial<Omit<GitHubConfig, 'tokenEncrypted'>> & {
  clearToken?: boolean
}

export interface AIStatus {
  prose: boolean
  background: boolean
  check: boolean
  ready: boolean
  storage: AIKeyStorageStatus
}

export interface DesktopGeneratedCandidateGroup {
  id: string
  branch_id: string
  parent_run_id?: string
  candidates: Array<{ run: RunMetadata; output: string }>
  scene: DesktopDocEntry<SceneDoc>
}

export interface ProjectCreateInput {
  id?: string
  title: string
  genre?: string
  targetWords?: number
  chapterWords?: number
  sectionWords?: number
  defaultTheme?: ProjectConfig['default_theme']
}

export type ProjectSummary = { root: string } & ProjectConfig

export type DesktopDocData<T extends DocumentIdentity = DocumentIdentity> = T & Record<string, unknown>

export interface DesktopDocEntry<T extends DocumentIdentity = DocumentIdentity> {
  path: string
  data: DesktopDocData<T>
  content: string
}

export interface LoadedProject {
  project: ProjectConfig
  docs: DesktopDocEntry[]
  runs: RunMetadata[]
}

export interface MarkdownDocument {
  data: Record<string, unknown>
  content: string
}

export type TargetInput = {
  type: string
  id: string
}

type ContextDocumentField =
  | 'canon'
  | 'strategies'
  | 'patterns'
  | 'narratives'
  | 'timeline_nodes'
  | 'timeline'
  | 'characters'
  | 'character_states'
  | 'locations'
  | 'world_entries'
  | 'foreshadowing'
  | 'issues'

export type DesktopContextPacket = Omit<ContextPacket, ContextDocumentField> & {
  [Field in ContextDocumentField]: DesktopDocEntry[]
}

export type ChapterSelections = Record<string, ScenePromptInput['selectedElements']>

export type ImportPlanRequest = ImportPlanInput & {
  callAI?: boolean
}

export interface FinalizeReviewRequest {
  chapterId: string
  sceneIds: string[]
  draft: string
  final: string
  aiResponse?: string
  callAI?: boolean
}

export interface CanonDiscussionRequest {
  mode?: 'discuss' | 'summarize'
  title?: string
  status?: string
  strength?: string
  source?: string
  content?: string
  transcript?: string
  message?: string
}

export const PLANNING_DOCUMENT_KINDS = [
  'character',
  'character_relation',
  'world_entry',
  'timeline_node',
  'timeline_event',
  'location',
  'foreshadowing',
  'strategy',
  'pattern',
  'narrative',
  'issue',
  'reference'
] as const

export type PlanningDocumentKind = (typeof PLANNING_DOCUMENT_KINDS)[number]
export type PlanningChatRole = 'author' | 'assistant'

export interface PlanningChatMessage {
  role: PlanningChatRole
  content: string
}

export interface PlanningDraft {
  kind: PlanningDocumentKind
  title: string
  fields: Record<string, unknown>
  content: string
}

export interface PlanningChatRequest {
  module: string
  messages: PlanningChatMessage[]
  proposal?: PlanningDraft | null
  sessionId?: string
}

export interface PlanningChatResponse {
  message: string
  proposal: PlanningDraft | null
}

export interface PlanningDocumentRef {
  path: string
  id: string
  type: PlanningDocumentKind
}

export interface PlanningSession {
  schema_version: 1
  id: string
  module: string
  created_at: string
  updated_at: string
  messages: PlanningChatMessage[]
  proposal: PlanningDraft | null
  document?: PlanningDocumentRef
}

export interface PlanningCheckSummary {
  generated_at: string
  checked_cards: number
  skipped_disabled: number
  rule_findings: number
  ai_findings: number
  created_issue_ids: string[]
  updated_issue_ids: string[]
}

export interface PlanningSessionUpdate {
  messages: PlanningChatMessage[]
  proposal: PlanningDraft | null
}

export interface PlanningConfirmRequest extends PlanningSessionUpdate {
  sessionId: string
  proposal: PlanningDraft
}

export interface GitStatus {
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

export interface IpcContract {
  'config:get': { request: []; response: DesktopConfig }
  'config:getVault': { request: []; response: string | null }
  'config:getWorkspace': { request: []; response: string | null }
  'config:chooseWorkspace': { request: []; response: string | null }
  'config:setWorkspace': { request: [dir: string]; response: string | undefined }
  'config:chooseVault': { request: []; response: string | null }
  'config:setVault': { request: [dir: string]; response: string | undefined }
  'config:migrateVault': { request: []; response: string | null }
  'config:setTheme': {
    request: [theme: NonNullable<QuillariumConfig['theme']>]
    response: DesktopConfig
  }
  'config:setDensity': {
    request: [density: NonNullable<QuillariumConfig['density']>]
    response: DesktopConfig
  }
  'config:setLanguage': {
    request: [language: NonNullable<QuillariumConfig['language']>]
    response: DesktopConfig
  }
  'config:saveAIProfile': {
    request: [profile: AIProfileName, input: DesktopAIProfileInput]
    response: DesktopConfig
  }
  'config:saveGithub': { request: [input: DesktopGitHubInput]; response: DesktopConfig }
  'config:aiStatus': { request: []; response: AIStatus }
  'project:list': { request: []; response: ProjectSummary[] }
  'project:create': { request: [input: ProjectCreateInput]; response: ProjectSummary }
  'project:choose': { request: []; response: ProjectSummary | null }
  'project:load': { request: [root: string]; response: LoadedProject }
  'preset:list': { request: [root: string]; response: WritingPresetListItem[] }
  'preset:initializeDefault': { request: [root: string]; response: LoadedWritingPreset }
  'preset:select': { request: [root: string, id: string]; response: LoadedWritingPreset }
  'doc:read': { request: [filePath: string]; response: MarkdownDocument }
  'doc:saveBody': {
    request: [filePath: string, data: Record<string, unknown>, body: string]
    response: boolean
  }
  'doc:delete': { request: [filePath: string]; response: boolean }
  'doc:openExternal': { request: [filePath: string]; response: boolean }
  'doc:create': {
    request: [root: string, kind: string, input: Record<string, unknown>]
    response: string
  }
  'doc:origin': {
    request: [root: string, filePath: string]
    response: DocumentOriginResolution | null
  }
  'import:chooseMarkdown': { request: [root: string]; response: MarkdownImportResult[] }
  'import:chooseSources': { request: []; response: string[] }
  'import:markdownText': {
    request: [root: string, markdown: string, title?: string]
    response: MarkdownImportResult[]
  }
  'import:syncMarkdown': { request: [root: string]; response: MarkdownImportResult[] }
  'prompt:init': { request: [root: string]; response: PromptAsset[] }
  'prompt:read': { request: [root: string, name: PromptName]; response: string }
  'import:aiPlan': { request: [root: string, input: ImportPlanRequest]; response: ImportSession }
  'import:session': { request: [root: string, sessionId: string]; response: ImportSession }
  'import:updateCandidates': {
    request: [root: string, sessionId: string, candidates: ImportCandidate[]]
    response: ImportSession
  }
  'import:answerIssue': {
    request: [root: string, sessionId: string, issueId: string, answer: string]
    response: ImportSession
  }
  'import:landSession': { request: [root: string, sessionId: string]; response: ImportSession }
  'import:reimportCard': {
    request: [root: string, filePath: string]
    response: { path: string; document: MarkdownDocument }
  }
  'canon:discuss': { request: [root: string, input: CanonDiscussionRequest]; response: string }
  'planning:start': {
    request: [root: string, module: string, documentId?: string]
    response: PlanningSession
  }
  'planning:session': { request: [root: string, sessionId: string]; response: PlanningSession }
  'planning:save': {
    request: [root: string, sessionId: string, update: PlanningSessionUpdate]
    response: PlanningSession
  }
  'planning:discuss': {
    request: [root: string, input: PlanningChatRequest]
    response: PlanningChatResponse
  }
  'planning:confirm': {
    request: [root: string, input: PlanningConfirmRequest]
    response: { path: string; document: MarkdownDocument }
  }
  'planning:check': {
    request: [root: string, language: 'zh' | 'en']
    response: PlanningCheckSummary
  }
  'scene:context': { request: [root: string, sceneId: string]; response: string }
  'target:context': {
    request: [root: string, target: TargetInput]
    response: { packet: DesktopContextPacket; markdown: string }
  }
  'target:writingPrompt': { request: [root: string, outlineId: string]; response: string }
  'target:check': {
    request: [root: string, target: TargetInput]
    response: { report: CheckReport; markdown: string }
  }
  'scene:check': {
    request: [root: string, sceneId: string]
    response: { report: CheckReport; markdown: string }
  }
  'scene:semanticCheck': {
    request: [root: string, sceneId: string, content?: string]
    response: CheckReport
  }
  'scene:checkIntoRun': {
    request: [root: string, sceneId: string, content?: string]
    response: { run: RunMetadata; report: CheckReport; markdown: string }
  }
  'scene:generateDryRun': { request: [root: string, sceneId: string]; response: RunMetadata }
  'scene:generate': {
    request: [root: string, sceneId: string]
    response: { run: RunMetadata; output: string }
  }
  'outline:generate': {
    request: [root: string, outlineId: string, prompt?: string, sceneId?: string]
    response: { run: RunMetadata; output: string; scene: DesktopDocEntry<SceneDoc> }
  }
  'outline:generateCandidates': {
    request: [
      root: string,
      outlineId: string,
      prompt: string,
      sceneId: string | undefined,
      count: number,
      parentRunId?: string
    ]
    response: DesktopGeneratedCandidateGroup
  }
  'scene:prepare': {
    request: [root: string, chapterId: string]
    response: DesktopDocEntry<SceneDoc>
  }
  'scene:acceptManual': {
    request: [root: string, sceneId: string, content: string]
    response: ChapterLifecycleSnapshot
  }
  'scene:promptPlan': {
    request: [root: string, sceneId: string]
    response: EditableScenePromptPlan
  }
  'chapter:lifecycle': {
    request: [root: string, chapterId: string]
    response: ChapterLifecycleSnapshot
  }
  'chapter:finalize': {
    request: [root: string, chapterId: string]
    response: ChapterLifecycleSnapshot
  }
  'chapter:publish': {
    request: [root: string, chapterId: string, confirmation: string]
    response: ChapterPublicationResult
  }
  'chapter:writingPlan': {
    request: [root: string, chapterId: string, selectedByScene?: ChapterSelections]
    response: ChapterPromptPlan
  }
  'finalize:reviewPlan': {
    request: [root: string, input: FinalizeReviewRequest]
    response: FinalizeReviewSession
  }
  'finalize:session': {
    request: [root: string, sessionId: string]
    response: FinalizeReviewSession
  }
  'finalize:confirmImpact': {
    request: [root: string, sessionId: string, impactId: string, answer: string, state?: string]
    response: FinalizeReviewSession
  }
  'run:readFile': { request: [root: string, runId: string, file: string]; response: string }
  'run:select': { request: [root: string, runId: string]; response: CandidateGroupSummary }
  'run:check': {
    request: [root: string, runId: string]
    response: { run: RunMetadata; report: CheckReport; markdown: string; evaluation: CheckScore }
  }
  'run:accept': { request: [root: string, runId: string, candidate?: string]; response: RunMetadata }
  'export:manuscript': {
    request: [root: string, options?: ManuscriptExportOptions]
    response: ManuscriptExportResult
  }
  'st:importCard': {
    request: [root: string, filePath?: string]
    response: CharacterCardImportResult | null
  }
  'st:exportCard': {
    request: [root: string, characterId: string]
    response: CharacterCardWriteResult
  }
  'st:exportLorebook': { request: [root: string]; response: WorldInfoWriteResult }
  'git:status': { request: [root: string]; response: GitStatus }
  'git:init': { request: [root: string]; response: GitStatus }
  'git:commit': { request: [root: string, message: string]; response: GitStatus }
  'git:sync': { request: [root: string, message: string]; response: GitStatus }
  'github:createRepoForProject': { request: [root: string]; response: GitStatus }
  'git:setRemote': { request: [root: string, url: string]; response: GitStatus }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<Channel extends IpcChannel> = IpcContract[Channel]['request']
export type IpcResponse<Channel extends IpcChannel> = IpcContract[Channel]['response']

export const QUILLARIUM_API_CHANNELS = {
  getConfig: 'config:get',
  getVault: 'config:getVault',
  getWorkspace: 'config:getWorkspace',
  chooseWorkspace: 'config:chooseWorkspace',
  setWorkspace: 'config:setWorkspace',
  chooseVault: 'config:chooseVault',
  setVault: 'config:setVault',
  migrateVault: 'config:migrateVault',
  setTheme: 'config:setTheme',
  setDensity: 'config:setDensity',
  setLanguage: 'config:setLanguage',
  saveAIProfile: 'config:saveAIProfile',
  saveGithub: 'config:saveGithub',
  aiStatus: 'config:aiStatus',
  listProjects: 'project:list',
  createProject: 'project:create',
  chooseProject: 'project:choose',
  loadProject: 'project:load',
  listWritingPresets: 'preset:list',
  initializeDefaultWritingPreset: 'preset:initializeDefault',
  selectWritingPreset: 'preset:select',
  readDoc: 'doc:read',
  saveDocBody: 'doc:saveBody',
  deleteDoc: 'doc:delete',
  openDocExternal: 'doc:openExternal',
  createDoc: 'doc:create',
  resolveDocumentOrigin: 'doc:origin',
  chooseMarkdownImport: 'import:chooseMarkdown',
  chooseImportSources: 'import:chooseSources',
  importMarkdownText: 'import:markdownText',
  syncMarkdownImports: 'import:syncMarkdown',
  initPrompts: 'prompt:init',
  readPrompt: 'prompt:read',
  createAIImportPlan: 'import:aiPlan',
  loadImportSession: 'import:session',
  updateImportCandidates: 'import:updateCandidates',
  answerImportIssue: 'import:answerIssue',
  landImportSession: 'import:landSession',
  reimportCard: 'import:reimportCard',
  discussCanon: 'canon:discuss',
  startPlanningSession: 'planning:start',
  loadPlanningSession: 'planning:session',
  savePlanningSession: 'planning:save',
  discussPlanningRecord: 'planning:discuss',
  confirmPlanningRecord: 'planning:confirm',
  checkPlanningCards: 'planning:check',
  assembleContext: 'scene:context',
  assembleTargetContext: 'target:context',
  assembleWritingPrompt: 'target:writingPrompt',
  checkTarget: 'target:check',
  checkScene: 'scene:check',
  semanticCheckScene: 'scene:semanticCheck',
  checkSceneIntoRun: 'scene:checkIntoRun',
  generateDryRun: 'scene:generateDryRun',
  generate: 'scene:generate',
  generateOutline: 'outline:generate',
  generateOutlineCandidates: 'outline:generateCandidates',
  prepareScene: 'scene:prepare',
  acceptManualScene: 'scene:acceptManual',
  buildScenePromptPlan: 'scene:promptPlan',
  loadChapterLifecycle: 'chapter:lifecycle',
  finalizeChapter: 'chapter:finalize',
  publishChapter: 'chapter:publish',
  buildChapterWritingPlan: 'chapter:writingPlan',
  createFinalizeReviewPlan: 'finalize:reviewPlan',
  loadFinalizeReviewSession: 'finalize:session',
  confirmFinalizeImpact: 'finalize:confirmImpact',
  readRunFile: 'run:readFile',
  selectRunCandidate: 'run:select',
  checkRunCandidate: 'run:check',
  acceptRun: 'run:accept',
  exportManuscript: 'export:manuscript',
  importSillyTavernCard: 'st:importCard',
  exportSillyTavernCard: 'st:exportCard',
  exportSillyTavernLorebook: 'st:exportLorebook',
  gitStatus: 'git:status',
  gitInit: 'git:init',
  gitCommit: 'git:commit',
  gitSync: 'git:sync',
  githubCreateRepoForProject: 'github:createRepoForProject',
  gitSetRemote: 'git:setRemote'
} as const satisfies Record<string, IpcChannel>

type AssertNever<Value extends never> = Value

export type AllIpcChannelsAreMapped = AssertNever<
  Exclude<IpcChannel, (typeof QUILLARIUM_API_CHANNELS)[keyof typeof QUILLARIUM_API_CHANNELS]>
>

export type QuillariumAPI = {
  [Name in keyof typeof QUILLARIUM_API_CHANNELS]: (
    ...args: IpcRequest<(typeof QUILLARIUM_API_CHANNELS)[Name]>
  ) => Promise<IpcResponse<(typeof QUILLARIUM_API_CHANNELS)[Name]>>
}

export type TypedIpcHandler<Channel extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IpcRequest<Channel>
) => IpcResponse<Channel> | Promise<IpcResponse<Channel>>

export function typedHandle<Channel extends IpcChannel>(
  channel: Channel,
  handler: TypedIpcHandler<Channel>
): void {
  ipcMain.handle(channel, (event, ...args) => handler(event, ...(args as IpcRequest<Channel>)))
}
