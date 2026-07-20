import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

// A persistent, in-flow alert — used when the user needs to DO something (a
// failed publish, a missing connection). Transient success goes to a Toast
// instead; this stays on screen until the underlying condition is resolved.

type AlertTone = 'info' | 'success' | 'warning' | 'error'

const TONES: Record<AlertTone, { box: string; icon: LucideIcon; iconColor: string }> = {
  info: { box: 'border-sky-200 bg-sky-50 text-sky-800', icon: Info, iconColor: 'text-sky-500' },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2, iconColor: 'text-emerald-500' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-800', icon: AlertTriangle, iconColor: 'text-amber-500' },
  error: { box: 'border-rose-200 bg-rose-50 text-rose-800', icon: XCircle, iconColor: 'text-rose-500' },
}

export interface InlineAlertProps {
  tone?: AlertTone
  title?: string
  children?: React.ReactNode
  /** An optional call-to-action (e.g. a "再接続" Button) rendered under the message. */
  action?: React.ReactNode
  className?: string
}

export default function InlineAlert({ tone = 'info', title, children, action, className }: InlineAlertProps) {
  const { box, icon: Icon, iconColor } = TONES[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-card border px-4 py-3 text-sm', box, className)}>
      <Icon aria-hidden className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn('leading-6', title && 'mt-0.5')}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  )
}
