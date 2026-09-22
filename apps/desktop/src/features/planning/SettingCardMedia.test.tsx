import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DocEntry } from '../../app/types.js'
import {
  defaultDisplayImagePrompt,
  nextDisplayImagePrompt,
  SettingCardMediaPanel
} from './SettingCardMedia.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const document: DocEntry = {
  path: 'characters/lin.md',
  data: { id: 'character-lin', type: 'character', title: '林澜' },
  content: '水手。'
}

describe('nextDisplayImagePrompt', () => {
  it('keeps a custom prompt when title and content change on the same card', () => {
    const custom = 'custom prompt for generation'
    expect(
      nextDisplayImagePrompt({
        previousCardId: 'character-lin',
        cardId: 'character-lin',
        title: 'Updated title',
        content: 'Updated body text.',
        currentPrompt: custom
      })
    ).toBe(custom)
  })

  it('reseeds from title and excerpt when the card id changes', () => {
    expect(
      nextDisplayImagePrompt({
        previousCardId: 'character-lin',
        cardId: 'character-mei',
        title: '梅雪',
        content: '学者。',
        currentPrompt: 'custom prompt for generation'
      })
    ).toBe(defaultDisplayImagePrompt('梅雪', '学者。'))
  })
})

describe('SettingCardMediaPanel', () => {
  it('shows upload and generate controls when display chrome is on without writing card image', () => {
    const html = renderToStaticMarkup(
      <SettingCardMediaPanel
        root="C:/projects/sample"
        document={document}
        dirty={false}
        onSave={async () => undefined}
        onReloadDocument={async () => undefined}
        onReloadProject={async () => undefined}
        language="zh"
        showImageChrome
      />
    )

    expect(html).toContain('创建设定卡')
    expect(html).toContain('上传图片')
    expect(html).toContain('生成配图')
    expect(html).toContain('确认保存')
    expect(html).toContain('取消')
    expect(html).toContain('林澜')
    expect(html).toContain('水手。')
    expect(html).not.toContain('name="image"')
    expect(html).not.toMatch(/data-image-field/u)
  })

  it('hides upload and generate controls when display chrome is off', () => {
    const html = renderToStaticMarkup(
      <SettingCardMediaPanel
        root="C:/projects/sample"
        document={document}
        dirty={false}
        onSave={async () => undefined}
        onReloadDocument={async () => undefined}
        onReloadProject={async () => undefined}
        language="zh"
        showImageChrome={false}
      />
    )

    expect(html).toContain('创建设定卡')
    expect(html).not.toContain('上传图片')
    expect(html).not.toContain('生成配图')
    expect(html).not.toContain('确认保存')
  })

  it('offers the HTML designer for allowlist types beyond world_entry/character/location/character_relation', () => {
    for (const type of ['canon', 'faction', 'timeline_event', 'narrative'] as const) {
      const html = renderToStaticMarkup(
        <SettingCardMediaPanel
          root="C:/projects/sample"
          document={{
            path: `${type}/sample.md`,
            data: { id: `${type}-sample`, type, title: '样本卡' },
            content: ''
          }}
          dirty={false}
          onSave={async () => undefined}
          onReloadDocument={async () => undefined}
          onReloadProject={async () => undefined}
          language="en"
        />
      )
      expect(html, type).toContain('Design card')
      expect(html, type).toContain('setting-media-panel')
    }
  })

  it('hides designer chrome for document types outside the setting-card allowlist', () => {
    const html = renderToStaticMarkup(
      <SettingCardMediaPanel
        root="C:/projects/sample"
        document={{
          path: 'story/scene.md',
          data: { id: 'scene-one', type: 'scene', title: '第一场' },
          content: ''
        }}
        dirty={false}
        onSave={async () => undefined}
        onReloadDocument={async () => undefined}
        onReloadProject={async () => undefined}
        language="en"
      />
    )
    expect(html).toBe('')
  })
})
