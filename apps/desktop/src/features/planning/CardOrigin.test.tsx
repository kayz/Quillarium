import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))
import { PlanningCreationDialog } from './PlanningCreationDialog.js'
import { CardOriginDialog } from '../import/CardOriginDialog.js'

describe('card origin workflows', () => {
  it('renders the planning editor in a session-restorable shape', () => {
    const html = renderToStaticMarkup(
      <PlanningCreationDialog
        root="C:\\project"
        module="world"
        sessionId="planning-session"
        language="zh"
        onClose={() => undefined}
        onCreated={() => undefined}
      />
    )
    expect(html).toContain('AI 对话式建档')
    expect(html).toContain('建档讨论消息')
    expect(html).toContain('结构化字段与 Markdown 正文')
  })

  it('renders source discovery and single-card reimport controls', () => {
    const html = renderToStaticMarkup(
      <CardOriginDialog
        root="C:\\project"
        doc={{
          path: 'C:\\project\\world\\entry.md',
          data: { id: 'world-entry', type: 'world_entry', title: '边境通行规则', status: 'active' },
          content: '## 规则'
        }}
        language="zh"
        onClose={() => undefined}
        onReimported={() => undefined}
      />
    )
    expect(html).toContain('导入来源')
    expect(html).toContain('只重新提取这一张')
    expect(html).toContain('正在核验源文件')
  })
})
