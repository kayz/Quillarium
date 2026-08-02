import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  importSillyTavernCard,
  type CharacterCardImporter,
  type CharacterCardWriter,
  type LorebookWriter,
  type SillyTavernDialog
} from './sillytavern.js'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
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
})
