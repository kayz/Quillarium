export const UI_SKIN_IDS = ['paper', 'ink', 'mist', 'bamboo'] as const

export type UISkinId = (typeof UI_SKIN_IDS)[number]
export type UIDensity = 'compact' | 'comfortable'
export type UILanguage = 'zh' | 'en'
export type UISkinFont = 'editorial' | 'modern' | 'system'
export type UISkinNavigationPosition = 'left' | 'right'
export type UISkinDetailPosition = 'left' | 'right'
export type UISkinToolbarAlignment = 'start' | 'end' | 'split'
export type UISkinSpacing = 'tight' | 'regular' | 'airy'
export type UISkinButtonShape = 'square' | 'soft' | 'pill'
export type UISkinButtonTreatment = 'solid' | 'tonal' | 'outline'
export type UISkinButtonSize = 'compact' | 'regular'

export interface UISkinPaletteV1 {
  app: string
  panel: string
  editor: string
  muted: string
  text: string
  textMuted: string
  border: string
  accent: string
  accentStrong: string
  success: string
  warning: string
  danger: string
  chrome: string
  chromeText: string
}

export interface UISkinDefinitionV1 {
  schema_version: 1
  id: UISkinId
  name: string
  palette: UISkinPaletteV1
  typography: {
    interfaceFont: UISkinFont
    proseFont: UISkinFont
    scale: number
  }
  layout: {
    navigation: UISkinNavigationPosition
    detail: UISkinDetailPosition
    toolbar: UISkinToolbarAlignment
    spacing: UISkinSpacing
  }
  buttons: {
    shape: UISkinButtonShape
    treatment: UISkinButtonTreatment
    size: UISkinButtonSize
  }
}

/** User-owned definitions for the four compatible built-in skin slots. */
export interface UISkinPreferencesV1 {
  schema_version: 1
  customizations?: Partial<Record<UISkinId, UISkinDefinitionV1>>
}

export interface UIAppearanceInputV1 {
  theme: UISkinId
  density: UIDensity
  language: UILanguage
  skin: UISkinDefinitionV1
  /** Removes the persisted customization for `theme` and restores its product default. */
  resetSkin?: boolean
}

export const BUILTIN_UI_SKINS: Readonly<Record<UISkinId, UISkinDefinitionV1>> = {
  paper: {
    schema_version: 1,
    id: 'paper',
    name: '稿纸 Manuscript',
    palette: {
      app: '#f2eee6',
      panel: '#fbf8f1',
      editor: '#fffdf7',
      muted: '#eee7d9',
      text: '#2f2a22',
      textMuted: '#776f63',
      border: '#ddd4c4',
      accent: '#a77a35',
      accentStrong: '#8a642a',
      success: '#5d8a57',
      warning: '#c99031',
      danger: '#b85a4d',
      chrome: '#25211c',
      chromeText: '#f5ead8'
    },
    typography: { interfaceFont: 'modern', proseFont: 'editorial', scale: 1 },
    layout: { navigation: 'left', detail: 'right', toolbar: 'split', spacing: 'regular' },
    buttons: { shape: 'soft', treatment: 'solid', size: 'regular' }
  },
  ink: {
    schema_version: 1,
    id: 'ink',
    name: '夜航 Night Ink',
    palette: {
      app: '#191817',
      panel: '#23211f',
      editor: '#1f1d1b',
      muted: '#2f2c28',
      text: '#eee7da',
      textMuted: '#a69c8e',
      border: '#3d3832',
      accent: '#c99a51',
      accentStrong: '#e0b56a',
      success: '#7fb06c',
      warning: '#d0a04b',
      danger: '#d16b60',
      chrome: '#0f0e0d',
      chromeText: '#f5ead8'
    },
    typography: { interfaceFont: 'system', proseFont: 'editorial', scale: 0.96 },
    layout: { navigation: 'left', detail: 'right', toolbar: 'end', spacing: 'tight' },
    buttons: { shape: 'square', treatment: 'tonal', size: 'compact' }
  },
  mist: {
    schema_version: 1,
    id: 'mist',
    name: '蓝图 Studio Mist',
    palette: {
      app: '#eef0ef',
      panel: '#fafafa',
      editor: '#ffffff',
      muted: '#e3e7e5',
      text: '#252a2c',
      textMuted: '#687174',
      border: '#d3d8d8',
      accent: '#526d82',
      accentStrong: '#344c5e',
      success: '#5b8b76',
      warning: '#b8893a',
      danger: '#b65b55',
      chrome: '#22313b',
      chromeText: '#f4f8fa'
    },
    typography: { interfaceFont: 'modern', proseFont: 'modern', scale: 1 },
    layout: { navigation: 'right', detail: 'right', toolbar: 'start', spacing: 'airy' },
    buttons: { shape: 'pill', treatment: 'outline', size: 'regular' }
  },
  bamboo: {
    schema_version: 1,
    id: 'bamboo',
    name: '竹简 Bamboo Ledger',
    palette: {
      app: '#eef2e7',
      panel: '#fbfcf6',
      editor: '#fffef8',
      muted: '#e3ead8',
      text: '#273025',
      textMuted: '#68725f',
      border: '#d4ddc7',
      accent: '#637f45',
      accentStrong: '#486334',
      success: '#5d8a57',
      warning: '#b58b35',
      danger: '#ad5d52',
      chrome: '#243126',
      chromeText: '#f0f3e8'
    },
    typography: { interfaceFont: 'editorial', proseFont: 'editorial', scale: 1.04 },
    layout: { navigation: 'left', detail: 'left', toolbar: 'split', spacing: 'regular' },
    buttons: { shape: 'soft', treatment: 'tonal', size: 'regular' }
  }
}

export function isUISkinId(value: unknown): value is UISkinId {
  return typeof value === 'string' && (UI_SKIN_IDS as readonly string[]).includes(value)
}

export function normalizeUIAppearanceInput(value: unknown): UIAppearanceInputV1 {
  if (!isRecord(value) || !isUISkinId(value.theme)) {
    throw new Error('INVALID_UI_APPEARANCE: a compatible skin id is required.')
  }
  if (value.density !== 'compact' && value.density !== 'comfortable') {
    throw new Error('INVALID_UI_APPEARANCE: density must be compact or comfortable.')
  }
  if (value.language !== 'zh' && value.language !== 'en') {
    throw new Error('INVALID_UI_APPEARANCE: language must be zh or en.')
  }
  return {
    theme: value.theme,
    density: value.density,
    language: value.language,
    skin: normalizeUISkinDefinition(value.skin, value.theme),
    resetSkin: value.resetSkin === true
  }
}

export function normalizeUISkinDefinition(value: unknown, id: UISkinId): UISkinDefinitionV1 {
  const fallback = BUILTIN_UI_SKINS[id]
  if (!isRecord(value)) return cloneUISkin(fallback)
  const palette = isRecord(value.palette) ? value.palette : {}
  const typography = isRecord(value.typography) ? value.typography : {}
  const layout = isRecord(value.layout) ? value.layout : {}
  const buttons = isRecord(value.buttons) ? value.buttons : {}
  return {
    schema_version: 1,
    id,
    name: safeName(value.name, fallback.name),
    palette: {
      app: safeHex(palette.app, fallback.palette.app),
      panel: safeHex(palette.panel, fallback.palette.panel),
      editor: safeHex(palette.editor, fallback.palette.editor),
      muted: safeHex(palette.muted, fallback.palette.muted),
      text: safeHex(palette.text, fallback.palette.text),
      textMuted: safeHex(palette.textMuted, fallback.palette.textMuted),
      border: safeHex(palette.border, fallback.palette.border),
      accent: safeHex(palette.accent, fallback.palette.accent),
      accentStrong: safeHex(palette.accentStrong, fallback.palette.accentStrong),
      success: safeHex(palette.success, fallback.palette.success),
      warning: safeHex(palette.warning, fallback.palette.warning),
      danger: safeHex(palette.danger, fallback.palette.danger),
      chrome: safeHex(palette.chrome, fallback.palette.chrome),
      chromeText: safeHex(palette.chromeText, fallback.palette.chromeText)
    },
    typography: {
      interfaceFont: enumValue(
        typography.interfaceFont,
        ['editorial', 'modern', 'system'],
        fallback.typography.interfaceFont
      ),
      proseFont: enumValue(
        typography.proseFont,
        ['editorial', 'modern', 'system'],
        fallback.typography.proseFont
      ),
      scale: safeScale(typography.scale, fallback.typography.scale)
    },
    layout: {
      navigation: enumValue(layout.navigation, ['left', 'right'], fallback.layout.navigation),
      detail: enumValue(layout.detail, ['left', 'right'], fallback.layout.detail),
      toolbar: enumValue(layout.toolbar, ['start', 'end', 'split'], fallback.layout.toolbar),
      spacing: enumValue(layout.spacing, ['tight', 'regular', 'airy'], fallback.layout.spacing)
    },
    buttons: {
      shape: enumValue(buttons.shape, ['square', 'soft', 'pill'], fallback.buttons.shape),
      treatment: enumValue(buttons.treatment, ['solid', 'tonal', 'outline'], fallback.buttons.treatment),
      size: enumValue(buttons.size, ['compact', 'regular'], fallback.buttons.size)
    }
  }
}

export function resolveUISkin(id: UISkinId, preferences?: UISkinPreferencesV1 | null): UISkinDefinitionV1 {
  return normalizeUISkinDefinition(
    preferences?.schema_version === 1 ? preferences.customizations?.[id] : undefined,
    id
  )
}

export function withUISkinCustomization(
  current: UISkinPreferencesV1 | undefined,
  skin: UISkinDefinitionV1
): UISkinPreferencesV1 {
  const normalized = normalizeUISkinDefinition(skin, skin.id)
  return {
    schema_version: 1,
    customizations: { ...validCustomizations(current), [skin.id]: normalized }
  }
}

export function withoutUISkinCustomization(
  current: UISkinPreferencesV1 | undefined,
  id: UISkinId
): UISkinPreferencesV1 | undefined {
  const customizations = { ...validCustomizations(current) }
  delete customizations[id]
  return Object.keys(customizations).length > 0 ? { schema_version: 1, customizations } : undefined
}

export function cloneUISkin(skin: UISkinDefinitionV1): UISkinDefinitionV1 {
  return {
    ...skin,
    palette: { ...skin.palette },
    typography: { ...skin.typography },
    layout: { ...skin.layout },
    buttons: { ...skin.buttons }
  }
}

function validCustomizations(
  preferences: UISkinPreferencesV1 | undefined
): Partial<Record<UISkinId, UISkinDefinitionV1>> {
  const result: Partial<Record<UISkinId, UISkinDefinitionV1>> = {}
  if (preferences?.schema_version !== 1) return result
  for (const id of UI_SKIN_IDS) {
    if (preferences?.customizations?.[id]) {
      result[id] = normalizeUISkinDefinition(preferences.customizations[id], id)
    }
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const normalized = [...value.trim()]
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  return normalized ? normalized.slice(0, 48) : fallback
}

function safeScale(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) ? Math.round(Math.min(1.15, Math.max(0.9, parsed)) * 100) / 100 : fallback
}

function enumValue<const Value extends string>(
  value: unknown,
  choices: readonly Value[],
  fallback: Value
): Value {
  return typeof value === 'string' && (choices as readonly string[]).includes(value)
    ? (value as Value)
    : fallback
}
