import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FileDropIntentDialog, pathsFromDroppedFiles } from './FileDropIntentDialog.js'

describe('FileDropIntentDialog', () => {
  it('deduplicates stable local paths resolved by the Electron bridge', () => {
    const first = { name: 'world.md' }
    const second = { name: 'people.txt' }
    const resolver = vi.fn((file: unknown) =>
      file === first ? 'C:/notes/world.md' : file === second ? 'C:/notes/people.txt' : ''
    )

    expect(pathsFromDroppedFiles([first, second, first], resolver)).toEqual([
      'C:/notes/world.md',
      'C:/notes/people.txt'
    ])
  })

  it('fails clearly when the running preload is too old for file drops', () => {
    expect(() => pathsFromDroppedFiles([{ name: 'world.md' }])).toThrow(/bridge is out of date/u)
  })

  it('requires an explicit reference or setting-import choice before writing', () => {
    const html = renderToStaticMarkup(
      <FileDropIntentDialog
        sourcePaths={['C:/notes/world.md', 'C:/notes/people.txt']}
        language="zh"
        onReference={async () => undefined}
        onSettingImport={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(html).toContain('文件已接收 · 尚未写入')
    expect(html).toContain('作为参考文档')
    expect(html).toContain('不自动调用 AI')
    expect(html).toContain('导入设定')
    expect(html).toContain('逐张校对确认后才写入')
    expect(html).not.toContain('C:/notes')
  })
})
