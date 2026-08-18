import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt } from './project.js'
import { createWorldEntry } from './documents.js'
import { readMarkdown, readText, writeMarkdown, writeText } from './fs.js'
import {
  applyDocumentReferenceMigration,
  planDocumentReferenceMigration
} from './document-reference-migration.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-reference-migration-'))
  roots.push(root)
  await createProjectAt(root, { id: 'reference-migration', title: 'Reference migration' })
  return root
}

describe('document reference migration', () => {
  it('previews legacy code and title links without modifying files, then applies with backup and verification', async () => {
    const root = await project()
    const target = await createWorldEntry(root, 'Target title', {
      id: 'lore-0077',
      code: 'LORE-0077'
    })
    const source = await createWorldEntry(
      root,
      'Source',
      { id: 'world-source', links: ['LORE-0077'] },
      'See [[Target title#Heading|display]].'
    )
    const parsed = await readMarkdown<Record<string, unknown>>(source)
    await writeMarkdown(source, { ...parsed.data, future_field: { keep: true } }, parsed.content)
    const run = path.join(root, 'runs', 'legacy-run', 'result.json')
    await writeText(run, '{"keep":true}\n')
    const before = await readText(source)

    const plan = await planDocumentReferenceMigration(root, new Date('2026-08-17T10:00:00.000Z'))

    expect(await readText(source)).toBe(before)
    expect(plan.files).toHaveLength(1)
    expect(plan.files[0]?.replacements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ raw_reference: 'LORE-0077', target_id: 'lore-0077' }),
        expect.objectContaining({
          raw_reference: '[[Target title#Heading|display]]',
          target_id: 'lore-0077'
        })
      ])
    )

    const report = await applyDocumentReferenceMigration(root, plan, {
      now: new Date('2026-08-17T10:01:00.000Z')
    })
    const migrated = await readMarkdown<Record<string, unknown>>(source)
    expect(migrated.data.links).toEqual(['[[world/lore-0077-Target-title|Target title]]'])
    expect(migrated.data.future_field).toEqual({ keep: true })
    expect(migrated.content).toContain('[[world/lore-0077-Target-title#Heading|display]]')
    expect(report).toMatchObject({ changed_files: 1, replacement_count: 2, verified: true })
    expect(await readText(path.join(root, report.backup_path, 'world', path.basename(source)))).toBe(before)
    expect(await readText(run)).toBe('{"keep":true}\n')
    expect(await readText(target)).toContain('id: lore-0077')
  })

  it('keeps ambiguous references unchanged and reports them separately from missing references', async () => {
    const root = await project()
    await createWorldEntry(root, 'Duplicate', { id: 'duplicate-a' })
    await createWorldEntry(root, 'Duplicate', { id: 'duplicate-b' })
    await createWorldEntry(root, 'Source', { id: 'source', links: ['Duplicate', 'missing-id'] })

    const plan = await planDocumentReferenceMigration(root)

    expect(plan.files).toHaveLength(0)
    expect(plan.ambiguous).toEqual([
      expect.objectContaining({ raw_reference: 'Duplicate', status: 'ambiguous' })
    ])
    expect(plan.missing).toEqual([
      expect.objectContaining({ raw_reference: 'missing-id', status: 'missing' })
    ])
  })

  it('rejects stale plans before writing any project document', async () => {
    const root = await project()
    await createWorldEntry(root, 'Target', { id: 'target' })
    const source = await createWorldEntry(root, 'Source', { id: 'source', links: ['Target'] })
    const plan = await planDocumentReferenceMigration(root)
    const parsed = await readMarkdown<Record<string, unknown>>(source)
    await writeMarkdown(source, parsed.data, `${parsed.content}\nexternal change`)

    await expect(applyDocumentReferenceMigration(root, plan)).rejects.toThrow(/STALE_PROJECT_WRITE/)
    expect((await readMarkdown<Record<string, unknown>>(source)).data.links).toEqual(['Target'])
  })

  it('rolls back every document if a later atomic write fails', async () => {
    const root = await project()
    await createWorldEntry(root, 'Target', { id: 'target' })
    const first = await createWorldEntry(root, 'First', { id: 'first', links: ['Target'] })
    const second = await createWorldEntry(root, 'Second', { id: 'second', links: ['Target'] })
    const beforeFirst = await readText(first)
    const beforeSecond = await readText(second)
    const plan = await planDocumentReferenceMigration(root)
    let writes = 0

    await expect(
      applyDocumentReferenceMigration(root, plan, {
        write_document: async (...args) => {
          writes += 1
          if (writes === 2) throw new Error('simulated write failure')
          await writeMarkdown(...args)
        }
      })
    ).rejects.toThrow('simulated write failure')

    expect(await readText(first)).toBe(beforeFirst)
    expect(await readText(second)).toBe(beforeSecond)
  })
})
