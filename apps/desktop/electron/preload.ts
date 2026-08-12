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
  readDoc: (filePath) => invoke('doc:read', filePath),
  saveDocBody: (filePath, data, body) => invoke('doc:saveBody', filePath, data, body),
  deleteDoc: (filePath) => invoke('doc:delete', filePath),
  openDocExternal: (filePath) => invoke('doc:openExternal', filePath),
  createDoc: (root, kind, input) => invoke('doc:create', root, kind, input),
  chooseMarkdownImport: (root) => invoke('import:chooseMarkdown', root),
  importMarkdownText: (root, markdown, title) => invoke('import:markdownText', root, markdown, title),
  syncMarkdownImports: (root) => invoke('import:syncMarkdown', root),
  initPrompts: (root) => invoke('prompt:init', root),
  readPrompt: (root, name) => invoke('prompt:read', root, name),
  createAIImportPlan: (root, input) => invoke('import:aiPlan', root, input),
  loadImportSession: (root, sessionId) => invoke('import:session', root, sessionId),
  answerImportIssue: (root, sessionId, issueId, answer) =>
    invoke('import:answerIssue', root, sessionId, issueId, answer),
  landImportSession: (root, sessionId) => invoke('import:landSession', root, sessionId),
  discussCanon: (root, input) => invoke('canon:discuss', root, input),
  assembleContext: (root, sceneId) => invoke('scene:context', root, sceneId),
  assembleTargetContext: (root, target) => invoke('target:context', root, target),
  checkTarget: (root, target) => invoke('target:check', root, target),
  checkScene: (root, sceneId) => invoke('scene:check', root, sceneId),
  semanticCheckScene: (root, sceneId) => invoke('scene:semanticCheck', root, sceneId),
  checkSceneIntoRun: (root, sceneId) => invoke('scene:checkIntoRun', root, sceneId),
  generateDryRun: (root, sceneId) => invoke('scene:generateDryRun', root, sceneId),
  generate: (root, sceneId) => invoke('scene:generate', root, sceneId),
  generateOutline: (root, outlineId) => invoke('outline:generate', root, outlineId),
  buildChapterWritingPlan: (root, chapterId, selectedByScene) =>
    invoke('chapter:writingPlan', root, chapterId, selectedByScene),
  createFinalizeReviewPlan: (root, input) => invoke('finalize:reviewPlan', root, input),
  loadFinalizeReviewSession: (root, sessionId) => invoke('finalize:session', root, sessionId),
  confirmFinalizeImpact: (root, sessionId, impactId, answer, state) =>
    invoke('finalize:confirmImpact', root, sessionId, impactId, answer, state),
  readRunFile: (root, runId, file) => invoke('run:readFile', root, runId, file),
  acceptRun: (root, runId) => invoke('run:accept', root, runId),
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
