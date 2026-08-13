import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { clampPaneSize, SplitHandle } from './SplitHandle.js'

describe('resizable split handles', () => {
  it('clamps pane sizes and tolerates a max smaller than the minimum', () => {
    expect(clampPaneSize(120, 180, 480)).toBe(180)
    expect(clampPaneSize(360, 180, 480)).toBe(360)
    expect(clampPaneSize(520, 180, 480)).toBe(480)
    expect(clampPaneSize(100, 180, 120)).toBe(180)
  })

  it('exposes an accessible keyboard-focusable separator', () => {
    const html = renderToStaticMarkup(
      <SplitHandle orientation="vertical" label="调整左右栏" onResize={() => undefined} />
    )
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).toContain('tabindex="0"')
  })
})
