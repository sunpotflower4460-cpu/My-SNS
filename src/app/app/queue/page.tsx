'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import ChannelBadge from '@/components/ui/ChannelBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import { getDraftRevisionById } from '@/lib/repositories/supabase/draft-revisions'
import { formatRevisionForNote } from '@/lib/services/note-handoff'
import type { PublishJob, PublishJobStatus } from '@/lib/domain/types'

const STATUS_FILTERS: Array<{ label: string; value: PublishJobStatus | 'all' }> = [
  { label: 'すべて', value: 'all' },
  { label: '予約済み', value: 'scheduled' },
  { label: '公開済み', value: 'published' },
  { label: '失敗', value: 'failed' },
  { label: '下書き', value: 'draft' },
  { label: 'キャンセル済み', value: 'cancelled' },
]

const PUBLISH_MODE_LABELS: Record<string, string> = {
  auto: '自動',
  assisted: '要確認',
  draft: '下書き',
  manual: '手動',
  owned: '自社媒体',
}

const ACTIVE_STATUSES: PublishJobStatus[] = ['scheduled', 'draft', 'failed']

export default function QueuePage() {
  const { cancelQueueJob, completeManualPublish, currentMember, currentWorkspace, publishJobs, retryQueueJob, seeds, triggerPublishJob } = useApp()
  const canManageQueue = Boolean(currentMember && hasPermission(currentMember.role, 'manage_queue'))
  const [activeStatus, setActiveStatus] = useState<PublishJobStatus | 'all'>('all')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [busyJobId, setBusyJobId] = useState<string | null>(null)

  const filtered = useMemo(
    () => publishJobs.filter((job) => activeStatus === 'all' || job.status === activeStatus).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [activeStatus, publishJobs],
  )

  const getSeedTitle = (seedId: string) => seeds.find((seed) => seed.id === seedId)?.title ?? seedId

  const handleRetry = async (jobId: string) => {
    setBusyJobId(jobId)
    try {
      await retryQueueJob(jobId)
      setFeedback('公開キューの項目を予約済みに戻しました。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '再試行できませんでした。')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  const handleCancel = async (jobId: string) => {
    setBusyJobId(jobId)
    try {
      await cancelQueueJob(jobId)
      setFeedback('公開キューの項目をキャンセルしました。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'キャンセルできませんでした。')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  const handleCompleteManually = async (jobId: string) => {
    const externalUrl = window.prompt('任意：記録用に、公開されたURLを貼り付けてください。')?.trim() || undefined
    setBusyJobId(jobId)
    try {
      await completeManualPublish(jobId, externalUrl)
      setFeedback('投稿済みにしました。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '投稿済みとして記録できませんでした。')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  const handleTrigger = async (jobId: string) => {
    setBusyJobId(jobId)
    try {
      const result = await triggerPublishJob(jobId)
      setFeedback(result.success ? '公開しました。' : '公開に失敗しました。下記のエラーをご確認ください。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '公開できませんでした。')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  const handleCopyForNote = async (job: PublishJob) => {
    if (!currentWorkspace) return
    setBusyJobId(job.id)
    try {
      const revision = await getDraftRevisionById(currentWorkspace.id, job.revisionId)
      if (!revision) throw new Error('この項目の承認済みコンテンツが見つかりませんでした。')
      await navigator.clipboard.writeText(formatRevisionForNote(revision))
      setFeedback('コピーしました。note.comに貼り付けて公開したら、「投稿済みにする」を押してください。')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'この下書きをコピーできませんでした。')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  return (
    <div>
      <PageHeader title="公開キュー" description="このワークスペースの予約・失敗・下書き状態の投稿ジョブを確認できます。" />

      {(feedback || error) && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>
          {error || feedback}
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setActiveStatus(filter.value)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${activeStatus === filter.value ? 'bg-violet-600 text-white shadow-sm' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'}`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="該当するジョブがありません" description="フィルターを変えるか、媒体の下書きを承認して後で予約してください。" />
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm shadow-stone-100/80">
          <div className="divide-y divide-stone-100">
            {filtered.map((job) => {
              const isActive = ACTIVE_STATUSES.includes(job.status)
              return (
              <div key={job.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3">
                  <ChannelBadge channel={job.channel} />
                  <StatusBadge status={job.status} />
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-stone-500">{PUBLISH_MODE_LABELS[job.publishMode] ?? job.publishMode}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{getSeedTitle(job.seedId)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {job.status === 'failed'
                      ? 'エラーが発生しました。再試行するか、キャンセルしてください。'
                      : job.status === 'cancelled'
                        ? '公開キューから除外されています'
                        : job.status === 'published'
                          ? job.publishedAt ? `公開日時: ${new Date(job.publishedAt).toLocaleString('ja-JP')}` : '公開済み'
                          : job.publishMode === 'manual'
                            ? 'ご自身で投稿し、「投稿済みにする」から完了を記録してください'
                            : job.publishMode === 'assisted' || job.publishMode === 'draft'
                              ? '自動では公開されません。「今すぐ公開」を押して手動で公開してください'
                              : job.scheduledAt
                                ? `予約日時: ${new Date(job.scheduledAt).toLocaleString('ja-JP')}`
                                : 'まだ予約されていません'}
                  </p>
                  {job.errorMessage && <p className="mt-2 text-xs text-red-500">{job.errorMessage}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {canManageQueue && job.channel === 'note' && isActive && (
                    <button
                      onClick={() => void handleCopyForNote(job)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl border border-stone-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-stone-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      note.com用にコピー
                    </button>
                  )}
                  {canManageQueue && (job.publishMode === 'assisted' || job.publishMode === 'draft') && isActive && (
                    <button
                      onClick={() => handleTrigger(job.id)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-50"
                    >
                      今すぐ公開
                    </button>
                  )}
                  {canManageQueue && isActive && job.publishMode !== 'auto' && (
                    <button
                      onClick={() => handleCompleteManually(job.id)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      投稿済みにする
                    </button>
                  )}
                  {canManageQueue && job.status === 'failed' && job.publishMode === 'auto' && (
                    <button
                      onClick={() => handleRetry(job.id)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      再試行
                    </button>
                  )}
                  {canManageQueue && isActive && (
                    <button
                      onClick={() => handleCancel(job.id)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl border border-stone-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-stone-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                    >
                      キャンセル
                    </button>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
