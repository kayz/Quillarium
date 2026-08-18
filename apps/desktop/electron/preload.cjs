const { contextBridge, ipcRenderer } = require('electron')

const api = {
  cancelAIStream: (executionId, requestId) => ipcRenderer.invoke('ai:cancelStream', executionId, requestId),
  onAIStreamEvent: (listener) => {
    const handler = (_event, value) => listener(value)
    ipcRenderer.on('ai:streamEvent', handler)
    return () => ipcRenderer.removeListener('ai:streamEvent', handler)
  },
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  openReleases: () => ipcRenderer.invoke('app:openReleases'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  getModelCapabilities: () => ipcRenderer.invoke('config:modelCapabilities'),
  getVault: () => ipcRenderer.invoke('config:getVault'),
  getWorkspace: () => ipcRenderer.invoke('config:getWorkspace'),
  chooseWorkspace: () => ipcRenderer.invoke('config:chooseWorkspace'),
  setWorkspace: (dir) => ipcRenderer.invoke('config:setWorkspace', dir),
  chooseVault: () => ipcRenderer.invoke('config:chooseVault'),
  setVault: (dir) => ipcRenderer.invoke('config:setVault', dir),
  migrateVault: () => ipcRenderer.invoke('config:migrateVault'),
  setTheme: (theme) => ipcRenderer.invoke('config:setTheme', theme),
  setDensity: (density) => ipcRenderer.invoke('config:setDensity', density),
  setLanguage: (language) => ipcRenderer.invoke('config:setLanguage', language),
  saveAIProfile: (profile, input) => ipcRenderer.invoke('config:saveAIProfile', profile, input),
  saveGithub: (input) => ipcRenderer.invoke('config:saveGithub', input),
  aiStatus: () => ipcRenderer.invoke('config:aiStatus'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (input) => ipcRenderer.invoke('project:create', input),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  loadProject: (root) => ipcRenderer.invoke('project:load', root),
  chooseProjectCover: (root) => ipcRenderer.invoke('cover:choose', root),
  getProjectCover: (root) => ipcRenderer.invoke('cover:get', root),
  updateProjectCoverFocus: (root, focusX, focusY) => ipcRenderer.invoke('cover:focus', root, focusX, focusY),
  initializeAssistants: (root) => ipcRenderer.invoke('assistant:initialize', root),
  listAssistantPromptVersions: (root, assistantId) =>
    ipcRenderer.invoke('assistant:listPrompts', root, assistantId),
  saveAssistantPromptVersion: (root, input) => ipcRenderer.invoke('assistant:savePrompt', root, input),
  startAssistantSession: (root, roleId, target, title, workflowInput) =>
    ipcRenderer.invoke('assistant:start', root, roleId, target, title, workflowInput),
  loadAssistantSession: (root, sessionId) => ipcRenderer.invoke('assistant:session', root, sessionId),
  forkAssistantSession: (root, sessionId, throughTurnId) =>
    ipcRenderer.invoke('assistant:fork', root, sessionId, throughTurnId),
  previewAssistantTurn: (root, sessionId, authorInput, sentUserContent) =>
    ipcRenderer.invoke('assistant:preview', root, sessionId, authorInput, sentUserContent),
  sendAssistantTurn: (root, sessionId, expectedSessionSha256, authorInput, sentUserContent) =>
    ipcRenderer.invoke(
      'assistant:turn',
      root,
      sessionId,
      expectedSessionSha256,
      authorInput,
      sentUserContent
    ),
  applyAssistantProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    ipcRenderer.invoke('assistant:applyProposal', root, sessionId, turnId, proposalId, expectedTurnSha256),
  rejectAssistantProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    ipcRenderer.invoke('assistant:rejectProposal', root, sessionId, turnId, proposalId, expectedTurnSha256),
  applyAssistantConfigurationProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    ipcRenderer.invoke(
      'assistant:applyConfigurationProposal',
      root,
      sessionId,
      turnId,
      proposalId,
      expectedTurnSha256
    ),
  rejectAssistantConfigurationProposal: (root, sessionId, turnId, proposalId, expectedTurnSha256) =>
    ipcRenderer.invoke(
      'assistant:rejectConfigurationProposal',
      root,
      sessionId,
      turnId,
      proposalId,
      expectedTurnSha256
    ),
  createCreatorRole: (root, role) => ipcRenderer.invoke('assistant:createRole', root, role),
  updateCreatorRole: (root, role, expectedSha256) =>
    ipcRenderer.invoke('assistant:updateRole', root, role, expectedSha256),
  deleteCreatorRole: (root, id, expectedSha256) =>
    ipcRenderer.invoke('assistant:deleteRole', root, id, expectedSha256),
  createContextBundle: (root, bundle) => ipcRenderer.invoke('assistant:createBundle', root, bundle),
  updateContextBundle: (root, bundle, expectedSha256) =>
    ipcRenderer.invoke('assistant:updateBundle', root, bundle, expectedSha256),
  deleteContextBundle: (root, id, expectedSha256) =>
    ipcRenderer.invoke('assistant:deleteBundle', root, id, expectedSha256),
  listWritingPresets: (root) => ipcRenderer.invoke('preset:list', root),
  initializeDefaultWritingPreset: (root) => ipcRenderer.invoke('preset:initializeDefault', root),
  selectWritingPreset: (root, id) => ipcRenderer.invoke('preset:select', root, id),
  getBookGenerationHeader: (root) => ipcRenderer.invoke('prompt:bookHeaderGet', root),
  saveBookGenerationHeader: (root, text) => ipcRenderer.invoke('prompt:bookHeaderSave', root, text),
  clearBookGenerationHeader: (root) => ipcRenderer.invoke('prompt:bookHeaderClear', root),
  readDoc: (filePath) => ipcRenderer.invoke('doc:read', filePath),
  saveDocBody: (filePath, data, body) => ipcRenderer.invoke('doc:saveBody', filePath, data, body),
  deleteDoc: (filePath) => ipcRenderer.invoke('doc:delete', filePath),
  openDocExternal: (filePath) => ipcRenderer.invoke('doc:openExternal', filePath),
  createDoc: (root, kind, input) => ipcRenderer.invoke('doc:create', root, kind, input),
  reorderStorySiblings: (root, input) => ipcRenderer.invoke('story:reorder', root, input),
  rebuildDocumentLinkIndex: (root) => ipcRenderer.invoke('references:index', root),
  formatDocumentLink: (root, documentId, displayText) =>
    ipcRenderer.invoke('references:format', root, documentId, displayText),
  planDocumentReferenceMigration: (root) => ipcRenderer.invoke('references:migrationPlan', root),
  applyDocumentReferenceMigration: (root, plan) =>
    ipcRenderer.invoke('references:migrationApply', root, plan),
  loadTimelineCatalog: (root) => ipcRenderer.invoke('timeline:catalog', root),
  getTimelineOrderSnapshot: (root, trackId) => ipcRenderer.invoke('timeline:orderSnapshot', root, trackId),
  reorderTimelineTracks: (root, orderedTrackIds, expectedHashes) =>
    ipcRenderer.invoke('timeline:reorderTracks', root, orderedTrackIds, expectedHashes),
  reorderTimelineNodes: (root, input) => ipcRenderer.invoke('timeline:reorderNodes', root, input),
  reorderTimelineEvents: (root, input) => ipcRenderer.invoke('timeline:reorderEvents', root, input),
  placeTimelineEvent: (root, input) => ipcRenderer.invoke('timeline:placeEvent', root, input),
  createTimelineNode: (root, input) => ipcRenderer.invoke('timeline:createNode', root, input),
  createTimeSystem: (root, value) => ipcRenderer.invoke('timeline:createTimeSystem', root, value),
  updateTimeSystem: (root, value, expectedHash) =>
    ipcRenderer.invoke('timeline:updateTimeSystem', root, value, expectedHash),
  deleteTimeSystem: (root, id, expectedHash) =>
    ipcRenderer.invoke('timeline:deleteTimeSystem', root, id, expectedHash),
  createTimelineTrack: (root, value) => ipcRenderer.invoke('timeline:createTrack', root, value),
  updateTimelineTrack: (root, value, expectedHash) =>
    ipcRenderer.invoke('timeline:updateTrack', root, value, expectedHash),
  deleteTimelineTrack: (root, id, expectedHash) =>
    ipcRenderer.invoke('timeline:deleteTrack', root, id, expectedHash),
  planTimelineMigration: (root) => ipcRenderer.invoke('timeline:migrationPlan', root),
  applyTimelineMigration: (root, plan) => ipcRenderer.invoke('timeline:migrationApply', root, plan),
  planStoryTimeTimelineImport: (root) => ipcRenderer.invoke('timeline:storyTimePlan', root),
  applyStoryTimeTimelineImport: (root, plan, decision) =>
    ipcRenderer.invoke('timeline:storyTimeApply', root, plan, decision),
  checkTimelineDeterministically: (root) => ipcRenderer.invoke('timeline:check', root),
  resolveDocumentOrigin: (root, filePath) => ipcRenderer.invoke('doc:origin', root, filePath),
  chooseMarkdownImport: (root) => ipcRenderer.invoke('import:chooseMarkdown', root),
  chooseImportSources: () => ipcRenderer.invoke('import:chooseSources'),
  importMarkdownText: (root, markdown, title) =>
    ipcRenderer.invoke('import:markdownText', root, markdown, title),
  syncMarkdownImports: (root) => ipcRenderer.invoke('import:syncMarkdown', root),
  initPrompts: (root) => ipcRenderer.invoke('prompt:init', root),
  readPrompt: (root, name) => ipcRenderer.invoke('prompt:read', root, name),
  createAIImportPlan: (root, input) => ipcRenderer.invoke('import:aiPlan', root, input),
  loadImportSession: (root, sessionId) => ipcRenderer.invoke('import:session', root, sessionId),
  loadLatestUnfinishedImportSession: (root) => ipcRenderer.invoke('import:latestUnfinishedSession', root),
  updateImportCandidates: (root, sessionId, candidates) =>
    ipcRenderer.invoke('import:updateCandidates', root, sessionId, candidates),
  answerImportIssue: (root, sessionId, issueId, answer, mode) =>
    ipcRenderer.invoke('import:answerIssue', root, sessionId, issueId, answer, mode),
  abandonImportSession: (root, sessionId) => ipcRenderer.invoke('import:abandonSession', root, sessionId),
  landImportSession: (root, sessionId) => ipcRenderer.invoke('import:landSession', root, sessionId),
  reimportCard: (root, filePath) => ipcRenderer.invoke('import:reimportCard', root, filePath),
  discussCanon: (root, input) => ipcRenderer.invoke('canon:discuss', root, input),
  startPlanningSession: (root, module, documentId) =>
    ipcRenderer.invoke('planning:start', root, module, documentId),
  loadPlanningSession: (root, sessionId) => ipcRenderer.invoke('planning:session', root, sessionId),
  savePlanningSession: (root, sessionId, update) =>
    ipcRenderer.invoke('planning:save', root, sessionId, update),
  discussPlanningRecord: (root, input) => ipcRenderer.invoke('planning:discuss', root, input),
  confirmPlanningRecord: (root, input) => ipcRenderer.invoke('planning:confirm', root, input),
  applyIssueBatchAction: (root, issueIds, action) =>
    ipcRenderer.invoke('planning:issueBatch', root, issueIds, action),
  checkPlanningCards: (root, language, clientRequestId, scope) =>
    ipcRenderer.invoke('planning:check', root, language, clientRequestId, scope),
  retryPlanningCheck: (root, executionId, language, clientRequestId) =>
    ipcRenderer.invoke('planning:checkRetry', root, executionId, language, clientRequestId),
  decidePlanningCheck: (root, input) => ipcRenderer.invoke('planning:checkDecision', root, input),
  applyPlanningCheck: (root, executionId, decisionId) =>
    ipcRenderer.invoke('planning:checkApply', root, executionId, decisionId),
  openPlanningCheckRun: (root, executionId) => ipcRenderer.invoke('planning:checkOpenRun', root, executionId),
  assembleContext: (root, sceneId) => ipcRenderer.invoke('scene:context', root, sceneId),
  assembleTargetContext: (root, target) => ipcRenderer.invoke('target:context', root, target),
  assembleWritingPrompt: (root, outlineId) => ipcRenderer.invoke('target:writingPrompt', root, outlineId),
  checkTarget: (root, target) => ipcRenderer.invoke('target:check', root, target),
  checkScene: (root, sceneId) => ipcRenderer.invoke('scene:check', root, sceneId),
  semanticCheckScene: (root, sceneId, content) =>
    ipcRenderer.invoke('scene:semanticCheck', root, sceneId, content),
  checkSceneIntoRun: (root, sceneId, content) =>
    ipcRenderer.invoke('scene:checkIntoRun', root, sceneId, content),
  generateDryRun: (root, sceneId) => ipcRenderer.invoke('scene:generateDryRun', root, sceneId),
  previewFullGenerationPrompt: (root, sceneId, prompt, promptSources) =>
    ipcRenderer.invoke('scene:previewFullPrompt', root, sceneId, prompt, promptSources),
  generate: (root, sceneId) => ipcRenderer.invoke('scene:generate', root, sceneId),
  generateOutline: (root, outlineId, prompt, sceneId) =>
    ipcRenderer.invoke('outline:generate', root, outlineId, prompt, sceneId),
  generateOutlineCandidates: (root, outlineId, prompt, sceneId, count, parentRunId, promptSources) =>
    ipcRenderer.invoke(
      'outline:generateCandidates',
      root,
      outlineId,
      prompt,
      sceneId,
      count,
      parentRunId,
      promptSources
    ),
  prepareScene: (root, chapterId) => ipcRenderer.invoke('scene:prepare', root, chapterId),
  acceptManualScene: (root, sceneId, content) =>
    ipcRenderer.invoke('scene:acceptManual', root, sceneId, content),
  buildScenePromptPlan: (root, sceneId) => ipcRenderer.invoke('scene:promptPlan', root, sceneId),
  compileScenePromptOverlay: (root, sceneId, sources) =>
    ipcRenderer.invoke('scene:compilePromptOverlay', root, sceneId, sources),
  savePromptSourcesAsBundle: (root, title, sources) =>
    ipcRenderer.invoke('scene:savePromptBundle', root, title, sources),
  loadChapterLifecycle: (root, chapterId) => ipcRenderer.invoke('chapter:lifecycle', root, chapterId),
  finalizeChapter: (root, chapterId) => ipcRenderer.invoke('chapter:finalize', root, chapterId),
  publishChapter: (root, chapterId, confirmation) =>
    ipcRenderer.invoke('chapter:publish', root, chapterId, confirmation),
  buildChapterWritingPlan: (root, chapterId, selectedByScene) =>
    ipcRenderer.invoke('chapter:writingPlan', root, chapterId, selectedByScene),
  createFinalizeReviewPlan: (root, input) => ipcRenderer.invoke('finalize:reviewPlan', root, input),
  loadFinalizeReviewSession: (root, sessionId) => ipcRenderer.invoke('finalize:session', root, sessionId),
  confirmFinalizeImpact: (root, sessionId, impactId, answer, state) =>
    ipcRenderer.invoke('finalize:confirmImpact', root, sessionId, impactId, answer, state),
  answerFinalizeQuestion: (root, sessionId, questionId, answer, state) =>
    ipcRenderer.invoke('finalize:answerQuestion', root, sessionId, questionId, answer, state),
  applyFinalizeReview: (root, sessionId) => ipcRenderer.invoke('finalize:apply', root, sessionId),
  recoverFinalizationApplications: (root) => ipcRenderer.invoke('finalize:recover', root),
  readRunFile: (root, runId, file) => ipcRenderer.invoke('run:readFile', root, runId, file),
  selectRunCandidate: (root, runId) => ipcRenderer.invoke('run:select', root, runId),
  checkRunCandidate: (root, runId) => ipcRenderer.invoke('run:check', root, runId),
  acceptRun: (root, runId, candidate) => ipcRenderer.invoke('run:accept', root, runId, candidate),
  exportManuscript: (root, options) => ipcRenderer.invoke('export:manuscript', root, options),
  importSillyTavernCard: (root, filePath) => ipcRenderer.invoke('st:importCard', root, filePath),
  chooseBookCharacterCard: () => ipcRenderer.invoke('st:chooseBookCard'),
  importBookCharacterCardProject: (sourcePath, title) =>
    ipcRenderer.invoke('st:importBookProject', sourcePath, title),
  exportBookCharacterCard: (root, options) => ipcRenderer.invoke('st:exportBookCard', root, options),
  exportSillyTavernCard: (root, characterId) => ipcRenderer.invoke('st:exportCard', root, characterId),
  exportSillyTavernLorebook: (root) => ipcRenderer.invoke('st:exportLorebook', root),
  gitStatus: (root) => ipcRenderer.invoke('git:status', root),
  gitInit: (root) => ipcRenderer.invoke('git:init', root),
  gitCommit: (root, message) => ipcRenderer.invoke('git:commit', root, message),
  gitSync: (root, message) => ipcRenderer.invoke('git:sync', root, message),
  githubCreateRepoForProject: (root) => ipcRenderer.invoke('github:createRepoForProject', root),
  gitSetRemote: (root, url) => ipcRenderer.invoke('git:setRemote', root, url)
}

contextBridge.exposeInMainWorld('quillarium', api)
