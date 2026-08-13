import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EditableDocumentTitle } from './EditableDocumentTitle.js'

describe('EditableDocumentTitle', () => {
  it('renders the document name as a prominent editable field', () => {
    const html = renderToStaticMarkup(
      <EditableDocumentTitle value="第一卷" language="zh" onChange={() => undefined} />
    )

    expect(html).toContain('aria-label="文档名称"')
    expect(html).toContain('value="第一卷"')
    expect(html).toContain('名称')
    expect(html).toContain('用户在列表和引用中看到的名称。')
    expect(html).toContain('可修改')
  })

  it('uses English title copy and explanation in the English interface', () => {
    const html = renderToStaticMarkup(
      <EditableDocumentTitle value="First volume" language="en" onChange={() => undefined} />
    )

    expect(html).toContain('Name')
    expect(html).toContain('The name shown in lists and references.')
    expect(html).toContain('Editable')
  })

  it('explains why an empty name cannot be saved', () => {
    const html = renderToStaticMarkup(
      <EditableDocumentTitle value="" language="zh" onChange={() => undefined} />
    )

    expect(html).toContain('名称不能为空，填写后再保存。')
  })
})
