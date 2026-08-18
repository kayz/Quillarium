import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createOutline, createScene, listDocs } from './documents.js'
import { readText } from './fs.js'
import { createProjectAt } from './project.js'
import { reorderStorySiblings } from './story-order.js'
import type { OutlineDoc, SceneDoc } from './types.js'

async function withProject(test: (projectRoot: string) => Promise<void>): Promise<void> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'quillarium-story-order-'))
  const projectRoot = path.join(base, 'project')
  try {
    await createProjectAt(projectRoot, { id: 'ordering-sample', title: 'Ordering sample' })
    await test(projectRoot)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
}

function expected(entries: Array<{ data: { id: string; order: number; type: string } }>) {
  return entries.map((entry) => ({
    kind: entry.data.type === 'scene' ? ('scene' as const) : ('outline' as const),
    id: entry.data.id,
    order: entry.data.order
  }))
}

describe('story sibling ordering', () => {
  it('normalizes duplicate volume order only after an explicit reorder and persists it', async () => {
    await withProject(async (root) => {
      await createOutline(root, 'book', 'Book', { id: 'book' })
      await createOutline(root, 'volume', 'Volume A', { id: 'volume-a', parent: 'book', order: 0 })
      await createOutline(root, 'volume', 'Volume B', { id: 'volume-b', parent: 'book', order: 0 })
      const before = await listDocs<OutlineDoc>(root, 'outline')
      const volumes = before.filter((item) => item.data.level === 'volume')
      expect(volumes.map((item) => item.data.order)).toEqual([0, 0])

      await reorderStorySiblings(root, {
        node: { kind: 'outline', id: 'volume-b' },
        direction: 'up',
        expected_siblings: expected(volumes)
      })

      const reloaded = (await listDocs<OutlineDoc>(root, 'outline'))
        .filter((item) => item.data.level === 'volume')
        .sort((left, right) => left.data.order - right.data.order)
      expect(reloaded.map((item) => [item.data.id, item.data.order])).toEqual([
        ['volume-b', 0],
        ['volume-a', 1]
      ])
    })
  })

  it('shares one mixed order between acts and direct chapters and rejects cross-parent moves', async () => {
    await withProject(async (root) => {
      await createOutline(root, 'book', 'Book', { id: 'book' })
      await createOutline(root, 'volume', 'Volume', { id: 'volume', parent: 'book' })
      await createOutline(root, 'part', 'Part A', { id: 'part-a', parent: 'volume' })
      await createOutline(root, 'part', 'Part B', { id: 'part-b', parent: 'volume' })
      await createOutline(root, 'act', 'Act', { id: 'act', parent: 'part-a', order: 0 })
      await createOutline(root, 'chapter', 'Direct chapter', {
        id: 'chapter-direct',
        parent: 'part-a',
        order: 1
      })
      await createOutline(root, 'chapter', 'Other chapter', {
        id: 'chapter-other',
        parent: 'part-b'
      })
      const siblings = (await listDocs<OutlineDoc>(root, 'outline')).filter(
        (item) => item.data.parent === 'part-a'
      )
      await reorderStorySiblings(root, {
        node: { kind: 'outline', id: 'chapter-direct' },
        target: { kind: 'outline', id: 'act' },
        placement: 'before',
        expected_siblings: expected(siblings)
      })
      const reordered = (await listDocs<OutlineDoc>(root, 'outline'))
        .filter((item) => item.data.parent === 'part-a')
        .sort((left, right) => left.data.order - right.data.order)
      expect(reordered.map((item) => item.data.id)).toEqual(['chapter-direct', 'act'])

      await expect(
        reorderStorySiblings(root, {
          node: { kind: 'outline', id: 'chapter-direct' },
          target: { kind: 'outline', id: 'chapter-other' },
          placement: 'before',
          expected_siblings: expected(reordered)
        })
      ).rejects.toThrow('STORY_ORDER_CROSS_PARENT')
    })
  })

  it('orders scenes, detects stale sibling state, and fully rolls back a failed write', async () => {
    await withProject(async (root) => {
      await createOutline(root, 'book', 'Book', { id: 'book' })
      await createOutline(root, 'volume', 'Volume', { id: 'volume', parent: 'book' })
      await createOutline(root, 'part', 'Part', { id: 'part', parent: 'volume' })
      await createOutline(root, 'chapter', 'Chapter', { id: 'chapter', parent: 'part' })
      await createScene(root, 'Scene A', { id: 'scene-a', chapter_id: 'chapter', order: 0 })
      await createScene(root, 'Scene B', { id: 'scene-b', chapter_id: 'chapter', order: 1 })
      await createScene(root, 'Scene C', { id: 'scene-c', chapter_id: 'chapter', order: 2 })
      const scenes = await listDocs<SceneDoc>(root, 'scene')

      await expect(
        reorderStorySiblings(root, {
          node: { kind: 'scene', id: 'scene-c' },
          direction: 'up',
          expected_siblings: expected(scenes).map((item, index) =>
            index === 0 ? { ...item, order: 99 } : item
          )
        })
      ).rejects.toThrow('STORY_ORDER_CONFLICT')

      const originals = new Map(
        await Promise.all(scenes.map(async (scene) => [scene.path, await readText(scene.path)] as const))
      )
      await expect(
        reorderStorySiblings(
          root,
          {
            node: { kind: 'scene', id: 'scene-c' },
            direction: 'up',
            expected_siblings: expected(scenes)
          },
          {
            beforeWrite: (_entry, index) => {
              if (index === 1) throw new Error('injected write failure')
            }
          }
        )
      ).rejects.toThrow('injected write failure')
      for (const [file, raw] of originals) expect(await readText(file)).toBe(raw)
    })
  })
})
