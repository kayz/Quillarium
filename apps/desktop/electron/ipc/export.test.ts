import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManuscriptExportResult } from '@quillarium/core'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { exportDesktopManuscript, type ManuscriptExporter } from './export.js'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('desktop manuscript export handler helper', () => {
  it('forwards the optional volume filter and returns the core export result unchanged', async () => {
    const result: ManuscriptExportResult = {
      markdown_path: 'C:\\novel\\exports\\volume.md',
      text_path: 'C:\\novel\\exports\\volume.txt',
      volume_id: 'volume-02',
      exported_scenes: [],
      gaps: []
    }
    const exporter = vi.fn<ManuscriptExporter>(async () => result)

    const exported = await exportDesktopManuscript('C:\\novel', { volumeId: 'volume-02' }, exporter)

    expect(exporter).toHaveBeenCalledWith('C:\\novel', { volumeId: 'volume-02' })
    expect(exported).toBe(result)
  })
})
