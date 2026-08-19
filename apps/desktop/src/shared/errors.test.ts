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

  it('explains incomplete AI import output in the selected language', () => {
    expect(formatDesktopError('AI_IMPORT_INVALID_RESPONSE: incomplete JSON', 'zh')).toContain(
      '拆分结果不完整'
    )
    expect(formatDesktopError('AI_IMPORT_INVALID_RESPONSE: incomplete JSON', 'en')).toContain(
      'Nothing was imported'
    )
  })

  it('explains setting-image format, conflict, and path failures', () => {
    expect(formatDesktopError('SETTING_IMAGE_TYPE_MISMATCH', 'zh')).toContain('PNG、JPEG 或 WebP')
    expect(formatDesktopError('SETTING_IMAGE_DOCUMENT_HASH_CONFLICT', 'en')).toContain('Nothing was written')
    expect(formatDesktopError('SETTING_IMAGE_SYMLINK_FORBIDDEN', 'zh')).toContain('安全资产目录')
  })

  it('shows provider truncation details verbatim even in the Chinese interface', () => {
    const message = 'AI_OUTPUT_TRUNCATED: deepseek stopped with finish_reason=length at max_tokens=2000.'
    expect(formatDesktopError(message, 'zh')).toBe(message)
  })

  it('explains invalid story-time coordinates in the selected language', () => {
    expect(formatDesktopError('Unsupported timeline time “a long time ago”.', 'zh')).toContain('第1周周二')
    expect(formatDesktopError('Timeline month must be between 1 and 12.', 'en')).toBe(
      'The Story time month must be between 1 and 12.'
    )
  })

  it('explains planning type migration conflicts without hiding the retained original', () => {
    expect(
      formatDesktopError('Planning card type migration target already exists: location-card.md', 'zh')
    ).toContain('原卡片仍然保留')
    expect(
      formatDesktopError('Planning card type migration failed and rollback was incomplete.', 'en')
    ).toContain('diagnostic log')
  })

  it('localizes missing and incompatible writing presets with an actionable next step', () => {
    expect(formatDesktopError('Writing preset not found: focused.', 'zh')).toBe(
      '找不到写作预设“focused”。请在设置中选择已有预设，或创建默认预设。'
    )
    expect(formatDesktopError('No writing preset is selected.', 'en')).toBe(
      'No writing preset is selected. Select an existing preset or create the default in Settings.'
    )
    expect(formatDesktopError('Unsupported writing preset schema_version 9 for focused.', 'zh')).toBe(
      '所选写作预设来自不兼容的版本。请先迁移该预设，再进行生成。'
    )
  })

  it('localizes finalization conflicts and rollback outcomes', () => {
    expect(formatDesktopError('Finalization source changed after review: chapter-one', 'zh')).toContain(
      '重新生成定稿反查'
    )
    expect(
      formatDesktopError(
        'Finalization apply failed and was rolled back. Audit: reviews/apply/attempt.json.',
        'zh'
      )
    ).toContain('所有目标和反查状态已恢复')
    expect(
      formatDesktopError('Finalization review still has open decisions: 1 impacts, 0 questions.', 'en')
    ).toBe('Resolve every open impact and question before applying this final review.')
  })

  it('uses the selected interface language for otherwise unknown errors', () => {
    expect(formatDesktopError('Internal bridge implementation failed.', 'zh')).toBe(
      '操作未完成。请重试；若问题持续，请重启 Quillarium。'
    )
    expect(formatDesktopError('内部实现失败。', 'en')).toBe(
      'The operation could not be completed. Try again; if it persists, restart Quillarium.'
    )
  })

  it('localizes story-order conflicts and scope violations', () => {
    expect(formatDesktopError('STORY_ORDER_CONFLICT: sibling order changed', 'zh')).toContain(
      '没有覆盖新内容'
    )
    expect(formatDesktopError('STORY_ORDER_CROSS_PARENT: rejected', 'en')).toContain('one parent')
  })

  it('localizes creator-assistant context, permission, and structured-output errors', () => {
    expect(formatDesktopError('Error: AGENT_AI_NOT_CONFIGURED', 'zh')).toContain('AI 配置')
    expect(formatDesktopError('SENSITIVE_PROMPT_CONTENT: author-input:credential', 'zh')).toContain(
      '落盘和调用 AI 前停止'
    )
    expect(
      formatDesktopError('Required context source is missing or unreadable: canon:rule', 'zh')
    ).toContain('缺少必需资料')
    expect(formatDesktopError('AGENT_PERMISSION_DENIED: cannot propose issue', 'en')).toContain('not allowed')
    expect(
      formatDesktopError('Structured AI response still failed validation after one repair attempt.', 'zh')
    ).toContain('一次修复')
    expect(formatDesktopError('AGENT_EXECUTION_SNAPSHOT_CONFIGURATION_MISMATCH', 'zh')).toContain('运行快照')
  })

  it('localizes typed Agent provider failures without hiding the actionable cause', () => {
    expect(formatDesktopError('AGENT_PROVIDER_AUTH_FAILED: unauthorized', 'zh')).toContain('API Key')
    expect(formatDesktopError('AGENT_PROVIDER_RATE_LIMITED: 429', 'zh')).toContain('限流')
    expect(formatDesktopError('AGENT_PROVIDER_TIMEOUT: request timed out', 'en')).toContain('timed out')
    expect(formatDesktopError('AGENT_PROVIDER_TRANSPORT_FAILED: socket closed', 'zh')).toContain('模型服务')
  })
})
