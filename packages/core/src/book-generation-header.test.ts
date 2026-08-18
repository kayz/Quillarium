import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearBookGenerationHeader,
  loadBookGenerationHeader,
  saveBookGenerationHeader
} from './book-generation-header.js'
import { createProjectAt } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('book generation header', () => {
  it('stores long text outside project.yaml, treats empty as unset, and warns about literal external macros', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-book-header-'))
    roots.push(base)
    const root = (
      await createProjectAt(path.join(base, 'project'), { id: 'book-header', title: 'Book header' })
    ).root
    expect(await loadBookGenerationHeader(root)).toMatchObject({
      text: '',
      configured: false,
      relative_path: 'prompts/book-generation-header.md',
      character_count: 0
    })
    const text = 'Keep the narration restrained.\n{{char}} remains literal.\n'
    const saved = await saveBookGenerationHeader(root, text)
    expect(saved).toMatchObject({ text, configured: true, character_count: [...text].length })
    expect(saved.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(saved.warnings[0]).toContain('{{char}}')
    expect((await loadBookGenerationHeader(root)).text).toBe(text)
    expect(await clearBookGenerationHeader(root)).toMatchObject({ text: '', configured: false })
  })
})
