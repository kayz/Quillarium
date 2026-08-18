import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWorkspaceDir, listWorkspaceProjects, loadWorkspace } from '@quillarium/core'

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '0.0.0-test') },
  dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() },
  ipcMain: { handle: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

import { createLocalWorkspaceProject, registerLocalWorkspace } from './local-workspace.js'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('desktop local writing workspace registration', () => {
  it('turns an ordinary folder into a usable workspace without GitHub configuration', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-desktop-local-workspace-'))
    roots.push(root)
    vi.stubEnv('QUILL_CONFIG_DIR', path.join(root, 'config'))
    await writeFile(path.join(root, 'existing.txt'), 'preserved', 'utf8')

    const registered = await registerLocalWorkspace(root)
    const workspace = await loadWorkspace(root)

    expect(registered).toBe(path.resolve(root))
    await expect(getWorkspaceDir()).resolves.toBe(path.resolve(root))
    expect(workspace.manifest.projects).toEqual([])
    expect((await stat(path.join(root, 'projects'))).isDirectory()).toBe(true)
    await expect(readFile(path.join(root, 'existing.txt'), 'utf8')).resolves.toBe('preserved')

    const project = await createLocalWorkspaceProject(root, {
      title: 'Offline Sample',
      genre: 'mystery',
      targetWords: 80000
    })
    expect(project).toMatchObject({
      id: 'offline-sample',
      title: 'Offline Sample',
      genre: 'mystery',
      target_words: 80000
    })
    expect((await listWorkspaceProjects(root)).map((item) => item.config.id)).toEqual(['offline-sample'])
    expect((await stat(path.join(project.root, '.obsidian'))).isDirectory()).toBe(true)
    await expect(stat(path.join(root, '.git'))).rejects.toThrow()
    await expect(stat(path.join(project.root, '.git'))).rejects.toThrow()
  })
})
