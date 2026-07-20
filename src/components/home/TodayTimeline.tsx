import Link from 'next/link'
import { Send, MessageCircle, CalendarDays, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/kit'
import type { TimelineItem, TimelineKind } from '@/lib/presentation/home-actions'

// Today's agenda: scheduled posts, queued replies, and calendar events merged
// and time-ordered. Read-only glance — actions live in NextActionList above.

const KIND: Record<TimelineKind, { icon: LucideIcon; label: string; tint: string }> = {
  publish: { icon: Send, label: '公開', tint: 'text-violet-600' },
  reply: { icon: MessageCircle, label: '返信', tint: 'text-sky-600' },
  event: { icon: CalendarDays, label: '予定', tint: 'text-emerald-600' },
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
}

export default function TodayTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <Card size="container" padded className="h-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">今日の予定</h2>
        <Link href="/app/calendar" className="text-sm font-medium text-violet-600 hover:text-violet-800">
          カレンダー →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-card bg-stone-50 px-4 py-6 text-center text-sm text-gray-500">
          今日の予定はありません。ゆっくりいきましょう。
        </p>
      ) : (
        <ol className="space-y-2">
          {items.map((item) => {
            const kind = KIND[item.kind]
            const Icon = kind.icon
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-card px-2 py-2 transition hover:bg-stone-50"
                >
                  <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-gray-500">
                    {formatTime(item.at)}
                  </span>
                  <Icon aria-hidden className={`h-4 w-4 shrink-0 ${kind.tint}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
                    {item.detail && <p className="truncate text-xs text-gray-500">{item.detail}</p>}
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400">{kind.label}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
