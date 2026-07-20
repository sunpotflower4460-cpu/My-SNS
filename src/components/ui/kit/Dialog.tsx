'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/ui/cn'
import { useFocusTrap } from './use-focus-trap'
import IconButton from './IconButton'

// A centered modal for a focused decision (e.g. 投稿済みにしますか？). Focus is
// trapped, Escape and backdrop-click close it, and focus returns to the opener.
// For mobile-first flows that slide from the bottom, use Sheet instead.

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: React.ReactNode
  footer?: React.ReactNode
}

export default function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn('relative w-full max-w-md rounded-container border border-stone-200 bg-white p-6 shadow-xl')}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          </div>
          <IconButton icon={X} label="閉じる" onClick={onClose} />
        </div>
        {children && <div className="mt-4 text-sm text-gray-700">{children}</div>}
        {footer && <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
