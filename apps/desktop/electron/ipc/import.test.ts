import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() }
}))

import { chooseImportSourceFiles, type ImportSourceDialog } from './import.js'

describe('AI import source picker', () => {
  it('returns supported text and Markdown paths from the desktop dialog', async () => {
    const showOpenDialog = vi.fn(async () => ({
      canceled: false,
      filePaths: ['C:\\notes\\story.md', 'C:\\notes\\timeline.txt']
    }))

    await expect(chooseImportSourceFiles({ showOpenDialog } as ImportSourceDialog)).resolves.toEqual([
      'C:\\notes\\story.md',
      'C:\\notes\\timeline.txt'
    ])
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: '选择要拆分的文本或 Markdown 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '文本与 Markdown', extensions: ['md', 'markdown', 'txt'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
  })

  it('returns an empty list when the author cancels file selection', async () => {
    const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] }))

    await expect(chooseImportSourceFiles({ showOpenDialog } as ImportSourceDialog)).resolves.toEqual([])
  })
})
