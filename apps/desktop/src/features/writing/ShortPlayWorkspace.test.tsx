import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ShortPlayWorkspace } from './ShortPlayWorkspace.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

describe('ShortPlayWorkspace (ST-12, ST-13, ST-14, IO-8)', () => {
  it('renders short-play studio header and sub-tabs for settings, assets, storyboard, and export', () => {
    const html = renderToStaticMarkup(
      <ShortPlayWorkspace
        root="C:/projects/sample"
        data={{
          docs: []
        }}
        language="zh"
      />
    )

    expect(html).toContain('剧本与分镜工作台')
    expect(html).toContain('short-play/')
    expect(html).toContain('剧本设定')
    expect(html).toContain('剧本资产')
    expect(html).toContain('分镜拆分')
    expect(html).toContain('提示词导出')
  })
})
