import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DocEntry, RunSummary } from '../../app/types.js'
import { ModuleView } from './ModuleView.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const noopAsync = async () => undefined
const baseProps = {
  root: 'C:/projects/sample',
  runs: [] as RunSummary[],
  onCreate: noopAsync,
  onAIPlanningCreate: vi.fn(),
  selectedTarget: null,
  onSelect: vi.fn(),
  onReload: noopAsync
}

describe('ModuleView localized summaries', () => {
  it('shows localized record types and statuses instead of storage values', () => {
    const docs: DocEntry[] = [
      {
        path: 'world/signal-tower.md',
        data: {
          id: 'world-one',
          type: 'world_entry',
          title: '烽火台',
          status: 'active'
        },
        content: '边境预警设施。'
      }
    ]
    const html = renderToStaticMarkup(<ModuleView {...baseProps} module="world" docs={docs} language="zh" />)

    expect(html).toContain('世界书 · 启用')
    expect(html).not.toContain('>active<')
  })

  it('localizes run status in both interface languages', () => {
    const runs: RunSummary[] = [
      {
        id: 'run-one',
        scene_id: 'scene-one',
        status: 'generated',
        model: 'sample-model',
        created_at: '2026-08-13T00:00:00.000Z'
      }
    ]
    const zh = renderToStaticMarkup(
      <ModuleView {...baseProps} module="runs" docs={[]} runs={runs} language="zh" />
    )
    const en = renderToStaticMarkup(
      <ModuleView {...baseProps} module="runs" docs={[]} runs={runs} language="en" />
    )

    expect(zh).toContain('已生成')
    expect(en).toContain('Generated')
  })
})
