interface StatusBadgeProps {
  status: string
}

const STATUS_STYLES: Record<string, string> = {
  captured: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  ready: 'bg-blue-100 text-blue-700 border-blue-200',
  published: 'bg-green-100 text-green-700 border-green-200',
  archived: 'bg-red-100 text-red-600 border-red-200',
  scheduled: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  failed: 'bg-red-100 text-red-600 border-red-200',
  cancelled: 'bg-orange-100 text-orange-600 border-orange-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  rejected: 'bg-red-100 text-red-600 border-red-200',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  accepted: 'bg-green-100 text-green-700 border-green-200',
  expired: 'bg-gray-100 text-gray-500 border-gray-200',
  revoked: 'bg-red-100 text-red-500 border-red-200',
}

// Spans Seed / draft / publish job / invitation statuses — kept in one map
// since none of these domains ever share a status value with a different
// meaning (e.g. "draft" only ever means the draft-content status).
const STATUS_LABELS: Record<string, string> = {
  captured: '取り込み済み',
  draft: '下書き',
  ready: '準備完了',
  published: '公開済み',
  archived: 'アーカイブ済み',
  scheduled: '予約済み',
  failed: '失敗',
  cancelled: 'キャンセル済み',
  approved: '承認済み',
  rejected: '却下済み',
  pending: '保留中',
  accepted: '参加済み',
  expired: '期限切れ',
  revoked: '取り消し済み',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.05em] ${style}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
