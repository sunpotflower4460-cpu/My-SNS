import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandProfile } from '@/lib/domain/types'
import { generateReplyWithAnthropic, AnthropicReplyGenerationError } from './anthropic-reply'
import { calculateGenerationCost, isAnthropicConfigured } from './anthropic-draft'
import { computeRecipientSendTime, ensureMinimumLead } from './reply-timing'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { getDefaultBrandProfileForClient } from '@/lib/repositories/supabase/brand-profiles'
import { listContactReplyExamples } from '@/lib/repositories/supabase/reply-learning'
import { createReplyJob } from '@/lib/repositories/supabase/reply-queue'
import { createNotifications } from '@/lib/repositories/supabase/notifications'

// The opt-in auto-reply sweep (Phase 2). For contacts the creator has explicitly
// flipped `auto_send_enabled` on, this drafts a reply AND enqueues it without a
// per-message approval — the deliberate exception to CLAUDE.md #4.
//
// Every safety rail lives here, not in the caller:
// - Opt-in only: an inner join on messaging_contacts.auto_send_enabled = true.
// - Never steps on human work: items that already have a suggestion OR a reply
//   job are skipped (the creator may be mid-review).
// - Never an instant send: the schedule is floored to a minimum cancel-window
//   lead (ensureMinimumLead) even during the recipient's waking hours, and the
//   creator is notified so they can edit or cancel before it goes.
// - Fail-closed: no Anthropic key, over monthly budget, no connected LINE
//   account, or a generation error → the item is skipped, never a fake send.
// - LINE only: Instagram/others can't send in Phase 1, so they're never swept.

const BATCH_SIZE = 20
// Only recently-received, still-unread DMs are eligible — the sweep answers
// fresh conversation, it does not retroactively reply to old backlog.
const LOOKBACK_HOURS = 24

interface CandidateContact {
  id: string
  external_contact_id: string
  display_name: string | null
  timezone: string | null
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  auto_send_enabled: boolean
}

interface CandidateRow {
  id: string
  workspace_id: string
  text: string
  contact_id: string
  messaging_contacts: CandidateContact | CandidateContact[] | null
}

function firstContact(value: CandidateRow['messaging_contacts']): CandidateContact | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export interface AutoReplySweepResult {
  scheduled: number
  skipped: number
  reason?: string
}

/** Per-workspace cache so we resolve owner / LINE-connection / brand profile / budget once. */
interface WorkspaceContext {
  ownerId: string | null
  lineConnected: boolean
  brandProfile: BrandProfile | null
  overBudget: boolean
}

async function loadWorkspaceContext(supabase: SupabaseClient, workspaceId: string, monthlyBudgetUsd: number | null): Promise<WorkspaceContext> {
  const [{ data: owner }, { data: account }, brandProfile] = await Promise.all([
    supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner').limit(1).maybeSingle(),
    supabase.from('social_accounts').select('id').eq('workspace_id', workspaceId).eq('platform', 'line').eq('connected', true).limit(1).maybeSingle(),
    getDefaultBrandProfileForClient(supabase, workspaceId).catch(() => null),
  ])

  let overBudget = false
  if (monthlyBudgetUsd !== null) {
    const spent = await getWorkspaceMonthlyAiCost(supabase, workspaceId).catch(() => 0)
    overBudget = spent >= monthlyBudgetUsd
  }

  return {
    ownerId: (owner?.user_id as string | undefined) ?? null,
    lineConnected: Boolean(account),
    brandProfile,
    overBudget,
  }
}

/**
 * Runs one sweep pass. Uses the service-role client (cross-workspace, no user in
 * the request). Never throws for a single item's failure — one bad generation
 * must not stop the batch. `now` is injected for determinism/testability.
 */
export async function runAutoReplySweep(supabase: SupabaseClient, now: Date = new Date()): Promise<AutoReplySweepResult> {
  // Global fail-closed gate: with no AI key, nothing can be drafted — so nothing
  // is auto-sent. Honest no-op rather than a silent partial run.
  if (!isAnthropicConfigured()) {
    return { scheduled: 0, skipped: 0, reason: 'ANTHROPIC_API_KEY未設定のため自動返信は実行されません。' }
  }

  const rawBudget = Number(process.env.ANTHROPIC_MONTHLY_BUDGET_USD)
  const monthlyBudgetUsd = Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : null

  const cutoffIso = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

  const { data: candidates, error } = await supabase
    .from('inbox_items')
    .select(
      'id, workspace_id, text, contact_id, messaging_contacts!inner(id, external_contact_id, display_name, timezone, quiet_hours_start, quiet_hours_end, auto_send_enabled)',
    )
    .eq('platform', 'line')
    .eq('kind', 'dm')
    .eq('is_read', false)
    .eq('messaging_contacts.auto_send_enabled', true)
    .gte('received_at', cutoffIso)
    .order('received_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) return { scheduled: 0, skipped: 0, reason: error.message }

  const rows = (candidates ?? []) as unknown as CandidateRow[]
  if (rows.length === 0) return { scheduled: 0, skipped: 0 }

  // Skip any item a human is already handling: an existing suggestion or an
  // existing reply job means the concierge (or the creator) already engaged it.
  const itemIds = rows.map((row) => row.id)
  const [{ data: existingJobs }, { data: existingSuggestions }] = await Promise.all([
    supabase.from('reply_jobs').select('inbox_item_id').in('inbox_item_id', itemIds),
    supabase.from('ai_reply_suggestions').select('inbox_item_id').in('inbox_item_id', itemIds),
  ])
  const alreadyHandled = new Set<string>([
    ...((existingJobs ?? []) as Array<{ inbox_item_id: string }>).map((r) => r.inbox_item_id),
    ...((existingSuggestions ?? []) as Array<{ inbox_item_id: string }>).map((r) => r.inbox_item_id),
  ])

  const workspaceContexts = new Map<string, WorkspaceContext>()
  let scheduled = 0
  let skipped = 0

  for (const row of rows) {
    const contact = firstContact(row.messaging_contacts)
    // The inner-join query already guarantees auto_send_enabled=true; this
    // re-check is belt-and-suspenders on the single most safety-critical
    // invariant (never auto-send to a contact who didn't opt in).
    if (!contact || !contact.auto_send_enabled || alreadyHandled.has(row.id)) {
      skipped += 1
      continue
    }

    let context = workspaceContexts.get(row.workspace_id)
    if (!context) {
      context = await loadWorkspaceContext(supabase, row.workspace_id, monthlyBudgetUsd)
      workspaceContexts.set(row.workspace_id, context)
    }

    // Fail-closed preconditions: without a LINE connection, an owner to attribute
    // the job to, or budget headroom, skip — never enqueue something that can't
    // send or shouldn't be billed. `ownerId` is a const so it stays narrowed to
    // string for the rest of this iteration (used as created_by / notify target).
    const ownerId = context.ownerId
    if (!context.lineConnected || !ownerId || context.overBudget) {
      skipped += 1
      continue
    }

    try {
      const styleExamples = await listContactReplyExamples(supabase, row.workspace_id, contact.id).catch(() => [])
      const result = await generateReplyWithAnthropic(row.text, {
        brandProfile: context.brandProfile,
        contactDisplayName: contact.display_name ?? undefined,
        styleExamples,
      })
      const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)

      const generation = await recordAiGeneration(supabase, {
        workspaceId: row.workspace_id,
        inboxItemId: row.id,
        purpose: 'reply',
        channels: [],
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        createdBy: ownerId,
      })

      const { data: suggestion, error: suggestionError } = await supabase
        .from('ai_reply_suggestions')
        .insert({
          workspace_id: row.workspace_id,
          inbox_item_id: row.id,
          suggested_text: result.proposal.reply,
          tone: result.proposal.tone,
          source: 'ai',
          assumptions: result.proposal.assumptions,
          ai_generation_id: generation.id,
        })
        .select('id')
        .single()
      if (suggestionError) throw new Error(suggestionError.message)

      await supabase
        .from('inbox_items')
        .update({ ai_summary: result.proposal.summary, ai_priority: result.proposal.priority })
        .eq('id', row.id)
        .eq('workspace_id', row.workspace_id)

      // Recipient-appropriate time, then floored so there is always a cancel
      // window — an auto reply is never delivered the instant it is drafted.
      const recipientTime = computeRecipientSendTime(now, {
        timeZone: contact.timezone ?? undefined,
        quietStart: contact.quiet_hours_start ?? undefined,
        quietEnd: contact.quiet_hours_end ?? undefined,
      })
      const scheduledAt = ensureMinimumLead(recipientTime, now)

      // If a concurrent sweep (or a sweep racing a human) already enqueued an
      // active auto reply for this item, the partial unique index
      // reply_jobs_one_active_auto_per_item makes this INSERT fail — the catch
      // below then skips the item, so the recipient never gets a duplicate DM.
      const job = await createReplyJob(supabase, {
        workspaceId: row.workspace_id,
        inboxItemId: row.id,
        contactId: contact.id,
        suggestionId: suggestion.id as string,
        platform: 'line',
        replyText: result.proposal.reply,
        sendTarget: contact.external_contact_id,
        replyMode: 'auto',
        scheduledAt,
        createdBy: ownerId,
      })

      await supabase.from('audit_logs').insert({
        workspace_id: row.workspace_id,
        actor_id: ownerId,
        action: 'inbox_reply_scheduled',
        target_type: 'inbox_item',
        target_id: row.id,
        metadata: { platform: 'line', replyJobId: job.id, scheduledAt, auto: true },
      })

      await createNotifications(supabase, [
        {
          workspaceId: row.workspace_id,
          userId: ownerId,
          type: 'auto_reply_scheduled',
          title: '自動返信を予約しました',
          body: `${contact.display_name ?? '相手'}さんへの返信を${new Date(scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}に送信予定です。内容の確認・取り消しができます。`,
          targetType: 'inbox_item',
          targetId: row.id,
        },
      ]).catch((cause) => console.error('Failed to notify about an auto-scheduled reply:', cause))

      scheduled += 1
    } catch (cause) {
      // Record billed usage on a parse failure so cost isn't under-reported,
      // then skip the item — never enqueue a reply we couldn't draft.
      if (cause instanceof AnthropicReplyGenerationError) {
        await recordAiGeneration(supabase, {
          workspaceId: row.workspace_id,
          inboxItemId: row.id,
          purpose: 'reply',
          channels: [],
          model: cause.usage.model,
          inputTokens: cause.usage.inputTokens,
          outputTokens: cause.usage.outputTokens,
          costUsd: calculateGenerationCost(cause.usage.inputTokens, cause.usage.outputTokens),
          createdBy: ownerId,
        }).catch((recordError) => console.error('Failed to record AI usage after a failed auto reply:', recordError))
      }
      console.error(`Auto-reply generation failed for inbox item ${row.id}:`, cause)
      skipped += 1
    }
  }

  return { scheduled, skipped }
}
