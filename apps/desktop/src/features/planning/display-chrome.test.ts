import { describe, expect, it } from 'vitest'
import {
  displayLayerAfterLoadError,
  displayLayerForChrome,
  showDisplayCardChrome,
  showLegacySettingThumbnails
} from './display-chrome.js'

describe('display chrome gating', () => {
  it('shows old setting thumbnails only while display layer is unmigrated', () => {
    expect(showLegacySettingThumbnails({ enabled: false, migrated: false })).toBe(true)
    expect(showLegacySettingThumbnails({ enabled: true, migrated: false })).toBe(true)
    expect(showLegacySettingThumbnails({ enabled: false, migrated: true })).toBe(false)
    expect(showLegacySettingThumbnails({ enabled: true, migrated: true })).toBe(false)
  })

  it('shows new card chrome only after migration when the layer is enabled', () => {
    expect(showDisplayCardChrome({ enabled: true, migrated: true })).toBe(true)
    expect(showDisplayCardChrome({ enabled: false, migrated: true })).toBe(false)
    expect(showDisplayCardChrome({ enabled: true, migrated: false })).toBe(false)
    expect(showDisplayCardChrome({ enabled: false, migrated: false })).toBe(false)
  })

  it('keeps leftover projects unmigrated when YAML has no display_layer', () => {
    expect(displayLayerForChrome({ needsMigration: true })).toEqual({ enabled: false, migrated: false })
  })

  it('treats a missing display_layer without leftovers as a migrated writer default', () => {
    expect(displayLayerForChrome({ needsMigration: false })).toEqual({ enabled: false, migrated: true })
  })

  it('uses an explicit display_layer even when leftovers still exist', () => {
    expect(
      displayLayerForChrome({
        displayLayer: { enabled: true, migrated: true },
        needsMigration: true
      })
    ).toEqual({ enabled: true, migrated: true })
  })

  it('fails closed when leftover scan did not complete after loadProject', () => {
    expect(
      displayLayerAfterLoadError({
        leftoverScanCompleted: false,
        needsMigration: false
      })
    ).toBeNull()
    expect(
      displayLayerAfterLoadError({
        displayLayer: { enabled: false, migrated: true },
        leftoverScanCompleted: false,
        needsMigration: false
      })
    ).toBeNull()
  })

  it('still mounts known leftover state after a later load error', () => {
    expect(
      displayLayerAfterLoadError({
        leftoverScanCompleted: true,
        needsMigration: true
      })
    ).toEqual({ enabled: false, migrated: false })
  })
})
