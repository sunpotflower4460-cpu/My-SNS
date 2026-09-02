'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import NextActionList from '@/components/home/NextActionList'
import TodayTimeline from '@/components/home/TodayTimeline'
import TodayPublishingPanel from '@/components/home/TodayPublishingPanel'
import HomeSummary, { type HomeSummaryStat } from '@/components/home/HomeSummary'
import {
  buildTodayTimeline,
  computeNextActions,
} from '@/lib/presentation/home-actions'
import { buildPublishPacks } from '@/lib/presentation/publish-pack'
import { buildTodayPublishingOverview } from '@/lib/presentation/today-publishing'
import { useApp } from '@/lib/app/app-provider'

export default function DashboardPage() {
  const {
    currentWorkspace,
    seeds,
    publishJobs,
    replyJobs,
    inboxItems,
    drafts,
    draftRevisions,
    socialAccounts,
    calendarEvents,
  } = useApp()

  // Date.now() is fine in the browser runtime; presenters resolve calendar
  // boundaries in JST so "today" follows the creator's local day.
  const now = Date.now()

  const packs = buildPublishPacks({ seeds, jobs: publishJobs, revisions: draftRevisions })
  const publishingOverview = buildTodayPublishingOverview(packs, now)
  const actions = computeNextActions({ publishJobs, replyJobs, inboxItems, drafts, seeds, socialAccounts })
    // Failed publishing is already the highest-priority item in the publishing
    // panel above. Keep the supporting action list useful without duplicating it.
    .filter((action) => action.id !== 'publish-failed')
  const timeline = buildTodayTimeline({ publishJobs, replyJobs, calendarEvents }, now)

  const stats: HomeSummaryStat[] = [
    { label: '進行中パック', value: publishingOverview.activeCount, href: '/app/packs' },
    { label: '今日までに投稿', value: publishingOverview.duePacks.length, href: '/app/packs' },
    { label: '受信箱の未読', value: inboxItems.filter((item) => !item.isRead).length, href: '/app/inbox' },
    { label: '公開できる状態', value: seeds.filter((seed) => seed.status === 'ready').length, href: '/app/seeds' },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="ホーム"
        description={`${currentWorkspace?.name ?? 'ワークスペース'}の今日の投稿と、次に進める1件を最初に確認できます。新しい発信は写真や動画を入れて、提案を直して送れます。`}
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

      <TodayPublishingPanel overview={publishingOverview} />

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-label="その他の対応">
          <h2 className="mb-3 text-base font-semibold text-gray-900">その他の対応</h2>
          <NextActionList actions={actions} />
        </section>
        <TodayTimeline items={timeline} />
      </div>

      <section aria-label="全体のようす">
        <h2 className="mb-3 text-sm font-medium text-gray-500">全体のようす</h2>
        <HomeSummary stats={stats} />
      </section>
    </div>
  )
}
