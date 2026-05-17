import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

const server = await createServer({
  configFile: path.join(appRoot, 'vite.config.ts'),
  server: {
    host: '127.0.0.1',
    port: 5177,
    strictPort: false
  }
})
await server.listen()
server.printUrls()

const devUrl = server.resolvedUrls?.local[0]
if (!devUrl) throw new Error('Vite dev server did not expose a local URL.')

await run('pnpm', ['exec', 'tsc', '-p', 'tsconfig.main.json'])
await ensureElectronBinary()

const electron = spawn('pnpm', ['exec', 'electron', 'dist/main/main.js'], {
  cwd: appRoot,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: devUrl }
})

electron.on('exit', (code) => {
  void shutdown().finally(() => {
    process.exit(code ?? 0)
  })
})

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      shell: true,
      stdio: 'inherit'
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

async function ensureElectronBinary() {
  try {
    const electronEntry = require.resolve('electron', { paths: [appRoot] })
    const electronRoot = path.dirname(electronEntry)
    if (existsSync(path.join(electronRoot, 'path.txt'))) return
    const installScript = path.join(electronRoot, 'install.js')
    if (existsSync(installScript)) {
      await run(process.execPath, [installScript])
    }
  } catch {
    // pnpm exec electron will surface the actionable error.
  }
}

async function shutdown() {
  electron.kill()
  await server.close()
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
