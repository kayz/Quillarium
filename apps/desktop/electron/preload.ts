import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  getVault: () => ipcRenderer.invoke('config:getVault'),
  chooseVault: () => ipcRenderer.invoke('config:chooseVault'),
  setVault: (dir: string) => ipcRenderer.invoke('config:setVault', dir),
  migrateVault: () => ipcRenderer.invoke('config:migrateVault'),
  setTheme: (theme: string) => ipcRenderer.invoke('config:setTheme', theme),
  setDensity: (density: string) => ipcRenderer.invoke('config:setDensity', density),
  setLanguage: (language: string) => ipcRenderer.invoke('config:setLanguage', language),
  saveAIProfile: (profile: string, input: unknown) =>
    ipcRenderer.invoke('config:saveAIProfile', profile, input),
  saveGithub: (input: unknown) => ipcRenderer.invoke('config:saveGithub', input),
  aiStatus: () => ipcRenderer.invoke('config:aiStatus'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (input: unknown) => ipcRenderer.invoke('project:create', input),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  loadProject: (root: string) => ipcRenderer.invoke('project:load', root),
  readDoc: (filePath: string) => ipcRenderer.invoke('doc:read', filePath),
  saveDocBody: (filePath: string, data: Record<string, unknown>, body: string) =>
    ipcRenderer.invoke('doc:saveBody', filePath, data, body),
  deleteDoc: (filePath: string) => ipcRenderer.invoke('doc:delete', filePath),
  openDocExternal: (filePath: string) => ipcRenderer.invoke('doc:openExternal', filePath),
  createDoc: (root: string, kind: string, input: unknown) =>
    ipcRenderer.invoke('doc:create', root, kind, input),
  chooseMarkdownImport: (root: string) => ipcRenderer.invoke('import:chooseMarkdown', root),
  importMarkdownText: (root: string, markdown: string, title?: string) =>
    ipcRenderer.invoke('import:markdownText', root, markdown, title),
  syncMarkdownImports: (root: string) => ipcRenderer.invoke('import:syncMarkdown', root),
  initPrompts: (root: string) => ipcRenderer.invoke('prompt:init', root),
  readPrompt: (root: string, name: string) => ipcRenderer.invoke('prompt:read', root, name),
  createAIImportPlan: (root: string, input: unknown) => ipcRenderer.invoke('import:aiPlan', root, input),
  loadImportSession: (root: string, sessionId: string) =>
    ipcRenderer.invoke('import:session', root, sessionId),
  answerImportIssue: (root: string, sessionId: string, issueId: string, answer: string) =>
    ipcRenderer.invoke('import:answerIssue', root, sessionId, issueId, answer),
  landImportSession: (root: string, sessionId: string) =>
    ipcRenderer.invoke('import:landSession', root, sessionId),
  discussCanon: (root: string, input: unknown) => ipcRenderer.invoke('canon:discuss', root, input),
  assembleContext: (root: string, sceneId: string) => ipcRenderer.invoke('scene:context', root, sceneId),
  assembleTargetContext: (root: string, target: unknown) =>
    ipcRenderer.invoke('target:context', root, target),
  checkTarget: (root: string, target: unknown) => ipcRenderer.invoke('target:check', root, target),
  checkScene: (root: string, sceneId: string) => ipcRenderer.invoke('scene:check', root, sceneId),
  checkSceneIntoRun: (root: string, sceneId: string) =>
    ipcRenderer.invoke('scene:checkIntoRun', root, sceneId),
  generateDryRun: (root: string, sceneId: string) =>
    ipcRenderer.invoke('scene:generateDryRun', root, sceneId),
  generate: (root: string, sceneId: string) => ipcRenderer.invoke('scene:generate', root, sceneId),
  generateOutline: (root: string, outlineId: string) =>
    ipcRenderer.invoke('outline:generate', root, outlineId),
  buildChapterWritingPlan: (root: string, chapterId: string, selectedByScene?: unknown) =>
    ipcRenderer.invoke('chapter:writingPlan', root, chapterId, selectedByScene),
  createFinalizeReviewPlan: (root: string, input: unknown) =>
    ipcRenderer.invoke('finalize:reviewPlan', root, input),
  loadFinalizeReviewSession: (root: string, sessionId: string) =>
    ipcRenderer.invoke('finalize:session', root, sessionId),
  confirmFinalizeImpact: (root: string, sessionId: string, impactId: string, answer: string, state?: string) =>
    ipcRenderer.invoke('finalize:confirmImpact', root, sessionId, impactId, answer, state),
  readRunFile: (root: string, runId: string, file: string) =>
    ipcRenderer.invoke('run:readFile', root, runId, file),
  acceptRun: (root: string, runId: string) => ipcRenderer.invoke('run:accept', root, runId),
  gitStatus: (root: string) => ipcRenderer.invoke('git:status', root),
  gitInit: (root: string) => ipcRenderer.invoke('git:init', root),
  gitCommit: (root: string, message: string) => ipcRenderer.invoke('git:commit', root, message),
  gitSync: (root: string, message: string) => ipcRenderer.invoke('git:sync', root, message),
  githubCreateRepoForProject: (root: string) => ipcRenderer.invoke('github:createRepoForProject', root),
  gitSetRemote: (root: string, url: string) => ipcRenderer.invoke('git:setRemote', root, url)
}

contextBridge.exposeInMainWorld('quillarium', api)

export type QuillariumAPI = typeof api
