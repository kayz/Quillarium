/// <reference types="vite/client" />

import type { QuillariumAPI } from '../electron/ipc/contract.js'

declare global {
  interface Window {
    quillarium: QuillariumAPI
  }
}
