'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import PlatformBadge from '@/components/ui/PlatformBadge'
import StatusBadge from '@/components/ui/StatusBadge'
import { describeAuditLog, getAuditLogMeta } from '@/lib/audit/presenter'
import { formatBytes, normalizeTags } from '@/lib/mock/repositories/helpers'
import { useMockApp } from '@/lib/app/app-provider'
import type { ContentStatus } from '@/lib/domain/types'

export default function ContentDetailPage() {
  const params = useParams<{ id: string }>()
  const { currentWorkspace, getContentDetail, updateContentItem } = useMockApp()
  const detail = getContentDetail(params.id)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [status, setStatus] = useState<ContentStatus>('draft')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const normalizedTags = useMemo(() => normalizeTags(tags), [tags])

  useEffect(() => {
    if (!detail.content) {
      return
    }

    setTitle(detail.content.title)
    setBody(detail.content.body ?? '')
    setTags(detail.content.tags.join(', '))
    setStatus(detail.content.status)
  }, [detail.content])

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

  const handleSave = async () => {
    try {
      await updateContentItem(content.id, {
        title,
        body,
        status,
        tags: normalizedTags,
      })
      setFeedback('Content details saved locally for this workspace.')
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save content.')
      setFeedback('')
    }
  }

  return (
    <div>
      <PageHeader
        title={content.title}
        description={`${content.type} · ${content.status} · ${currentWorkspace?.name ?? 'Current workspace'}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/app/content" className="text-sm text-gray-500 hover:text-gray-700">← Back</Link>
            <StatusBadge status={content.status} />
          </div>
        }
      />

      {(feedback || error) && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${error ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-green-200 bg-green-50 text-green-700'}`}>
          {error || feedback}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.95fr)]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">Overview</h2>
              <p className="text-xs text-gray-500">Draft and ready states stay editable in local mock state.</p>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Title</label>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Body</label>
                <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Status</label>
                  <select value={status} onChange={(event) => setStatus(event.target.value as ContentStatus)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Tags</label>
                  <input value={tags} onChange={(event) => setTags(event.target.value)} className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {normalizedTags.length > 0 ? (
                  normalizedTags.map((tag) => (
                    <span key={tag} className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">#{tag}</span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">No tags yet</span>
                )}
              </div>
              <div className="grid gap-4 border-t border-stone-100 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-gray-500">Author</p>
                  <p className="mt-1 text-gray-900">{content.author?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Updated</p>
                  <p className="mt-1 text-gray-900">{new Date(content.updatedAt).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleSave} className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700">
                  Save changes
                </button>
                <span className="text-xs text-gray-500">Content edits stay scoped to {currentWorkspace?.name ?? 'this workspace'}.</span>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm shadow-stone-100/80">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">Attached assets</h2>
              <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">{assets.length}</span>
            </div>
            {assets.length === 0 ? (
              <p className="text-sm text-gray-500">No assets attached yet for this workspace entry.</p>
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
              <p className="text-sm text-gray-500">No jobs queued from this workspace yet.</p>
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
                    <p className="text-sm leading-6 text-gray-700">{describeAuditLog(log)}</p>
                    <p className="mt-1 text-xs text-gray-400">{getAuditLogMeta(log)}</p>
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
