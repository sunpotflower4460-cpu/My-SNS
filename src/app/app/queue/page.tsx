'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import ChannelBadge from '@/components/ui/ChannelBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import { getDraftRevisionById } from '@/lib/repositories/supabase/draft-revisions'
import { formatRevisionForNote } from '@/lib/services/note-handoff'
import {
  describeJobStatus,
  filterAndSortJobs,
  getJobActions,
  publishModeLabel,
} from '@/lib/presentation/queue-presenter'
import type { PublishJob, PublishJobStatus } from '@/lib/domain/types'

const STATUS_FILTERS: Array<{ label: string; value: PublishJobStatus | 'all' }> = [
  { label: 'すべて', value: 'all' },
  { label: '予約済み', value: 'scheduled' },
  { label: '公開済み', value: 'published' },
  { label: '失敗', value: 'failed' },
  { label: '下書き', value: 'draft' },
  { label: 'キャンセル済み', value: 'cancelled' },
]

export default function QueuePage() {
  const { cancelQueueJob, completeManualPublish, currentMember, currentWorkspace, publishJobs, retryQueueJob, seeds, triggerPublishJob } = useApp()
  const canManageQueue = Boolean(currentMember && hasPermission(currentMember.role, 'manage_queue'))
  const [activeStatus, setActiveStatus] = useState<PublishJobStatus | 'all'>('all')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [busyJobId, setBusyJobId] = useState<string | null>(null)

  const filtered = useMemo(() => filterAndSortJobs(publishJobs, activeStatus), [activeStatus, publishJobs])

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
      <PageHeader title="公開予定" description="このワークスペースの予約・失敗・下書き状態の投稿ジョブを確認できます。" />

      {feedback && <div className="mb-5"><InlineAlert tone="success">{feedback}</InlineAlert></div>}
      {error && <div className="mb-5"><InlineAlert tone="error">{error}</InlineAlert></div>}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveStatus(filter.value)}
            aria-pressed={activeStatus === filter.value}
            className={`inline-flex min-h-touch items-center justify-center rounded-full px-3.5 text-sm font-medium transition sm:min-h-control ${
              activeStatus === filter.value ? 'bg-violet-600 text-white shadow-sm' : 'border border-stone-200 bg-white text-gray-600 hover:bg-stone-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="該当するジョブがありません" description="フィルターを変えるか、媒体の下書きを承認して後で予約してください。" />
      ) : (
        <Card size="container" padded={false} className="overflow-hidden">
          <div className="divide-y divide-stone-100">
            {filtered.map((job) => {
              const actions = getJobActions(job, canManageQueue)
              const busy = busyJobId === job.id
              return (
                <div key={job.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChannelBadge channel={job.channel} />
                    <StatusBadge status={job.status} />
                    <Badge tone="neutral">{publishModeLabel(job.publishMode)}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{getSeedTitle(job.seedId)}</p>
                    <p className="mt-1 text-xs text-gray-500">{describeJobStatus(job)}</p>
                    {job.errorMessage && <p className="mt-2 text-xs text-rose-600">{job.errorMessage}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {actions.copyForNote && (
                      <Button size="sm" variant="secondary" onClick={() => void handleCopyForNote(job)} disabled={busy}>
                        note.com用にコピー
                      </Button>
                    )}
                    {actions.publishNow && (
                      <Button size="sm" variant="primary" onClick={() => handleTrigger(job.id)} loading={busy}>
                        今すぐ公開
                      </Button>
                    )}
                    {actions.completeManually && (
                      <Button size="sm" variant="secondary" onClick={() => handleCompleteManually(job.id)} disabled={busy}>
                        投稿済みにする
                      </Button>
                    )}
                    {actions.retry && (
                      <Button size="sm" variant="secondary" onClick={() => handleRetry(job.id)} disabled={busy}>
                        再試行
                      </Button>
                    )}
                    {actions.cancel && (
                      <Button size="sm" variant="destructive" onClick={() => handleCancel(job.id)} disabled={busy}>
                        キャンセル
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
