'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/ui/cn'
import { useFocusTrap } from './use-focus-trap'
import IconButton from './IconButton'

// A panel that slides from the bottom on mobile and the right on desktop — the
// natural home for contextual settings (e.g. a contact's auto-reply settings)
// that would be cramped in a centered dialog. Same focus/Escape/restore
// behaviour as Dialog.

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  children?: React.ReactNode
  footer?: React.ReactNode
}

export default function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[85vh] w-full flex-col overflow-hidden border-stone-200 bg-white shadow-xl',
          'rounded-t-container border-t sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <IconButton icon={X} label="閉じる" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-safe">{children}</div>
        {footer && <div className="border-t border-stone-100 px-5 py-4 pb-safe">{footer}</div>}
      </div>
    </div>
  )
}
