import { notFound } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import PlatformBadge from '@/components/ui/PlatformBadge'
import {
  MOCK_CONTENTS,
  MOCK_ASSETS,
  MOCK_SOCIAL_DRAFTS,
  MOCK_PUBLISH_JOBS,
  MOCK_AUDIT_LOGS,
  MOCK_INBOX_ITEMS,
} from '@/lib/mock/seed'

interface ContentDetailPageProps {
  params: { id: string }
}

export default function ContentDetailPage({ params }: ContentDetailPageProps) {
  const content = MOCK_CONTENTS.find((c) => c.id === params.id)
  if (!content) notFound()

  const assets = MOCK_ASSETS.filter((a) => a.contentId === content.id)
  const drafts = MOCK_SOCIAL_DRAFTS.filter((d) => d.contentId === content.id)
  const jobs = MOCK_PUBLISH_JOBS.filter((j) => j.contentId === content.id)
  const logs = MOCK_AUDIT_LOGS.filter((l) => l.targetId === content.id).slice(0, 5)
  const reactions = MOCK_INBOX_ITEMS.filter((i) => i.contentId === content.id)

  return (
    <div>
      <PageHeader
        title={content.title}
        description={`${content.type} · ${content.status}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/app/content"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back
            </Link>
            <StatusBadge status={content.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Metadata */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Metadata</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500 w-20 inline-block">Title</span>
                <span className="text-gray-900 font-medium">{content.title}</span>
              </div>
              <div>
                <span className="text-gray-500 w-20 inline-block">Body</span>
                <span className="text-gray-700">{content.body ?? '—'}</span>
              </div>
              <div>
                <span className="text-gray-500 w-20 inline-block">Author</span>
                <span className="text-gray-700">{content.author?.name ?? '—'}</span>
              </div>
              <div>
                <span className="text-gray-500 w-20 inline-block">Tags</span>
                <span className="text-gray-700">{content.tags.join(', ')}</span>
              </div>
              <div>
                <span className="text-gray-500 w-20 inline-block">Updated</span>
                <span className="text-gray-700">{new Date(content.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Assets */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Assets</h2>
            {assets.length === 0 ? (
              <p className="text-sm text-gray-400">No assets attached.</p>
            ) : (
              <div className="space-y-2">
                {assets.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                    <span className="text-base">📎</span>
                    <span className="flex-1 text-sm text-gray-700">{a.name}</span>
                    <span className="text-xs text-gray-400">{(a.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Social Drafts */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Social Drafts</h2>
            {drafts.length === 0 ? (
              <p className="text-sm text-gray-400">No drafts created yet.</p>
            ) : (
              <div className="space-y-3">
                {drafts.map((d) => (
                  <div key={d.id} className="p-3 border border-gray-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <PlatformBadge platform={d.platform} />
                      <StatusBadge status={d.status} />
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{d.draftText}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-5">
          {/* Publish Queue */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Publish Queue</h2>
            {jobs.length === 0 ? (
              <p className="text-sm text-gray-400">No jobs queued.</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => (
                  <div key={j.id} className="flex items-center gap-2">
                    <PlatformBadge platform={j.platform} />
                    <StatusBadge status={j.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inbox Reactions */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Inbox Reactions</h2>
            {reactions.length === 0 ? (
              <p className="text-sm text-gray-400">No reactions yet.</p>
            ) : (
              <div className="space-y-2">
                {reactions.map((r) => (
                  <div key={r.id} className="text-sm">
                    <span className="font-medium text-gray-700">{r.authorHandle}</span>
                    <p className="text-gray-500 text-xs line-clamp-1">{r.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Trail */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Audit Trail</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400">No log entries.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((l) => (
                  <div key={l.id}>
                    <p className="text-xs text-gray-600">
                      <span className="font-medium">{l.actor?.name}</span>{' '}
                      {l.action.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(l.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
