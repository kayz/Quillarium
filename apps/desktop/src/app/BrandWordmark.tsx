import wordmarkUrl from '../../../../assets/brand/quillarium-wordmark.png'

export function BrandWordmark({
  className = '',
  decorative = false
}: {
  className?: string
  decorative?: boolean
}) {
  return (
    <img
      className={`brand-wordmark ${className}`.trim()}
      src={wordmarkUrl}
      alt={decorative ? '' : 'Quillarium'}
      draggable={false}
    />
  )
}
