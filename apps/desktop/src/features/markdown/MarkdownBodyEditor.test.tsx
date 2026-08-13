import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownBodyEditor } from './MarkdownBodyEditor.js'

describe('MarkdownBodyEditor', () => {
  it('uses one body frame with source and preview modes instead of two simultaneous panes', () => {
    const html = renderToStaticMarkup(
      <MarkdownBodyEditor value="# Heading\n\nBody" onChange={() => undefined} language="zh" />
    )

    expect(html).toContain('aria-label="正文显示模式"')
    expect(html).toContain('源码')
    expect(html).toContain('预览')
    expect(html.match(/<textarea/g) ?? []).toHaveLength(1)
    expect(html).not.toContain('detail-markdown-preview')
  })
})
