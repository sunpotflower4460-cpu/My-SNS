import Link from 'next/link'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import ContentCard from '@/components/ui/ContentCard'
import {
  MOCK_CONTENTS,
  MOCK_PUBLISH_JOBS,
  MOCK_INBOX_ITEMS,
  MOCK_AUDIT_LOGS,
} from '@/lib/mock/seed'

export default function DashboardPage() {
  const draftCount = MOCK_CONTENTS.filter((c) => c.status === 'draft').length
  const queueCount = MOCK_PUBLISH_JOBS.filter((j) => j.status === 'scheduled').length
  const unreadCount = MOCK_INBOX_ITEMS.filter((i) => !i.isRead).length
  const recentContent = [...MOCK_CONTENTS]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3)
  const recentActivity = [...MOCK_AUDIT_LOGS]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Welcome back — here's what's happening in your workspace."
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Content" value={MOCK_CONTENTS.length} icon="📄" />
        <StatCard label="Drafts" value={draftCount} icon="✏️" trend="Waiting to publish" />
        <StatCard label="Scheduled Jobs" value={queueCount} icon="📅" trend="In queue" />
        <StatCard label="Unread Inbox" value={unreadCount} icon="📬" trend="Needs attention" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Content */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Recent Content</h2>
            <Link href="/app/content" className="text-sm text-violet-600 hover:text-violet-800">
              View all →
            </Link>
          </div>
          <div className="grid gap-3">
            {recentContent.map((content) => (
              <ContentCard key={content.id} content={content} />
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 mt-6">
            <Link
              href="/app/content/new"
              className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"
            >
              + New Content
            </Link>
            <Link
              href="/app/inbox"
              className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Open Inbox
            </Link>
          </div>
        </div>

        {/* Latest Activity */}
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Latest Activity</h2>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {recentActivity.map((log) => (
              <div key={log.id} className="px-4 py-3">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">{log.actor?.name ?? 'Unknown'}</span>{' '}
                  <span className="text-gray-500">{log.action.replace(/_/g, ' ')}</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(log.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
