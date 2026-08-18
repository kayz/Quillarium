import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt, createWorldEntry, importMarkdownFile, readMarkdown, writeText } from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-import-references-'))
  roots.push(root)
  await createProjectAt(root, { id: 'import-references', title: 'Import references' })
  return root
}

describe('imported document references', () => {
  it('writes a uniquely resolved legacy code as a canonical Obsidian link', async () => {
    const root = await project()
    await createWorldEntry(root, 'Target title', { id: 'lore-0077', code: 'LORE-0077' })
    const source = path.join(root, 'incoming.md')
    await writeText(
      source,
      '---\ntitle: Imported source\ntype: world_entry\nlinks:\n  - LORE-0077\n---\n\nImported body.\n'
    )

    const [result] = await importMarkdownFile(root, source, { defaultType: 'world_entry' })
    const imported = await readMarkdown<Record<string, unknown>>(result!.path)

    expect(imported.data['links']).toEqual(['[[world/lore-0077-Target-title|Target title]]'])
    expect(result!.notes.some((note) => note.startsWith('reference:'))).toBe(false)
  })

  it('keeps an ambiguous title unchanged and reports candidates instead of guessing', async () => {
    const root = await project()
    await createWorldEntry(root, 'Duplicate title', { id: 'duplicate-a' })
    await createWorldEntry(root, 'Duplicate title', { id: 'duplicate-b' })
    const source = path.join(root, 'ambiguous.md')
    await writeText(
      source,
      '---\ntitle: Imported source\ntype: world_entry\nlinks:\n  - Duplicate title\n---\n\nImported body.\n'
    )

    const [result] = await importMarkdownFile(root, source, { defaultType: 'world_entry' })
    const imported = await readMarkdown<Record<string, unknown>>(result!.path)

    expect(imported.data['links']).toEqual(['Duplicate title'])
    expect(result!.notes).toContain('reference: ambiguous Duplicate title (Duplicate title, Duplicate title)')
  })
})
