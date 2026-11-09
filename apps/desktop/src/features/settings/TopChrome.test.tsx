import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsModal, TopChrome } from './TopChrome.js'

vi.mock('../../app/bridge.js', () => ({ bridge: {} }))

const defaultAIStatus = {
  ready: true,
  prose: true,
  background: true,
  check: true
}

describe('TopChrome and SettingsModal (AG-1)', () => {
  it('renders separate Agent and Settings entry pills in TopChrome', () => {
    const html = renderToStaticMarkup(
      <TopChrome
        theme="paper"
        density="comfortable"
        language="zh"
        aiStatus={defaultAIStatus}
        onTheme={() => undefined}
        onDensity={() => undefined}
        onLanguage={() => undefined}
        onSkinPreferences={() => undefined}
        onAIStatus={() => undefined}
        root="C:/projects/sample"
        projectName="潮生记"
      />
    )

    expect(html).toContain('Agent · AI 已配置')
    expect(html).toContain('设置')
  })

  it('shows appearance and work capabilities in mode="settings" without mixing AI provider config', () => {
    const html = renderToStaticMarkup(
      <SettingsModal
        mode="settings"
        root="C:/projects/sample"
        git={null}
        theme="paper"
        density="comfortable"
        language="zh"
        onTheme={() => undefined}
        onDensity={() => undefined}
        onLanguage={() => undefined}
        onSkinPreferences={() => undefined}
        onAIStatus={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(html).toContain('界面皮肤')
    expect(html).toContain('章节树')
    expect(html).toContain('展示层')
    expect(html).not.toContain('写作预设')
    expect(html).not.toContain('公共提示词 · 本书生文头部提示词')
    expect(html).not.toContain('生图凭证')
  })

  it('shows WritingPreset, book generation header, and AI profiles in mode="agent" without appearance settings', () => {
    const html = renderToStaticMarkup(
      <SettingsModal
        mode="agent"
        root="C:/projects/sample"
        git={null}
        theme="paper"
        density="comfortable"
        language="zh"
        onTheme={() => undefined}
        onDensity={() => undefined}
        onLanguage={() => undefined}
        onSkinPreferences={() => undefined}
        onAIStatus={() => undefined}
        onClose={() => undefined}
      />
    )

    expect(html).toContain('写作预设')
    expect(html).toContain('公共提示词 · 本书生文头部提示词')
    expect(html).toContain('生图凭证')
    expect(html).not.toContain('界面皮肤')
    expect(html).not.toContain('章节树')
  })
})
