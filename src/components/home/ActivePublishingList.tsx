import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { Card } from '@/components/ui/kit'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { PublishJob } from '@/lib/domain/types'

// The publishing runway: scheduled posts beyond today, soonest first. Distinct
// from today's timeline so nothing is listed twice.

function formatWhen(iso?: string): string {
  if (!iso) return '日時未定'
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
}

export default function ActivePublishingList({ jobs }: { jobs: PublishJob[] }) {
  return (
    <Card size="container" padded className="h-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">この先の公開予定</h2>
        <Link href="/app/queue" className="text-sm font-medium text-violet-600 hover:text-violet-800">
          公開予定 →
        </Link>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-card bg-stone-50 px-4 py-6 text-center text-sm text-gray-500">
          この先に予約された公開はありません。
        </p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => {
            const channel = PUBLISHING_CHANNEL_CONFIG[job.channel]
            return (
              <li key={job.id}>
                <Link
                  href={`/app/seeds/${job.seedId}`}
                  className="flex items-center gap-3 rounded-card px-2 py-2 transition hover:bg-stone-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm text-gray-600">
                    {channel?.icon ?? '•'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{channel?.label ?? job.channel}に公開</p>
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <CalendarClock aria-hidden className="h-3 w-3" />
                      {formatWhen(job.scheduledAt)}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
