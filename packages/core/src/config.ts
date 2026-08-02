import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ensureDir, pathExists, readText, writeText } from './fs.js'

const execFileAsync = promisify(execFile)

export interface QuillariumConfig {
  obsidianDir?: string
  theme?: 'paper' | 'ink' | 'mist' | 'bamboo'
  density?: 'compact' | 'comfortable'
  language?: 'zh' | 'en'
  aiProfiles?: Partial<Record<'prose' | 'background' | 'check', AIProfileConfig>>
  github?: GitHubConfig
}

export interface GitHubConfig {
  token?: string
  tokenEncrypted?: string
  defaultOwner?: string
  defaultVisibility?: 'private' | 'public'
}

export interface AIProfileConfig {
  provider: 'openai-compatible' | 'openai' | 'claude' | 'gemini' | 'deepseek' | 'ollama'
  baseUrl?: string
  apiKey?: string
  apiKeyEncrypted?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface StoredCredential {
  plaintext?: string
  encrypted?: string
}

export interface StoredCredentialUpdateOptions {
  encrypt?: (value: string) => string
  clear?: boolean
}

export function withStoredCredential(
  value: string | undefined,
  encrypt?: (value: string) => string
): StoredCredential {
  if (!value) return {}
  return encrypt ? { encrypted: encrypt(value) } : { plaintext: value }
}

export function withUpdatedStoredCredential(
  previous: StoredCredential | undefined,
  value: string | undefined,
  options: StoredCredentialUpdateOptions = {}
): StoredCredential {
  if (options.clear) return {}
  if (value) return withStoredCredential(value, options.encrypt)
  if (previous?.encrypted !== undefined) return { encrypted: previous.encrypted }
  if (previous?.plaintext !== undefined) {
    return withStoredCredential(previous.plaintext, options.encrypt)
  }
  return {}
}

export function withStoredAIProfileApiKey(
  profile: AIProfileConfig,
  apiKey: string | undefined,
  encrypt?: (value: string) => string
): AIProfileConfig {
  return applyAIProfileCredential(profile, withStoredCredential(apiKey, encrypt))
}

export function withUpdatedAIProfileApiKey(
  profile: AIProfileConfig,
  previous: AIProfileConfig | undefined,
  apiKey: string | undefined,
  options: StoredCredentialUpdateOptions = {}
): AIProfileConfig {
  return applyAIProfileCredential(
    profile,
    withUpdatedStoredCredential(
      previous ? { plaintext: previous.apiKey, encrypted: previous.apiKeyEncrypted } : undefined,
      apiKey,
      options
    )
  )
}

export function migrateAIProfileApiKeys(
  config: QuillariumConfig,
  encrypt: (value: string) => string
): QuillariumConfig {
  if (!config.aiProfiles) return config
  const aiProfiles = { ...config.aiProfiles }
  let changed = false
  for (const [name, profile] of Object.entries(config.aiProfiles) as Array<
    [keyof typeof aiProfiles, AIProfileConfig | undefined]
  >) {
    if (!profile || !Object.prototype.hasOwnProperty.call(profile, 'apiKey')) continue
    if (profile.apiKeyEncrypted !== undefined) {
      const withoutPlaintext = { ...profile }
      delete withoutPlaintext.apiKey
      aiProfiles[name] = withoutPlaintext
    } else {
      aiProfiles[name] = withStoredAIProfileApiKey(profile, profile.apiKey, encrypt)
    }
    changed = true
  }
  return changed ? { ...config, aiProfiles } : config
}

export function withUpdatedGitHubToken(
  github: GitHubConfig,
  previous: GitHubConfig | undefined,
  token: string | undefined,
  options: StoredCredentialUpdateOptions = {}
): GitHubConfig {
  return applyGitHubCredential(
    github,
    withUpdatedStoredCredential(
      previous ? { plaintext: previous.token, encrypted: previous.tokenEncrypted } : undefined,
      token,
      options
    )
  )
}

export function migrateGitHubToken(
  config: QuillariumConfig,
  encrypt: (value: string) => string
): QuillariumConfig {
  if (!config.github || !Object.prototype.hasOwnProperty.call(config.github, 'token')) return config
  return {
    ...config,
    github: withUpdatedGitHubToken(config.github, config.github, undefined, { encrypt })
  }
}

export function migrateConfigCredentials(
  config: QuillariumConfig,
  encrypt: (value: string) => string
): QuillariumConfig {
  return migrateGitHubToken(migrateAIProfileApiKeys(config, encrypt), encrypt)
}

function applyAIProfileCredential(profile: AIProfileConfig, credential: StoredCredential): AIProfileConfig {
  const stored = { ...profile }
  delete stored.apiKey
  delete stored.apiKeyEncrypted
  if (credential.encrypted !== undefined) stored.apiKeyEncrypted = credential.encrypted
  else if (credential.plaintext !== undefined) stored.apiKey = credential.plaintext
  return stored
}

function applyGitHubCredential(github: GitHubConfig, credential: StoredCredential): GitHubConfig {
  const stored = { ...github }
  delete stored.token
  delete stored.tokenEncrypted
  if (credential.encrypted !== undefined) stored.tokenEncrypted = credential.encrypted
  else if (credential.plaintext !== undefined) stored.token = credential.plaintext
  return stored
}

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.QUILL_CONFIG_DIR?.trim()
  return override ? path.resolve(override) : path.join(os.homedir(), '.quillarium')
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), 'config.json')
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
