import { readFile, rm, stat } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildLocalDocumentLinkIndex,
  createLocalDocumentReferenceResolver,
  createProjectAt,
  createWorldEntry,
  extractLocalDocumentReferences,
  extractStructuredDocumentReferences,
  formatObsidianDocumentLink,
  listDocs,
  loadLocalDocumentLinkIndex,
  rebuildLocalDocumentLinkIndex,
  relativeDocumentPath,
  type DocumentIdentity,
  type ReferenceDocument,
  type WorldEntryDoc
} from './index.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function fixture(
  id: string,
  title: string,
  options: {
    code?: string
    aliases?: string[]
    relativePath?: string
    content?: string
    links?: string[]
  } = {}
): ReferenceDocument {
  return {
    path: `C:/vault/${options.relativePath ?? `world/${id}-${title}.md`}`,
    data: {
      id,
      type: 'world_entry',
      schema_version: 1,
      title,
      tags: [],
      status: 'active',
      enabled: true,
      source_refs: [],
      relations: [],
      code: options.code ?? '',
      aliases: options.aliases ?? [],
      links: options.links ?? []
    } as unknown as WorldEntryDoc,
    content: options.content ?? ''
  }
}

describe('local document reference resolver', () => {
  const documents = [
    fixture('lore-0077', '女真三部', {
      code: 'LORE-0077',
      aliases: ['女真诸部'],
      relativePath: 'world/lore-0077-女真三部.md'
    }),
    fixture('world-capital', '建州', { relativePath: 'world/places/world-capital-建州.md' })
  ]
  const resolver = createLocalDocumentReferenceResolver(documents, 'C:/vault')

  it.each([
    ['lore-0077', 'stable_id'],
    ['LORE-0077', 'code'],
    ['world/lore-0077-女真三部', 'relative_path'],
    ['world/lore-0077-女真三部.md', 'relative_path'],
    ['[[lore-0077-女真三部]]', 'wikilink_target'],
    ['[[女真三部]]', 'title'],
    ['[[女真诸部|旧称]]', 'alias']
  ])('resolves %s by %s', (reference, matchedBy) => {
    expect(resolver.resolve(reference)).toMatchObject({
      status: 'resolved',
      target_id: 'lore-0077',
      target_relative_path: 'world/lore-0077-女真三部.md',
      matched_by: matchedBy
    })
  })

  it('resolves source-relative Markdown links without relying on Windows path casing', () => {
    expect(
      resolver.resolve('[建州](../world/places/world-capital-建州.md#沿革)', {
        sourcePath: 'outlines/chapter.md'
      })
    ).toMatchObject({
      status: 'resolved',
      target_id: 'world-capital',
      matched_by: 'relative_path',
      fragment: { kind: 'heading', value: '沿革' }
    })
  })

  it('keeps heading, block and display-name information from Obsidian links', () => {
    expect(resolver.resolve('[[女真三部#沿革|三部沿革]]')).toMatchObject({
      target_id: 'lore-0077',
      fragment: { kind: 'heading', value: '沿革' },
      display_text: '三部沿革'
    })
    expect(resolver.resolve('[[女真三部#^treaty]]')).toMatchObject({
      target_id: 'lore-0077',
      fragment: { kind: 'block', value: 'treaty' }
    })
  })

  it('uses deterministic Unicode normalization and case-insensitive code matching', () => {
    const accent = fixture('world-accent', 'Café', { code: 'RÉF-1' })
    const unicodeResolver = createLocalDocumentReferenceResolver([accent], 'C:/vault')
    expect(unicodeResolver.resolve('re\u0301f-1')).toMatchObject({
      status: 'resolved',
      target_id: 'world-accent',
      matched_by: 'code'
    })
  })

  it('reports duplicate titles and aliases as ambiguous without choosing a target', () => {
    const duplicateResolver = createLocalDocumentReferenceResolver(
      [fixture('world-a', '同名'), fixture('world-b', '同名')],
      'C:/vault'
    )
    expect(duplicateResolver.resolve('[[同名]]')).toMatchObject({
      status: 'ambiguous',
      candidates: [{ id: 'world-a' }, { id: 'world-b' }]
    })
    expect(duplicateResolver.resolve('[[不存在]]')).toMatchObject({ status: 'missing', candidates: [] })
  })

  it('extracts wikilinks, display names, headings, blocks and local Markdown links', () => {
    const references = extractLocalDocumentReferences(
      '[[女真三部]] [[女真三部|显示]] [[女真三部#沿革]] [[女真三部#^block]] [建州](world/建州.md)'
    )
    expect(references).toHaveLength(5)
    expect(references.map((item) => item.origin)).toEqual([
      'wikilink',
      'wikilink',
      'wikilink',
      'wikilink',
      'markdown_link'
    ])
  })

  it('extracts quoted wikilinks and legacy link fields from frontmatter data', () => {
    expect(
      extractStructuredDocumentReferences({
        note: '参见 [[女真三部]]',
        links: ['LORE-0077'],
        relations: [{ target_id: 'world-capital' }]
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ raw_reference: '[[女真三部]]', field_path: 'note' }),
        expect.objectContaining({ raw_reference: 'LORE-0077', field_path: 'links' }),
        expect.objectContaining({ raw_reference: 'world-capital', field_path: 'relations.target_id' })
      ])
    )
  })
})

describe('derived forward and backlink index', () => {
  it('builds a cycle-safe derived index and preserves unresolved references', () => {
    const first = fixture('world-a', '甲', { content: '[[乙]]' })
    const second = fixture('world-b', '乙', { content: '[[甲]] [[缺失]]' })
    const index = buildLocalDocumentLinkIndex([first, second], 'C:/vault', new Date('2026-08-17T00:00:00Z'))
    expect(index.forward['world-a']).toEqual([
      expect.objectContaining({ status: 'resolved', target_id: 'world-b', origin: 'wikilink' })
    ])
    expect(index.backlinks['world-a']).toEqual([
      expect.objectContaining({ status: 'resolved', target_id: 'world-b', origin: 'backlink' })
    ])
    expect(index.unresolved).toEqual([
      expect.objectContaining({ status: 'missing', raw_reference: '[[缺失]]' })
    ])
  })

  it('formats new links with the stable filename path and an author-facing title', () => {
    expect(formatObsidianDocumentLink(fixture('lore-0077', '女真三部'), 'C:/vault')).toBe(
      '[[world/lore-0077-女真三部|女真三部]]'
    )
  })

  it('strips a Windows-style vault root without using host path.resolve', () => {
    expect(relativeDocumentPath('C:/vault/world/lore-0077-女真三部.md', 'C:/vault')).toBe(
      'world/lore-0077-女真三部.md'
    )
    expect(relativeDocumentPath('C:\\vault\\world\\lore.md', 'C:/vault')).toBe('world/lore.md')
  })

  it('writes the rebuildable cache only under the ignored project cache directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-reference-index-'))
    roots.push(root)
    await createProjectAt(root, { id: 'reference-index', title: 'Reference Index' })
    await createWorldEntry(root, '女真三部', { id: 'lore-0077', code: 'LORE-0077' }, '正文')
    await createWorldEntry(root, '引用者', { id: 'world-source', links: ['LORE-0077'] }, '[[女真三部]]')
    const index = await rebuildLocalDocumentLinkIndex(root)
    expect(index.forward['world-source']).toEqual(
      expect.arrayContaining([expect.objectContaining({ target_id: 'lore-0077' })])
    )
    const cache = path.join(root, '.quillarium', 'cache', 'document-links.json')
    expect((await stat(cache)).isFile()).toBe(true)
    expect(JSON.parse(await readFile(cache, 'utf8'))).toMatchObject({ schema_version: 1 })
    expect(await listDocs<DocumentIdentity>(root)).toHaveLength(2)
  })

  it('validates the cache against the current document set and rebuilds after an external edit', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-reference-load-'))
    roots.push(root)
    await createProjectAt(root, { id: 'reference-load', title: 'Reference Load' })
    await createWorldEntry(root, '女真三部', { id: 'lore-0077', code: 'LORE-0077' }, '正文')
    await createWorldEntry(root, '引用者', { id: 'world-source', links: ['LORE-0077'] }, '[[女真三部]]')
    await rebuildLocalDocumentLinkIndex(root)
    await createWorldEntry(root, '后写卡片', { id: 'world-new' }, '后写')

    const loaded = await loadLocalDocumentLinkIndex(root)
    expect(loaded.forward['world-source']).toEqual(
      expect.arrayContaining([expect.objectContaining({ target_id: 'lore-0077' })])
    )
    expect(loaded.forward['world-new']).toBeDefined()
  })

  it('reuses a matching cache and rebuilds when the cache file is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-reference-missing-'))
    roots.push(root)
    await createProjectAt(root, { id: 'reference-missing', title: 'Reference Missing' })
    await createWorldEntry(root, '女真三部', { id: 'lore-0077', code: 'LORE-0077' }, '正文')
    await createWorldEntry(root, '引用者', { id: 'world-source', links: ['LORE-0077'] }, '[[女真三部]]')
    const initial = await rebuildLocalDocumentLinkIndex(root)
    expect((await loadLocalDocumentLinkIndex(root)).generated_at).toBe(initial.generated_at)
    await rm(path.join(root, '.quillarium', 'cache', 'document-links.json'), { force: true })

    const loaded = await loadLocalDocumentLinkIndex(root)
    expect(loaded.forward['world-source']).toEqual(
      expect.arrayContaining([expect.objectContaining({ target_id: 'lore-0077' })])
    )
  })
})
