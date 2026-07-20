import Link from 'next/link'
import {
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  Send,
  Plug,
  Sprout,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '@/components/ui/kit'
import type { NextAction, NextActionCategory, NextActionPriority } from '@/lib/presentation/home-actions'

// The hero of the home screen: the few things that genuinely need the creator.
// Priority is shown by an icon + a worded label (never colour alone — §17.7).

const CATEGORY_ICON: Record<NextActionCategory, LucideIcon> = {
  publish: Send,
  reply: MessageCircle,
  approval: CheckCircle2,
  setup: Plug,
}

// A distinct icon for the two failure cards so a stuck send reads as trouble,
// not just another task.
function iconFor(action: NextAction): LucideIcon {
  if (action.id === 'publish-failed' || action.id === 'reply-failed') return AlertTriangle
  if (action.id === 'seeds-in-progress') return Sprout
  return CATEGORY_ICON[action.category]
}

const PRIORITY: Record<NextActionPriority, { label: string; badge: string; ring: string; icon: string }> = {
  critical: {
    label: '対応が必要',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    ring: 'border-rose-200 bg-rose-50/40',
    icon: 'text-rose-600',
  },
  high: {
    label: '早めに',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    ring: 'border-stone-200 bg-white',
    icon: 'text-amber-600',
  },
  normal: {
    label: 'いつでも',
    badge: 'border-stone-200 bg-stone-50 text-stone-600',
    ring: 'border-stone-200 bg-white',
    icon: 'text-violet-600',
  },
}

export default function NextActionList({ actions }: { actions: NextAction[] }) {
  if (actions.length === 0) {
    return (
      <Card tone="muted" size="container" className="flex items-center gap-3">
        <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-medium text-gray-900">いま対応が必要なことはありません</p>
          <p className="mt-0.5 text-sm text-gray-500">落ち着いて、次の発信の準備を進めましょう。</p>
        </div>
      </Card>
    )
  }

  return (
    <ul className="space-y-3">
      {actions.map((action) => {
        const meta = PRIORITY[action.priority]
        const Icon = iconFor(action)
        return (
          <li key={action.id}>
            <Link
              href={action.href}
              className={`group flex items-center gap-4 rounded-card border p-4 transition hover:border-violet-200 hover:bg-violet-50/30 ${meta.ring}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 ring-1 ring-inset ring-stone-200">
                <Icon aria-hidden className={`h-5 w-5 ${meta.icon}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
                    {meta.label}
                  </span>
                  <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                </div>
                <p className="mt-1 text-sm leading-6 text-gray-500">{action.description}</p>
              </div>
              <span className="hidden shrink-0 items-center gap-1 text-sm font-medium text-violet-600 sm:inline-flex">
                {action.actionLabel}
                <ArrowRight aria-hidden className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
