import type { PublishJob, PublishJobStatus, PublishMode } from '@/lib/domain/types'

// Pure presenter for the 公開予定 (Queue) page. The rules for which actions a
// job offers and what its status line says depend on status × publish mode ×
// permission, so they live here and stay unit-tested.

const JST = 'Asia/Tokyo'

export const PUBLISH_MODE_LABELS: Record<PublishMode, string> = {
  auto: '自動',
  assisted: '要確認',
  draft: '下書き',
  manual: '無料ハンドオフ',
  owned: '自社媒体',
}

export function publishModeLabel(mode: PublishMode): string {
  return PUBLISH_MODE_LABELS[mode] ?? mode
}

/** A job still in play (can be published, retried, or cancelled). */
const ACTIVE_STATUSES: PublishJobStatus[] = ['scheduled', 'draft', 'failed']
export function isActiveJob(status: PublishJobStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: JST })
}

/** Human-readable Queue guidance for one job. */
export function describeJobStatus(job: PublishJob): string {
  if (job.status === 'failed') return 'エラーが発生しました。再試行するか、キャンセルしてください。'
  if (job.status === 'cancelled') return '公開キューから除外されています'
  if (job.status === 'published') {
    return job.publishedAt ? `公開日時: ${formatJst(job.publishedAt)}` : '公開済み'
  }
  if (job.publishMode === 'manual') {
    const planned = job.scheduledAt ? `投稿予定: ${formatJst(job.scheduledAt)}。` : ''
    return `${planned}投稿文をコピーしてSNSの投稿画面を開き、公開後に「投稿済みにする」で完了を記録してください`
  }
  if (job.publishMode === 'assisted' || job.publishMode === 'draft') {
    return 'API-firstモードの確認対象です。「今すぐ公開」から接続済みAPIで処理してください'
  }
  return job.scheduledAt ? `予約日時: ${formatJst(job.scheduledAt)}` : 'まだ予約されていません'
}

export interface JobActions {
  openHandoff: boolean
  publishNow: boolean
  completeManually: boolean
  retry: boolean
  cancel: boolean
}

/**
 * Which actions a job offers to a viewer who can (or can't) manage the queue.
 * apiPublishingEnabled=false is the migration-safe zero-cost view: even old
 * auto/assisted jobs are handed to the platform UI instead of invoking an API.
 */
export function getJobActions(
  job: PublishJob,
  canManageQueue: boolean,
  apiPublishingEnabled = true,
): JobActions {
  if (!canManageQueue) {
    return { openHandoff: false, publishNow: false, completeManually: false, retry: false, cancel: false }
  }

  const active = isActiveJob(job.status)
  const isThirdPartyChannel = job.channel !== 'website'

  return {
    openHandoff: active && isThirdPartyChannel && (!apiPublishingEnabled || job.publishMode === 'manual'),
    publishNow: active && apiPublishingEnabled && (job.publishMode === 'assisted' || job.publishMode === 'draft'),
    completeManually: active && (job.publishMode !== 'auto' || !apiPublishingEnabled),
    retry: job.status === 'failed' && job.publishMode === 'auto' && apiPublishingEnabled,
    cancel: active,
  }
}

/** Jobs matching a status filter ('all' = everything), newest first. */
export function filterAndSortJobs(jobs: PublishJob[], status: PublishJobStatus | 'all'): PublishJob[] {
  return jobs
    .filter((job) => status === 'all' || job.status === status)
    .slice()
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
}
