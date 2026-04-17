'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import PlatformBadge from '@/components/ui/PlatformBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import { formatBytes } from '@/lib/mock/repositories/helpers'
import { useMockApp } from '@/lib/mock/store/provider'

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>()
  const { getContentDetail } = useMockApp()
  const detail = getContentDetail(params.id)

  if (!detail.content) {
    return (
      <div>
        <PageHeader title="Content not found" description="This entry is missing from the current workspace." />
        <EmptyState
          title="No content found"
          description="Try switching workspaces or go back to the library to create something new."
          action={<Link href="/app/content" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">Back to content</Link>}
        />
      </div>
    )
  }

  const { content, assets, drafts, jobs, inboxItems, auditLogs } = detail

  return (
    <div>
      <PageHeader
        title={content.title}
        description={`${content.type} · ${content.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/app/content" className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
            <StatusBadge status={content.status} />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Overview</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-gray-500">Body</dt>
                <dd className="mt-1 leading-6 text-gray-700">{content.body ?? '—'}</dd>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-gray-500">Author</dt>
                  <dd className="mt-1 text-gray-900">{content.author?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Updated</dt>
                  <dd className="mt-1 text-gray-900">{new Date(content.updatedAt).toLocaleString()}</dd>
                </div>
              </div>
              <div>
                <dt className="text-gray-500">Tags</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {content.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">#{tag}</span>
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Attached assets</h2>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">{assets.length}</span>
            </div>
            {assets.length === 0 ? (
              <p className="text-sm text-gray-500">No assets attached yet.</p>
            ) : (
              <div className="space-y-3">
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-4 rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                    {asset.type === 'image' && asset.url ? (
                      <div
                        aria-label={asset.name}
                        className="h-14 w-14 rounded-2xl bg-cover bg-center"
                        style={{ backgroundImage: `url(${asset.url})` }}
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl">📎</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{asset.name}</p>
                      <p className="text-xs text-gray-500">{asset.type} · {formatBytes(asset.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Related drafts</h2>
            {drafts.length === 0 ? (
              <p className="text-sm text-gray-500">No drafts saved for this content yet.</p>
            ) : (
              <div className="space-y-3">
                {drafts.map((draft) => (
                  <div key={draft.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <PlatformBadge platform={draft.platform} />
                      <StatusBadge status={draft.status} />
                    </div>
                    <p className="text-sm leading-6 text-gray-600">{draft.draftText}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Queue snippets</h2>
            {jobs.length === 0 ? (
              <p className="text-sm text-gray-500">No jobs queued.</p>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <PlatformBadge platform={job.platform} />
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="text-xs text-gray-500">{job.scheduledAt ? `Scheduled ${new Date(job.scheduledAt).toLocaleString()}` : 'Awaiting scheduling'}</p>
                    {job.errorMessage && <p className="mt-2 text-xs text-red-500">{job.errorMessage}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Inbox reactions</h2>
            {inboxItems.length === 0 ? (
              <p className="text-sm text-gray-500">No related inbox activity yet.</p>
            ) : (
              <div className="space-y-3">
                {inboxItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <p className="text-sm font-medium text-gray-900">{item.authorHandle}</p>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Recent audit trail</h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-gray-500">No log entries yet.</p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-gray-900">{log.actor?.name ?? 'Unknown'}</span>{' '}
                      {log.action.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
