import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createCharacter, createCharacterRelation, createWorldEntry, listDocs } from './documents.js'
import { pathExists, readMarkdown, writeMarkdown } from './fs.js'
import { specializePlanningCard } from './planning-specialize.js'
import { DOCUMENT_ORIGIN_FIELD } from './provenance.js'
import { createProjectAt } from './project.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-specialize-'))
  roots.push(root)
  await createProjectAt(root, { id: 'spec-novel', title: '特化夹具' })
  return root
}

describe('specializePlanningCard', () => {
  it('preserves existing quillarium_origin and excludes it from excerpt', async () => {
    const root = await fixture()
    const sourcePath = await createWorldEntry(
      root,
      '林舟',
      { id: 'world-lin', triggers: ['林舟', '舟师'], story_setting: '北港水手' },
      '北港的舟师。'
    )
    const origin = {
      schema_version: 1 as const,
      kind: 'document-import' as const,
      sources: [{ path: '/tmp/source.md', sha256: 'abc123' }],
      item_index: 0,
      item_title: '林舟',
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-20T00:00:00.000Z'
    }
    const existing = await readMarkdown<Record<string, unknown>>(sourcePath)
    await writeMarkdown(sourcePath, { ...existing.data, [DOCUMENT_ORIGIN_FIELD]: origin }, existing.content)

    await specializePlanningCard(root, 'world-lin', 'character', {})

    const [character] = await listDocs(root, 'character')
    expect((character!.data as unknown as Record<string, unknown>)[DOCUMENT_ORIGIN_FIELD]).toEqual(origin)
    expect(character!.content).toContain('## 特化前摘录')
    expect(character!.content).toContain('triggers:')
    expect(character!.content).not.toContain(DOCUMENT_ORIGIN_FIELD)
    expect(JSON.stringify(character!.data)).not.toContain('story_setting')
  })

  it('moves a world entry to a character file and keeps the id', async () => {
    const root = await fixture()
    const source = await createWorldEntry(
      root,
      '林舟',
      { id: 'world-lin', triggers: ['林舟', '舟师'], story_setting: '北港水手' },
      '北港的舟师。'
    )
    const result = await specializePlanningCard(root, 'world-lin', 'character', {})
    expect(result.data.id).toBe('world-lin')
    expect(result.data.type).toBe('character')
    expect(result.path.replaceAll('\\', '/')).toContain('/characters/')
    expect(await pathExists(source)).toBe(false)
    expect(await listDocs(root, 'world_entry')).toEqual([])
    const characters = await listDocs(root, 'character')
    expect(characters).toHaveLength(1)
    expect(characters[0]!.data.id).toBe('world-lin')
    expect(characters[0]!.content).toContain('北港的舟师。')
    expect(characters[0]!.content).toContain('## 特化前摘录')
    expect(characters[0]!.content).toContain('triggers:')
    expect(JSON.stringify(characters[0]!.data)).not.toContain('story_setting')
  })

  it('refuses a relation specialize when endpoints are missing and does not write', async () => {
    const root = await fixture()
    const source = await createWorldEntry(root, '旧盟', { id: 'world-pact' }, '两人未点名。')
    await expect(specializePlanningCard(root, 'world-pact', 'character_relation', {})).rejects.toThrow(
      '特化缺少必填字段'
    )
    expect(await pathExists(source)).toBe(true)
    const [still] = await listDocs(root, 'world_entry')
    expect(still?.data.type).toBe('world_entry')
  })

  it('refuses when converting a referenced character would break typed relations', async () => {
    const root = await fixture()
    await createCharacter(root, '林澜', { id: 'character-lin' })
    await createCharacter(root, '顾衡', { id: 'character-gu' })
    await createCharacterRelation(root, '同僚', {
      id: 'rel-lin-gu',
      from_character: 'character-lin',
      to_character: 'character-gu',
      relation_type: 'colleague'
    })
    await expect(specializePlanningCard(root, 'character-lin', 'world_entry', {})).rejects.toThrow(
      '现有类型化引用失效'
    )
    const character = (await listDocs(root, 'character')).find((item) => item.data.id === 'character-lin')
    expect(character?.data.id).toBe('character-lin')
    expect(character?.data.type).toBe('character')
  })

  it('converts a character back to a world entry', async () => {
    const root = await fixture()
    const source = await createCharacter(root, '顾衡', { id: 'character-gu', desire: '守住北港' })
    const result = await specializePlanningCard(root, 'character-gu', 'world_entry', {})
    expect(result.data.type).toBe('world_entry')
    expect(result.path.replaceAll('\\', '/')).toContain('/world/')
    expect(await pathExists(source)).toBe(false)
    expect(await listDocs(root, 'character')).toEqual([])
    const [world] = await listDocs(root, 'world_entry')
    expect(world?.data.id).toBe('character-gu')
    expect(JSON.stringify(world?.data)).not.toContain('守住北港')
    expect(world?.content).toContain('desire:')
  })

  it('rejects a stale expected hash', async () => {
    const root = await fixture()
    const source = await createWorldEntry(root, '潮信', { id: 'world-tide' })
    await expect(
      specializePlanningCard(root, 'world-tide', 'location', {}, { expectedSha256: '0'.repeat(64) })
    ).rejects.toThrow('其它写入')
    expect(await pathExists(source)).toBe(true)
    expect((await listDocs(root, 'world_entry'))[0]?.data.type).toBe('world_entry')
  })

  it('rejects specializing a card to its current type', async () => {
    const root = await fixture()
    await createWorldEntry(root, '潮信', { id: 'world-tide' })
    await expect(specializePlanningCard(root, 'world-tide', 'world_entry', {})).rejects.toThrow(
      '目标类型与当前相同'
    )
  })
})
