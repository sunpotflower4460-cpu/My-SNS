/**
 * Read-only projection of My-SNS state for Artist OS (contract v1).
 *
 * My-SNS stays the source of truth: this only reshapes rows it already owns into
 * attention/activity items. Approval actions are NOT exposed here — approving a
 * draft or reply needs a human session and role check, so every approval item
 * is a deeplink back into My-SNS, never a machine endpoint.
 *
 * Contract: Artist-OS/src/contracts/service.ts (SERVICE_CONTRACT_VERSION = 1).
 */
export const ARTIST_OS_CONTRACT_VERSION = 1 as const

export interface DraftRow {
  id: string
  channel: string
  created_at: string
}
export interface PublishJobRow {
  id: string
  channel: string
  status: 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
  scheduled_at: string | null
  published_at: string | null
  created_at: string
}
export interface InboxCountRow {
  needs_action: number
}
export interface ReplyJobRow {
  id: string
  platform: string
  status: 'scheduled' | 'sent' | 'failed' | 'cancelled'
  scheduled_at: string
}

export interface StatusInput {
  now: Date
  appUrl: string
  draftsAwaitingApproval: DraftRow[]
  publishJobs: PublishJobRow[]
  replyJobs: ReplyJobRow[]
  inboxNeedsAction: number
}

type Attention = {
  sourceSystem: 'my-sns'
  sourceEntityId: string
  sourceEntityType: string
  kind: 'approval' | 'failure' | 'ambiguity'
  summary: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  createdAt: string
  dueAt?: string
  action?: { type: 'deeplink'; url: string }
}
type Activity = {
  sourceSystem: 'my-sns'
  sourceEntityId: string
  sourceEntityType: string
  state: 'completed' | 'running' | 'scheduled'
  summary: string
  at: string
}

export interface ArtistOsStatusReport {
  contractVersion: typeof ARTIST_OS_CONTRACT_VERSION
  service: 'my-sns'
  generatedAt: string
  attention: Attention[]
  activity: Activity[]
  counters: Record<string, number>
}

/** Row caps keep the response bounded and well below PostgREST's 1000-row truncation. */
export const STATUS_ROW_LIMIT = 100

const link = (appUrl: string, path: string) => `${appUrl.replace(/\/+$/, '')}${path}`

export function buildArtistOsStatus(input: StatusInput): ArtistOsStatusReport {
  const attention: Attention[] = []
  const activity: Activity[] = []
  const nowIso = input.now.toISOString()

  for (const d of input.draftsAwaitingApproval) {
    attention.push({
      sourceSystem: 'my-sns',
      sourceEntityId: d.id,
      sourceEntityType: 'draft',
      kind: 'approval',
      summary: `${d.channel} draft awaiting approval`,
      priority: 'normal',
      createdAt: d.created_at,
      action: { type: 'deeplink', url: link(input.appUrl, '/app/drafts') },
    })
  }

  for (const j of input.publishJobs) {
    if (j.status === 'failed') {
      // Deliberately no provider error text: it can be visible across members and may leak detail.
      attention.push({
        sourceSystem: 'my-sns',
        sourceEntityId: j.id,
        sourceEntityType: 'publish_job',
        kind: 'failure',
        summary: `${j.channel} publish failed`,
        priority: 'high',
        createdAt: j.scheduled_at ?? j.created_at,
        action: { type: 'deeplink', url: link(input.appUrl, '/app/queue') },
      })
    } else if (j.status === 'scheduled' && j.scheduled_at) {
      activity.push({
        sourceSystem: 'my-sns',
        sourceEntityId: j.id,
        sourceEntityType: 'publish_job',
        state: 'scheduled',
        // Honest about the platform's once-a-day cron: this is the planned time, not a promise.
        summary: `${j.channel} publish scheduled for ${j.scheduled_at}`,
        at: j.scheduled_at,
      })
    } else if (j.status === 'published' && j.published_at) {
      activity.push({
        sourceSystem: 'my-sns',
        sourceEntityId: j.id,
        sourceEntityType: 'publish_job',
        state: 'completed',
        summary: `${j.channel} published`,
        at: j.published_at,
      })
    }
  }

  for (const r of input.replyJobs) {
    if (r.status === 'failed') {
      attention.push({
        sourceSystem: 'my-sns',
        sourceEntityId: r.id,
        sourceEntityType: 'reply_job',
        kind: 'failure',
        summary: `${r.platform} reply failed to send`,
        priority: 'high',
        createdAt: r.scheduled_at,
        action: { type: 'deeplink', url: link(input.appUrl, '/app/inbox') },
      })
    } else if (r.status === 'scheduled') {
      activity.push({
        sourceSystem: 'my-sns',
        sourceEntityId: r.id,
        sourceEntityType: 'reply_job',
        state: 'scheduled',
        summary: `${r.platform} reply scheduled`,
        at: r.scheduled_at,
      })
    }
  }

  if (input.inboxNeedsAction > 0) {
    attention.push({
      sourceSystem: 'my-sns',
      // A stable synthetic id: this item is an aggregate, not a single inbox row.
      sourceEntityId: 'inbox-needs-action',
      sourceEntityType: 'inbox',
      kind: 'ambiguity',
      summary: `${input.inboxNeedsAction} inbox message(s) flagged as needing action`,
      priority: 'normal',
      createdAt: nowIso,
      action: { type: 'deeplink', url: link(input.appUrl, '/app/inbox') },
    })
  }

  const count = (s: PublishJobRow['status']) => input.publishJobs.filter((j) => j.status === s).length
  return {
    contractVersion: ARTIST_OS_CONTRACT_VERSION,
    service: 'my-sns',
    generatedAt: nowIso,
    attention,
    activity,
    counters: {
      draftsAwaitingApproval: input.draftsAwaitingApproval.length,
      publishJobsScheduled: count('scheduled'),
      publishJobsFailed: count('failed'),
      publishJobsPublished: count('published'),
      inboxNeedsAction: input.inboxNeedsAction,
    },
  }
}

/** Capability ids My-SNS can truthfully claim. Kept literal so a test pins them. */
export function mySnsCapabilities(opts: { publishingStrategy: string; serviceKeyConfigured: boolean }): string[] {
  const caps = ['status.read', 'inbox.instagram.comment.ingest', 'inbox.instagram.dm.ingest', 'inbox.line.dm.ingest', 'inbox.youtube.comment.ingest']
  if (opts.publishingStrategy === 'api-first') caps.push('publish.api')
  else caps.push('publish.manual')
  if (!opts.serviceKeyConfigured) return caps.filter((c) => c !== 'status.read')
  return caps
}
