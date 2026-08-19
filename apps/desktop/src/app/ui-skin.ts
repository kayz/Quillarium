import type { UISkinDefinitionV1, UISkinFont } from '@quillarium/core/ui-skins'

const INTERFACE_FONTS: Record<UISkinFont, string> = {
  editorial: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, serif",
  modern: "Inter, 'Segoe UI', 'Noto Sans SC', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', 'Noto Sans SC', sans-serif"
}

const PROSE_FONTS: Record<UISkinFont, string> = {
  editorial: "'PT Serif', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', Georgia, serif",
  modern: "Inter, 'Noto Sans SC', 'Segoe UI', sans-serif",
  system: "system-ui, -apple-system, 'Segoe UI', 'Noto Sans SC', sans-serif"
}

export function uiSkinCssVariables(skin: UISkinDefinitionV1): Record<string, string> {
  const spacing = {
    tight: { gap: '6px', inset: '8px', radius: '4px' },
    regular: { gap: '10px', inset: '12px', radius: '8px' },
    airy: { gap: '14px', inset: '16px', radius: '12px' }
  }[skin.layout.spacing]
  const buttonRadius = { square: '3px', soft: '8px', pill: '999px' }[skin.buttons.shape]
  const buttonHeight = skin.buttons.size === 'compact' ? '32px' : '36px'
  const toolbarJustify = { start: 'flex-start', end: 'flex-end', split: 'space-between' }[skin.layout.toolbar]
  return {
    '--bg-app': skin.palette.app,
    '--bg-panel': skin.palette.panel,
    '--bg-editor': skin.palette.editor,
    '--bg-muted': skin.palette.muted,
    '--text-main': skin.palette.text,
    '--text-muted': skin.palette.textMuted,
    '--border': skin.palette.border,
    '--accent': skin.palette.accent,
    '--accent-strong': skin.palette.accentStrong,
    '--success': skin.palette.success,
    '--warning': skin.palette.warning,
    '--danger': skin.palette.danger,
    '--chrome-bg': skin.palette.chrome,
    '--chrome-text': skin.palette.chromeText,
    '--interface-font': INTERFACE_FONTS[skin.typography.interfaceFont],
    '--prose-font': PROSE_FONTS[skin.typography.proseFont],
    '--skin-font-scale': String(skin.typography.scale),
    '--skin-gap': spacing.gap,
    '--skin-inset': spacing.inset,
    '--skin-panel-radius': spacing.radius,
    '--skin-button-radius': buttonRadius,
    '--skin-button-height': buttonHeight,
    '--skin-toolbar-justify': toolbarJustify
  }
}

export function applyUISkin(root: HTMLElement, skin: UISkinDefinitionV1): void {
  root.dataset.theme = skin.id
  root.dataset.skinNavigation = skin.layout.navigation
  root.dataset.skinDetail = skin.layout.detail
  root.dataset.skinToolbar = skin.layout.toolbar
  root.dataset.skinButtonTreatment = skin.buttons.treatment
  for (const [property, value] of Object.entries(uiSkinCssVariables(skin))) {
    root.style.setProperty(property, value)
  }
}
