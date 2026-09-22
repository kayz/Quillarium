import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import { SettingCardMediaPanel } from './SettingCardMedia.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const document: DocEntry = {
  path: 'characters/lin.md',
  data: { id: 'character-lin', type: 'character', title: '林澜' },
  content: '水手。'
}

describe('SettingCardMediaPanel', () => {
  it('hides image upload controls this slice even when chrome is on', () => {
    const html = renderToStaticMarkup(
      <SettingCardMediaPanel
        root="C:/projects/sample"
        document={document}
        dirty={false}
        onSave={async () => undefined}
        onReloadDocument={async () => undefined}
        onReloadProject={async () => undefined}
        language="zh"
      />
    )

    expect(html).toContain('创建设定卡')
    expect(html).not.toContain('上传图片')
    expect(html).not.toContain('替换图片')
    expect(html).not.toContain('尚未上传图片')
  })
})
