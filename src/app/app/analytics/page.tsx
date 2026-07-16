'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import ChannelBadge from '@/components/ui/ChannelBadge'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import { wasRevisionEditedByHuman } from '@/lib/repositories/supabase/draft-revisions'
import type { PostMetrics, PublishFailureReason, PublishingChannel } from '@/lib/domain/types'

const FAILURE_REASON_LABELS: Record<PublishFailureReason, string> = {
  auth: 'Auth / token',
  ratelimit: 'Rate limited',
  validation: 'Validation',
  network: 'Network',
  unavailable: 'Connector unavailable',
}

function formatCost(usd: number): string {
  return usd > 0 ? `$${usd.toFixed(usd < 1 ? 4 : 2)}` : '$0 (no cost rate set)'
}

type MetricsState = { status: 'loading' } | { status: 'loaded'; metrics: PostMetrics } | { status: 'error'; message: string }

export default function AnalyticsPage() {
  const { aiGenerations, currentWorkspace, draftRevisions, fetchPostMetrics, publishAttempts, publishJobs, seeds } = useApp()
  const [metricsByJob, setMetricsByJob] = useState<Record<string, MetricsState>>({})

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
      setMetricsByJob((prev) => ({ ...prev, [jobId]: { status: 'error', message: cause instanceof Error ? cause.message : 'Unable to fetch metrics.' } }))
    }
  }

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`How publishing and AI proposals are actually going in ${currentWorkspace?.name ?? 'this workspace'} — derived from real attempt records, not estimates.`}
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Publish success rate" value={successRate === null ? '—' : `${successRate}%`} icon="✅" trend={`${successAttempts.length} of ${totalAttempts} attempts`} />
        <StatCard label="AI generation calls" value={aiTotals.totalCalls} icon="🤖" trend={`${aiTotals.totalTokens.toLocaleString()} tokens total`} />
        <StatCard label="AI cost so far" value={formatCost(aiTotals.totalCost)} icon="💰" />
        <StatCard
          label="AI proposals edited"
          value={editStats.total === 0 ? '—' : `${Math.round((editStats.edited / editStats.total) * 100)}%`}
          icon="✏️"
          trend={editStats.total === 0 ? 'No AI-sourced approvals yet' : `${editStats.edited} of ${editStats.total} approved AI drafts changed`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Publishing by channel</h2>
          {perChannel.length === 0 ? (
            <EmptyState title="No publish attempts yet" description="Once jobs run (Worker or Publish now), success/failure per channel shows up here." />
          ) : (
            <div className="space-y-3">
              {perChannel.map(([channel, counts]) => {
                const total = counts.success + counts.failed
                const rate = total > 0 ? Math.round((counts.success / total) * 100) : 0
                return (
                  <div key={channel} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <ChannelBadge channel={channel} />
                      <span className="text-sm font-medium text-gray-700">{rate}% success</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{counts.success} succeeded · {counts.failed} failed</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Failure reasons</h2>
          {failureReasonCounts.length === 0 ? (
            <EmptyState title="No failures recorded" description="Failed publish attempts and why they failed will appear here." icon="🕊️" />
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
          <h2 className="text-base font-semibold text-gray-900">Recently published</h2>
          <span className="text-xs text-gray-400">Metrics are fetched live, not stored — numbers may lag the platform slightly.</span>
        </div>
        {recentPublished.length === 0 ? (
          <EmptyState title="Nothing published yet" description="Successful publish attempts with a recorded post will appear here." />
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
                    <p className="mt-1 text-xs text-gray-500">{new Date(attempt.createdAt).toLocaleString()}</p>
                    {state?.status === 'loaded' && (
                      <p className="mt-1 text-xs text-gray-600">
                        {[
                          state.metrics.views !== undefined ? `${state.metrics.views.toLocaleString()} views` : null,
                          state.metrics.likes !== undefined ? `${state.metrics.likes.toLocaleString()} likes` : null,
                          state.metrics.comments !== undefined ? `${state.metrics.comments.toLocaleString()} comments` : null,
                          state.metrics.shares !== undefined ? `${state.metrics.shares.toLocaleString()} shares` : null,
                        ].filter(Boolean).join(' · ') || 'No metrics reported for this post.'}
                      </p>
                    )}
                    {state?.status === 'error' && <p className="mt-1 text-xs text-red-500">{state.message}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {attempt.externalUrl && (
                      <a href={attempt.externalUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-stone-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-stone-50">
                        Open post
                      </a>
                    )}
                    <button
                      onClick={() => void handleLoadMetrics(job.id)}
                      disabled={state?.status === 'loading'}
                      className="rounded-2xl bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      {state?.status === 'loading' ? 'Loading…' : 'Load metrics'}
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
