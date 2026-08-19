import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SettingThumbnail } from './SettingThumbnail.js'

describe('setting thumbnails', () => {
  it('prefers the stored preview and accessible alt text', () => {
    const html = renderToStaticMarkup(
      <SettingThumbnail
        preview={{ previewDataUrl: 'data:image/png;base64,AAAA', asset: { alt_text: '人物肖像' } }}
        title="林澜"
        type="character"
      />
    )
    expect(html).toContain('src="data:image/png;base64,AAAA"')
    expect(html).toContain('alt="人物肖像"')
  })

  it('uses a deterministic circle-and-initials mark only for factions without an emblem', () => {
    expect(renderToStaticMarkup(<SettingThumbnail title="海灯会" type="faction" />)).toContain('>海灯<')
    expect(renderToStaticMarkup(<SettingThumbnail title="林澜" type="character" />)).toBe('')
  })
})
