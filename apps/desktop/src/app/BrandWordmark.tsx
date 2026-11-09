export function BrandWordmark({
  className = '',
  decorative = false
}: {
  className?: string
  decorative?: boolean
}) {
  return (
    <span className={`brand-wordmark ${className}`.trim()} aria-hidden={decorative || undefined}>
      琢磨
    </span>
  )
}
