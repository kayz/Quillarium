import { describe, expect, it } from 'vitest'
import { BUILTIN_UI_SKINS } from '@quillarium/core/ui-skins'
import { uiSkinCssVariables } from './ui-skin.js'

describe('ui skin CSS variables', () => {
  it('maps the structured skin to palette, typography, spacing and button variables', () => {
    const variables = uiSkinCssVariables(BUILTIN_UI_SKINS.mist)
    expect(variables['--accent']).toBe('#526d82')
    expect(variables['--interface-font']).toContain('Inter')
    expect(variables['--skin-button-radius']).toBe('999px')
    expect(variables['--skin-toolbar-justify']).toBe('flex-start')
    expect(variables['--skin-inset']).toBe('16px')
  })
})
