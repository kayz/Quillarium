import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendTimelineEvent,
  createForeshadowing,
  createItem,
  createProjectAt,
  createRankHolding,
  createRankLadder,
  createWorldEntry,
  listDocs
} from './index.js'
import { readMarkdown } from './fs.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-setting-'))
  roots.push(root)
  await createProjectAt(root, { id: 'setting', title: 'Setting' })
  return root
}

describe('setting entities', () => {
  it('stores an item without an owner and does not create a foreshadowing card', async () => {
    const root = await project()
    const file = await createItem(root, '旧钥匙', {
      id: 'item-key',
      description: '铜钥匙',
      function_text: '打开城门',
      important: true
    })
    const saved = await readMarkdown<Record<string, unknown>>(file)
    expect(saved.data).toMatchObject({
      type: 'item',
      owner_id: null,
      location_id: null,
      important: true
    })
    expect(await listDocs(root, 'foreshadowing')).toEqual([])
  })

  it('stores a rank ladder and one holding for a span of time', async () => {
    const root = await project()
    await createRankLadder(root, '官阶', {
      id: 'rank-office',
      rungs: [
        { id: 'clerk', label: '书吏' },
        { id: 'magistrate', label: '县令' }
      ]
    })
    const holding = await createRankHolding(root, '林澜任书吏', {
      id: 'hold-lin',
      ladder_id: 'rank-office',
      holder_type: 'character',
      holder_id: 'char-lin',
      rung_id: 'clerk',
      starts_at: 'year-1',
      ends_at: 'year-3'
    })
    const saved = await readMarkdown<Record<string, unknown>>(holding)
    expect(saved.data.rung_id).toBe('clerk')
    expect(saved.data.holder_type).toBe('character')
  })

  it('keeps author fields on a world entry', async () => {
    const root = await project()
    const file = await createWorldEntry(root, '潮汐', {
      id: 'world-tide',
      attributes: { 历法: '随月', 禁忌: '不在涨潮时出海' }
    })
    const saved = await readMarkdown<Record<string, unknown>>(file)
    expect(saved.data.attributes).toEqual({ 历法: '随月', 禁忌: '不在涨潮时出海' })
  })

  it('keeps an incomplete event out of formal order', async () => {
    const root = await project()
    const file = await appendTimelineEvent(root, '未完成', {
      id: 'event-draft',
      characters: ['char-lin']
    })
    const saved = await readMarkdown<Record<string, unknown>>(file)
    expect(saved.data.order_state).toBe('draft')
    expect(saved.data.status).toBe('draft')
    expect(saved.data.previous).toBeNull()
    expect(saved.data.placements).toEqual([])
  })

  it('records foreshadowing plant and payoff on the writing tree', async () => {
    const root = await project()
    const file = await createForeshadowing(root, '城门钥匙', {
      id: 'fb-key',
      plant_outline_id: 'chapter-1',
      resolve_outline_id: 'chapter-4'
    })
    const saved = await readMarkdown<Record<string, unknown>>(file)
    expect(saved.data.plant_outline_id).toBe('chapter-1')
    expect(saved.data.resolve_outline_id).toBe('chapter-4')
  })
})
