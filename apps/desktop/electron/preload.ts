import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse, QuillariumAPI } from './ipc/contract.js'

function invoke<Channel extends IpcChannel>(
  channel: Channel,
  ...args: IpcRequest<Channel>
): Promise<IpcResponse<Channel>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<Channel>>
}

const api: QuillariumAPI = {
  cancelAIStream: (executionId, requestId) => invoke('ai:cancelStream', executionId, requestId),
  onAIStreamEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]) =>
      listener(value)
    ipcRenderer.on('ai:streamEvent', handler)
    return () => ipcRenderer.removeListener('ai:streamEvent', handler)
  },
  getAppVersion: () => invoke('app:version'),
  checkForUpdates: () => invoke('app:checkForUpdates'),
  openReleases: () => invoke('app:openReleases'),
  getConfig: () => invoke('config:get'),
  getModelCapabilities: () => invoke('config:modelCapabilities'),
  getVault: () => invoke('config:getVault'),
  getWorkspace: () => invoke('config:getWorkspace'),
  chooseWorkspace: () => invoke('config:chooseWorkspace'),
  setWorkspace: (dir) => invoke('config:setWorkspace', dir),
  chooseVault: () => invoke('config:chooseVault'),
  setVault: (dir) => invoke('config:setVault', dir),
  migrateVault: () => invoke('config:migrateVault'),
  setTheme: (theme) => invoke('config:setTheme', theme),
  setDensity: (density) => invoke('config:setDensity', density),
  setLanguage: (language) => invoke('config:setLanguage', language),
  saveAIProfile: (profile, input) => invoke('config:saveAIProfile', profile, input),
  saveGithub: (input) => invoke('config:saveGithub', input),
  aiStatus: () => invoke('config:aiStatus'),
  listProjects: () => invoke('project:list'),
  createProject: (input) => invoke('project:create', input),
  chooseProject: () => invoke('project:choose'),
  loadProject: (root) => invoke('project:load', root),
  chooseProjectCover: (root) => invoke('cover:choose', root),
  getProjectCover: (root) => invoke('cover:get', root),
  updateProjectCoverFocus: (root, focusX, focusY) => invoke('cover:focus', root, focusX, focusY),
  initializeAssistants: (root) => invoke('assistant:initialize', root),
  listAssistantPromptVersions: (root, assistantId) => invoke('assistant:listPrompts', root, assistantId),
  saveAssistantPromptVersion: (root, input) => invoke('assistant:savePrompt', root, input),
  startAssistantSession: (root, roleId, target, title, workflowInput) =>
    invoke('assistant:start', root, roleId, target, title, workflowInput),
  loadAssistantSession: (root, sessionId) => invoke('assistant:session', root, sessionId),
  forkAssistantSession: (root, sessionId, throughTurnId) =>
    invoke('assistant:fork', root, sessionId, throughTurnId),
  previewAssistantTurn: (root, sessionId, authorInput, sentUserContent) =>
    invoke('assistant:preview', root, sessionId, authorInput, sentUserContent),
  sendAssistantTurn: (root, sessionId, expectedSessionSha256, authorInput, sentUserContent) =>
    invoke('assistant:turn', root, sessionId, expectedSessionSha256, authorInput, sentUserContent),
  applyAssistantProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    invoke('assistant:applyProposal', root, sessionId, turnId, proposalId, expectedTurnSha256),
  rejectAssistantProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    invoke('assistant:rejectProposal', root, sessionId, turnId, proposalId, expectedTurnSha256),
  applyAssistantConfigurationProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    invoke('assistant:applyConfigurationProposal', root, sessionId, turnId, proposalId, expectedTurnSha256),
  rejectAssistantConfigurationProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    invoke('assistant:rejectConfigurationProposal', root, sessionId, turnId, proposalId, expectedTurnSha256),
  createCreatorRole: (root, role) => invoke('assistant:createRole', root, role),
  updateCreatorRole: (root, role, expectedSha256) =>
    invoke('assistant:updateRole', root, role, expectedSha256),
  deleteCreatorRole: (root, id, expectedSha256) => invoke('assistant:deleteRole', root, id, expectedSha256),
  createContextBundle: (root, bundle) => invoke('assistant:createBundle', root, bundle),
  updateContextBundle: (root, bundle, expectedSha256) =>
    invoke('assistant:updateBundle', root, bundle, expectedSha256),
  deleteContextBundle: (root, id, expectedSha256) =>
    invoke('assistant:deleteBundle', root, id, expectedSha256),
  listWritingPresets: (root) => invoke('preset:list', root),
  initializeDefaultWritingPreset: (root) => invoke('preset:initializeDefault', root),
  selectWritingPreset: (root, id) => invoke('preset:select', root, id),
  getBookGenerationHeader: (root) => invoke('prompt:bookHeaderGet', root),
  saveBookGenerationHeader: (root, text) => invoke('prompt:bookHeaderSave', root, text),
  clearBookGenerationHeader: (root) => invoke('prompt:bookHeaderClear', root),
  readDoc: (filePath) => invoke('doc:read', filePath),
  saveDocBody: (filePath, data, body) => invoke('doc:saveBody', filePath, data, body),
  deleteDoc: (filePath) => invoke('doc:delete', filePath),
  openDocExternal: (filePath) => invoke('doc:openExternal', filePath),
  createDoc: (root, kind, input) => invoke('doc:create', root, kind, input),
  reorderStorySiblings: (root, input) => invoke('story:reorder', root, input),
  rebuildDocumentLinkIndex: (root) => invoke('references:index', root),
  formatDocumentLink: (root, documentId, displayText) =>
    invoke('references:format', root, documentId, displayText),
  planDocumentReferenceMigration: (root) => invoke('references:migrationPlan', root),
  applyDocumentReferenceMigration: (root, plan) => invoke('references:migrationApply', root, plan),
  loadTimelineCatalog: (root) => invoke('timeline:catalog', root),
  getTimelineOrderSnapshot: (root, trackId) => invoke('timeline:orderSnapshot', root, trackId),
  reorderTimelineTracks: (root, orderedTrackIds, expectedHashes) =>
    invoke('timeline:reorderTracks', root, orderedTrackIds, expectedHashes),
  reorderTimelineNodes: (root, input) => invoke('timeline:reorderNodes', root, input),
  reorderTimelineEvents: (root, input) => invoke('timeline:reorderEvents', root, input),
  placeTimelineEvent: (root, input) => invoke('timeline:placeEvent', root, input),
  createTimelineNode: (root, input) => invoke('timeline:createNode', root, input),
  createTimeSystem: (root, value) => invoke('timeline:createTimeSystem', root, value),
  updateTimeSystem: (root, value, expectedHash) =>
    invoke('timeline:updateTimeSystem', root, value, expectedHash),
  deleteTimeSystem: (root, id, expectedHash) => invoke('timeline:deleteTimeSystem', root, id, expectedHash),
  createTimelineTrack: (root, value) => invoke('timeline:createTrack', root, value),
  updateTimelineTrack: (root, value, expectedHash) =>
    invoke('timeline:updateTrack', root, value, expectedHash),
  deleteTimelineTrack: (root, id, expectedHash) => invoke('timeline:deleteTrack', root, id, expectedHash),
  planTimelineMigration: (root) => invoke('timeline:migrationPlan', root),
  applyTimelineMigration: (root, plan) => invoke('timeline:migrationApply', root, plan),
  planStoryTimeTimelineImport: (root) => invoke('timeline:storyTimePlan', root),
  applyStoryTimeTimelineImport: (root, plan, decision) =>
    invoke('timeline:storyTimeApply', root, plan, decision),
  checkTimelineDeterministically: (root) => invoke('timeline:check', root),
  resolveDocumentOrigin: (root, filePath) => invoke('doc:origin', root, filePath),
  chooseMarkdownImport: (root) => invoke('import:chooseMarkdown', root),
  chooseImportSources: () => invoke('import:chooseSources'),
  importMarkdownText: (root, markdown, title) => invoke('import:markdownText', root, markdown, title),
  syncMarkdownImports: (root) => invoke('import:syncMarkdown', root),
  initPrompts: (root) => invoke('prompt:init', root),
  readPrompt: (root, name) => invoke('prompt:read', root, name),
  createAIImportPlan: (root, input) => invoke('import:aiPlan', root, input),
  loadImportSession: (root, sessionId) => invoke('import:session', root, sessionId),
  loadLatestUnfinishedImportSession: (root) => invoke('import:latestUnfinishedSession', root),
  updateImportCandidates: (root, sessionId, candidates) =>
    invoke('import:updateCandidates', root, sessionId, candidates),
  answerImportIssue: (root, sessionId, issueId, answer, mode) =>
    invoke('import:answerIssue', root, sessionId, issueId, answer, mode),
  abandonImportSession: (root, sessionId) => invoke('import:abandonSession', root, sessionId),
  landImportSession: (root, sessionId) => invoke('import:landSession', root, sessionId),
  reimportCard: (root, filePath) => invoke('import:reimportCard', root, filePath),
  discussCanon: (root, input) => invoke('canon:discuss', root, input),
  startPlanningSession: (root, module, documentId) => invoke('planning:start', root, module, documentId),
  loadPlanningSession: (root, sessionId) => invoke('planning:session', root, sessionId),
  savePlanningSession: (root, sessionId, update) => invoke('planning:save', root, sessionId, update),
  discussPlanningRecord: (root, input) => invoke('planning:discuss', root, input),
  confirmPlanningRecord: (root, input) => invoke('planning:confirm', root, input),
  applyIssueBatchAction: (root, issueIds, action) => invoke('planning:issueBatch', root, issueIds, action),
  checkPlanningCards: (root, language, clientRequestId, scope) =>
    invoke('planning:check', root, language, clientRequestId, scope),
  retryPlanningCheck: (root, executionId, language, clientRequestId) =>
    invoke('planning:checkRetry', root, executionId, language, clientRequestId),
  decidePlanningCheck: (root, input) => invoke('planning:checkDecision', root, input),
  applyPlanningCheck: (root, executionId, decisionId) =>
    invoke('planning:checkApply', root, executionId, decisionId),
  openPlanningCheckRun: (root, executionId) => invoke('planning:checkOpenRun', root, executionId),
  assembleContext: (root, sceneId) => invoke('scene:context', root, sceneId),
  assembleTargetContext: (root, target) => invoke('target:context', root, target),
  assembleWritingPrompt: (root, outlineId) => invoke('target:writingPrompt', root, outlineId),
  checkTarget: (root, target) => invoke('target:check', root, target),
  checkScene: (root, sceneId) => invoke('scene:check', root, sceneId),
  semanticCheckScene: (root, sceneId, content) => invoke('scene:semanticCheck', root, sceneId, content),
  checkSceneIntoRun: (root, sceneId, content) => invoke('scene:checkIntoRun', root, sceneId, content),
  generateDryRun: (root, sceneId) => invoke('scene:generateDryRun', root, sceneId),
  previewFullGenerationPrompt: (root, sceneId, prompt, promptSources) =>
    invoke('scene:previewFullPrompt', root, sceneId, prompt, promptSources),
  generate: (root, sceneId) => invoke('scene:generate', root, sceneId),
  generateOutline: (root, outlineId, prompt, sceneId) =>
    invoke('outline:generate', root, outlineId, prompt, sceneId),
  generateOutlineCandidates: (root, outlineId, prompt, sceneId, count, parentRunId, promptSources) =>
    invoke('outline:generateCandidates', root, outlineId, prompt, sceneId, count, parentRunId, promptSources),
  prepareScene: (root, chapterId) => invoke('scene:prepare', root, chapterId),
  acceptManualScene: (root, sceneId, content) => invoke('scene:acceptManual', root, sceneId, content),
  buildScenePromptPlan: (root, sceneId) => invoke('scene:promptPlan', root, sceneId),
  compileScenePromptOverlay: (root, sceneId, sources) =>
    invoke('scene:compilePromptOverlay', root, sceneId, sources),
  savePromptSourcesAsBundle: (root, title, sources) => invoke('scene:savePromptBundle', root, title, sources),
  loadChapterLifecycle: (root, chapterId) => invoke('chapter:lifecycle', root, chapterId),
  finalizeChapter: (root, chapterId) => invoke('chapter:finalize', root, chapterId),
  publishChapter: (root, chapterId, confirmation) => invoke('chapter:publish', root, chapterId, confirmation),
  buildChapterWritingPlan: (root, chapterId, selectedByScene) =>
    invoke('chapter:writingPlan', root, chapterId, selectedByScene),
  createFinalizeReviewPlan: (root, input) => invoke('finalize:reviewPlan', root, input),
  loadFinalizeReviewSession: (root, sessionId) => invoke('finalize:session', root, sessionId),
  confirmFinalizeImpact: (root, sessionId, impactId, answer, state) =>
    invoke('finalize:confirmImpact', root, sessionId, impactId, answer, state),
  answerFinalizeQuestion: (root, sessionId, questionId, answer, state) =>
    invoke('finalize:answerQuestion', root, sessionId, questionId, answer, state),
  applyFinalizeReview: (root, sessionId) => invoke('finalize:apply', root, sessionId),
  recoverFinalizationApplications: (root) => invoke('finalize:recover', root),
  readRunFile: (root, runId, file) => invoke('run:readFile', root, runId, file),
  selectRunCandidate: (root, runId) => invoke('run:select', root, runId),
  checkRunCandidate: (root, runId) => invoke('run:check', root, runId),
  acceptRun: (root, runId, candidate) => invoke('run:accept', root, runId, candidate),
  exportManuscript: (root, options) => invoke('export:manuscript', root, options),
  importSillyTavernCard: (root, filePath) => invoke('st:importCard', root, filePath),
  chooseBookCharacterCard: () => invoke('st:chooseBookCard'),
  importBookCharacterCardProject: (sourcePath, title) => invoke('st:importBookProject', sourcePath, title),
  exportBookCharacterCard: (root, options) => invoke('st:exportBookCard', root, options),
  exportSillyTavernCard: (root, characterId) => invoke('st:exportCard', root, characterId),
  exportSillyTavernLorebook: (root) => invoke('st:exportLorebook', root),
  gitStatus: (root) => invoke('git:status', root),
  gitInit: (root) => invoke('git:init', root),
  gitCommit: (root, message) => invoke('git:commit', root, message),
  gitSync: (root, message) => invoke('git:sync', root, message),
  githubCreateRepoForProject: (root) => invoke('github:createRepoForProject', root),
  gitSetRemote: (root, url) => invoke('git:setRemote', root, url)
}

contextBridge.exposeInMainWorld('quillarium', api)

export type { QuillariumAPI } from './ipc/contract.js'
