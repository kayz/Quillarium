import { useEffect, useRef } from 'react'

export function clampPaneSize(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max)
  return Math.min(safeMax, Math.max(min, Math.round(value)))
}

export function SplitHandle({
  orientation,
  label,
  onResize,
  className = ''
}: {
  orientation: 'vertical' | 'horizontal'
  label: string
  onResize: (delta: number) => void
  className?: string
}) {
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRef.current?.(), [])
  return (
    <div
      className={`split-handle ${orientation} ${className}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      tabIndex={0}
      onKeyDown={(event) => {
        const delta = 16
        if (orientation === 'vertical' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault()
          onResize(event.key === 'ArrowRight' ? delta : -delta)
        }
        if (orientation === 'horizontal' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault()
          onResize(event.key === 'ArrowDown' ? delta : -delta)
        }
      }}
      onPointerDown={(event) => {
        cleanupRef.current?.()
        let previous = orientation === 'vertical' ? event.clientX : event.clientY
        const bodyClass = orientation === 'vertical' ? 'is-resizing-column' : 'is-resizing-row'
        document.body.classList.add(bodyClass)
        const move = (moveEvent: PointerEvent) => {
          const current = orientation === 'vertical' ? moveEvent.clientX : moveEvent.clientY
          onResize(current - previous)
          previous = current
        }
        const cleanup = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', cleanup)
          window.removeEventListener('pointercancel', cleanup)
          document.body.classList.remove(bodyClass)
          cleanupRef.current = null
        }
        cleanupRef.current = cleanup
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', cleanup)
        window.addEventListener('pointercancel', cleanup)
        event.preventDefault()
      }}
    />
  )
}
