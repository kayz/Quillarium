/** The renderer's single access point for the typed Electron preload API. */
export type QuillariumAPI = Window['quillarium']

export const bridge: QuillariumAPI = window.quillarium
