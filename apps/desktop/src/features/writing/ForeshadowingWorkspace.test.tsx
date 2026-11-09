import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { ForeshadowingWorkspace } from './ForeshadowingWorkspace.js'

const timeline: DocEntry = {
  path: 'timeline/opening.md',
  data: { id: 'opening', type: 'timeline_node', title: '开篇节点' },
  content: ''
}

const chapter: DocEntry = {
  path: 'outlines/chapter.md',
  data: { id: 'chapter', type: 'outline', title: '第一章', level: 'chapter' },
  content: ''
}

const thread: DocEntry = {
  path: 'foreshadowing/fleet.md',
  data: {
    id: 'fleet',
    type: 'foreshadowing',
    title: '旧舰队',
    summary: '舰队还在。',
    plant_outline_id: 'chapter',
    resolve_outline_id: null
  },
  content: ''
}

describe('ForeshadowingWorkspace', () => {
  it('edits the hidden truth and writing-tree positions', () => {
    const html = renderToStaticMarkup(
      <ForeshadowingWorkspace
        docs={[chapter, timeline, thread]}
        doc={thread}
        dirty={false}
        busy={false}
        language="zh"
        projectRoot="/work"
        onSelect={() => undefined}
        onCreate={async () => undefined}
        onDocChange={() => undefined}
        onSave={async () => undefined}
      />
    )
    expect(html).toContain('被掩盖的真相')
    expect(html).toContain('埋设位置')
    expect(html).toContain('回收位置')
    expect(html).toContain('章 · 第一章')
    expect(html).not.toContain('开篇节点')
    expect(html).toContain('管理伏笔')
  })
})
