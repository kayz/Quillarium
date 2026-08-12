import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readText, writeText } from './fs.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('atomic text writes', () => {
  it('replaces the destination and leaves no temporary sibling behind', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-atomic-write-'))
    roots.push(root)
    const file = path.join(root, 'record.md')

    await writeText(file, 'first')
    await writeText(file, 'second')

    expect(await readText(file)).toBe('second')
    expect((await readdir(root)).sort()).toEqual(['record.md'])
  })
})
