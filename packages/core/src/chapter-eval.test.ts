import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyChapterEval,
  createChapterProse,
  createOutline,
  createProjectAt,
  listDocs,
  loadChapterProseForEval,
  pathExists,
  readMarkdown,
  requiredSpecializationFields,
  UNCONFIRMED_EVAL,
  writeMarkdown,
  type ChapterEvalProposalSet
} from './index.js'
import type { IssueDoc } from './types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-chapter-eval-'))
  roots.push(root)
  await createProjectAt(root, { id: 'chapter-eval-test', title: 'Chapter Eval Test' })
  await createOutline(root, 'overview', '作品总览', { id: 'overview' })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', '第一篇', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', '第一章', { id: 'chapter', parent: 'part' })
  return root
}

function baseProposals(overrides?: Partial<ChapterEvalProposalSet>): ChapterEvalProposalSet {
  return {
    eval_id: 'eval-1',
    chapter_id: 'chapter',
    issues: [{ proposal_id: 'issue-prop-1', title: '时间线冲突', body: '开篇与后文时间不符。' }],
    settings: [
      {
        proposal_id: 'setting-prop-1',
        title: '北港',
        content: '北方港口城市。',
        type: 'world_entry',
        fields: {}
      }
    ],
    ...overrides
  }
}

describe('chapter prose gate + apply API', () => {
  it('returns null when chapter prose is missing or empty', async () => {
    const root = await fixture()
    expect(await loadChapterProseForEval(root, 'chapter')).toBeNull()

    await createChapterProse(root, 'chapter', '第一章正文')
    expect(await loadChapterProseForEval(root, 'chapter')).toBeNull()

    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '   \n\t  ')
    expect(await loadChapterProseForEval(root, 'chapter')).toBeNull()
  })

  it('refuses unconfirmed apply and writes nothing', async () => {
    const root = await fixture()
    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '章正文内容。')

    await expect(
      applyChapterEval(root, baseProposals(), {
        confirmed: false,
        issues: ['issue-prop-1'],
        settings: [{ proposal_id: 'setting-prop-1' }]
      })
    ).rejects.toThrow(UNCONFIRMED_EVAL)

    expect(await listDocs(root, 'issue')).toEqual([])
    expect(await listDocs(root, 'world_entry')).toEqual([])
  })

  it('applies one confirmed issue and one world_entry setting', async () => {
    const root = await fixture()
    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '章正文内容。')

    const result = await applyChapterEval(root, baseProposals(), {
      confirmed: true,
      issues: ['issue-prop-1'],
      settings: [{ proposal_id: 'setting-prop-1' }]
    })

    expect(result.issue_ids).toHaveLength(1)
    expect(result.setting_ids).toHaveLength(1)

    const issues = await listDocs<IssueDoc>(root, 'issue')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.data.title).toBe('时间线冲突')
    expect(issues[0]!.data.related_docs).toEqual(['chapter'])
    expect(issues[0]!.content).toContain('开篇与后文时间不符。')

    const worlds = await listDocs(root, 'world_entry')
    expect(worlds).toHaveLength(1)
    expect(worlds[0]!.data.title).toBe('北港')
    expect(worlds[0]!.data.type).toBe('world_entry')
    expect(worlds[0]!.content).toContain('北方港口城市。')
  })

  it('rolls back when specialize is missing required fields', async () => {
    const root = await fixture()
    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '章正文内容。')

    expect(requiredSpecializationFields('character_relation').length).toBeGreaterThan(0)

    await expect(
      applyChapterEval(root, baseProposals(), {
        confirmed: true,
        issues: [],
        settings: [{ proposal_id: 'setting-prop-1', type: 'character_relation', fields: {} }]
      })
    ).rejects.toThrow('特化缺少必填字段：')

    expect(await listDocs(root, 'world_entry')).toEqual([])
    expect(await listDocs(root, 'character_relation')).toEqual([])
  })

  it('specializes confirmed setting to character when fields are valid', async () => {
    const root = await fixture()
    const prosePath = await createChapterProse(root, 'chapter', '第一章正文')
    const existing = await readMarkdown(prosePath)
    await writeMarkdown(prosePath, existing.data, '章正文内容。')

    expect(requiredSpecializationFields('character')).toEqual([])

    const result = await applyChapterEval(root, baseProposals(), {
      confirmed: true,
      issues: [],
      settings: [{ proposal_id: 'setting-prop-1', type: 'character', fields: {} }]
    })

    expect(result.setting_ids).toHaveLength(1)
    expect(await listDocs(root, 'world_entry')).toEqual([])

    const characters = await listDocs(root, 'character')
    expect(characters).toHaveLength(1)
    expect(characters[0]!.data.id).toBe(result.setting_ids[0])
    expect(characters[0]!.data.type).toBe('character')
    expect(characters[0]!.path.replaceAll('\\', '/')).toContain('/characters/')
    expect(await pathExists(characters[0]!.path)).toBe(true)
  })
})
