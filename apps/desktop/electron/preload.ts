import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse, QuillariumAPI } from './ipc/contract.js'

function invoke<Channel extends IpcChannel>(
  channel: Channel,
  ...args: IpcRequest<Channel>
): Promise<IpcResponse<Channel>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResponse<Channel>>
}

const api: QuillariumAPI = {
  getConfig: () => invoke('config:get'),
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
  listWritingPresets: (root) => invoke('preset:list', root),
  initializeDefaultWritingPreset: (root) => invoke('preset:initializeDefault', root),
  selectWritingPreset: (root, id) => invoke('preset:select', root, id),
  readDoc: (filePath) => invoke('doc:read', filePath),
  saveDocBody: (filePath, data, body) => invoke('doc:saveBody', filePath, data, body),
  deleteDoc: (filePath) => invoke('doc:delete', filePath),
  openDocExternal: (filePath) => invoke('doc:openExternal', filePath),
  createDoc: (root, kind, input) => invoke('doc:create', root, kind, input),
  resolveDocumentOrigin: (root, filePath) => invoke('doc:origin', root, filePath),
  chooseMarkdownImport: (root) => invoke('import:chooseMarkdown', root),
  chooseImportSources: () => invoke('import:chooseSources'),
  importMarkdownText: (root, markdown, title) => invoke('import:markdownText', root, markdown, title),
  syncMarkdownImports: (root) => invoke('import:syncMarkdown', root),
  initPrompts: (root) => invoke('prompt:init', root),
  readPrompt: (root, name) => invoke('prompt:read', root, name),
  createAIImportPlan: (root, input) => invoke('import:aiPlan', root, input),
  loadImportSession: (root, sessionId) => invoke('import:session', root, sessionId),
  updateImportCandidates: (root, sessionId, candidates) =>
    invoke('import:updateCandidates', root, sessionId, candidates),
  answerImportIssue: (root, sessionId, issueId, answer) =>
    invoke('import:answerIssue', root, sessionId, issueId, answer),
  landImportSession: (root, sessionId) => invoke('import:landSession', root, sessionId),
  reimportCard: (root, filePath) => invoke('import:reimportCard', root, filePath),
  discussCanon: (root, input) => invoke('canon:discuss', root, input),
  startPlanningSession: (root, module, documentId) => invoke('planning:start', root, module, documentId),
  loadPlanningSession: (root, sessionId) => invoke('planning:session', root, sessionId),
  savePlanningSession: (root, sessionId, update) => invoke('planning:save', root, sessionId, update),
  discussPlanningRecord: (root, input) => invoke('planning:discuss', root, input),
  confirmPlanningRecord: (root, input) => invoke('planning:confirm', root, input),
  checkPlanningCards: (root, language) => invoke('planning:check', root, language),
  assembleContext: (root, sceneId) => invoke('scene:context', root, sceneId),
  assembleTargetContext: (root, target) => invoke('target:context', root, target),
  assembleWritingPrompt: (root, outlineId) => invoke('target:writingPrompt', root, outlineId),
  checkTarget: (root, target) => invoke('target:check', root, target),
  checkScene: (root, sceneId) => invoke('scene:check', root, sceneId),
  semanticCheckScene: (root, sceneId, content) => invoke('scene:semanticCheck', root, sceneId, content),
  checkSceneIntoRun: (root, sceneId, content) => invoke('scene:checkIntoRun', root, sceneId, content),
  generateDryRun: (root, sceneId) => invoke('scene:generateDryRun', root, sceneId),
  generate: (root, sceneId) => invoke('scene:generate', root, sceneId),
  generateOutline: (root, outlineId, prompt, sceneId) =>
    invoke('outline:generate', root, outlineId, prompt, sceneId),
  generateOutlineCandidates: (root, outlineId, prompt, sceneId, count, parentRunId) =>
    invoke('outline:generateCandidates', root, outlineId, prompt, sceneId, count, parentRunId),
  prepareScene: (root, chapterId) => invoke('scene:prepare', root, chapterId),
  acceptManualScene: (root, sceneId, content) => invoke('scene:acceptManual', root, sceneId, content),
  buildScenePromptPlan: (root, sceneId) => invoke('scene:promptPlan', root, sceneId),
  loadChapterLifecycle: (root, chapterId) => invoke('chapter:lifecycle', root, chapterId),
  finalizeChapter: (root, chapterId) => invoke('chapter:finalize', root, chapterId),
  publishChapter: (root, chapterId, confirmation) => invoke('chapter:publish', root, chapterId, confirmation),
  buildChapterWritingPlan: (root, chapterId, selectedByScene) =>
    invoke('chapter:writingPlan', root, chapterId, selectedByScene),
  createFinalizeReviewPlan: (root, input) => invoke('finalize:reviewPlan', root, input),
  loadFinalizeReviewSession: (root, sessionId) => invoke('finalize:session', root, sessionId),
  confirmFinalizeImpact: (root, sessionId, impactId, answer, state) =>
    invoke('finalize:confirmImpact', root, sessionId, impactId, answer, state),
  readRunFile: (root, runId, file) => invoke('run:readFile', root, runId, file),
  selectRunCandidate: (root, runId) => invoke('run:select', root, runId),
  checkRunCandidate: (root, runId) => invoke('run:check', root, runId),
  acceptRun: (root, runId, candidate) => invoke('run:accept', root, runId, candidate),
  exportManuscript: (root, options) => invoke('export:manuscript', root, options),
  importSillyTavernCard: (root, filePath) => invoke('st:importCard', root, filePath),
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
