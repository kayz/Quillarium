import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureDir, pathExists, readText, writeText } from './fs.js'

const execFileAsync = promisify(execFile)

export interface QuillariumConfig {
  obsidianDir?: string
}

export function configDir(): string {
  return path.join(os.homedir(), '.quillarium')
}

export function configPath(): string {
  return path.join(configDir(), 'config.json')
}

export async function loadConfig(): Promise<QuillariumConfig> {
  const file = configPath()
  if (!(await pathExists(file))) return {}
  return JSON.parse(await readText(file)) as QuillariumConfig
}

export async function saveConfig(config: QuillariumConfig): Promise<void> {
  await ensureDir(configDir())
  await writeText(configPath(), `${JSON.stringify(config, null, 2)}\n`)
}

export async function setObsidianDir(dir: string): Promise<QuillariumConfig> {
  const resolved = path.resolve(dir)
  await ensureDir(resolved)
  const config = { ...(await loadConfig()), obsidianDir: resolved }
  await saveConfig(config)
  return config
}

export async function getObsidianDir(): Promise<string | null> {
  const config = await loadConfig()
  return config.obsidianDir ? path.resolve(config.obsidianDir) : null
}

export async function chooseObsidianDir(): Promise<string | null> {
  if (process.platform === 'win32') return chooseFolderWindows()
  return null
}

async function chooseFolderWindows(): Promise<string | null> {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dialog.Description = "请选择 Obsidian Vault 目录"',
    '$dialog.ShowNewFolderButton = $true',
    '$result = $dialog.ShowDialog()',
    'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($dialog.SelectedPath) }'
  ].join('; ')
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
      windowsHide: false
    })
    const selected = stdout.trim()
    return selected ? selected : null
  } catch {
    return null
  }
}

export function configFileUrl(): string {
  return pathToFileURL(configPath()).toString()
}
