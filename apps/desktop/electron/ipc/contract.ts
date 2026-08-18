import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  AgentExecutionOutcome,
  AgentRuntimeErrorV1,
  AuthorApplyDecisionV1,
  PlanningCheckScope,
  PlanningIntegrityReviewResult,
  PlanningIssueApplicationResultV1
} from '@quillarium/agent-runtime'
import type {
  AIProfileConfig,
  AgentPromptEnvelopeV1,
  AgentTaskDefinitionV1,
  BookGenerationHeaderState,
  ContextBundleV1,
  CreatorRoleV1,
  LoadedAgentSession,
  LoadedAgentSessionDetail,
  LoadedAssistantPromptVersion,
  LoadedContextBundle,
  LoadedCreatorRole,
  ResolvedContextBundle,
  CandidateGroupSummary,
  ChapterLifecycleSnapshot,
  ChapterPublicationResult,
  ChapterPromptPlan,
  ContextPacket,
  DocumentIdentity,
  DocumentOriginResolution,
  EditableScenePromptPlan,
  FinalizationApplicationReport,
  FinalizeReviewSession,
  GitHubConfig,
  ImportPlanInput,
  ImportCandidate,
  ImportSession,
  IssueBatchAction,
  IssueBatchResult,
  ManuscriptExportOptions,
  ManuscriptExportResult,
  MarkdownImportResult,
  ProjectConfig,
  PromptBlock,
  PromptSourceSelection,
  PromptAsset,
  PromptName,
  QuillariumConfig,
  RunMetadata,
  ReorderStorySiblingsRequest,
  SceneDoc,
  ScenePromptInput,
  LoadedWritingPreset,
  LocalDocumentLinkIndexV1,
  DocumentReferenceMigrationPlanV1,
  DocumentReferenceMigrationReportV1,
  WritingPresetListItem,
  StoryOrderResult,
  TimelineCatalogV1,
  TimelineOrderSnapshotV1,
  ReorderTimelineNodesRequestV1,
  ReorderTimelineEventsRequestV1,
  PlaceTimelineEventRequestV1,
  CreateTimelineNodeV2Input,
  TimeSystemV1,
  TimelineTrackV1,
  LoadedVersionedYaml,
  TimelineMigrationPlanV1,
  TimelineMigrationReportV1,
  StoryTimeImportPlanV1,
  StoryTimeImportDecisionV1,
  StoryTimeImportReportV1,
  TimelineDeterministicIssueV1,
  CreatorAssistantId,
  CreatorAssistantWorkflowInputV1,
  SaveAssistantPromptVersionInput
} from '@quillarium/core'
import { recordIpcFailure } from '../logging.js'
import type { CheckReport, CheckScore } from '@quillarium/checks'
import type { AIModelCapabilities } from '@quillarium/ai'
import type {
  BookCharacterCardExportOptions,
  BookCharacterCardImportResult,
  BookCharacterCardInspection,
  BookCharacterCardWriteResult,
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

export interface ProjectCoverResult {
  cover: NonNullable<ProjectConfig['cover']>
  warning: string | null
  previewDataUrl: string
}

export interface ImportedBookProject {
  project: ProjectSummary
  import: BookCharacterCardImportResult
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

export interface PromptViewerSnapshot {
  promptEnvelope: AgentPromptEnvelopeV1
  providerRequest: Record<string, unknown>
  promptBlocks: PromptBlock[]
  providerTransformed: boolean
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
  clientRequestId?: string
  resumeSessionId?: string
}

export type DesktopAIStreamOperation = 'import-split' | 'planning-check'

export interface DesktopAIStreamEvent {
  execution_id: string
  request_id: string
  client_request_id: string
  operation: DesktopAIStreamOperation
  type: 'started' | 'attempt' | 'phase' | 'content_delta' | 'completed' | 'failed' | 'cancelled'
  elapsed_ms: number
  phase?: 'connecting' | 'waiting' | 'streaming' | 'validating'
  attempt?: number
  content_delta?: string
  child_execution_id?: string
  batch_key?: string
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

export type PlanningProposalOperation = 'create' | 'update'
export type PlanningProposalStatus = 'draft' | 'confirmed' | 'applied'

export interface PlanningProposalRevision {
  id: string
  created_at: string
  source: 'anchor' | 'ai' | 'author'
  content_sha256: string
}

export interface PlanningProposalTarget extends PlanningDocumentRef {
  expected_sha256: string
}

export interface PlanningProposal {
  /** Stable temporary identity for the lifetime of the conversation. */
  id: string
  operation: PlanningProposalOperation
  source: 'anchor' | 'ai' | 'author'
  status: PlanningProposalStatus
  draft: PlanningDraft
  target?: PlanningProposalTarget
  revisions: PlanningProposalRevision[]
  validation_error?: string
}

export interface PlanningChatRequest {
  module: string
  messages: PlanningChatMessage[]
  proposal?: PlanningDraft | null
  proposals?: PlanningProposal[]
  selectedProposalId?: string | null
  sessionId?: string
}

export interface PlanningChatResponse {
  message: string
  proposal: PlanningDraft | null
  proposals: PlanningProposal[]
  selectedProposalId: string | null
}

export interface PlanningDocumentRef {
  path: string
  id: string
  type: PlanningDocumentKind
}

export interface PlanningSession {
  schema_version: 2
  id: string
  module: string
  created_at: string
  updated_at: string
  messages: PlanningChatMessage[]
  proposal: PlanningDraft | null
  proposals: PlanningProposal[]
  selected_proposal_id: string | null
  anchor_proposal_id?: string
  document?: PlanningDocumentRef
}

export type PlanningCheckSummary = AgentExecutionOutcome<PlanningIntegrityReviewResult, AgentRuntimeErrorV1>

export interface PlanningCheckDecisionRequest {
  executionId: string
  selectedResultIds: string[]
  decision: 'approved' | 'rejected'
  createdBy?: 'desktop-author' | 'cli-author'
}

export type PlanningCheckDecisionResponse =
  { status: 'decided'; decision: AuthorApplyDecisionV1 } | { status: 'failed'; error: AgentRuntimeErrorV1 }

export type PlanningCheckApplyResponse =
  | { status: 'applied'; result: PlanningIssueApplicationResultV1 }
  | { status: 'failed'; error: AgentRuntimeErrorV1 }

export interface PlanningSessionUpdate {
  messages: PlanningChatMessage[]
  proposal?: PlanningDraft | null
  proposals?: PlanningProposal[]
  selectedProposalId?: string | null
}

export interface PlanningConfirmRequest extends PlanningSessionUpdate {
  sessionId: string
  proposal?: PlanningDraft
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

export type UpdateCheckStatus = 'available' | 'up-to-date' | 'unavailable'

export type UpdateUnavailableReason =
  'network' | 'rate-limited' | 'service-error' | 'invalid-response' | 'no-release' | 'current-version-invalid'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  currentVersion: string
  latestVersion: string | null
  releaseName: string | null
  publishedAt: string | null
  prerelease: boolean | null
  checkedAt: string
  reason: UpdateUnavailableReason | null
}

export interface AssistantWorkspaceState {
  tasks: AgentTaskDefinitionV1[]
  roles: LoadedCreatorRole[]
  bundles: LoadedContextBundle[]
  sessions: LoadedAgentSession[]
  prompts: LoadedAssistantPromptVersion[]
}

export interface AssistantRunPreview {
  session: LoadedAgentSessionDetail
  resolved_context: ResolvedContextBundle
  prompt_envelope: AgentPromptEnvelopeV1
  knows: Array<{
    source_type: string
    source_id: string
    authority: string
    required: boolean
    token_count: number
    reason: string
    outcome: string
    display_title: string
    purpose: string
  }>
  can_do: string[]
  result_destination: string
}

export interface AssistantProposalActionResult {
  session: LoadedAgentSessionDetail
  document?: { path: string; id: string; type: string }
}

export interface AssistantConfigurationActionResult {
  session: LoadedAgentSessionDetail
  applied?: CreatorRoleV1 | ContextBundleV1
}

export interface IpcContract {
  'ai:cancelStream': {
    request: [executionId: string, requestId: string]
    response: boolean
  }
  'app:version': { request: []; response: string }
  'app:checkForUpdates': { request: []; response: UpdateCheckResult }
  'app:openReleases': { request: []; response: boolean }
  'config:get': { request: []; response: DesktopConfig }
  'config:modelCapabilities': { request: []; response: AIModelCapabilities[] }
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
  'cover:choose': { request: [root: string]; response: ProjectCoverResult | null }
  'cover:get': { request: [root: string]; response: ProjectCoverResult | null }
  'cover:focus': {
    request: [root: string, focusX: number, focusY: number]
    response: ProjectCoverResult
  }
  'assistant:initialize': { request: [root: string]; response: AssistantWorkspaceState }
  'assistant:listPrompts': {
    request: [root: string, assistantId: CreatorAssistantId]
    response: LoadedAssistantPromptVersion[]
  }
  'assistant:savePrompt': {
    request: [root: string, input: SaveAssistantPromptVersionInput]
    response: LoadedAssistantPromptVersion
  }
  'assistant:start': {
    request: [
      root: string,
      roleId: string,
      target: { document_type: string; document_id: string },
      title?: string,
      workflowInput?: CreatorAssistantWorkflowInputV1
    ]
    response: LoadedAgentSession
  }
  'assistant:session': {
    request: [root: string, sessionId: string]
    response: LoadedAgentSessionDetail
  }
  'assistant:fork': {
    request: [root: string, sessionId: string, throughTurnId?: string]
    response: LoadedAgentSession
  }
  'assistant:preview': {
    request: [root: string, sessionId: string, authorInput: string, sentUserContent?: string]
    response: AssistantRunPreview
  }
  'assistant:turn': {
    request: [
      root: string,
      sessionId: string,
      expectedSessionSha256: string,
      authorInput: string,
      sentUserContent?: string
    ]
    response: LoadedAgentSessionDetail
  }
  'assistant:applyProposal': {
    request: [root: string, sessionId: string, turnId: string, proposalId: string, expectedTurnSha256: string]
    response: AssistantProposalActionResult
  }
  'assistant:rejectProposal': {
    request: [root: string, sessionId: string, turnId: string, proposalId: string, expectedTurnSha256: string]
    response: AssistantProposalActionResult
  }
  'assistant:applyConfigurationProposal': {
    request: [root: string, sessionId: string, turnId: string, proposalId: string, expectedTurnSha256: string]
    response: AssistantConfigurationActionResult
  }
  'assistant:rejectConfigurationProposal': {
    request: [root: string, sessionId: string, turnId: string, proposalId: string, expectedTurnSha256: string]
    response: AssistantConfigurationActionResult
  }
  'assistant:createRole': {
    request: [root: string, role: CreatorRoleV1]
    response: LoadedCreatorRole
  }
  'assistant:updateRole': {
    request: [root: string, role: CreatorRoleV1, expectedSha256: string]
    response: LoadedCreatorRole
  }
  'assistant:deleteRole': {
    request: [root: string, id: string, expectedSha256: string]
    response: boolean
  }
  'assistant:createBundle': {
    request: [root: string, bundle: ContextBundleV1]
    response: LoadedContextBundle
  }
  'assistant:updateBundle': {
    request: [root: string, bundle: ContextBundleV1, expectedSha256: string]
    response: LoadedContextBundle
  }
  'assistant:deleteBundle': {
    request: [root: string, id: string, expectedSha256: string]
    response: boolean
  }
  'preset:list': { request: [root: string]; response: WritingPresetListItem[] }
  'preset:initializeDefault': { request: [root: string]; response: LoadedWritingPreset }
  'preset:select': { request: [root: string, id: string]; response: LoadedWritingPreset }
  'prompt:bookHeaderGet': { request: [root: string]; response: BookGenerationHeaderState }
  'prompt:bookHeaderSave': {
    request: [root: string, text: string]
    response: BookGenerationHeaderState
  }
  'prompt:bookHeaderClear': { request: [root: string]; response: BookGenerationHeaderState }
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
  'story:reorder': {
    request: [root: string, input: ReorderStorySiblingsRequest]
    response: StoryOrderResult
  }
  'references:index': {
    request: [root: string]
    response: LocalDocumentLinkIndexV1
  }
  'references:format': {
    request: [root: string, documentId: string, displayText?: string]
    response: string
  }
  'references:migrationPlan': {
    request: [root: string]
    response: DocumentReferenceMigrationPlanV1
  }
  'references:migrationApply': {
    request: [root: string, plan: DocumentReferenceMigrationPlanV1]
    response: DocumentReferenceMigrationReportV1
  }
  'timeline:catalog': { request: [root: string]; response: TimelineCatalogV1 }
  'timeline:orderSnapshot': {
    request: [root: string, trackId: string]
    response: TimelineOrderSnapshotV1
  }
  'timeline:reorderTracks': {
    request: [root: string, orderedTrackIds: string[], expectedHashes: Record<string, string>]
    response: TimelineTrackV1[]
  }
  'timeline:reorderNodes': {
    request: [root: string, input: ReorderTimelineNodesRequestV1]
    response: DocumentIdentity[]
  }
  'timeline:reorderEvents': {
    request: [root: string, input: ReorderTimelineEventsRequestV1]
    response: DocumentIdentity[]
  }
  'timeline:placeEvent': {
    request: [root: string, input: PlaceTimelineEventRequestV1]
    response: DocumentIdentity
  }
  'timeline:createNode': {
    request: [root: string, input: CreateTimelineNodeV2Input]
    response: string
  }
  'timeline:createTimeSystem': {
    request: [root: string, value: TimeSystemV1]
    response: LoadedVersionedYaml<TimeSystemV1>
  }
  'timeline:updateTimeSystem': {
    request: [root: string, value: TimeSystemV1, expectedHash: string]
    response: LoadedVersionedYaml<TimeSystemV1>
  }
  'timeline:deleteTimeSystem': {
    request: [root: string, id: string, expectedHash: string]
    response: boolean
  }
  'timeline:createTrack': {
    request: [root: string, value: TimelineTrackV1]
    response: LoadedVersionedYaml<TimelineTrackV1>
  }
  'timeline:updateTrack': {
    request: [root: string, value: TimelineTrackV1, expectedHash: string]
    response: LoadedVersionedYaml<TimelineTrackV1>
  }
  'timeline:deleteTrack': {
    request: [root: string, id: string, expectedHash: string]
    response: boolean
  }
  'timeline:migrationPlan': {
    request: [root: string]
    response: TimelineMigrationPlanV1
  }
  'timeline:migrationApply': {
    request: [root: string, plan: TimelineMigrationPlanV1]
    response: TimelineMigrationReportV1
  }
  'timeline:storyTimePlan': {
    request: [root: string]
    response: StoryTimeImportPlanV1
  }
  'timeline:storyTimeApply': {
    request: [root: string, plan: StoryTimeImportPlanV1, decision: StoryTimeImportDecisionV1]
    response: StoryTimeImportReportV1
  }
  'timeline:check': {
    request: [root: string]
    response: TimelineDeterministicIssueV1[]
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
  'import:latestUnfinishedSession': { request: [root: string]; response: ImportSession | null }
  'import:updateCandidates': {
    request: [root: string, sessionId: string, candidates: ImportCandidate[]]
    response: ImportSession
  }
  'import:answerIssue': {
    request: [
      root: string,
      sessionId: string,
      issueId: string,
      answer: string,
      mode?: 'confirm-current' | 'supplement-candidate'
    ]
    response: ImportSession
  }
  'import:abandonSession': {
    request: [root: string, sessionId: string]
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
  'planning:issueBatch': {
    request: [root: string, issueIds: string[], action: IssueBatchAction]
    response: IssueBatchResult
  }
  'planning:check': {
    request: [root: string, language: 'zh' | 'en', clientRequestId?: string, scope?: PlanningCheckScope]
    response: PlanningCheckSummary
  }
  'planning:checkRetry': {
    request: [root: string, executionId: string, language: 'zh' | 'en', clientRequestId?: string]
    response: PlanningCheckSummary
  }
  'planning:checkDecision': {
    request: [root: string, input: PlanningCheckDecisionRequest]
    response: PlanningCheckDecisionResponse
  }
  'planning:checkApply': {
    request: [root: string, executionId: string, decisionId: string]
    response: PlanningCheckApplyResponse
  }
  'planning:checkOpenRun': {
    request: [root: string, executionId: string]
    response: boolean
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
  'scene:previewFullPrompt': {
    request: [root: string, sceneId: string, prompt: string, promptSources?: PromptSourceSelection[]]
    response: PromptViewerSnapshot
  }
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
      parentRunId?: string,
      promptSources?: PromptSourceSelection[]
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
  'scene:compilePromptOverlay': {
    request: [root: string, sceneId: string, sources: PromptSourceSelection[]]
    response: EditableScenePromptPlan
  }
  'scene:savePromptBundle': {
    request: [root: string, title: string, sources: PromptSourceSelection[]]
    response: LoadedContextBundle
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
  'finalize:answerQuestion': {
    request: [root: string, sessionId: string, questionId: string, answer: string, state?: string]
    response: FinalizeReviewSession
  }
  'finalize:apply': {
    request: [root: string, sessionId: string]
    response: FinalizationApplicationReport
  }
  'finalize:recover': {
    request: [root: string]
    response: FinalizationApplicationReport[]
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
  'st:chooseBookCard': { request: []; response: BookCharacterCardInspection | null }
  'st:importBookProject': {
    request: [sourcePath: string, title: string]
    response: ImportedBookProject
  }
  'st:exportBookCard': {
    request: [root: string, options?: BookCharacterCardExportOptions]
    response: BookCharacterCardWriteResult
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
  cancelAIStream: 'ai:cancelStream',
  getAppVersion: 'app:version',
  checkForUpdates: 'app:checkForUpdates',
  openReleases: 'app:openReleases',
  getConfig: 'config:get',
  getModelCapabilities: 'config:modelCapabilities',
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
  chooseProjectCover: 'cover:choose',
  getProjectCover: 'cover:get',
  updateProjectCoverFocus: 'cover:focus',
  initializeAssistants: 'assistant:initialize',
  listAssistantPromptVersions: 'assistant:listPrompts',
  saveAssistantPromptVersion: 'assistant:savePrompt',
  startAssistantSession: 'assistant:start',
  loadAssistantSession: 'assistant:session',
  forkAssistantSession: 'assistant:fork',
  previewAssistantTurn: 'assistant:preview',
  sendAssistantTurn: 'assistant:turn',
  applyAssistantProposal: 'assistant:applyProposal',
  rejectAssistantProposal: 'assistant:rejectProposal',
  applyAssistantConfigurationProposal: 'assistant:applyConfigurationProposal',
  rejectAssistantConfigurationProposal: 'assistant:rejectConfigurationProposal',
  createCreatorRole: 'assistant:createRole',
  updateCreatorRole: 'assistant:updateRole',
  deleteCreatorRole: 'assistant:deleteRole',
  createContextBundle: 'assistant:createBundle',
  updateContextBundle: 'assistant:updateBundle',
  deleteContextBundle: 'assistant:deleteBundle',
  listWritingPresets: 'preset:list',
  initializeDefaultWritingPreset: 'preset:initializeDefault',
  selectWritingPreset: 'preset:select',
  getBookGenerationHeader: 'prompt:bookHeaderGet',
  saveBookGenerationHeader: 'prompt:bookHeaderSave',
  clearBookGenerationHeader: 'prompt:bookHeaderClear',
  readDoc: 'doc:read',
  saveDocBody: 'doc:saveBody',
  deleteDoc: 'doc:delete',
  openDocExternal: 'doc:openExternal',
  createDoc: 'doc:create',
  reorderStorySiblings: 'story:reorder',
  rebuildDocumentLinkIndex: 'references:index',
  formatDocumentLink: 'references:format',
  planDocumentReferenceMigration: 'references:migrationPlan',
  applyDocumentReferenceMigration: 'references:migrationApply',
  loadTimelineCatalog: 'timeline:catalog',
  getTimelineOrderSnapshot: 'timeline:orderSnapshot',
  reorderTimelineTracks: 'timeline:reorderTracks',
  reorderTimelineNodes: 'timeline:reorderNodes',
  reorderTimelineEvents: 'timeline:reorderEvents',
  placeTimelineEvent: 'timeline:placeEvent',
  createTimelineNode: 'timeline:createNode',
  createTimeSystem: 'timeline:createTimeSystem',
  updateTimeSystem: 'timeline:updateTimeSystem',
  deleteTimeSystem: 'timeline:deleteTimeSystem',
  createTimelineTrack: 'timeline:createTrack',
  updateTimelineTrack: 'timeline:updateTrack',
  deleteTimelineTrack: 'timeline:deleteTrack',
  planTimelineMigration: 'timeline:migrationPlan',
  applyTimelineMigration: 'timeline:migrationApply',
  planStoryTimeTimelineImport: 'timeline:storyTimePlan',
  applyStoryTimeTimelineImport: 'timeline:storyTimeApply',
  checkTimelineDeterministically: 'timeline:check',
  resolveDocumentOrigin: 'doc:origin',
  chooseMarkdownImport: 'import:chooseMarkdown',
  chooseImportSources: 'import:chooseSources',
  importMarkdownText: 'import:markdownText',
  syncMarkdownImports: 'import:syncMarkdown',
  initPrompts: 'prompt:init',
  readPrompt: 'prompt:read',
  createAIImportPlan: 'import:aiPlan',
  loadImportSession: 'import:session',
  loadLatestUnfinishedImportSession: 'import:latestUnfinishedSession',
  updateImportCandidates: 'import:updateCandidates',
  answerImportIssue: 'import:answerIssue',
  abandonImportSession: 'import:abandonSession',
  landImportSession: 'import:landSession',
  reimportCard: 'import:reimportCard',
  discussCanon: 'canon:discuss',
  startPlanningSession: 'planning:start',
  loadPlanningSession: 'planning:session',
  savePlanningSession: 'planning:save',
  discussPlanningRecord: 'planning:discuss',
  confirmPlanningRecord: 'planning:confirm',
  applyIssueBatchAction: 'planning:issueBatch',
  checkPlanningCards: 'planning:check',
  retryPlanningCheck: 'planning:checkRetry',
  decidePlanningCheck: 'planning:checkDecision',
  applyPlanningCheck: 'planning:checkApply',
  openPlanningCheckRun: 'planning:checkOpenRun',
  assembleContext: 'scene:context',
  assembleTargetContext: 'target:context',
  assembleWritingPrompt: 'target:writingPrompt',
  checkTarget: 'target:check',
  checkScene: 'scene:check',
  semanticCheckScene: 'scene:semanticCheck',
  checkSceneIntoRun: 'scene:checkIntoRun',
  generateDryRun: 'scene:generateDryRun',
  previewFullGenerationPrompt: 'scene:previewFullPrompt',
  generate: 'scene:generate',
  generateOutline: 'outline:generate',
  generateOutlineCandidates: 'outline:generateCandidates',
  prepareScene: 'scene:prepare',
  acceptManualScene: 'scene:acceptManual',
  buildScenePromptPlan: 'scene:promptPlan',
  compileScenePromptOverlay: 'scene:compilePromptOverlay',
  savePromptSourcesAsBundle: 'scene:savePromptBundle',
  loadChapterLifecycle: 'chapter:lifecycle',
  finalizeChapter: 'chapter:finalize',
  publishChapter: 'chapter:publish',
  buildChapterWritingPlan: 'chapter:writingPlan',
  createFinalizeReviewPlan: 'finalize:reviewPlan',
  loadFinalizeReviewSession: 'finalize:session',
  confirmFinalizeImpact: 'finalize:confirmImpact',
  answerFinalizeQuestion: 'finalize:answerQuestion',
  applyFinalizeReview: 'finalize:apply',
  recoverFinalizationApplications: 'finalize:recover',
  readRunFile: 'run:readFile',
  selectRunCandidate: 'run:select',
  checkRunCandidate: 'run:check',
  acceptRun: 'run:accept',
  exportManuscript: 'export:manuscript',
  importSillyTavernCard: 'st:importCard',
  chooseBookCharacterCard: 'st:chooseBookCard',
  importBookCharacterCardProject: 'st:importBookProject',
  exportBookCharacterCard: 'st:exportBookCard',
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

type QuillariumInvokeAPI = {
  [Name in keyof typeof QUILLARIUM_API_CHANNELS]: (
    ...args: IpcRequest<(typeof QUILLARIUM_API_CHANNELS)[Name]>
  ) => Promise<IpcResponse<(typeof QUILLARIUM_API_CHANNELS)[Name]>>
}

export type QuillariumAPI = QuillariumInvokeAPI & {
  onAIStreamEvent(listener: (event: DesktopAIStreamEvent) => void): () => void
}

export type TypedIpcHandler<Channel extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IpcRequest<Channel>
) => IpcResponse<Channel> | Promise<IpcResponse<Channel>>

export function typedHandle<Channel extends IpcChannel>(
  channel: Channel,
  handler: TypedIpcHandler<Channel>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...(args as IpcRequest<Channel>))
    } catch (error) {
      await recordIpcFailure(channel, error, { argument_count: args.length }).catch((loggingError) =>
        console.error('Could not persist Quillarium IPC error log.', loggingError)
      )
      throw error
    }
  })
}
