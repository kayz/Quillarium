import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() }
}))

import { createProjectAt, listDocs, readText, type ReferenceDoc } from '@quillarium/core'
import { chooseReferenceUploadFiles, uploadReferenceFiles, type ReferenceUploadDialog } from './references.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('reference upload picker', () => {
  it('selects text and Markdown files without invoking an AI workflow', async () => {
    const showOpenDialog = vi.fn(async () => ({
      canceled: false,
      filePaths: ['C:\\notes\\dynasty.md', 'C:\\notes\\terms.txt']
    }))

    await expect(chooseReferenceUploadFiles({ showOpenDialog } as ReferenceUploadDialog)).resolves.toEqual([
      'C:\\notes\\dynasty.md',
      'C:\\notes\\terms.txt'
    ])
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: '上传参考文档',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '文本与 Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
  })

  it('returns no files when the author cancels', async () => {
    const showOpenDialog = vi.fn(async () => ({ canceled: true, filePaths: [] }))

    await expect(chooseReferenceUploadFiles({ showOpenDialog } as ReferenceUploadDialog)).resolves.toEqual([])
  })
})

describe('deterministic reference upload', () => {
  it('stores each source as a reference card with no external absolute path', async () => {
    const root = await projectRoot()
    const sources = await tempDir('quillarium-reference-sources-')
    const markdown = path.join(sources, 'dynasty.md')
    const text = path.join(sources, 'terms.txt')
    await writeFile(markdown, '# 大明官制\n\n六部职掌摘要。', 'utf8')
    await writeFile(text, '卫所：军政组织。', 'utf8')

    const result = await uploadReferenceFiles(root, [markdown, text])
    const references = await listDocs<ReferenceDoc>(root, 'reference')

    expect(result.items).toHaveLength(2)
    expect(new Set(references.map((item) => item.data.title))).toEqual(new Set(['大明官制', 'terms']))
    expect(references.find((item) => item.data.title === '大明官制')?.content.trimEnd()).toBe(
      '# 大明官制\n\n六部职掌摘要。'
    )
    expect(references.find((item) => item.data.title === 'terms')?.content.trimEnd()).toBe('卫所：军政组织。')
    for (const reference of references) {
      expect(reference.data.location).toBe(path.basename(reference.data.location))
      expect(await readText(reference.path)).not.toContain(path.dirname(markdown))
    }
  })

  it('rolls back every card created by a failed upload batch', async () => {
    const root = await projectRoot()
    const sources = await tempDir('quillarium-reference-sources-')
    const first = path.join(sources, 'first.md')
    const second = path.join(sources, 'second.md')
    await writeFile(first, '# First', 'utf8')
    await writeFile(second, '# Second', 'utf8')
    let creates = 0

    await expect(
      uploadReferenceFiles(root, [first, second], {
        beforeCreate: () => {
          creates += 1
          if (creates === 2) throw new Error('injected upload failure')
        }
      })
    ).rejects.toThrow('injected upload failure')

    expect(await listDocs<ReferenceDoc>(root, 'reference')).toEqual([])
    await expect(readdir(path.join(root, 'references'))).resolves.toEqual([])
  })
})

async function projectRoot(): Promise<string> {
  const root = await tempDir('quillarium-reference-upload-')
  await createProjectAt(root, { id: 'reference-upload', title: 'Reference upload' })
  return root
}

async function tempDir(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}
