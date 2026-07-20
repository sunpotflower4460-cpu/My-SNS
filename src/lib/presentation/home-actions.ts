import type {
  CalendarEvent,
  PublishJob,
  ReplyJob,
  InboxItem,
  SocialAccount,
  SocialDraft,
  Seed,
} from '@/lib/domain/types'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'

// The home screen presenter (UI-PR1b). Pure functions only — no React, no
// Date.now() inside (callers pass `now`) — so the "what should I do next" logic
// is unit-testable and timezone-explicit. The home page is a calm agenda, not a
// feature list: computeNextActions surfaces the few things that genuinely need a
// human, buildTodayTimeline shows today's schedule, getUpcomingPublishJobs shows
// the runway beyond today. Routes are unchanged; every href points at an
// existing screen.

const JST = 'Asia/Tokyo'

export type NextActionPriority = 'critical' | 'high' | 'normal'
export type NextActionCategory = 'publish' | 'reply' | 'approval' | 'setup'

/** One prioritized thing the creator should attend to, rendered as a card with a single action. */
export interface NextAction {
  id: string
  priority: NextActionPriority
  category: NextActionCategory
  title: string
  description: string
  href: string
  actionLabel: string
}

/** The slice of workspace data computeNextActions reads. */
export interface HomeSnapshot {
  publishJobs: PublishJob[]
  replyJobs: ReplyJob[]
  inboxItems: InboxItem[]
  drafts: SocialDraft[]
  seeds: Seed[]
  socialAccounts: SocialAccount[]
}

const PRIORITY_RANK: Record<NextActionPriority, number> = { critical: 0, high: 1, normal: 2 }

function channelLabel(channel: PublishJob['channel']): string {
  return PUBLISHING_CHANNEL_CONFIG[channel]?.label ?? channel
}

/**
 * The ordered list of next actions. Aggregated by concern (one card per kind,
 * with a count) so the list stays short and calm rather than one row per item.
 * Ordering: failures (critical) → urgent replies / pending approvals (high) →
 * everything else (normal). Stable within a priority tier (insertion order).
 */
export function computeNextActions(snapshot: HomeSnapshot): NextAction[] {
  const { publishJobs, replyJobs, inboxItems, drafts, seeds, socialAccounts } = snapshot
  const actions: NextAction[] = []

  // 1. Publishes that failed — the most urgent thing: something the creator
  //    expected to go out didn't.
  const failedPublishes = publishJobs.filter((job) => job.status === 'failed')
  if (failedPublishes.length > 0) {
    const only = failedPublishes.length === 1 ? failedPublishes[0] : null
    actions.push({
      id: 'publish-failed',
      priority: 'critical',
      category: 'publish',
      title: `公開に失敗した投稿が${failedPublishes.length}件あります`,
      description: '原因を確認して、もう一度公開するか下書きに戻せます。',
      href: only ? `/app/seeds/${only.seedId}` : '/app/queue',
      actionLabel: '確認する',
    })
  }

  // 2. Reply sends that failed.
  const failedReplies = replyJobs.filter((job) => job.status === 'failed')
  if (failedReplies.length > 0) {
    actions.push({
      id: 'reply-failed',
      priority: 'critical',
      category: 'reply',
      title: `返信の送信に失敗したメッセージが${failedReplies.length}件あります`,
      description: '接続状態を確認して、もう一度送信できます。',
      href: '/app/inbox',
      actionLabel: '確認する',
    })
  }

  // 3. Unread messages the AI judged high-priority.
  const urgentDms = inboxItems.filter((item) => !item.isRead && item.aiPriority === 'high')
  if (urgentDms.length > 0) {
    actions.push({
      id: 'inbox-urgent',
      priority: 'high',
      category: 'reply',
      title: `急ぎの返信が必要なメッセージが${urgentDms.length}件あります`,
      description: 'AIが優先度が高いと判断したメッセージです。',
      href: '/app/inbox',
      actionLabel: '返信する',
    })
  }

  // 4. AI drafts still waiting for a human to approve (CLAUDE.md #4: AI proposes,
  //    the human confirms — this is the gate, so it stays high-priority).
  const pendingDrafts = drafts.filter((draft) => draft.status === 'draft')
  if (pendingDrafts.length > 0) {
    const only = pendingDrafts.length === 1 ? pendingDrafts[0] : null
    actions.push({
      id: 'drafts-approval',
      priority: 'high',
      category: 'approval',
      title: `承認を待っている下書きが${pendingDrafts.length}件あります`,
      description: 'AIの提案を確認し、必要なら整えてから承認できます。',
      href: only ? `/app/seeds/${only.seedId}` : '/app/seeds',
      actionLabel: '確認する',
    })
  }

  // 5. Other inbox items flagged as needing action (excluding the urgent ones
  //    already surfaced above, so the same message isn't listed twice).
  const urgentIds = new Set(urgentDms.map((item) => item.id))
  const needsAction = inboxItems.filter((item) => item.needsAction && !urgentIds.has(item.id))
  if (needsAction.length > 0) {
    actions.push({
      id: 'inbox-needs-action',
      priority: 'normal',
      category: 'reply',
      title: `対応が必要なメッセージが${needsAction.length}件あります`,
      description: '受信箱で内容を確認できます。',
      href: '/app/inbox',
      actionLabel: '受信箱を開く',
    })
  }

  // 6. Setup gap: no connected account yet. Only shown when nothing is connected,
  //    so it fades away once the creator is set up.
  const hasConnection = socialAccounts.some((account) => account.connected)
  if (!hasConnection) {
    actions.push({
      id: 'setup-connect',
      priority: 'normal',
      category: 'setup',
      title: 'SNSアカウントを接続しましょう',
      description: '接続すると、投稿の公開やメッセージの受信ができるようになります。',
      href: '/app/settings',
      actionLabel: '接続する',
    })
  }

  // 7. Seeds captured but not yet ready — gentle nudge to keep momentum.
  const inProgressSeeds = seeds.filter((seed) => seed.status === 'captured')
  if (inProgressSeeds.length > 0) {
    const only = inProgressSeeds.length === 1 ? inProgressSeeds[0] : null
    actions.push({
      id: 'seeds-in-progress',
      priority: 'normal',
      category: 'publish',
      title: `仕上げ途中のシードが${inProgressSeeds.length}件あります`,
      description: '続きを整えると、公開できる状態になります。',
      href: only ? `/app/seeds/${only.id}` : '/app/seeds',
      actionLabel: '続きを整える',
    })
  }

  // Array.prototype.sort is stable, so ties keep the insertion order above.
  return actions.sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority])
}

// ─── Today timeline ────────────────────────────────────────────────────────────

export type TimelineKind = 'publish' | 'reply' | 'event'

/** One entry on today's agenda — a scheduled post, a queued reply, or a calendar event. */
export interface TimelineItem {
  id: string
  kind: TimelineKind
  /** Absolute ISO timestamp; the component formats it in JST. */
  at: string
  /** An all-day calendar event: show "終日" instead of a clock time. */
  allDay?: boolean
  title: string
  detail?: string
  href: string
}

export interface TimelineSnapshot {
  publishJobs: PublishJob[]
  replyJobs: ReplyJob[]
  calendarEvents: CalendarEvent[]
}

/** The JST calendar date (YYYY-MM-DD) an instant falls on. */
function jstDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: JST })
}

/**
 * Merge today's (JST) scheduled posts, queued replies, and calendar events into
 * one time-ordered agenda. "Today" is resolved from `now` in Asia/Tokyo so the
 * boundary matches what the creator sees on their clock, regardless of server TZ.
 */
export function buildTodayTimeline(snapshot: TimelineSnapshot, now: number): TimelineItem[] {
  const todayKey = new Date(now).toLocaleDateString('en-CA', { timeZone: JST })
  const items: TimelineItem[] = []

  for (const job of snapshot.publishJobs) {
    if (job.status !== 'scheduled' || !job.scheduledAt) continue
    if (jstDateKey(job.scheduledAt) !== todayKey) continue
    items.push({
      id: `publish-${job.id}`,
      kind: 'publish',
      at: job.scheduledAt,
      title: `${channelLabel(job.channel)}に公開`,
      href: `/app/seeds/${job.seedId}`,
    })
  }

  for (const job of snapshot.replyJobs) {
    if (job.status !== 'scheduled') continue
    if (jstDateKey(job.scheduledAt) !== todayKey) continue
    items.push({
      id: `reply-${job.id}`,
      kind: 'reply',
      at: job.scheduledAt,
      title: '返信を送信',
      detail: job.replyText.trim().slice(0, 40) || undefined,
      href: '/app/inbox',
    })
  }

  for (const event of snapshot.calendarEvents) {
    if (jstDateKey(event.startsAt) !== todayKey) continue
    items.push({
      id: `event-${event.id}`,
      kind: 'event',
      at: event.startsAt,
      allDay: event.allDay,
      title: event.title,
      detail: event.location || undefined,
      href: '/app/calendar',
    })
  }

  return items.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
}

/**
 * Scheduled publish jobs on a FUTURE (JST) day — the runway. Sorted soonest-
 * first and capped. Distinct from the timeline, which is today only, so nothing
 * overlaps. Strictly-future comparison also drops past-due jobs: an `assisted`
 * (YouTube) or `draft` (TikTok) job the Worker never auto-runs can sit in
 * `scheduled` with a past `scheduledAt` indefinitely, and must not surface at
 * the top of an "upcoming" list. JST date keys are ISO YYYY-MM-DD, so a string
 * `>` compares chronologically.
 */
export function getUpcomingPublishJobs(publishJobs: PublishJob[], now: number, limit = 5): PublishJob[] {
  const todayKey = new Date(now).toLocaleDateString('en-CA', { timeZone: JST })
  return publishJobs
    .filter((job) => job.status === 'scheduled' && Boolean(job.scheduledAt) && jstDateKey(job.scheduledAt as string) > todayKey)
    .sort((left, right) => new Date(left.scheduledAt as string).getTime() - new Date(right.scheduledAt as string).getTime())
    .slice(0, limit)
}
