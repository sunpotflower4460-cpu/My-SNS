import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

// A status/label chip. Tones pair a colour with an OPTIONAL icon so state is
// never conveyed by colour alone (accessibility — §17.7). No uppercase / wide
// letter-spacing (removed during localization; it doesn't suit Japanese).

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-stone-200 bg-stone-50 text-stone-600',
  accent: 'border-violet-200 bg-violet-50 text-violet-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
}

export interface BadgeProps {
  tone?: BadgeTone
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}

export default function Badge({ tone = 'neutral', icon: Icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="h-3 w-3" />}
      {children}
    </span>
  )
}
