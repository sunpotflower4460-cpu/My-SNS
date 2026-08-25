import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

// Icon-only button. `label` is required (TS-enforced) and becomes the aria-label
// — an icon-only control must never ship without an accessible name.

type IconButtonVariant = 'ghost' | 'secondary'

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-[color:var(--text-muted)] hover:bg-black/[0.045] hover:text-[color:var(--text-strong)]',
  secondary: 'border border-[color:var(--border-default)] bg-white/90 text-[color:var(--text-default)] hover:bg-white',
}

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: LucideIcon
  label: string
  variant?: IconButtonVariant
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, variant = 'ghost', type, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition duration-200 ease-[var(--ease-out-premium)] active:scale-[0.985] disabled:opacity-50 sm:h-9 sm:w-9',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="h-5 w-5" />
    </button>
  )
})

export default IconButton
