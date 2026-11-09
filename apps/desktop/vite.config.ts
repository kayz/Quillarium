import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const NODE_BUILTIN_IDS = new Set([
  'async_hooks',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'fs/promises',
  'os',
  'path',
  'stream',
  'url',
  'util'
])

function lazyBrowserExternalStub(): Plugin {
  return {
    name: 'quillarium:lazy-browser-external',
    enforce: 'pre',
    resolveId(source) {
      if (source.startsWith('node:') || NODE_BUILTIN_IDS.has(source)) {
        return `\0quillarium-browser-stub:${source}`
      }
      return null
    },
    load(id) {
      if (!id.startsWith('\0quillarium-browser-stub:')) return null
      return `const stub = new Proxy(function () {}, {
  get(_, key) {
    if (key === '__esModule') return false
    if (key === 'default') return stub
    if (key === Symbol.toPrimitive) return () => ''
    return stub
  },
  apply() {
    return ''
  },
  construct() {
    return stub
  }
})
export class AsyncLocalStorage {
  getStore() { return undefined }
  run(_store, fn, ...args) { return fn(...args) }
}
export default stub
export const Buffer = stub
export const constants = stub
export const chmod = stub
export const copyFile = stub
export const createHash = () => stub
export const execFile = stub
export const fileURLToPath = stub
export const lstat = stub
export const mkdir = stub
export const mkdtemp = stub
export const pathToFileURL = stub
export const promisify = () => stub
export const randomUUID = () => ''
export const readFile = stub
export const readdir = stub
export const realpath = stub
export const rename = stub
export const rm = stub
export const stat = stub
export const symlink = stub
export const writeFile = stub
`
    }
  }
}

export default defineConfig({
  plugins: [lazyBrowserExternalStub(), react()],
  root: '.',
  base: './',
  optimizeDeps: {
    exclude: ['@quillarium/core']
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true
  },
  server: {
    port: 5177
  }
})
