import { safeStorage } from 'electron'
import {
  loadConfig,
  migrateConfigCredentials,
  saveConfig,
  withUpdatedAIProfileApiKey,
  withUpdatedGitHubToken,
  type AIProfileConfig,
  type GitHubConfig,
  type QuillariumConfig
} from '@quillarium/core'
import { defaultBaseUrl, defaultModel, loadAIProfile, type AIConfig } from '@quillarium/ai'
import type {
  AIKeyStorageStatus,
  AIProfileName,
  DesktopAIProfileConfig,
  DesktopAIProfileInput,
  DesktopConfig,
  DesktopGitHubConfig,
  DesktopGitHubInput
} from './contract.js'

const STORAGE_UNAVAILABLE_WARNING =
  'Secure credential storage is unavailable. Newly saved desktop credentials use plaintext fallback, and encrypted credentials cannot be decrypted until secure storage is available.'
const MIGRATION_FAILED_WARNING =
  'Secure credential storage could not migrate an existing plaintext credential. The existing plaintext value remains in config.json.'
const AI_DECRYPTION_FAILED_WARNING =
  'An encrypted desktop AI API key could not be decrypted on this system. Re-enter and save the key.'
const GITHUB_DECRYPTION_FAILED_WARNING =
  'An encrypted desktop GitHub token could not be decrypted on this system. Re-enter and save the token.'
export const DESKTOP_SECRET_MASK = '********'

export interface ResolvedGitHubCredentials {
  token: string
  defaultOwner?: string
  defaultVisibility?: 'private' | 'public'
}

export async function loadDesktopConfig(): Promise<DesktopConfig> {
  const loaded = await loadAndMigrateConfig()
  let warning = loaded.status.warning
  const aiProfiles = loaded.config.aiProfiles
    ? ({} as Partial<Record<AIProfileName, DesktopAIProfileConfig>>)
    : undefined
  let github: DesktopGitHubConfig | undefined
  if (loaded.config.github) {
    let hasToken = false
    if (loaded.config.github.tokenEncrypted !== undefined) {
      try {
        hasToken = Boolean(decryptCredential(loaded.config.github.tokenEncrypted))
      } catch {
        hasToken = true
        warning = combineWarnings(warning, GITHUB_DECRYPTION_FAILED_WARNING)
      }
    } else {
      hasToken = Boolean(loaded.config.github.token)
    }
    github = {
      defaultOwner: loaded.config.github.defaultOwner,
      defaultVisibility: loaded.config.github.defaultVisibility,
      token: hasToken ? DESKTOP_SECRET_MASK : '',
      hasToken
    }
  }

  if (aiProfiles && loaded.config.aiProfiles) {
    for (const [name, profile] of Object.entries(loaded.config.aiProfiles) as Array<
      [AIProfileName, AIProfileConfig | undefined]
    >) {
      if (!profile) continue
      const exposed: DesktopAIProfileConfig = {
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
        temperature: profile.temperature,
        maxTokens: profile.maxTokens,
        apiKey: '',
        hasKey: false,
        keyStatus: 'none'
      }
      if (profile.apiKeyEncrypted !== undefined) {
        try {
          exposed.hasKey = Boolean(decryptCredential(profile.apiKeyEncrypted))
          exposed.keyStatus = exposed.hasKey ? 'available' : 'none'
        } catch {
          exposed.hasKey = true
          exposed.keyStatus = 'unavailable'
          warning = combineWarnings(warning, AI_DECRYPTION_FAILED_WARNING)
        }
      } else if (profile.apiKey) {
        exposed.hasKey = true
        exposed.keyStatus = 'available'
      }
      aiProfiles[name] = exposed
    }
  }

  return {
    ...loaded.config,
    aiProfiles,
    github,
    aiKeyStorage: { ...loaded.status, warning }
  }
}

export async function saveDesktopAIProfile(
  profile: AIProfileName,
  input: DesktopAIProfileInput
): Promise<DesktopConfig> {
  const { config } = await loadAndMigrateConfig()
  const provider = input.provider ?? 'openai-compatible'
  const normalized: AIProfileConfig = {
    provider,
    baseUrl: input.baseUrl || defaultBaseUrl(provider),
    model: input.model || defaultModel(provider),
    temperature: Number(input.temperature ?? 0.7),
    maxTokens: Number(input.maxTokens ?? 2000)
  }

  const previous = config.aiProfiles?.[profile]
  let stored: AIProfileConfig
  if (isEncryptionAvailable()) {
    try {
      stored = withUpdatedAIProfileApiKey(normalized, previous, input.apiKey, {
        encrypt: encryptCredential,
        clear: input.clearApiKey === true
      })
    } catch {
      throw new Error('Secure credential storage failed to encrypt the AI API key; no key was saved.')
    }
  } else {
    stored = withUpdatedAIProfileApiKey(normalized, previous, input.apiKey, {
      clear: input.clearApiKey === true
    })
  }

  await saveConfig({
    ...config,
    aiProfiles: {
      ...config.aiProfiles,
      [profile]: stored
    }
  })
  return loadDesktopConfig()
}

export async function saveDesktopGitHub(input: DesktopGitHubInput): Promise<DesktopConfig> {
  const { config } = await loadAndMigrateConfig()
  const normalized: GitHubConfig = {
    defaultOwner: input.defaultOwner ?? '',
    defaultVisibility: input.defaultVisibility === 'public' ? 'public' : 'private'
  }
  const submittedToken = input.token === DESKTOP_SECRET_MASK ? undefined : input.token
  let stored: GitHubConfig
  if (isEncryptionAvailable()) {
    try {
      stored = withUpdatedGitHubToken(normalized, config.github, submittedToken, {
        encrypt: encryptCredential,
        clear: input.clearToken === true
      })
    } catch {
      throw new Error('Secure credential storage failed to encrypt the GitHub token; no token was saved.')
    }
  } else {
    stored = withUpdatedGitHubToken(normalized, config.github, submittedToken, {
      clear: input.clearToken === true
    })
  }
  await saveConfig({
    ...config,
    github: stored
  })
  return loadDesktopConfig()
}

export async function loadDesktopAIProfile(
  profile: AIProfileName = 'prose',
  env: NodeJS.ProcessEnv = process.env
): Promise<AIConfig> {
  await loadAndMigrateConfig()
  return loadAIProfile(profile, env, decryptCredential)
}

export async function loadDesktopGitHubCredentials(
  env: NodeJS.ProcessEnv = process.env
): Promise<ResolvedGitHubCredentials> {
  const { config } = await loadAndMigrateConfig()
  const github = config.github
  const environmentToken = env.QUILL_GITHUB_TOKEN !== undefined ? env.QUILL_GITHUB_TOKEN : env.GITHUB_TOKEN
  return {
    token: resolveStoredCredential(
      environmentToken,
      github?.tokenEncrypted,
      github?.token,
      decryptCredential
    ),
    defaultOwner: github?.defaultOwner,
    defaultVisibility: github?.defaultVisibility
  }
}

async function loadAndMigrateConfig(): Promise<{
  config: QuillariumConfig
  status: AIKeyStorageStatus
}> {
  const config = await loadConfig()
  const encryptionAvailable = isEncryptionAvailable()
  if (!encryptionAvailable) {
    return {
      config,
      status: {
        mode: 'plaintext-fallback',
        encryptionAvailable: false,
        warning: STORAGE_UNAVAILABLE_WARNING
      }
    }
  }

  try {
    const migrated = migrateConfigCredentials(config, encryptCredential)
    if (migrated === config) {
      return {
        config,
        status: { mode: 'encrypted', encryptionAvailable: true, warning: null }
      }
    }
    await saveConfig(migrated)
    return {
      config: migrated,
      status: { mode: 'encrypted', encryptionAvailable: true, warning: null }
    }
  } catch {
    return {
      config,
      status: {
        mode: 'plaintext-fallback',
        encryptionAvailable: true,
        warning: MIGRATION_FAILED_WARNING
      }
    }
  }
}

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptCredential(value: string): string {
  return safeStorage.encryptString(value).toString('base64')
}

function decryptCredential(encrypted: string): string {
  if (!isEncryptionAvailable()) throw new Error('Secure credential storage is unavailable.')
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

function resolveStoredCredential(
  environmentValue: string | undefined,
  encryptedValue: string | undefined,
  legacyValue: string | undefined,
  decrypt: (value: string) => string
): string {
  if (environmentValue !== undefined) return environmentValue
  if (encryptedValue !== undefined) {
    try {
      return decrypt(encryptedValue)
    } catch {
      // Legacy plaintext remains the compatibility fallback when secure storage cannot decrypt.
    }
  }
  return legacyValue ?? ''
}

function combineWarnings(current: string | null, next: string): string {
  if (!current) return next
  return current.includes(next) ? current : `${current} ${next}`
}
