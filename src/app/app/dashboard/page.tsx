'use client'

import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import ContentCard from '@/components/ui/ContentCard'
import EmptyState from '@/components/ui/EmptyState'
import { describeAuditLog, getAuditLogMeta } from '@/lib/audit/presenter'
import { useMockApp } from '@/lib/mock/store/provider'

export default function DashboardPage() {
  const { auditLogs, contents, currentWorkspace, inboxItems, publishJobs } = useMockApp()

  const draftCount = contents.filter((content) => content.status === 'draft').length
  const readyCount = contents.filter((content) => content.status === 'ready').length
  const queueCount = publishJobs.filter((job) => job.status === 'scheduled').length
  const unreadCount = inboxItems.filter((item) => !item.isRead).length
  const recentContent = [...contents]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 3)
  const recentActivity = auditLogs.slice(0, 6)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back to ${currentWorkspace?.name ?? 'your workspace'} — a calm snapshot of what needs attention next.`}
      />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Content" value={contents.length} icon="📄" />
        <StatCard label="Drafts" value={draftCount} icon="✏️" trend={`${readyCount} ready to review`} />
        <StatCard label="Scheduled Jobs" value={queueCount} icon="📅" trend="Queue moving" />
        <StatCard label="Unread Inbox" value={unreadCount} icon="📬" trend="Needs attention" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Recent content</h2>
            <Link href="/app/content" className="text-sm font-medium text-violet-600 hover:text-violet-800">
              View all →
            </Link>
          </div>

          {recentContent.length === 0 ? (
            <EmptyState
              title="No content yet"
              description="Create the first piece for this workspace to start building momentum."
              action={
                <Link href="/app/content/new" className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
                  + New Content
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {recentContent.map((content) => (
                <ContentCard key={content.id} content={content} />
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/app/content/new"
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              + New Content
            </Link>
            <Link
              href="/app/inbox"
              className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-stone-50"
            >
              Open Inbox
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100/80">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Recent activity</h2>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-gray-500">
              {recentActivity.length} events
            </span>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState
              title="No recent activity yet"
              description="Recent content, inbox, queue, and team actions will appear here for this workspace."
              icon="🕊️"
            />
          ) : (
            <div className="space-y-3">
              {recentActivity.map((log) => (
                <div key={log.id} className="rounded-2xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <p className="text-sm leading-6 text-gray-700">{describeAuditLog(log)}</p>
                  <p className="mt-1 text-xs text-gray-400">{getAuditLogMeta(log)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
