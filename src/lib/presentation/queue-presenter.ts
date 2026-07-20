import type { PublishJob, PublishJobStatus, PublishMode } from '@/lib/domain/types'

// Pure presenter for the 公開予定 (Queue) page (UI-PR7). The rules for which
// actions a job offers and what its status line says are intricate (they depend
// on status × publish mode × permission), so they live here, unit-tested, and
// the page just renders the result. No schema/route/permission change — the same
// gates, just centralised.

const JST = 'Asia/Tokyo'

export const PUBLISH_MODE_LABELS: Record<PublishMode, string> = {
  auto: '自動',
  assisted: '要確認',
  draft: '下書き',
  manual: '手動',
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

/**
 * The human status line under a job's title. Mirrors the old inline conditional
 * exactly: failed / cancelled / published get their own copy; an active job's
 * line depends on its publish mode (manual → record it yourself, assisted/draft →
 * not auto-published, otherwise → scheduled time or "not scheduled yet").
 */
export function describeJobStatus(job: PublishJob): string {
  if (job.status === 'failed') return 'エラーが発生しました。再試行するか、キャンセルしてください。'
  if (job.status === 'cancelled') return '公開キューから除外されています'
  if (job.status === 'published') {
    return job.publishedAt ? `公開日時: ${formatJst(job.publishedAt)}` : '公開済み'
  }
  if (job.publishMode === 'manual') return 'ご自身で投稿し、「投稿済みにする」から完了を記録してください'
  if (job.publishMode === 'assisted' || job.publishMode === 'draft') {
    return '自動では公開されません。「今すぐ公開」を押して手動で公開してください'
  }
  return job.scheduledAt ? `予約日時: ${formatJst(job.scheduledAt)}` : 'まだ予約されていません'
}

export interface JobActions {
  copyForNote: boolean
  publishNow: boolean
  completeManually: boolean
  retry: boolean
  cancel: boolean
}

/**
 * Which actions a job offers to a viewer who can (or can't) manage the queue.
 * Every action requires manage permission; beyond that:
 *  - copyForNote: an active note job (manual copy handoff).
 *  - publishNow: an active assisted/draft job (never auto-run by the Worker).
 *  - completeManually: any active non-auto job (record a human publish).
 *  - retry: a failed auto job (re-enqueue for the Worker).
 *  - cancel: any active job.
 */
export function getJobActions(job: PublishJob, canManageQueue: boolean): JobActions {
  if (!canManageQueue) {
    return { copyForNote: false, publishNow: false, completeManually: false, retry: false, cancel: false }
  }
  const active = isActiveJob(job.status)
  return {
    copyForNote: active && job.channel === 'note',
    publishNow: active && (job.publishMode === 'assisted' || job.publishMode === 'draft'),
    completeManually: active && job.publishMode !== 'auto',
    retry: job.status === 'failed' && job.publishMode === 'auto',
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
