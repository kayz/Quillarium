import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, PropsWithChildren, ReactNode } from 'react'

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function ActionButton({
  tone = 'secondary',
  icon,
  className,
  children,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: 'primary' | 'secondary' | 'danger' | 'quiet'
    icon?: ReactNode
  }
>) {
  return (
    <button className={classes('ui-button', `ui-button-${tone}`, className)} {...props}>
      {icon}
      {children}
    </button>
  )
}

export function ActionBar({
  align = 'skin',
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { align?: 'skin' | 'start' | 'end' | 'split' }>) {
  return (
    <div className={classes('ui-action-bar', `ui-action-bar-${align}`, className)} {...props}>
      {children}
    </div>
  )
}

export function SurfacePanel({
  as: Element = 'section',
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' }>) {
  return (
    <Element className={classes('ui-surface-panel', className)} {...props}>
      {children}
    </Element>
  )
}

export function FormGrid({
  columns = 2,
  className,
  children,
  style,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { columns?: 1 | 2 | 3 | 4 }>) {
  return (
    <div
      className={classes('ui-form-grid', className)}
      style={{ '--ui-form-columns': columns, ...style } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  )
}
