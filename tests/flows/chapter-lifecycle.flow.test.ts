// 状态机测试：章的生命周期。下面的模型依据 README 写成，独立于实现：
// - 章正文依次经历草稿、定稿和不可变的已发布状态；
// - 节必须按顺序接受，接受后的正文按节顺序进入章正文；
// - 只有草稿章允许 AI 生成；已发布正文永久锁定。
// fast-check 随机生成动作序列，同时在模型和真实项目上执行，每一步比较状态。
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  acceptSceneIntoChapter,
  assertChapterAllowsAI,
  assertDocumentHumanEditable,
  createOutline,
  createProjectAt,
  createScene,
  finalizeChapter,
  loadChapterLifecycle,
  publishChapter
} from '@quillarium/core'

const CHAPTER_ID = 'chapter'
const CHAPTER_TITLE = '第一章'

type Status = 'draft' | 'final' | 'published'

interface Model {
  sceneCount: number
  texts: string[]
  accepted: Set<number>
  status: Status
}

interface Real {
  root: string
}

async function createFixture(sceneCount: number): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quill-flow-'))
  await createProjectAt(root, { id: 'flow-test', title: 'Flow Test' })
  await createOutline(root, 'overview', '作品总览', { id: 'overview' })
  await createOutline(root, 'book', '总纲', { id: 'book' })
  await createOutline(root, 'volume', '第一卷', { id: 'volume', parent: 'book' })
  await createOutline(root, 'part', '第一篇', { id: 'part', parent: 'volume' })
  await createOutline(root, 'chapter', CHAPTER_TITLE, { id: CHAPTER_ID, parent: 'part' })
  for (let index = 0; index < sceneCount; index += 1) {
    await createScene(root, `第${index + 1}节`, {
      id: `scene-${index}`,
      chapter_id: CHAPTER_ID,
      section: CHAPTER_ID,
      order: index,
      timeline_node: 'timeline-opening',
      location: 'location-room',
      pov: 'character-protagonist'
    })
  }
  return root
}

/** 每个动作执行后都要成立的检查。 */
async function checkInvariants(model: Model, real: Real): Promise<void> {
  const lifecycle = await loadChapterLifecycle(real.root, CHAPTER_ID)
  expect(lifecycle.prose.data.status).toBe(model.status)

  if (model.status === 'draft') {
    await expect(assertChapterAllowsAI(real.root, CHAPTER_ID)).resolves.toBeUndefined()
  } else {
    await expect(assertChapterAllowsAI(real.root, CHAPTER_ID)).rejects.toThrow()
  }

  if (model.accepted.size === model.sceneCount) {
    expect(lifecycle.prose.content.trim()).toBe(model.texts.join(''))
  }

  if (model.status === 'published') {
    await expect(
      assertDocumentHumanEditable(real.root, lifecycle.prose.data as unknown as Record<string, unknown>)
    ).rejects.toThrow()
  }
}

class AcceptScene implements fc.AsyncCommand<Model, Real> {
  constructor(readonly index: number) {}
  check(model: Readonly<Model>): boolean {
    return this.index < model.sceneCount
  }
  async run(model: Model, real: Real): Promise<void> {
    const earlierAllAccepted = [...Array(this.index).keys()].every((i) => model.accepted.has(i))
    const allowed = model.status === 'draft' && !model.accepted.has(this.index) && earlierAllAccepted
    const attempt = acceptSceneIntoChapter(real.root, `scene-${this.index}`, model.texts[this.index])
    if (allowed) {
      await attempt
      model.accepted.add(this.index)
    } else {
      await expect(attempt).rejects.toThrow()
    }
    await checkInvariants(model, real)
  }
  toString(): string {
    return `接受第${this.index + 1}节`
  }
}

class Finalize implements fc.AsyncCommand<Model, Real> {
  check(): boolean {
    return true
  }
  async run(model: Model, real: Real): Promise<void> {
    const attempt = finalizeChapter(real.root, CHAPTER_ID)
    if (model.status === 'draft' && model.accepted.size === model.sceneCount) {
      await attempt
      model.status = 'final'
    } else if (model.status === 'final') {
      // README 没有规定对已定稿的章再次定稿的结果，只要求状态不回退。
      await attempt.catch(() => undefined)
    } else {
      await expect(attempt).rejects.toThrow()
    }
    await checkInvariants(model, real)
  }
  toString(): string {
    return '定稿'
  }
}

class Publish implements fc.AsyncCommand<Model, Real> {
  constructor(readonly confirmWithTitle: boolean) {}
  check(): boolean {
    return true
  }
  async run(model: Model, real: Real): Promise<void> {
    const attempt = publishChapter(real.root, CHAPTER_ID, this.confirmWithTitle ? CHAPTER_TITLE : '确认')
    if (model.status === 'final' && this.confirmWithTitle) {
      await attempt
      model.status = 'published'
    } else {
      await expect(attempt).rejects.toThrow()
    }
    await checkInvariants(model, real)
  }
  toString(): string {
    return this.confirmWithTitle ? '发布（输入章名确认）' : '发布（确认文字错误）'
  }
}

const sceneText = fc.string({
  unit: fc.constantFrom('山', '雨', '灯', '门', '他', '说', '，', '。'),
  minLength: 1,
  maxLength: 12
})

const commands = [
  fc.integer({ min: 0, max: 2 }).map((index) => new AcceptScene(index)),
  fc.constant(new Finalize()),
  fc.boolean().map((ok) => new Publish(ok))
]

describe('章的生命周期', () => {
  it('任意动作序列下，真实项目与模型保持一致', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(sceneText, { minLength: 1, maxLength: 3 }),
        fc.commands(commands, { maxCommands: 12 }),
        async (texts, cmds) => {
          const root = await createFixture(texts.length)
          try {
            const setup = () => ({
              model: {
                sceneCount: texts.length,
                texts,
                accepted: new Set<number>(),
                status: 'draft' as Status
              },
              real: { root }
            })
            await fc.asyncModelRun(setup, cmds)
          } finally {
            await rm(root, { recursive: true, force: true }).catch(() => undefined)
          }
        }
      ),
      { numRuns: 25 }
    )
  }, 120_000)
})
