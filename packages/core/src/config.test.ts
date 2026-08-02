import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configDir, configPath, loadConfig, saveConfig } from './config.js'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('configuration isolation', () => {
  it('uses QUILL_CONFIG_DIR for isolated CLI and desktop sessions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-config-'))
    roots.push(root)
    vi.stubEnv('QUILL_CONFIG_DIR', root)

    await saveConfig({ language: 'en', obsidianDir: path.join(root, 'vault') })

    expect(configDir()).toBe(path.resolve(root))
    expect(configPath()).toBe(path.join(path.resolve(root), 'config.json'))
    await expect(loadConfig()).resolves.toEqual({
      language: 'en',
      obsidianDir: path.join(root, 'vault')
    })
  })

  it('ignores a blank override and retains the user config default', () => {
    expect(configDir({ QUILL_CONFIG_DIR: '   ' })).toBe(path.join(os.homedir(), '.quillarium'))
  })
})
