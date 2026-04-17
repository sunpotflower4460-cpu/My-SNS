'use client'

import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import PlatformBadge from '@/components/ui/PlatformBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import { MOCK_PUBLISH_JOBS, MOCK_CONTENTS } from '@/lib/mock/seed'
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
  const [activeStatus, setActiveStatus] = useState<PublishJobStatus | 'all'>('all')

  const filtered = MOCK_PUBLISH_JOBS.filter(
    (j) => activeStatus === 'all' || j.status === activeStatus,
  )

  const getContentTitle = (contentId: string) =>
    MOCK_CONTENTS.find((c) => c.id === contentId)?.title ?? contentId

  return (
    <div>
      <PageHeader
        title="Publish Queue"
        description="Track and manage your content publish jobs."
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeStatus === f.value
                ? 'bg-violet-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No jobs found"
          description="Try a different filter or schedule new content."
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map((job) => (
              <div key={job.id} className="px-5 py-4 flex items-center gap-4">
                <PlatformBadge platform={job.platform} />
                <StatusBadge status={job.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {getContentTitle(job.contentId)}
                  </p>
                  {job.scheduledAt && (
                    <p className="text-xs text-gray-400">
                      Scheduled: {new Date(job.scheduledAt).toLocaleString()}
                    </p>
                  )}
                  {job.errorMessage && (
                    <p className="text-xs text-red-500 mt-0.5">{job.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {job.status === 'failed' && (
                    <button className="text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-2.5 py-1 rounded-lg">
                      Retry
                    </button>
                  )}
                  {(job.status === 'scheduled' || job.status === 'draft') && (
                    <button className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 px-2.5 py-1 rounded-lg">
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
