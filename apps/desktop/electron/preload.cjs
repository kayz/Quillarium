const { contextBridge, ipcRenderer } = require('electron')

const api = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  getVault: () => ipcRenderer.invoke('config:getVault'),
  chooseVault: () => ipcRenderer.invoke('config:chooseVault'),
  setVault: (dir) => ipcRenderer.invoke('config:setVault', dir),
  setTheme: (theme) => ipcRenderer.invoke('config:setTheme', theme),
  setDensity: (density) => ipcRenderer.invoke('config:setDensity', density),
  setLanguage: (language) => ipcRenderer.invoke('config:setLanguage', language),
  saveAIProfile: (profile, input) => ipcRenderer.invoke('config:saveAIProfile', profile, input),
  aiStatus: () => ipcRenderer.invoke('config:aiStatus'),
  listProjects: () => ipcRenderer.invoke('project:list'),
  createProject: (input) => ipcRenderer.invoke('project:create', input),
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  loadProject: (root) => ipcRenderer.invoke('project:load', root),
  readDoc: (filePath) => ipcRenderer.invoke('doc:read', filePath),
  saveDocBody: (filePath, data, body) => ipcRenderer.invoke('doc:saveBody', filePath, data, body),
  createDoc: (root, kind, input) => ipcRenderer.invoke('doc:create', root, kind, input),
  assembleContext: (root, sceneId) => ipcRenderer.invoke('scene:context', root, sceneId),
  checkScene: (root, sceneId) => ipcRenderer.invoke('scene:check', root, sceneId),
  checkSceneIntoRun: (root, sceneId) => ipcRenderer.invoke('scene:checkIntoRun', root, sceneId),
  generateDryRun: (root, sceneId) => ipcRenderer.invoke('scene:generateDryRun', root, sceneId),
  generate: (root, sceneId) => ipcRenderer.invoke('scene:generate', root, sceneId),
  readRunFile: (root, runId, file) => ipcRenderer.invoke('run:readFile', root, runId, file),
  acceptRun: (root, runId) => ipcRenderer.invoke('run:accept', root, runId),
  gitStatus: (root) => ipcRenderer.invoke('git:status', root),
  gitInit: (root) => ipcRenderer.invoke('git:init', root),
  gitCommit: (root, message) => ipcRenderer.invoke('git:commit', root, message),
  gitSetRemote: (root, url) => ipcRenderer.invoke('git:setRemote', root, url)
}

contextBridge.exposeInMainWorld('quillarium', api)
