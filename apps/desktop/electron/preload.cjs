const { contextBridge, ipcRenderer } = require('electron')

const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
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
  listWritingPresets: (root) => ipcRenderer.invoke('preset:list', root),
  initializeDefaultWritingPreset: (root) => ipcRenderer.invoke('preset:initializeDefault', root),
  selectWritingPreset: (root, id) => ipcRenderer.invoke('preset:select', root, id),
  readDoc: (filePath) => ipcRenderer.invoke('doc:read', filePath),
  saveDocBody: (filePath, data, body) => ipcRenderer.invoke('doc:saveBody', filePath, data, body),
  deleteDoc: (filePath) => ipcRenderer.invoke('doc:delete', filePath),
  openDocExternal: (filePath) => ipcRenderer.invoke('doc:openExternal', filePath),
  createDoc: (root, kind, input) => ipcRenderer.invoke('doc:create', root, kind, input),
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
  updateImportCandidates: (root, sessionId, candidates) =>
    ipcRenderer.invoke('import:updateCandidates', root, sessionId, candidates),
  answerImportIssue: (root, sessionId, issueId, answer) =>
    ipcRenderer.invoke('import:answerIssue', root, sessionId, issueId, answer),
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
  checkPlanningCards: (root, language) => ipcRenderer.invoke('planning:check', root, language),
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
  generate: (root, sceneId) => ipcRenderer.invoke('scene:generate', root, sceneId),
  generateOutline: (root, outlineId, prompt, sceneId) =>
    ipcRenderer.invoke('outline:generate', root, outlineId, prompt, sceneId),
  prepareScene: (root, chapterId) => ipcRenderer.invoke('scene:prepare', root, chapterId),
  acceptManualScene: (root, sceneId, content) =>
    ipcRenderer.invoke('scene:acceptManual', root, sceneId, content),
  buildScenePromptPlan: (root, sceneId) => ipcRenderer.invoke('scene:promptPlan', root, sceneId),
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
  readRunFile: (root, runId, file) => ipcRenderer.invoke('run:readFile', root, runId, file),
  acceptRun: (root, runId, candidate) => ipcRenderer.invoke('run:accept', root, runId, candidate),
  exportManuscript: (root, options) => ipcRenderer.invoke('export:manuscript', root, options),
  importSillyTavernCard: (root, filePath) => ipcRenderer.invoke('st:importCard', root, filePath),
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
