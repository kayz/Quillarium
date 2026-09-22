import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configDir, configPath, loadConfig, saveConfig } from './config.js'
import { projectConfigSchema } from './schema.js'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('configuration isolation', () => {
  it('uses QUILL_CONFIG_DIR for isolated CLI and desktop sessions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-config-'))
    roots.push(root)
    vi.stubEnv('QUILL_CONFIG_DIR', root)

    await saveConfig({
      language: 'en',
      workspaceDir: path.join(root, 'workspace'),
      recentProjectId: 'sample-project',
      obsidianDir: path.join(root, 'vault')
    })

    expect(configDir()).toBe(path.resolve(root))
    expect(configPath()).toBe(path.join(path.resolve(root), 'config.json'))
    await expect(loadConfig()).resolves.toEqual({
      language: 'en',
      workspaceDir: path.join(root, 'workspace'),
      recentProjectId: 'sample-project',
      obsidianDir: path.join(root, 'vault')
    })
  })

  it('ignores a blank override and retains the user config default', () => {
    expect(configDir({ QUILL_CONFIG_DIR: '   ' })).toBe(path.join(os.homedir(), '.quillarium'))
  })

  it('round-trips displayImageProfile on QuillariumConfig without generating images', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-config-image-'))
    roots.push(root)
    vi.stubEnv('QUILL_CONFIG_DIR', root)
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)

    const displayImageProfile = {
      provider: 'openai' as const,
      model: 'gpt-image-1',
      apiKeyEncrypted: 'ciphertext'
    }
    await saveConfig({ language: 'zh', displayImageProfile })

    await expect(loadConfig()).resolves.toEqual({ language: 'zh', displayImageProfile })
    expect(fetchFn).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not keep displayImageProfile on ProjectConfig', () => {
    const parsed = projectConfigSchema.parse({
      id: 'sample-project',
      title: 'Sample',
      displayImageProfile: { provider: 'openai', apiKey: 'secret', model: 'gpt-image-1' }
    })
    expect(parsed).not.toHaveProperty('displayImageProfile')
  })
})
