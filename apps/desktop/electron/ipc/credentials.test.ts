import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((value: string) => Buffer.from(`wrapped:${value}`)),
  decryptString: vi.fn(() => 'decrypted-stored-secret'),
  fetch: vi.fn()
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mocks.isEncryptionAvailable,
    encryptString: mocks.encryptString,
    decryptString: mocks.decryptString
  }
}))

vi.mock('@quillarium/core', async () => {
  const actual = await vi.importActual<typeof import('@quillarium/core')>('@quillarium/core')
  return {
    ...actual,
    loadConfig: mocks.loadConfig,
    saveConfig: mocks.saveConfig
  }
})

import {
  DESKTOP_SECRET_MASK,
  loadDesktopConfig,
  loadDesktopGitHubCredentials,
  saveDesktopGitHub
} from './credentials.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.isEncryptionAvailable.mockReturnValue(true)
  mocks.encryptString.mockImplementation((value: string) => Buffer.from(`wrapped:${value}`))
  mocks.decryptString.mockReturnValue('decrypted-stored-secret')
})

afterEach(() => {
  expect(mocks.fetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('desktop configuration credential migration and sanitization', () => {
  it('shows official DeepSeek limits for a profile carrying the legacy 2000-token default', async () => {
    mocks.loadConfig.mockResolvedValue({
      aiProfiles: {
        prose: {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-pro',
          maxTokens: 2_000
        }
      }
    })

    const response = await loadDesktopConfig()

    expect(response.aiProfiles?.prose).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      maxTokens: 384_000,
      contextWindowTokens: 1_000_000
    })
    expect(mocks.saveConfig).not.toHaveBeenCalled()
  })

  it('migrates AI and GitHub plaintext into a disk payload without secrets', async () => {
    const aiSecret = 'ai-secret-that-must-not-reach-disk'
    const githubSecret = 'github-secret-that-must-not-reach-disk'
    mocks.loadConfig.mockResolvedValue({
      theme: 'ink',
      aiProfiles: {
        prose: { provider: 'openai', apiKey: aiSecret }
      },
      github: {
        token: githubSecret,
        defaultOwner: 'writer',
        defaultVisibility: 'private'
      }
    })

    const response = await loadDesktopConfig()
    const savedConfig = mocks.saveConfig.mock.calls[0]?.[0]
    const serializedDiskPayload = JSON.stringify(savedConfig)
    const serializedResponse = JSON.stringify(response)

    expect(savedConfig.aiProfiles.prose.apiKey).toBeUndefined()
    expect(savedConfig.aiProfiles.prose.apiKeyEncrypted).toBeTruthy()
    expect(savedConfig.github.token).toBeUndefined()
    expect(savedConfig.github.tokenEncrypted).toBeTruthy()
    expect(serializedDiskPayload).not.toContain(aiSecret)
    expect(serializedDiskPayload).not.toContain(githubSecret)
    expect(response.aiProfiles?.prose).toMatchObject({ apiKey: '', hasKey: true, keyStatus: 'available' })
    expect(response.aiProfiles?.prose).not.toHaveProperty('apiKeyEncrypted')
    expect(response.github).toMatchObject({ token: DESKTOP_SECRET_MASK, hasToken: true })
    expect(serializedResponse).not.toContain(aiSecret)
    expect(serializedResponse).not.toContain(githubSecret)
    expect(serializedResponse).not.toContain('apiKeyEncrypted')
    expect(serializedResponse).not.toContain('tokenEncrypted')
  })

  it('keeps legacy plaintext usable with an explicit warning when migration encryption fails', async () => {
    mocks.loadConfig.mockResolvedValue({
      github: { token: 'legacy-token', defaultOwner: 'writer' }
    })
    mocks.encryptString.mockImplementation(() => {
      throw new Error('OS encryption failed')
    })

    const response = await loadDesktopConfig()

    expect(mocks.saveConfig).not.toHaveBeenCalled()
    expect(response.github).toMatchObject({ token: DESKTOP_SECRET_MASK, hasToken: true })
    expect(response.aiKeyStorage.mode).toBe('plaintext-fallback')
    expect(response.aiKeyStorage.warning).toContain('plaintext value remains')
    expect(JSON.stringify(response)).not.toContain('legacy-token')
  })

  it('masks an undecryptable stored token and returns an explicit warning', async () => {
    mocks.loadConfig.mockResolvedValue({
      github: { tokenEncrypted: 'undecryptable-ciphertext', defaultOwner: 'writer' }
    })
    mocks.decryptString.mockImplementation(() => {
      throw new Error('decryption failed')
    })

    const response = await loadDesktopConfig()

    expect(response.github).toMatchObject({ token: DESKTOP_SECRET_MASK, hasToken: true })
    expect(response.aiKeyStorage.warning).toContain('could not be decrypted')
    expect(JSON.stringify(response)).not.toContain('undecryptable-ciphertext')
    expect(JSON.stringify(response)).not.toContain('tokenEncrypted')
  })
})

describe('desktop GitHub token persistence', () => {
  it('serializes a newly saved token as ciphertext only', async () => {
    const secret = 'new-github-token'
    mocks.loadConfig.mockResolvedValue({})

    await saveDesktopGitHub({
      token: secret,
      defaultOwner: 'writer',
      defaultVisibility: 'private'
    })

    const savedConfig = mocks.saveConfig.mock.calls[0]?.[0]
    expect(savedConfig.github.token).toBeUndefined()
    expect(savedConfig.github.tokenEncrypted).toBe(Buffer.from(`wrapped:${secret}`).toString('base64'))
    expect(JSON.stringify(savedConfig)).not.toContain(secret)
  })

  it.each(['', DESKTOP_SECRET_MASK])('preserves stored ciphertext for %j submissions', async (token) => {
    mocks.loadConfig.mockResolvedValue({
      github: {
        tokenEncrypted: 'existing-ciphertext',
        defaultOwner: 'old-owner',
        defaultVisibility: 'private'
      }
    })

    await saveDesktopGitHub({ token, defaultOwner: 'new-owner', defaultVisibility: 'public' })

    expect(mocks.saveConfig).toHaveBeenCalledWith({
      github: {
        tokenEncrypted: 'existing-ciphertext',
        defaultOwner: 'new-owner',
        defaultVisibility: 'public'
      }
    })
  })

  it('removes both token fields only for clearToken true', async () => {
    mocks.loadConfig.mockResolvedValue({
      github: { tokenEncrypted: 'existing-ciphertext', defaultOwner: 'writer' }
    })

    await saveDesktopGitHub({ token: DESKTOP_SECRET_MASK, clearToken: true })

    const savedConfig = mocks.saveConfig.mock.calls[0]?.[0]
    expect(savedConfig.github.token).toBeUndefined()
    expect(savedConfig.github.tokenEncrypted).toBeUndefined()
  })

  it('uses plaintext fallback and returns a warning when secure storage is unavailable', async () => {
    mocks.isEncryptionAvailable.mockReturnValue(false)
    mocks.loadConfig.mockResolvedValue({})

    const response = await saveDesktopGitHub({ token: 'fallback-token' })

    expect(mocks.saveConfig).toHaveBeenCalledWith({
      github: {
        token: 'fallback-token',
        defaultOwner: '',
        defaultVisibility: 'private'
      }
    })
    expect(response.aiKeyStorage.mode).toBe('plaintext-fallback')
    expect(response.aiKeyStorage.warning).toContain('plaintext fallback')
  })
})

describe('desktop GitHub token resolution', () => {
  it('prefers QUILL_GITHUB_TOKEN, then GITHUB_TOKEN, without decrypting', async () => {
    mocks.loadConfig.mockResolvedValue({
      github: { tokenEncrypted: 'ciphertext', token: 'legacy-token' }
    })

    const quill = await loadDesktopGitHubCredentials({
      QUILL_GITHUB_TOKEN: 'quill-environment-token',
      GITHUB_TOKEN: 'github-environment-token'
    })
    const github = await loadDesktopGitHubCredentials({ GITHUB_TOKEN: 'github-environment-token' })

    expect(quill.token).toBe('quill-environment-token')
    expect(github.token).toBe('github-environment-token')
    expect(mocks.decryptString).not.toHaveBeenCalled()
  })

  it('prefers decrypted ciphertext over a legacy plaintext token', async () => {
    mocks.loadConfig.mockResolvedValue({
      github: { tokenEncrypted: 'ciphertext', token: 'legacy-token' }
    })
    mocks.decryptString.mockReturnValue('decrypted-token')

    const credentials = await loadDesktopGitHubCredentials({})

    expect(credentials.token).toBe('decrypted-token')
    expect(mocks.decryptString).toHaveBeenCalled()
  })

  it('uses the legacy plaintext token when secure storage is unavailable', async () => {
    mocks.isEncryptionAvailable.mockReturnValue(false)
    mocks.loadConfig.mockResolvedValue({
      github: { token: 'legacy-token' }
    })

    const credentials = await loadDesktopGitHubCredentials({})

    expect(credentials.token).toBe('legacy-token')
  })

  it('returns no token and never returns ciphertext when decryption fails', async () => {
    mocks.loadConfig.mockResolvedValue({
      github: { tokenEncrypted: 'ciphertext-that-must-not-be-used-as-token' }
    })
    mocks.decryptString.mockImplementation(() => {
      throw new Error('decryption failed')
    })

    const credentials = await loadDesktopGitHubCredentials({})

    expect(credentials.token).toBe('')
    expect(credentials.token).not.toContain('ciphertext')
  })
})
