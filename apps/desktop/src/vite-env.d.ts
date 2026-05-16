/// <reference types="vite/client" />

import type { QuillariumAPI } from '../electron/preload'

declare global {
  interface Window {
    quillarium: QuillariumAPI
  }
}
