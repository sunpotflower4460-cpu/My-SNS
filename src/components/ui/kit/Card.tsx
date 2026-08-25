import { cn } from '@/lib/ui/cn'

// A surface primitive. `tone` carries semantic meaning (selected/AI = violet,
// warning = amber, error = rose, success = emerald) so screens don't hand-roll
// those backgrounds; `size` maps to the radius scale (card 16px / container 24px).

type CardTone = 'default' | 'muted' | 'selected' | 'warning' | 'error' | 'success'
type CardSize = 'card' | 'container'

const TONES: Record<CardTone, string> = {
  default: 'border-[color:var(--border-default)] glass-surface',
  muted: 'border-[color:var(--border-default)] bg-[color:var(--surface-secondary)]',
  selected: 'border-[color:rgba(109,93,246,0.18)] bg-[color:var(--accent-soft)]',
  warning: 'border-amber-200/80 bg-amber-50/90',
  error: 'border-rose-200/80 bg-rose-50/90',
  success: 'border-emerald-200/80 bg-emerald-50/90',
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  size?: CardSize
  /** Only elements that genuinely float (dialogs, popovers) get a shadow — flat cards read calmer. */
  elevated?: boolean
  padded?: boolean
  interactive?: boolean
}

export default function Card({
  tone = 'default',
  size = 'card',
  elevated = false,
  padded = true,
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'border',
        size === 'container' ? 'rounded-container' : 'rounded-card',
        padded && (size === 'container' ? 'p-6' : 'p-4'),
        TONES[tone],
        elevated && 'shadow-[var(--shadow-soft)]',
        interactive
          && 'transition duration-200 ease-[var(--ease-out-premium)] hover:-translate-y-px hover:shadow-[0_12px_36px_rgba(24,24,27,0.08)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
