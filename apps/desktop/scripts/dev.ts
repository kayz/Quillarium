import { spawn } from 'node:child_process'

const vite = spawn('pnpm', ['exec', 'vite', '--host', '127.0.0.1'], {
  cwd: new URL('..', import.meta.url),
  shell: true,
  stdio: 'inherit'
})

const electron = spawn('pnpm', ['exec', 'tsx', 'electron/main.ts'], {
  cwd: new URL('..', import.meta.url),
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5177' }
})

function shutdown() {
  vite.kill()
  electron.kill()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
