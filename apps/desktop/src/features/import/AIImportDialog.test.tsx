import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AIImportDialog, chooseAIImportSources } from './AIImportDialog.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

describe('AIImportDialog', () => {
  it('starts with source material instead of a Markdown syntax form', () => {
    const html = renderToStaticMarkup(
      <AIImportDialog
        root="C:/project"
        docs={[]}
        language="zh"
        onClose={() => undefined}
        onImported={async () => undefined}
      />
    )

    expect(html).toContain('输入材料 → AI 拆分 → 人工校对 → 确认写入')
    expect(html).toContain('粘贴大段文字')
    expect(html).toContain('选择文件')
    expect(html).toContain('交给 AI 拆分')
    expect(html).not.toContain('语法检查')
  })

  it('uses the bounded secondary action style for the optional assistant handoff', () => {
    const html = renderToStaticMarkup(
      <AIImportDialog
        root="C:/project"
        docs={[]}
        language="zh"
        onClose={() => undefined}
        onImported={async () => undefined}
        onOpenAssistant={() => undefined}
      />
    )

    expect(html).toContain('class="secondary ai-import-assistant-action"')
    expect(html).toContain('先与设定整理助手讨论')
  })

  it('opens dropped files directly in file-import mode without starting the analysis', () => {
    const html = renderToStaticMarkup(
      <AIImportDialog
        root="C:/project"
        docs={[]}
        language="zh"
        initialSourcePaths={['C:/notes/人物.md', 'C:/notes/地点.txt']}
        onClose={() => undefined}
        onImported={async () => undefined}
      />
    )

    expect(html).toContain('人物.md')
    expect(html).toContain('地点.txt')
    expect(html).toContain('交给 AI 拆分')
    expect(html).not.toContain('placeholder="粘贴人物小传')
  })

  it('uses the typed import-source picker when the preload bridge is current', async () => {
    const chooseImportSources = vi.fn(async () => ['C:/notes/story.md'])

    await expect(chooseAIImportSources({ chooseImportSources })).resolves.toEqual(['C:/notes/story.md'])
    expect(chooseImportSources).toHaveBeenCalledOnce()
  })

  it('reports an actionable bridge-version failure instead of a raw TypeError', async () => {
    await expect(chooseAIImportSources({})).rejects.toThrow(
      'Quillarium desktop bridge is out of date: import source picker unavailable.'
    )
  })
})
