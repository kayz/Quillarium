export const SETTING_IMAGE_TYPES = new Set([
  'world_entry',
  'character',
  'location',
  'character_relation',
  'faction'
])

export const SETTING_CARD_TYPES = new Set(['world_entry', 'character', 'location', 'character_relation'])

export interface SettingThumbnailPreview {
  previewDataUrl: string
  asset: { alt_text: string }
}

export function SettingThumbnail({
  preview,
  title,
  type,
  compact = false
}: {
  preview?: SettingThumbnailPreview | null
  title: string
  type: string
  compact?: boolean
}) {
  if (preview?.previewDataUrl) {
    return (
      <img
        className={`setting-thumbnail ${compact ? 'compact' : ''}`}
        src={preview.previewDataUrl}
        alt={preview.asset.alt_text || title}
      />
    )
  }
  if (type !== 'faction') return null
  return (
    <span className={`setting-thumbnail-fallback ${compact ? 'compact' : ''}`} aria-label={title}>
      {factionInitials(title)}
    </span>
  )
}

function factionInitials(title: string): string {
  const compact = title.trim().replace(/\s+/gu, '')
  return [...compact].slice(0, 2).join('').toLocaleUpperCase() || '势'
}
