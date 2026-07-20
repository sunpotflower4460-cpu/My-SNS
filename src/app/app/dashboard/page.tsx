'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import NextActionList from '@/components/home/NextActionList'
import TodayTimeline from '@/components/home/TodayTimeline'
import ActivePublishingList from '@/components/home/ActivePublishingList'
import HomeSummary, { type HomeSummaryStat } from '@/components/home/HomeSummary'
import {
  buildTodayTimeline,
  computeNextActions,
  getUpcomingPublishJobs,
} from '@/lib/presentation/home-actions'
import { useApp } from '@/lib/app/app-provider'

export default function DashboardPage() {
  const {
    currentWorkspace,
    seeds,
    publishJobs,
    replyJobs,
    inboxItems,
    drafts,
    socialAccounts,
    calendarEvents,
  } = useApp()

  // Date.now() is fine in the browser runtime; the presenter resolves "today"
  // in JST so the boundary matches the creator's clock regardless of server TZ.
  const now = Date.now()

  const actions = computeNextActions({ publishJobs, replyJobs, inboxItems, drafts, seeds, socialAccounts })
  const timeline = buildTodayTimeline({ publishJobs, replyJobs, calendarEvents }, now)
  const upcoming = getUpcomingPublishJobs(publishJobs, now)

  const stats: HomeSummaryStat[] = [
    { label: 'シード', value: seeds.length, href: '/app/seeds' },
    { label: '公開予定', value: publishJobs.filter((job) => job.status === 'scheduled').length, href: '/app/queue' },
    { label: '受信箱の未読', value: inboxItems.filter((item) => !item.isRead).length, href: '/app/inbox' },
    { label: '公開できる状態', value: seeds.filter((seed) => seed.status === 'ready').length, href: '/app/seeds' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="ホーム"
        description={`${currentWorkspace?.name ?? 'ワークスペース'}へようこそ。次に対応が必要なことを、落ち着いてひと目で確認できます。`}
        actions={
          <Link
            href="/app/seeds/new"
            className="inline-flex min-h-control items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            <Plus aria-hidden className="h-4 w-4" />
            新しい発信
          </Link>
        }
      />

      <section aria-label="次にやること">
        <h2 className="mb-3 text-base font-semibold text-gray-900">次にやること</h2>
        <NextActionList actions={actions} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <TodayTimeline items={timeline} />
        <ActivePublishingList jobs={upcoming} />
      </div>

      <section aria-label="全体のようす">
        <h2 className="mb-3 text-sm font-medium text-gray-500">全体のようす</h2>
        <HomeSummary stats={stats} />
      </section>
    </div>
  )
}
