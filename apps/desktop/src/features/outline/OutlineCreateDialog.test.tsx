import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OutlineCreateDialog } from './OutlineCreateDialog.js'

describe('OutlineCreateDialog', () => {
  it('renders a named parent-aware creation flow without browser prompt syntax', () => {
    const html = renderToStaticMarkup(
      <OutlineCreateDialog
        label="篇"
        parentTitle="第一卷"
        language="zh"
        busy={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />
    )

    expect(html).toContain('新建篇')
    expect(html).toContain('创建位置')
    expect(html).toContain('第一卷')
    expect(html).toContain('创建篇')
    expect(html).toContain('role="dialog"')
  })

  it('labels manual setting creation as a no-AI action', () => {
    const html = renderToStaticMarkup(
      <OutlineCreateDialog
        label="人物"
        mode="setting"
        language="zh"
        busy={false}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />
    )

    expect(html).toContain('手工新建设定卡 · 不调用 AI')
    expect(html).toContain('新建人物')
  })
})
