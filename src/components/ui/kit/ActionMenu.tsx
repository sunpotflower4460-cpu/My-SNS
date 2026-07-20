'use client'

import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/ui/cn'
import IconButton from './IconButton'

// A "…" overflow menu for secondary actions (日時変更 / キャンセル / 履歴を見る),
// keeping one primary action prominent and the rest tucked away. Closes on
// outside-click and Escape.

export interface ActionMenuItem {
  label: string
  icon?: LucideIcon
  onSelect: () => void
  tone?: 'default' | 'destructive'
}

export interface ActionMenuProps {
  items: ActionMenuItem[]
  label?: string
  align?: 'left' | 'right'
}

export default function ActionMenu({ items, label = 'その他の操作', align = 'right' }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <IconButton icon={MoreHorizontal} label={label} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" />
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-card border border-stone-200 bg-white py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={index}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50',
                item.tone === 'destructive' ? 'text-rose-600 hover:bg-rose-50' : 'text-gray-700',
              )}
            >
              {item.icon && <item.icon aria-hidden className="h-4 w-4" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
