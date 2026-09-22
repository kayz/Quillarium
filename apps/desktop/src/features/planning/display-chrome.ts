export type DisplayLayerChrome = {
  enabled: boolean
  migrated: boolean
}

export function displayLayerForChrome(input: {
  displayLayer?: DisplayLayerChrome
  needsMigration: boolean
}): DisplayLayerChrome {
  if (input.displayLayer) return input.displayLayer
  if (input.needsMigration) return { enabled: false, migrated: false }
  return { enabled: false, migrated: true }
}

export function showLegacySettingThumbnails(display: DisplayLayerChrome) {
  return !display.migrated
}

export function showDisplayCardChrome(display: DisplayLayerChrome) {
  return display.migrated && display.enabled
}
