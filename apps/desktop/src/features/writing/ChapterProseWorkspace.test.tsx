import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChapterProseWorkspace, countProseCharacters } from './ChapterProseWorkspace.js'

function render(status: 'draft' | 'final' | 'published') {
  return renderToStaticMarkup(
    <ChapterProseWorkspace
      chapterTitle="第一章"
      chapterId="chapter-one"
      root="C:/fixture"
      doc={{
        path: 'chapters/prose.md',
        data: { id: 'prose-one', type: 'chapter_prose', title: '第一章 正文', status },
        content: '第一段正文。\n\n第二段正文。'
      }}
      targetWords={3000}
      dirty={false}
      busy={false}
      onDocChange={() => undefined}
      onSave={async () => undefined}
      onFinalize={async () => undefined}
      onPublish={async () => undefined}
      onContinuityApplied={async () => undefined}
      language="zh"
    />
  )
}

describe('ChapterProseWorkspace', () => {
  it('provides a plain-text author editor and forward status actions', () => {
    const draft = render('draft')
    expect(draft).toContain('正文 · 纯文字')
    expect(draft).toContain('定稿')
    expect(draft).not.toContain('发布并清理节产物')
    expect(draft).toContain('aria-label="章正文纯文字编辑区"')
    expect(draft).not.toContain('readOnly')

    const final = render('final')
    expect(final).toContain('发布并清理节产物')
    expect(final).toContain('定稿反查与回写')
    expect(final).toContain('仅允许作者小幅修改')

    const published = render('published')
    expect(published).toContain('已发布，永久锁定')
    expect(published).toMatch(/readonly/i)
  })

  it('counts prose characters without whitespace', () => {
    expect(countProseCharacters('甲乙。\n\n丙 丁。')).toBe(6)
  })
})
