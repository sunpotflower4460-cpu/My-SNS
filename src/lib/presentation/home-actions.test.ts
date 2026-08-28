import { describe, expect, it } from 'vitest'
import {
  buildTodayTimeline,
  computeNextActions,
  getUpcomingPublishJobs,
  type HomeSnapshot,
  type TimelineSnapshot,
} from './home-actions'
import type { PublishJob, ReplyJob, InboxItem, SocialAccount, SocialDraft, Seed, CalendarEvent } from '@/lib/domain/types'

// Minimal builders — only the fields the presenter reads matter; the rest are
// filled with harmless defaults so the domain types stay satisfied.
function publishJob(over: Partial<PublishJob>): PublishJob {
  return {
    id: 'j1',
    workspaceId: 'w',
    seedId: 's1',
    draftId: 'd1',
    revisionId: 'r1',
    channel: 'x',
    publishMode: 'auto',
    status: 'scheduled',
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function replyJob(over: Partial<ReplyJob>): ReplyJob {
  return {
    id: 'rj1',
    workspaceId: 'w',
    inboxItemId: 'i1',
    platform: 'line',
    replyText: 'こんにちは、ありがとうございます。',
    sendTarget: 'U123',
    replyMode: 'scheduled',
    status: 'scheduled',
    scheduledAt: '2026-07-20T04:00:00Z',
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function inboxItem(over: Partial<InboxItem>): InboxItem {
  return {
    id: 'i1',
    workspaceId: 'w',
    platform: 'line',
    kind: 'dm',
    authorHandle: 'someone',
    text: 'hi',
    receivedAt: '2026-07-20T00:00:00Z',
    isRead: false,
    needsAction: false,
    isStarred: false,
    ...over,
  }
}

function draft(over: Partial<SocialDraft>): SocialDraft {
  return {
    id: 'd1',
    workspaceId: 'w',
    seedId: 's1',
    channel: 'x',
    draftText: 'body',
    hashtags: [],
    assumptions: [],
    metadata: {},
    source: 'ai',
    tone: 'friendly',
    length: 'short',
    status: 'draft',
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function seed(over: Partial<Seed>): Seed {
  return {
    id: 's1',
    workspaceId: 'w',
    title: 'A seed',
    kind: 'text',
    status: 'captured',
    keyPoints: [],
    targetChannels: [],
    tags: [],
    createdBy: 'u',
    createdAt: '2026-07-20T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function account(over: Partial<SocialAccount>): SocialAccount {
  return {
    id: 'a1',
    workspaceId: 'w',
    platform: 'x',
    handle: '@me',
    connected: true,
    updatedAt: '2026-07-20T00:00:00Z',
    ...over,
  }
}

function emptySnapshot(): HomeSnapshot {
  return { publishJobs: [], replyJobs: [], inboxItems: [], drafts: [], seeds: [], socialAccounts: [account({})] }
}

describe('computeNextActions', () => {
  it('returns no actions for a fully-quiet, set-up workspace', () => {
    expect(computeNextActions(emptySnapshot())).toEqual([])
  })

  it('orders failures (critical) ahead of urgent replies and approvals', () => {
    const snapshot: HomeSnapshot = {
      ...emptySnapshot(),
      publishJobs: [publishJob({ status: 'failed' })],
      inboxItems: [inboxItem({ aiPriority: 'high', isRead: false })],
      drafts: [draft({ status: 'draft' })],
    }
    const actions = computeNextActions(snapshot)
    expect(actions.map((a) => a.id)).toEqual(['publish-failed', 'inbox-urgent', 'drafts-approval'])
    expect(actions[0].priority).toBe('critical')
  })

  it('deep-links a single failed publish to its seed, aggregates when many', () => {
    const one = computeNextActions({ ...emptySnapshot(), publishJobs: [publishJob({ status: 'failed', seedId: 'seed-x' })] })
    expect(one[0].href).toBe('/app/seeds/seed-x')

    const many = computeNextActions({
      ...emptySnapshot(),
      publishJobs: [publishJob({ id: 'a', status: 'failed' }), publishJob({ id: 'b', status: 'failed' })],
    })
    expect(many[0].href).toBe('/app/queue')
    expect(many[0].title).toContain('2件')
  })

  it('does not double-count an urgent DM that also needs action', () => {
    const item = inboxItem({ id: 'dup', aiPriority: 'high', isRead: false, needsAction: true })
    const actions = computeNextActions({ ...emptySnapshot(), inboxItems: [item] })
    expect(actions.map((a) => a.id)).toEqual(['inbox-urgent'])
  })

  it('surfaces a setup gap only when nothing is connected', () => {
    const withConn = computeNextActions({ ...emptySnapshot(), socialAccounts: [account({ connected: true })] })
    expect(withConn.some((a) => a.id === 'setup-connect')).toBe(false)

    const noConn = computeNextActions({ ...emptySnapshot(), socialAccounts: [account({ connected: false })] })
    expect(noConn.some((a) => a.id === 'setup-connect')).toBe(true)
  })

  it('nudges in-progress seeds without counting ready ones', () => {
    const actions = computeNextActions({
      ...emptySnapshot(),
      seeds: [seed({ id: 'x', status: 'captured' }), seed({ id: 'y', status: 'ready' })],
    })
    const nudge = actions.find((a) => a.id === 'seeds-in-progress')
    expect(nudge?.title).toContain('1件')
    expect(nudge?.href).toBe('/app/seeds/x')
  })
})

describe('buildTodayTimeline', () => {
  // 2026-07-20T04:00:00Z == 13:00 JST on 2026-07-20.
  const now = new Date('2026-07-20T04:00:00Z').getTime()

  it('includes only items whose JST date is today, time-ordered', () => {
    const snapshot: TimelineSnapshot = {
      publishJobs: [
        publishJob({ id: 'today', status: 'scheduled', scheduledAt: '2026-07-20T09:00:00Z' }), // 18:00 JST today
        publishJob({ id: 'tomorrow', status: 'scheduled', scheduledAt: '2026-07-21T09:00:00Z' }),
      ],
      replyJobs: [replyJob({ id: 'r', status: 'scheduled', scheduledAt: '2026-07-20T02:00:00Z' })], // 11:00 JST today
      calendarEvents: [],
    }
    const timeline = buildTodayTimeline(snapshot, now)
    expect(timeline.map((t) => t.id)).toEqual(['reply-r', 'publish-today'])
  })

  it('treats a late-UTC instant as the next JST day', () => {
    // 2026-07-20T16:00:00Z == 2026-07-21T01:00 JST — tomorrow, must be excluded.
    const snapshot: TimelineSnapshot = {
      publishJobs: [publishJob({ id: 'late', status: 'scheduled', scheduledAt: '2026-07-20T16:00:00Z' })],
      replyJobs: [],
      calendarEvents: [],
    }
    expect(buildTodayTimeline(snapshot, now)).toEqual([])
  })

  it('includes calendar events on today (JST)', () => {
    const event: CalendarEvent = {
      id: 'e1',
      workspaceId: 'w',
      title: '打ち合わせ',
      startsAt: '2026-07-20T06:00:00Z',
      allDay: false,
      source: 'manual',
      createdBy: 'u',
      createdAt: '2026-07-20T00:00:00Z',
      updatedAt: '2026-07-20T00:00:00Z',
    }
    const timeline = buildTodayTimeline({ publishJobs: [], replyJobs: [], calendarEvents: [event] }, now)
    expect(timeline.map((t) => t.kind)).toEqual(['event'])
    expect(timeline[0].title).toBe('打ち合わせ')
    expect(timeline[0].allDay).toBe(false)
  })

  it('carries the all-day flag so the timeline can hide a spurious clock time', () => {
    const event: CalendarEvent = {
      id: 'e2',
      workspaceId: 'w',
      title: '終日イベント',
      startsAt: '2026-07-20T00:00:00Z', // 09:00 JST today
      allDay: true,
      source: 'manual',
      createdBy: 'u',
      createdAt: '2026-07-20T00:00:00Z',
      updatedAt: '2026-07-20T00:00:00Z',
    }
    const timeline = buildTodayTimeline({ publishJobs: [], replyJobs: [], calendarEvents: [event] }, now)
    expect(timeline[0].allDay).toBe(true)
  })
})

describe('getUpcomingPublishJobs', () => {
  const now = new Date('2026-07-20T04:00:00Z').getTime()

  it('excludes today and past, keeps future scheduled, soonest first', () => {
    const jobs = [
      publishJob({ id: 'today', status: 'scheduled', scheduledAt: '2026-07-20T09:00:00Z' }),
      // A past-due scheduled job left in 'scheduled' with a past time.
      // Must NOT lead the "upcoming" runway.
      publishJob({ id: 'overdue', status: 'scheduled', scheduledAt: '2026-07-18T09:00:00Z' }),
      publishJob({ id: 'far', status: 'scheduled', scheduledAt: '2026-07-25T09:00:00Z' }),
      publishJob({ id: 'soon', status: 'scheduled', scheduledAt: '2026-07-21T09:00:00Z' }),
      publishJob({ id: 'done', status: 'published', scheduledAt: '2026-07-22T09:00:00Z' }),
    ]
    expect(getUpcomingPublishJobs(jobs, now).map((j) => j.id)).toEqual(['soon', 'far'])
  })

  it('respects the limit', () => {
    const jobs = Array.from({ length: 8 }, (_, i) =>
      publishJob({ id: `j${i}`, status: 'scheduled', scheduledAt: `2026-07-2${i + 1}T09:00:00Z` }),
    )
    expect(getUpcomingPublishJobs(jobs, now, 3)).toHaveLength(3)
  })
})
