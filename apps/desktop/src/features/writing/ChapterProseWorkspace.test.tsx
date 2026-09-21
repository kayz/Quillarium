import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChapterProseWorkspace, countProseCharacters } from './ChapterProseWorkspace.js'

function render(status: 'draft' | 'final' | 'published', dirty = false) {
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
      dirty={dirty}
      busy={false}
      onDocChange={() => undefined}
      onSave={async () => undefined}
      onExtractSettings={async () => undefined}
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
    expect(draft).toContain('从正文抽取设定')
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

    const dirtyDraft = render('draft', true)
    expect(dirtyDraft).toContain('请先保存正文，再从稳定快照抽取设定。')
  })

  it('counts prose characters without whitespace', () => {
    expect(countProseCharacters('甲乙。\n\n丙 丁。')).toBe(6)
  })

  it('describes deferred chapter prose write after all scenes are confirmed', () => {
    const html = render('draft')
    expect(html).toContain('节模块会在本章所有节都确认后，才把各节正文一次性写入这里')
    expect(html).not.toContain('接受某一节的成果时，系统会按节顺序写入这里')
  })
})
