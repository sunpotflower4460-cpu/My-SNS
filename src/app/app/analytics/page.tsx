'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { computeAnalytics, formatCost, selectRecentPublished } from '@/lib/presentation/analytics-presenter'
import type { PostMetrics, PublishFailureReason } from '@/lib/domain/types'

const FAILURE_REASON_LABELS: Record<PublishFailureReason, string> = {
  auth: '認証 / トークン',
  ratelimit: 'レート制限',
  validation: '検証エラー',
  network: 'ネットワーク',
  unavailable: 'コネクタが利用できません',
}

type MetricsState = { status: 'loading' } | { status: 'loaded'; metrics: PostMetrics } | { status: 'error'; message: string }

export default function AnalyticsPage() {
  const { aiGenerations, currentWorkspace, draftRevisions, fetchPostMetrics, publishAttempts, publishJobs, seeds } = useApp()
  const [metricsByJob, setMetricsByJob] = useState<Record<string, MetricsState>>({})

  const summary = useMemo(
    () => computeAnalytics({ publishAttempts, aiGenerations, draftRevisions, publishJobs }),
    [publishAttempts, aiGenerations, draftRevisions, publishJobs],
  )
  const recentPublished = useMemo(() => selectRecentPublished(publishAttempts, publishJobs), [publishAttempts, publishJobs])
  const seedById = useMemo(() => new Map(seeds.map((seed) => [seed.id, seed])), [seeds])

  const handleLoadMetrics = async (jobId: string) => {
    setMetricsByJob((prev) => ({ ...prev, [jobId]: { status: 'loading' } }))
    try {
      const metrics = await fetchPostMetrics(jobId)
      setMetricsByJob((prev) => ({ ...prev, [jobId]: { status: 'loaded', metrics } }))
    } catch (cause) {
      setMetricsByJob((prev) => ({ ...prev, [jobId]: { status: 'error', message: cause instanceof Error ? cause.message : 'メトリクスを取得できませんでした。' } }))
    }
  }

  return (
    <div>
      <PageHeader
        title="分析"
        description={`${currentWorkspace?.name ?? 'このワークスペース'}における公開とAI提案の実際の状況です — 推定値ではなく、実際の試行記録に基づいています。`}
      />

      {summary.isTruncated && (
        <div className="mb-6">
          <InlineAlert tone="warning">
            このワークスペースには、これらの統計が対象とする範囲より多くの履歴があります — 以下の数値は直近の活動のみを反映したものであり、全期間の完全な記録ではありません。
          </InlineAlert>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="公開成功率" value={summary.successRate === null ? '—' : `${summary.successRate}%`} icon="✅" trend={`${summary.totalAttempts}件中${summary.successCount}件成功`} />
        <StatCard label="AI生成の呼び出し回数" value={summary.aiTotals.totalCalls} icon="🤖" trend={`合計${summary.aiTotals.totalTokens.toLocaleString()}トークン`} />
        <StatCard label="AIコスト（累計）" value={formatCost(summary.aiTotals.totalCost)} icon="💰" />
        <StatCard
          label="AI提案の編集率"
          value={summary.editStats.rate === null ? '—' : `${summary.editStats.rate}%`}
          icon="✏️"
          trend={summary.editStats.rate === null ? 'まだAI提案由来の承認がありません' : `承認済みAIドラフト${summary.editStats.total}件中${summary.editStats.edited}件を編集`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card size="container" padded>
          <h2 className="mb-4 text-base font-semibold text-gray-900">媒体別の公開状況</h2>
          {summary.perChannel.length === 0 ? (
            <EmptyState title="まだ公開の試行がありません" description="ジョブが実行されると（Workerまたは「今すぐ公開」）、媒体ごとの成功・失敗がここに表示されます。" />
          ) : (
            <div className="space-y-3">
              {summary.perChannel.map((entry) => (
                <div key={entry.channel} className="rounded-card border border-stone-100 bg-stone-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <ChannelBadge channel={entry.channel} />
                    <span className="text-sm font-medium text-gray-700">成功率{entry.rate}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${entry.rate}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{entry.success}件成功 · {entry.failed}件失敗</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card size="container" padded>
          <h2 className="mb-4 text-base font-semibold text-gray-900">失敗理由</h2>
          {summary.failureReasons.length === 0 ? (
            <EmptyState title="失敗の記録はありません" description="公開に失敗した試行とその理由がここに表示されます。" icon="🕊️" />
          ) : (
            <div className="space-y-3">
              {summary.failureReasons.map((entry) => (
                <div key={entry.reason} className="flex items-center justify-between rounded-card border border-stone-100 bg-stone-50 px-4 py-3">
                  <span className="text-sm text-gray-700">{FAILURE_REASON_LABELS[entry.reason]}</span>
                  <Badge tone="error">{entry.count}件</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card size="container" padded>
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <h2 className="text-base font-semibold text-gray-900">最近公開した投稿</h2>
            <span className="text-xs text-gray-400">メトリクスはその都度取得しており保存されません — 数値はプラットフォーム側の実際の値と多少ずれる場合があります。</span>
          </div>
          {recentPublished.length === 0 ? (
            <EmptyState title="まだ公開された投稿はありません" description="投稿記録のある成功した公開試行がここに表示されます。" />
          ) : (
            <div className="divide-y divide-stone-100">
              {recentPublished.map(({ attempt, job }) => {
                const seedTitle = seedById.get(job.seedId)?.title ?? job.seedId
                const state = metricsByJob[job.id]
                return (
                  <div key={attempt.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-3">
                      <ChannelBadge channel={job.channel} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{seedTitle}</p>
                      <p className="mt-1 text-xs text-gray-500">{new Date(attempt.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
                      {state?.status === 'loaded' && (
                        <p className="mt-1 text-xs text-gray-600">
                          {[
                            state.metrics.views !== undefined ? `再生数 ${state.metrics.views.toLocaleString()}` : null,
                            state.metrics.likes !== undefined ? `いいね数 ${state.metrics.likes.toLocaleString()}` : null,
                            state.metrics.comments !== undefined ? `コメント数 ${state.metrics.comments.toLocaleString()}` : null,
                            state.metrics.shares !== undefined ? `シェア数 ${state.metrics.shares.toLocaleString()}` : null,
                          ].filter(Boolean).join(' · ') || 'この投稿のメトリクスは報告されていません。'}
                        </p>
                      )}
                      {state?.status === 'error' && <p className="mt-1 text-xs text-rose-600">{state.message}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {attempt.externalUrl && (
                        <a
                          href={attempt.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-control items-center rounded-full border border-stone-200 bg-white px-4 text-xs font-medium text-gray-700 transition hover:bg-stone-50"
                        >
                          投稿を開く
                        </a>
                      )}
                      <Button size="sm" variant="primary" onClick={() => void handleLoadMetrics(job.id)} loading={state?.status === 'loading'}>
                        メトリクスを取得
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
