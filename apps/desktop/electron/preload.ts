import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  getVault: () => ipcRenderer.invoke('config:getVault'),
  chooseVault: () => ipcRenderer.invoke('config:chooseVault'),
  setVault: (dir: string) => ipcRenderer.invoke('config:setVault', dir),
  setTheme: (theme: string) => ipcRenderer.invoke('config:setTheme', theme),
  setDensity: (density: string) => ipcRenderer.invoke('config:setDensity', density),
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (input: unknown) => ipcRenderer.invoke('project:create', input),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  loadProject: (root: string) => ipcRenderer.invoke('project:load', root),
  readDoc: (filePath: string) => ipcRenderer.invoke('doc:read', filePath),
  saveDocBody: (filePath: string, data: Record<string, unknown>, body: string) =>
    ipcRenderer.invoke('doc:saveBody', filePath, data, body),
  createDoc: (root: string, kind: string, input: unknown) =>
    ipcRenderer.invoke('doc:create', root, kind, input),
  assembleContext: (root: string, sceneId: string) => ipcRenderer.invoke('scene:context', root, sceneId),
  checkScene: (root: string, sceneId: string) => ipcRenderer.invoke('scene:check', root, sceneId),
  checkSceneIntoRun: (root: string, sceneId: string) =>
    ipcRenderer.invoke('scene:checkIntoRun', root, sceneId),
  generateDryRun: (root: string, sceneId: string) =>
    ipcRenderer.invoke('scene:generateDryRun', root, sceneId),
  generate: (root: string, sceneId: string) => ipcRenderer.invoke('scene:generate', root, sceneId),
  readRunFile: (root: string, runId: string, file: string) =>
    ipcRenderer.invoke('run:readFile', root, runId, file),
  acceptRun: (root: string, runId: string) => ipcRenderer.invoke('run:accept', root, runId),
  gitStatus: (root: string) => ipcRenderer.invoke('git:status', root),
  gitInit: (root: string) => ipcRenderer.invoke('git:init', root),
  gitCommit: (root: string, message: string) => ipcRenderer.invoke('git:commit', root, message),
  gitSetRemote: (root: string, url: string) => ipcRenderer.invoke('git:setRemote', root, url)
}

contextBridge.exposeInMainWorld('quillarium', api)

export type QuillariumAPI = typeof api
