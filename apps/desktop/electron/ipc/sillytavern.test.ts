import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createWorldEntry,
  ensureWorkspaceAt,
  loadWorkspace,
  objectToYaml,
  pathExists,
  writeBinary,
  writeText
} from '@quillarium/core'
import type {
  CharacterCardImportResult,
  CharacterCardWriteResult,
  WorldInfoWriteResult
} from '@quillarium/sillytavern'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() }
}))

import {
  exportSillyTavernCard,
  exportSillyTavernLorebook,
  importBookProjectFromCard,
  importSillyTavernCard,
  type CharacterCardImporter,
  type CharacterCardWriter,
  type LorebookWriter,
  type SillyTavernDialog
} from './sillytavern.js'

const fetchMock = vi.fn()
const temporaryRoots: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
  return Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('desktop SillyTavern IPC helpers', () => {
  it('returns null without importing when the optional file picker is canceled', async () => {
    const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] }))
    const importer = vi.fn<CharacterCardImporter>()

    const result = await importSillyTavernCard('C:\\novel', undefined, {
      dialog: { showOpenDialog } as SillyTavernDialog,
      importer
    })

    expect(result).toBeNull()
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: '导入 SillyTavern 角色卡',
      defaultPath: 'C:\\novel',
      properties: ['openFile'],
      filters: [{ name: 'SillyTavern Character Card', extensions: ['json', 'png'] }]
    })
    expect(importer).not.toHaveBeenCalled()
  })

  it('imports an explicit JSON or PNG path without opening the file picker', async () => {
    const imported: CharacterCardImportResult = {
      format: 'v3',
      source: 'png',
      pngKeyword: 'ccv3',
      characterId: 'character-lin',
      characterPath: 'C:\\novel\\characters\\character-lin.md',
      rawPath: 'C:\\novel\\sillytavern\\lin-v3-raw.json'
    }
    const showOpenDialog = vi.fn()
    const importer = vi.fn<CharacterCardImporter>(async () => imported)

    const result = await importSillyTavernCard('C:\\novel', 'C:\\cards\\lin.png', {
      dialog: { showOpenDialog } as SillyTavernDialog,
      importer
    })

    expect(showOpenDialog).not.toHaveBeenCalled()
    expect(importer).toHaveBeenCalledWith('C:\\novel', 'C:\\cards\\lin.png')
    expect(result).toBe(imported)
  })

  it('includes the selected path in import failures', async () => {
    const importer = vi.fn<CharacterCardImporter>(async () => {
      throw new Error('ENOENT: file not found')
    })

    await expect(
      importSillyTavernCard('C:\\novel', 'C:\\cards\\missing.json', {
        dialog: { showOpenDialog: vi.fn() } as SillyTavernDialog,
        importer
      })
    ).rejects.toThrow(
      'Could not import SillyTavern Character Card from C:\\cards\\missing.json: ENOENT: file not found'
    )
  })

  it('writes a character card through the injected reusable writer', async () => {
    const written: CharacterCardWriteResult = {
      format: 'v2',
      characterId: 'character-lin',
      outputPath: 'C:\\novel\\sillytavern\\character-lin-card-v2.json'
    }
    const writer = vi.fn<CharacterCardWriter>(async () => written)

    const result = await exportSillyTavernCard('C:\\novel', 'character-lin', writer)

    expect(writer).toHaveBeenCalledWith('C:\\novel', 'character-lin')
    expect(result).toBe(written)
  })

  it('writes a lorebook through the injected reusable writer', async () => {
    const written: WorldInfoWriteResult = {
      format: 'world-info',
      entryCount: 7,
      outputPath: 'C:\\novel\\sillytavern\\quillarium-world-info.json'
    }
    const writer = vi.fn<LorebookWriter>(async () => written)

    const result = await exportSillyTavernLorebook('C:\\novel', writer)

    expect(writer).toHaveBeenCalledWith('C:\\novel')
    expect(result).toBe(written)
  })

  it('removes the transaction-owned final directory and leaves the manifest unchanged if registration fails', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'quillarium-book-project-rollback-'))
    temporaryRoots.push(workspaceRoot)
    const workspace = await ensureWorkspaceAt(workspaceRoot)
    const manifestBefore = await readFile(workspace.manifest_path, 'utf8')
    const sourceBytes = Buffer.from('synthetic archived card')
    const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')

    await expect(
      importBookProjectFromCard(workspaceRoot, 'synthetic.card.json', 'Imported Novel', {
        inspect: async () => ({
          format: 'v3',
          sourcePath: 'synthetic.card.json',
          name: 'Card title',
          description: 'Synopsis',
          hasPngCover: false,
          worldBookEntryCount: 1
        }),
        importCard: async (root, _source, options) => {
          await createWorldEntry(
            root,
            'Imported setting',
            { id: 'world-imported', status: 'candidate', entry_status: 'candidate', enabled: false },
            'Review me.'
          )
          const archivePath = path.join(root, 'imports', 'archive', 'synthetic.json')
          await writeBinary(archivePath, sourceBytes)
          expect(options.title).toBe('Imported Novel')
          return {
            format: 'v3',
            projectRoot: root,
            archivePath,
            sourceSha256,
            candidateDocumentIds: ['world-imported']
          }
        },
        registerProject: async (root, ref) => {
          const current = await loadWorkspace(root)
          await writeText(
            current.manifest_path,
            `${objectToYaml({
              ...current.manifest,
              projects: [...current.manifest.projects, ref]
            } as unknown as Record<string, unknown>)}\n`
          )
          throw new Error('INJECTED_MANIFEST_REGISTRATION_FAILURE')
        }
      })
    ).rejects.toThrow('INJECTED_MANIFEST_REGISTRATION_FAILURE')

    expect(await readFile(workspace.manifest_path, 'utf8')).toBe(manifestBefore)
    expect((await loadWorkspace(workspaceRoot)).manifest.projects).toEqual([])
    expect(await pathExists(path.join(workspaceRoot, 'projects', 'imported-novel'))).toBe(false)
    expect(await readdir(path.join(workspaceRoot, 'projects'))).toEqual([])
  })
})
