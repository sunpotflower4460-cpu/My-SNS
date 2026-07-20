import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

// Icon-only button. `label` is required (TS-enforced) and becomes the aria-label
// — an icon-only control must never ship without an accessible name.

type IconButtonVariant = 'ghost' | 'secondary'

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-gray-500 hover:bg-stone-100 hover:text-gray-900',
  secondary: 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50',
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
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 sm:h-9 sm:w-9',
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
