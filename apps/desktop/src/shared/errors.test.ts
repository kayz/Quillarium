import { describe, expect, it } from 'vitest'
import { formatDesktopError } from './errors.js'

describe('formatDesktopError', () => {
  it('localizes known scene prerequisite errors', () => {
    expect(
      formatDesktopError(
        "Error invoking remote method 'scene:prepare': Error: Cannot create a chapter scene; missing location, POV character.",
        'zh'
      )
    ).toBe('生成本节前还需补充：地点、视角人物。可先创建节，再在元数据中选择。')
  })

  it('localizes the invalid volume parent error without leaking internal wording', () => {
    expect(formatDesktopError('Error: volume outline requires a parent', 'zh')).toContain('卷必须隶属于总纲')
  })

  it('distinguishes duplicate overview and book-outline errors in both languages', () => {
    expect(formatDesktopError('This project already has a book document: Sample Story 总纲', 'zh')).toBe(
      '项目已有总纲“Sample Story 总纲”。请编辑现有总纲，不能再创建第二个。'
    )
    expect(formatDesktopError('This project already has a overview document: Story purpose', 'en')).toBe(
      'This project already has the overview “Story purpose”. Edit the existing overview instead.'
    )
  })

  it('turns a stale import bridge failure into an actionable localized message', () => {
    expect(formatDesktopError('bridge.chooseImportSources is not a function', 'zh')).toBe(
      '客户端后台接口已更新。请重启 Quillarium 后重新选择文件。'
    )
    expect(
      formatDesktopError('Quillarium desktop bridge is out of date: import source picker unavailable.', 'en')
    ).toBe('The desktop bridge was updated. Restart Quillarium, then choose the file again.')
  })

  it('explains invalid story-time coordinates in the selected language', () => {
    expect(formatDesktopError('Unsupported timeline time “a long time ago”.', 'zh')).toContain(
      '例如“1449-08”'
    )
    expect(formatDesktopError('Timeline month must be between 1 and 12.', 'en')).toBe(
      'The Story time month must be between 1 and 12.'
    )
  })

  it('uses the selected interface language for otherwise unknown errors', () => {
    expect(formatDesktopError('Internal bridge implementation failed.', 'zh')).toBe(
      '操作未完成。请重试；若问题持续，请重启 Quillarium。'
    )
    expect(formatDesktopError('内部实现失败。', 'en')).toBe(
      'The operation could not be completed. Try again; if it persists, restart Quillarium.'
    )
  })
})
