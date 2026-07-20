import { cn } from '@/lib/ui/cn'

// A surface primitive. `tone` carries semantic meaning (selected/AI = violet,
// warning = amber, error = rose, success = emerald) so screens don't hand-roll
// those backgrounds; `size` maps to the radius scale (card 16px / container 24px).

type CardTone = 'default' | 'muted' | 'selected' | 'warning' | 'error' | 'success'
type CardSize = 'card' | 'container'

const TONES: Record<CardTone, string> = {
  default: 'border-stone-200 bg-white',
  muted: 'border-stone-200 bg-stone-50',
  selected: 'border-violet-200 bg-violet-50/50',
  warning: 'border-amber-200 bg-amber-50',
  error: 'border-rose-200 bg-rose-50',
  success: 'border-emerald-200 bg-emerald-50',
}

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  size?: CardSize
  /** Only elements that genuinely float (dialogs, popovers) get a shadow — flat cards read calmer. */
  elevated?: boolean
  padded?: boolean
}

export default function Card({ tone = 'default', size = 'card', elevated = false, padded = true, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'border',
        size === 'container' ? 'rounded-container' : 'rounded-card',
        TONES[tone],
        padded && (size === 'container' ? 'p-6' : 'p-4'),
        elevated && 'shadow-sm shadow-stone-100/70',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
