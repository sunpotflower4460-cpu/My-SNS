'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import ChannelBadge from '@/components/ui/ChannelBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { useApp } from '@/lib/app/app-provider'
import type { PublishJobStatus } from '@/lib/domain/types'

const STATUS_FILTERS: Array<{ label: string; value: PublishJobStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Published', value: 'published' },
  { label: 'Failed', value: 'failed' },
  { label: 'Draft', value: 'draft' },
  { label: 'Cancelled', value: 'cancelled' },
]

export default function QueuePage() {
  const { cancelQueueJob, publishJobs, retryQueueJob, seeds } = useApp()
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
      setFeedback('Queue item moved back to scheduled.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to retry queue item.')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  const handleCancel = async (jobId: string) => {
    setBusyJobId(jobId)
    try {
      await cancelQueueJob(jobId)
      setFeedback('Queue item cancelled.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to cancel queue item.')
      setFeedback('')
    } finally {
      setBusyJobId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Publish Queue" description="Track scheduled, failed, and draft publish jobs in this workspace." />

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
        <EmptyState title="No jobs found" description="Try a different filter or approve a channel draft for scheduling later." />
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm shadow-stone-100/80">
          <div className="divide-y divide-stone-100">
            {filtered.map((job) => (
              <div key={job.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3">
                  <ChannelBadge channel={job.channel} />
                  <StatusBadge status={job.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{getSeedTitle(job.seedId)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {job.status === 'failed'
                      ? 'Needs retry or cancellation'
                      : job.status === 'cancelled'
                        ? 'Removed from the active queue'
                        : job.scheduledAt
                          ? `Scheduled: ${new Date(job.scheduledAt).toLocaleString()}`
                          : 'Not scheduled yet'}
                  </p>
                  {job.errorMessage && <p className="mt-2 text-xs text-red-500">{job.errorMessage}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {job.status === 'failed' && (
                    <button
                      onClick={() => handleRetry(job.id)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-wait disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                  {(job.status === 'scheduled' || job.status === 'draft' || job.status === 'failed') && (
                    <button
                      onClick={() => handleCancel(job.id)}
                      disabled={busyJobId === job.id}
                      className="rounded-2xl border border-stone-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-stone-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
