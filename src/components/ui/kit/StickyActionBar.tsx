import { cn } from '@/lib/ui/cn'

// A bottom-anchored action bar for mobile-first flows (e.g. 保存 / 承認). Below
// xl it sits ABOVE the fixed mobile bottom nav (which is ~64px tall + safe area,
// z-40) so its buttons are never occluded; at xl there's no bottom nav so it
// sticks to the very bottom. Safe-area padding clears the iPhone home indicator.

export interface StickyActionBarProps {
  children: React.ReactNode
  className?: string
}

export default function StickyActionBar({ children, className }: StickyActionBarProps) {
  return (
    <div
      className={cn(
        'sticky z-40 border-t border-stone-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur',
        'bottom-[calc(4rem+env(safe-area-inset-bottom))] xl:bottom-0',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">{children}</div>
    </div>
  )
}
