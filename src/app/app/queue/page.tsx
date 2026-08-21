'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import ChannelBadge from '@/components/ui/ChannelBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { Badge, Button, Card, InlineAlert } from '@/components/ui/kit'
import { useApp } from '@/lib/app/app-provider'
import { hasPermission } from '@/lib/permissions'
import { getPublishingStrategy, PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { buildPublishHandoff, formatRevisionForHandoff } from '@/lib/services/publish-handoff'
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

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('クリップボードへコピーできませんでした。')
}

export default function QueuePage() {
  const {
    cancelQueueJob,
    completeManualPublish,
    currentMember,
    draftRevisions,
    publishJobs,
    retryQueueJob,
    seeds,
    triggerPublishJob,
  } = useApp()
  const canManageQueue = Boolean(currentMember && hasPermission(currentMember.role, 'manage_queue'))
  const publishingStrategy = getPublishingStrategy()
  const apiPublishingEnabled = publishingStrategy === 'api-first'
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
      setFeedback('この予定を予約済みに戻しました。')
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
      setFeedback('この予定をキャンセルしました。')
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

  const handleOpenHandoff = async (job: PublishJob) => {
    const revision = draftRevisions.find((entry) => entry.id === job.revisionId)
    if (!revision) {
      setError('この項目の承認済みコンテンツが見つかりませんでした。')
      setFeedback('')
      return
    }

    const text = formatRevisionForHandoff(revision, job.channel)
    const target = buildPublishHandoff(job.channel, text)
    if (!target) {
      setError('この媒体には外部SNSの投稿画面がありません。')
      setFeedback('')
      return
    }

    // Open synchronously from the click event so browsers do not treat this as
    // an async popup. Clipboard work can safely finish after the new tab opens.
    const opened = window.open(target.url, '_blank', 'noopener,noreferrer')
    setBusyJobId(job.id)

    try {
      await copyText(text)
      const popupNote = opened ? '' : ' 投稿画面の自動オープンはブラウザに止められましたが、文章はコピー済みです。'
      setFeedback(`${target.instruction} 投稿文はクリップボードにもコピー済みです。${popupNote}`.trim())
      setError('')
    } catch (cause) {
      if (target.prefilledText && opened) {
        // X Web Intent already owns the text, so a denied clipboard permission
        // should not turn a successful no-cost handoff into a fake failure.
        setFeedback(target.instruction)
        setError('')
      } else {
        setError(cause instanceof Error ? cause.message : '投稿文をコピーできませんでした。投稿画面は開いています。')
        setFeedback('')
      }
    } finally {
      setBusyJobId(null)
    }
  }

  return (
    <div>
      <PageHeader title="公開予定" description="承認済みの投稿を、一箇所から各SNSへ安全に渡して公開できます。" />

      {publishingStrategy === 'zero-cost' && (
        <div className="mb-5">
          <InlineAlert tone="info" title="無料投稿モード">
            外部の有料投稿APIは使いません。「○○へ投稿」を押すと承認済み文章をコピーして、そのSNS自身の投稿画面を開きます。画像・動画は投稿画面側で選び、最後の公開ボタンだけご自身で押してください。
          </InlineAlert>
        </div>
      )}

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
        <EmptyState title="該当するジョブがありません" description="フィルターを変えるか、媒体の下書きを承認して公開予定へ追加してください。" />
      ) : (
        <Card size="container" padded={false} className="overflow-hidden">
          <div className="divide-y divide-stone-100">
            {filtered.map((job) => {
              const actions = getJobActions(job, canManageQueue, apiPublishingEnabled)
              const busy = busyJobId === job.id
              const channelLabel = PUBLISHING_CHANNEL_CONFIG[job.channel].shortLabel
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
                    {actions.openHandoff && (
                      <Button size="sm" variant="primary" onClick={() => void handleOpenHandoff(job)} disabled={busy}>
                        {channelLabel}へ投稿
                      </Button>
                    )}
                    {actions.publishNow && (
                      <Button size="sm" variant="primary" onClick={() => handleTrigger(job.id)} disabled={busy}>
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
