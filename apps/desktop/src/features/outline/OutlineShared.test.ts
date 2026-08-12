import { describe, expect, it } from 'vitest'
import { formatStructuredFieldDraft, parseStructuredFieldDraft } from './OutlineShared.js'

describe('structured frontmatter fields', () => {
  it('round-trips arrays, nested objects, Chinese values and unknown fields', () => {
    const value = {
      阶段: '第二幕',
      nested: { flags: ['已知', '待确认'], score: 3 },
      rows: [{ scene: 'scene-1', usage: '暗示' }]
    }
    const parsed = parseStructuredFieldDraft(formatStructuredFieldDraft(value))
    expect(parsed).toEqual({ ok: true, value })
  })

  it('keeps invalid drafts out of the document value', () => {
    const parsed = parseStructuredFieldDraft('{"unfinished":')
    expect(parsed.ok).toBe(false)
  })

  it('round-trips large unknown arrays without flattening or truncation', () => {
    const value = Array.from({ length: 128 }, (_, index) => ({
      index,
      nested: { label: `条目-${index}`, flags: ['长表格', '未知字段'] }
    }))
    const parsed = parseStructuredFieldDraft(formatStructuredFieldDraft(value))
    expect(parsed).toEqual({ ok: true, value })
  })
})
