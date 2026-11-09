import { describe, expect, it } from 'vitest'
import { parseWritingReferenceDraft } from './writing-reference.js'

describe('writing reference drafts', () => {
  it('reads a title and body and ignores text around the JSON', () => {
    expect(parseWritingReferenceDraft('草稿如下\n{"title":"短句","content":"一句一事。"}\n完')).toEqual({
      title: '短句',
      content: '一句一事。'
    })
  })

  it('rejects a draft that has no body', () => {
    expect(parseWritingReferenceDraft('{"title":"短句","content":"  "}')).toBeNull()
    expect(parseWritingReferenceDraft('不是 JSON')).toBeNull()
  })
})
