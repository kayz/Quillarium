import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectAt } from '@quillarium/core'
import type { AIConfig } from '@quillarium/ai'
import {
  confirmPlanningRecord,
  discussPlanningRecord,
  normalizePlanningDraft,
  parsePlanningAIResponse
} from './planning.js'
import type { PlanningDocumentKind } from './contract.js'

const roots: string[] = []
const configuredAI: AIConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://example.invalid/v1',
  apiKey: 'test-only',
  model: 'planning-test',
  temperature: 0,
  maxTokens: 1000
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('planning proposal validation', () => {
  const representative: Array<[PlanningDocumentKind, Record<string, unknown>]> = [
    ['character', { role: 'supporting', relationships: { ally: 'char-2' } }],
    ['world_entry', { role: 'both', entry_status: 'candidate', used_in: [] }],
    ['timeline_event', { date: '第三日', characters: ['char-1'] }],
    ['location', { parent_location: null, description: '临河旧城' }],
    ['foreshadowing', { level: 'L3', state: 'planned', related_characters: [] }],
    ['strategy', { category: 'style', scope: 'project', principles: ['克制'] }],
    ['pattern', { kind: 'writing', scope: 'project', source: 'user' }],
    ['issue', { priority: 'high', state: 'open', related_docs: [] }],
    ['reference', { material_type: 'book', reading_status: 'reading' }]
  ]

  it.each(representative)('normalizes a schema-valid %s proposal', (kind, fields) => {
    const result = normalizePlanningDraft({ kind, title: `测试 ${kind}`, fields, content: '## 正文' })
    expect(result.kind).toBe(kind)
    expect(result.fields).not.toHaveProperty('id')
    expect(result.fields).not.toHaveProperty('type')
  })

  it('rejects invalid AI JSON with an actionable retry message', () => {
    expect(() => parsePlanningAIResponse('{not-json')).toThrow(/提案无效.*重试/)
  })
})

describe('planning discussion side effects', () => {
  it('uses project/module context and writes no file before confirmation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    const before = await snapshotPaths(root)
    let prompt = ''
    const response = await discussPlanningRecord(
      root,
      {
        module: 'characters',
        messages: [{ role: 'author', content: '建立一个谨慎的档案管理员。' }]
      },
      {
        loadAIProfile: async () => configuredAI,
        generate: async (value) => {
          prompt = value
          return JSON.stringify({
            message: '已形成可修改提案。',
            proposal: {
              kind: 'character',
              title: '档案管理员',
              fields: { role: 'supporting', desire: '保护记录' },
              content: '## Profile\n\n谨慎核对每条记录。'
            }
          })
        }
      }
    )
    expect(response.proposal?.kind).toBe('character')
    expect(prompt).toContain('Planning module opened by the author: characters')
    expect(prompt).toContain('Current project: 中性样例')
    expect(await snapshotPaths(root)).toEqual(before)
  })

  it('reports a missing background profile before calling AI', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    await expect(
      discussPlanningRecord(
        root,
        { module: 'world', messages: [{ role: 'author', content: '补一个制度。' }] },
        {
          loadAIProfile: async () => ({ ...configuredAI, apiKey: '' }),
          generate: async () => {
            throw new Error('must not run')
          }
        }
      )
    ).rejects.toThrow(/设置.*背景/)
  })

  it('creates exactly one schema-valid Markdown document after confirmation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quillarium-planning-'))
    roots.push(root)
    await createProjectAt(root, { id: 'neutral-sample', title: '中性样例' })
    const before = await snapshotPaths(root)

    const result = await confirmPlanningRecord(root, {
      kind: 'world_entry',
      title: '河港通行规则',
      fields: {
        role: 'constraint',
        entry_status: 'candidate',
        triggers: ['河港', '通行证'],
        used_in: [{ scene: 'scene-sample', usage: '限制夜间出城' }]
      },
      content: '## 规则\n\n夜间通行需要凭证。'
    })

    const added = (await snapshotPaths(root)).filter((entry) => !before.includes(entry))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatch(/^world\/world-/)
    expect(result.document.data).toMatchObject({
      type: 'world_entry',
      title: '河港通行规则',
      role: 'constraint',
      triggers: ['河港', '通行证'],
      used_in: [{ scene: 'scene-sample', usage: '限制夜间出城' }]
    })
    expect(result.document.content).toBe('## 规则\n\n夜间通行需要凭证。\n')
  })
})

async function snapshotPaths(root: string): Promise<string[]> {
  const paths: string[] = []
  async function walk(dir: string, prefix = ''): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const relative = path.posix.join(prefix, entry.name)
      paths.push(relative)
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative)
    }
  }
  await walk(root)
  return paths.sort()
}
