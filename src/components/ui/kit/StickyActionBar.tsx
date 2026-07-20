import { cn } from '@/lib/ui/cn'

// A bottom-anchored action bar for mobile-first flows (e.g. 保存 / 承認). Sticks
// to the bottom of the viewport with safe-area padding so it clears the iPhone
// home indicator, and never overlaps content because it's part of the flow.

export interface StickyActionBarProps {
  children: React.ReactNode
  className?: string
}

export default function StickyActionBar({ children, className }: StickyActionBarProps) {
  return (
    <div className={cn('sticky bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 pb-safe backdrop-blur', className)}>
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  )
}
