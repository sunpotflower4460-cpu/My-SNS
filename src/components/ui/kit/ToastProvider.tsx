'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/ui/cn'

// Transient confirmations (変更を保存しました / 返信を送信しました) — they appear
// briefly and auto-dismiss, instead of stacking success banners at the top of a
// page. Errors that need the user to ACT don't belong here — use an InlineAlert
// so they persist. The region is aria-live so screen readers announce toasts.

type ToastTone = 'success' | 'info' | 'error'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TONES: Record<ToastTone, { icon: LucideIcon; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-600' },
  info: { icon: Info, color: 'text-sky-600' },
  error: { icon: XCircle, color: 'text-rose-600' },
}

const DEFAULT_DURATION_MS = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      // Date.now() is fine in the browser; a monotonic-ish id is all we need.
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((current) => [...current, { id, tone, message }])
      setTimeout(() => dismiss(id), DEFAULT_DURATION_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 pb-safe">
        {toasts.map((t) => {
          const { icon: Icon, color } = TONES[t.tone]
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-card border border-stone-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-lg')}
            >
              <Icon aria-hidden className={cn('mt-0.5 h-5 w-5 shrink-0', color)} />
              <span className="min-w-0 flex-1">{t.message}</span>
              <button aria-label="閉じる" onClick={() => dismiss(t.id)} className="shrink-0 text-gray-400 hover:text-gray-700">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** Access the toast function. Returns a no-op if no provider is mounted, so callers never crash. */
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? { toast: () => {} }
}
