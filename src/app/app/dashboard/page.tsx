'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import SeedCard from '@/components/ui/SeedCard'
import EmptyState from '@/components/ui/EmptyState'
import { describeAuditLog, getAuditLogMeta } from '@/lib/audit/presenter'
import { useApp } from '@/lib/app/app-provider'

export default function DashboardPage() {
  const router = useRouter()
  const { auditLogs, currentWorkspace, inboxItems, publishJobs, seeds } = useApp()

  const capturedCount = seeds.filter((seed) => seed.status === 'captured').length
  const readyCount = seeds.filter((seed) => seed.status === 'ready').length
  const queueCount = publishJobs.filter((job) => job.status === 'scheduled').length
  const unreadCount = inboxItems.filter((item) => !item.isRead).length
  const recentSeeds = [...seeds]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 3)
  const recentActivity = auditLogs.slice(0, 6)

  return (
    <div>
      <PageHeader
        title="ダッシュボード"
        description={`${currentWorkspace?.name ?? 'ワークスペース'}へようこそ。次に対応が必要なことを、落ち着いてひと目で確認できます。`}
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="シード数" value={seeds.length} icon="🌱" />
        <StatCard label="取り込み済み" value={capturedCount} icon="✍️" trend={`提案準備完了 ${readyCount}件`} />
        <StatCard label="予約中のジョブ" value={queueCount} icon="📅" trend="キュー稼働中" />
        <StatCard label="受信箱の未読" value={unreadCount} icon="📬" trend="要対応" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">最近のシード</h2>
            <Link href="/app/seeds" className="text-sm font-medium text-violet-600 hover:text-violet-800">
              すべて見る →
            </Link>
          </div>

          {recentSeeds.length === 0 ? (
            <EmptyState
              title="シードはまだありません"
              description="ラフなアイデアや素材をひとつ取り込んでみましょう。公開できる状態になっている必要はありません。"
              action={
                <Link href="/app/seeds/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
                  + 新しいシード
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {recentSeeds.map((seed) => (
                <SeedCard key={seed.id} seed={seed} onClick={() => router.push(`/app/seeds/${seed.id}`)} />
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/app/seeds/new"
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              + 新しいシード
            </Link>
            <Link
              href="/app/inbox"
              className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-stone-50"
            >
              受信箱を開く
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100/80">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">最近のアクティビティ</h2>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">
              {recentActivity.length}件のイベント
            </span>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState
              title="最近のアクティビティはまだありません"
              description="このワークスペースにおけるシード・受信箱・キュー・チームの操作がここに表示されます。"
              icon="🕊️"
            />
          ) : (
            <div className="space-y-3">
              {recentActivity.map((log) => (
                <div key={log.id} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <p className="text-sm leading-6 text-gray-700">{describeAuditLog(log)}</p>
                  <p className="mt-1 text-xs text-gray-400">{getAuditLogMeta(log)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
