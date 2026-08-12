import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarkdownPreview } from './MarkdownPreview.js'

describe('MarkdownPreview', () => {
  it('renders Chinese, tables, nested lists, links, quotes and fenced code', () => {
    const markdown = [
      '# 中文标题',
      '',
      '> 引用段落',
      '',
      '- 第一层',
      '  - 第二层',
      '',
      '| 字段 | 内容 | 很长的补充列 |',
      '| --- | --- | --- |',
      '| 人物 | 林舟 | 这是一段用于测试横向滚动的长文本 |',
      '',
      '[安全链接](https://example.com)',
      '',
      '```ts',
      'const answer = 42',
      '```'
    ].join('\n')
    const html = renderToStaticMarkup(<MarkdownPreview content={markdown} />)
    expect(html).toContain('<h1>中文标题</h1>')
    expect(html).toContain('<blockquote>')
    expect(html.match(/<ul>/g)?.length).toBe(2)
    expect(html).toContain('<table>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('<pre><code class="language-ts">')
  })

  it('does not execute raw HTML or unsafe links', () => {
    const html = renderToStaticMarkup(
      <MarkdownPreview content={'<script>alert(1)</script>\n\n[bad](javascript:alert(1))'} />
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
  })

  it('renders a long GFM table without dropping rows', () => {
    const rows = Array.from({ length: 80 }, (_, index) => `| ${index} | 中文行 ${index} |`)
    const markdown = ['| 序号 | 内容 |', '| ---: | --- |', ...rows].join('\n')
    const html = renderToStaticMarkup(<MarkdownPreview content={markdown} />)
    expect(html).toContain('<table>')
    expect(html.match(/<tr>/g)?.length).toBe(81)
    expect(html).toContain('中文行 79')
  })
})
