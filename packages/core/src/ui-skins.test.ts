import { describe, expect, it } from 'vitest'
import {
  BUILTIN_UI_SKINS,
  normalizeUIAppearanceInput,
  normalizeUISkinDefinition,
  resolveUISkin,
  withUISkinCustomization,
  withoutUISkinCustomization
} from './ui-skins.js'

describe('UI skins', () => {
  it('keeps the four legacy theme ids as full product skins', () => {
    expect(Object.keys(BUILTIN_UI_SKINS)).toEqual(['paper', 'ink', 'mist', 'bamboo'])
    expect(BUILTIN_UI_SKINS.mist.layout.navigation).toBe('right')
    expect(BUILTIN_UI_SKINS.bamboo.layout.detail).toBe('left')
    expect(BUILTIN_UI_SKINS.ink.buttons.shape).toBe('square')
  })

  it('bounds unsafe or malformed customization values', () => {
    const skin = normalizeUISkinDefinition(
      {
        name: '  My\u0000 skin  ',
        palette: { accent: 'url(file:///secret)', text: '#AABBCC' },
        typography: { scale: 99, interfaceFont: 'remote-font' },
        layout: { navigation: 'floating' },
        buttons: { shape: 'pill' }
      },
      'paper'
    )
    expect(skin.name).toBe('My skin')
    expect(skin.palette.accent).toBe(BUILTIN_UI_SKINS.paper.palette.accent)
    expect(skin.palette.text).toBe('#aabbcc')
    expect(skin.typography.scale).toBe(1.15)
    expect(skin.typography.interfaceFont).toBe(BUILTIN_UI_SKINS.paper.typography.interfaceFont)
    expect(skin.layout.navigation).toBe('left')
    expect(skin.buttons.shape).toBe('pill')
  })

  it('resolves, persists and resets one slot without rewriting the others', () => {
    const paper = { ...BUILTIN_UI_SKINS.paper, name: 'My paper' }
    const ink = { ...BUILTIN_UI_SKINS.ink, name: 'My ink' }
    const withPaper = withUISkinCustomization(undefined, paper)
    const withBoth = withUISkinCustomization(withPaper, ink)
    expect(resolveUISkin('paper', withBoth).name).toBe('My paper')
    expect(resolveUISkin('ink', withBoth).name).toBe('My ink')
    const resetPaper = withoutUISkinCustomization(withBoth, 'paper')
    expect(resolveUISkin('paper', resetPaper).name).toBe(BUILTIN_UI_SKINS.paper.name)
    expect(resolveUISkin('ink', resetPaper).name).toBe('My ink')
    expect(
      resolveUISkin('paper', {
        schema_version: 2,
        customizations: { paper }
      } as never).name
    ).toBe(BUILTIN_UI_SKINS.paper.name)
  })

  it('normalizes the complete appearance request at the trusted boundary', () => {
    const input = normalizeUIAppearanceInput({
      theme: 'mist',
      density: 'compact',
      language: 'zh',
      skin: { ...BUILTIN_UI_SKINS.mist, name: '  Custom mist  ' }
    })
    expect(input).toMatchObject({
      theme: 'mist',
      density: 'compact',
      language: 'zh',
      resetSkin: false,
      skin: { id: 'mist', name: 'Custom mist' }
    })
    expect(() => normalizeUIAppearanceInput({ theme: 'paper', density: 'wide', language: 'zh' })).toThrow(
      /density/
    )
  })
})
