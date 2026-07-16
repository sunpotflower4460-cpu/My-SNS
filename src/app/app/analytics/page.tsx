'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import { wasRevisionEditedByHuman, WORKSPACE_DRAFT_REVISIONS_LIMIT } from '@/lib/repositories/supabase/draft-revisions'
import { WORKSPACE_PUBLISH_ATTEMPTS_LIMIT } from '@/lib/repositories/supabase/publish-attempts'
import { WORKSPACE_AI_GENERATIONS_LIMIT } from '@/lib/repositories/supabase/ai-generations'
import type { PostMetrics, PublishFailureReason, PublishingChannel } from '@/lib/domain/types'

const FAILURE_REASON_LABELS: Record<PublishFailureReason, string> = {
  auth: '認証 / トークン',
  ratelimit: 'レート制限',
  validation: '検証エラー',
  network: 'ネットワーク',
  unavailable: 'コネクタが利用できません',
}

function formatCost(usd: number): string {
  return usd > 0 ? `$${usd.toFixed(usd < 1 ? 4 : 2)}` : '$0（コスト単価未設定）'
}

type MetricsState = { status: 'loading' } | { status: 'loaded'; metrics: PostMetrics } | { status: 'error'; message: string }

export default function AnalyticsPage() {
  const { aiGenerations, currentWorkspace, draftRevisions, fetchPostMetrics, publishAttempts, publishJobs, seeds } = useApp()
  const [metricsByJob, setMetricsByJob] = useState<Record<string, MetricsState>>({})

  // Every workspace-wide list below is capped (see each repo function) —
  // when the loaded count hits its cap, older history may be missing from
  // every stat derived from it. Rather than silently present a truncated
  // window as if it were the complete record, say so.
  const isTruncated =
    publishAttempts.length >= WORKSPACE_PUBLISH_ATTEMPTS_LIMIT ||
    aiGenerations.length >= WORKSPACE_AI_GENERATIONS_LIMIT ||
    draftRevisions.length >= WORKSPACE_DRAFT_REVISIONS_LIMIT

  const successAttempts = useMemo(() => publishAttempts.filter((attempt) => attempt.status === 'success'), [publishAttempts])
  const failedAttempts = useMemo(() => publishAttempts.filter((attempt) => attempt.status === 'failed'), [publishAttempts])
  const totalAttempts = publishAttempts.length
  const successRate = totalAttempts > 0 ? Math.round((successAttempts.length / totalAttempts) * 100) : null

  const jobById = useMemo(() => new Map(publishJobs.map((job) => [job.id, job])), [publishJobs])
  const seedById = useMemo(() => new Map(seeds.map((seed) => [seed.id, seed])), [seeds])

  const perChannel = useMemo(() => {
    const counts = new Map<PublishingChannel, { success: number; failed: number }>()
    for (const attempt of publishAttempts) {
      const channel = jobById.get(attempt.publishJobId)?.channel
      if (!channel) continue
      const entry = counts.get(channel) ?? { success: 0, failed: 0 }
      if (attempt.status === 'success') entry.success += 1
      else entry.failed += 1
      counts.set(channel, entry)
    }
    return Array.from(counts.entries()).sort((left, right) => right[1].success + right[1].failed - (left[1].success + left[1].failed))
  }, [publishAttempts, jobById])

  const failureReasonCounts = useMemo(() => {
    const counts = new Map<PublishFailureReason, number>()
    for (const attempt of failedAttempts) {
      if (!attempt.failureReason) continue
      counts.set(attempt.failureReason, (counts.get(attempt.failureReason) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])
  }, [failedAttempts])

  const aiTotals = useMemo(() => {
    const totalCost = aiGenerations.reduce((sum, generation) => sum + generation.costUsd, 0)
    const totalInputTokens = aiGenerations.reduce((sum, generation) => sum + generation.inputTokens, 0)
    const totalOutputTokens = aiGenerations.reduce((sum, generation) => sum + generation.outputTokens, 0)
    return { totalCost, totalCalls: aiGenerations.length, totalTokens: totalInputTokens + totalOutputTokens }
  }, [aiGenerations])

  const editStats = useMemo(() => {
    const withSnapshot = draftRevisions.filter((revision) => revision.source === 'ai' && revision.aiOriginalSnapshot)
    const edited = withSnapshot.filter(wasRevisionEditedByHuman)
    return { total: withSnapshot.length, edited: edited.length }
  }, [draftRevisions])

  const recentPublished = useMemo(
    () =>
      successAttempts
        .filter((attempt) => attempt.externalPostId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 10)
        .map((attempt) => ({ attempt, job: jobById.get(attempt.publishJobId) }))
        .filter((row): row is { attempt: typeof row.attempt; job: NonNullable<typeof row.job> } => Boolean(row.job)),
    [successAttempts, jobById],
  )

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

      {isTruncated && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          このワークスペースには、これらの統計が対象とする範囲より多くの履歴があります — 以下の数値は直近の活動のみを反映したものであり、全期間の完全な記録ではありません。
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="公開成功率" value={successRate === null ? '—' : `${successRate}%`} icon="✅" trend={`${totalAttempts}件中${successAttempts.length}件成功`} />
        <StatCard label="AI生成の呼び出し回数" value={aiTotals.totalCalls} icon="🤖" trend={`合計${aiTotals.totalTokens.toLocaleString()}トークン`} />
        <StatCard label="AIコスト（累計）" value={formatCost(aiTotals.totalCost)} icon="💰" />
        <StatCard
          label="AI提案の編集率"
          value={editStats.total === 0 ? '—' : `${Math.round((editStats.edited / editStats.total) * 100)}%`}
          icon="✏️"
          trend={editStats.total === 0 ? 'まだAI提案由来の承認がありません' : `承認済みAIドラフト${editStats.total}件中${editStats.edited}件を編集`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">媒体別の公開状況</h2>
          {perChannel.length === 0 ? (
            <EmptyState title="まだ公開の試行がありません" description="ジョブが実行されると（Workerまたは「今すぐ公開」）、媒体ごとの成功・失敗がここに表示されます。" />
          ) : (
            <div className="space-y-3">
              {perChannel.map(([channel, counts]) => {
                const total = counts.success + counts.failed
                const rate = total > 0 ? Math.round((counts.success / total) * 100) : 0
                return (
                  <div key={channel} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <ChannelBadge channel={channel} />
                      <span className="text-sm font-medium text-gray-700">成功率{rate}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{counts.success}件成功 · {counts.failed}件失敗</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">失敗理由</h2>
          {failureReasonCounts.length === 0 ? (
            <EmptyState title="失敗の記録はありません" description="公開に失敗した試行とその理由がここに表示されます。" icon="🕊️" />
          ) : (
            <div className="space-y-3">
              {failureReasonCounts.map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <span className="text-sm text-gray-700">{FAILURE_REASON_LABELS[reason]}</span>
                  <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">{count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
        <div className="mb-4 flex items-center justify-between gap-3">
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
                    {state?.status === 'error' && <p className="mt-1 text-xs text-red-500">{state.message}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {attempt.externalUrl && (
                      <a href={attempt.externalUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-stone-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-stone-50">
                        投稿を開く
                      </a>
                    )}
                    <button
                      onClick={() => void handleLoadMetrics(job.id)}
                      disabled={state?.status === 'loading'}
                      className="rounded-2xl bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      {state?.status === 'loading' ? '取得中…' : 'メトリクスを取得'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
