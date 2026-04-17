'use client'

import { useMemo, useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PlatformBadge from '@/components/ui/PlatformBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { useMockApp } from '@/lib/mock/store/provider'
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
  const { cancelQueueJob, contents, publishJobs, retryQueueJob } = useMockApp()
  const [activeStatus, setActiveStatus] = useState<PublishJobStatus | 'all'>('all')

  const filtered = useMemo(
    () => publishJobs.filter((job) => activeStatus === 'all' || job.status === activeStatus).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [activeStatus, publishJobs],
  )

  const getContentTitle = (contentId: string) => contents.find((content) => content.id === contentId)?.title ?? contentId

  return (
    <div>
      <PageHeader title="Publish Queue" description="Track and nudge scheduled, failed, and draft publish jobs in mock state." />

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
        <EmptyState title="No jobs found" description="Try a different filter or schedule new content." />
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm shadow-stone-100/80">
          <div className="divide-y divide-stone-100">
            {filtered.map((job) => (
              <div key={job.id} className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3">
                  <PlatformBadge platform={job.platform} />
                  <StatusBadge status={job.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{getContentTitle(job.contentId)}</p>
                  <p className="mt-1 text-xs text-gray-500">{job.scheduledAt ? `Scheduled: ${new Date(job.scheduledAt).toLocaleString()}` : 'Not scheduled yet'}</p>
                  {job.errorMessage && <p className="mt-2 text-xs text-red-500">{job.errorMessage}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {job.status === 'failed' && (
                    <button onClick={() => retryQueueJob(job.id)} className="rounded-2xl border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-50">
                      Retry
                    </button>
                  )}
                  {(job.status === 'scheduled' || job.status === 'draft' || job.status === 'failed') && (
                    <button onClick={() => cancelQueueJob(job.id)} className="rounded-2xl border border-stone-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-stone-50 hover:text-red-600">
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
