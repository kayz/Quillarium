/// <reference types="vite/client" />

import type { QuillariumAPI } from '../electron/ipc/contract'

declare global {
  interface Window {
    quillarium: QuillariumAPI
  }
}
