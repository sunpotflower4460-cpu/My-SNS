import { cn } from '@/lib/ui/cn'

// A loading placeholder. Prefer this over a blank page — screens keep their
// shape while data loads. The pulse animation is disabled under reduced-motion
// via the global rule.

export default function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-card bg-stone-100', className)} />
}
