import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

// The one button in the design system. Variants encode intent (one primary per
// screen — §17.6); destructive is not permanently red, it just reads as a real
// action. Touch target stays >= 44px on mobile via min-h-touch.

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[color:var(--accent)] text-white shadow-[0_10px_24px_rgba(109,93,246,0.22)] hover:bg-[color:var(--accent-hover)]',
  secondary: 'border border-[color:var(--border-default)] bg-white/90 text-[color:var(--text-strong)] hover:bg-white',
  ghost: 'text-[color:var(--text-default)] hover:bg-black/[0.045] hover:text-[color:var(--text-strong)]',
  destructive: 'border border-rose-200/80 bg-white text-rose-700 hover:bg-rose-50',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-2 text-xs gap-1.5',
  md: 'px-4.5 py-2.5 text-sm gap-2 sm:min-h-control min-h-touch',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, fullWidth = false, type, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // Default to 'button' so migrating an in-<form> control never triggers a
      // submit by accident; callers can still opt into type="submit".
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium transition duration-200 ease-[var(--ease-out-premium)] active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
})

export default Button
