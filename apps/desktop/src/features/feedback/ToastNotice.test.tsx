import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ToastNotice, toastAutoDismissMs } from './ToastNotice.js'

describe('ToastNotice', () => {
  it('offers a localized close action', () => {
    const html = renderToStaticMarkup(
      <ToastNotice message="需要补充地点" kind="error" language="zh" onDismiss={() => undefined} />
    )
    expect(html).toContain('需要补充地点')
    expect(html).toContain('aria-label="关闭提示"')
  })

  it('keeps errors visible longer than ordinary status messages', () => {
    expect(toastAutoDismissMs('error')).toBeGreaterThan(toastAutoDismissMs('status'))
  })
})
