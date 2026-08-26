import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandProfile } from '@/lib/domain/types'
import { generateReplyWithAnthropic, AnthropicReplyGenerationError } from './anthropic-reply'
import { calculateGenerationCost, isAnthropicConfigured } from './anthropic-draft'
import {
  claimInboxReplyGeneration,
  claimWorkspaceAiBudget,
  configuredMonthlyAiBudgetUsd,
  releaseInboxReplyGeneration,
  releaseWorkspaceAiBudget,
} from './ai-generation-claims'
import { computeRecipientSendTime, ensureMinimumLead } from './reply-timing'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { getDefaultBrandProfileForClient } from '@/lib/repositories/supabase/brand-profiles'
import { listContactReplyExamples } from '@/lib/repositories/supabase/reply-learning'
import { getMyCreatorStatus } from '@/lib/repositories/supabase/creator-status'
import { createNotifications } from '@/lib/repositories/supabase/notifications'

const BATCH_SIZE = 20
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

interface WorkspaceContext {
  ownerId: string | null
  lineConnected: boolean
  brandProfile: BrandProfile | null
  creatorStatus?: { mood: string; note?: string }
}

async function loadWorkspaceContext(supabase: SupabaseClient, workspaceId: string): Promise<WorkspaceContext> {
  const [{ data: owner }, { data: account }, brandProfile] = await Promise.all([
    supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner').limit(1).maybeSingle(),
    supabase.from('social_accounts').select('id').eq('workspace_id', workspaceId).eq('platform', 'line').eq('connected', true).limit(1).maybeSingle(),
    getDefaultBrandProfileForClient(supabase, workspaceId).catch(() => null),
  ])

  const ownerId = (owner?.user_id as string | undefined) ?? null
  const status = ownerId ? await getMyCreatorStatus(supabase, workspaceId, ownerId).catch(() => null) : null
  const creatorStatus = status?.shareWithContacts ? { mood: status.mood, note: status.note } : undefined

  return { ownerId, lineConnected: Boolean(account), brandProfile, creatorStatus }
}

async function isAlreadyHandledNow(supabase: SupabaseClient, inboxItemId: string): Promise<boolean> {
  const [{ data: job, error: jobError }, { data: suggestion, error: suggestionError }] = await Promise.all([
    supabase.from('reply_jobs').select('id').eq('inbox_item_id', inboxItemId).neq('status', 'cancelled').limit(1).maybeSingle(),
    supabase.from('ai_reply_suggestions').select('id').eq('inbox_item_id', inboxItemId).limit(1).maybeSingle(),
  ])

  if (jobError) throw new Error(jobError.message)
  if (suggestionError) throw new Error(suggestionError.message)
  return Boolean(job || suggestion)
}

export async function runAutoReplySweep(supabase: SupabaseClient, now: Date = new Date()): Promise<AutoReplySweepResult> {
  if (!isAnthropicConfigured()) {
    return { scheduled: 0, skipped: 0, reason: 'ANTHROPIC_API_KEY未設定のため自動返信は実行されません。' }
  }

  const monthlyBudgetUsd = configuredMonthlyAiBudgetUsd()
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
    if (!contact || !contact.auto_send_enabled || alreadyHandled.has(row.id)) {
      skipped += 1
      continue
    }

    let context = workspaceContexts.get(row.workspace_id)
    if (!context) {
      context = await loadWorkspaceContext(supabase, row.workspace_id)
      workspaceContexts.set(row.workspace_id, context)
    }

    const ownerId = context.ownerId
    if (!context.lineConnected || !ownerId) {
      skipped += 1
      continue
    }

    let replyClaimToken: string | null = null
    let budgetClaimToken: string | null = null
    let generationId: string | null = null

    try {
      replyClaimToken = await claimInboxReplyGeneration(supabase, row.workspace_id, row.id)
      if (!replyClaimToken) {
        skipped += 1
        continue
      }

      if (await isAlreadyHandledNow(supabase, row.id)) {
        skipped += 1
        continue
      }

      if (monthlyBudgetUsd !== null) {
        budgetClaimToken = await claimWorkspaceAiBudget(supabase, row.workspace_id)
        if (!budgetClaimToken) {
          skipped += 1
          continue
        }

        let spentUsd: number
        try {
          spentUsd = await getWorkspaceMonthlyAiCost(supabase, row.workspace_id)
        } catch (cause) {
          console.error(`Could not read AI budget for workspace ${row.workspace_id}:`, cause)
          skipped += 1
          continue
        }
        if (spentUsd >= monthlyBudgetUsd) {
          skipped += 1
          continue
        }
      }

      const styleExamples = await listContactReplyExamples(supabase, row.workspace_id, contact.id).catch(() => [])
      generationId = randomUUID()
      const result = await generateReplyWithAnthropic(row.text, {
        brandProfile: context.brandProfile,
        contactDisplayName: contact.display_name ?? undefined,
        styleExamples,
        creatorStatus: context.creatorStatus,
      })
      const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)

      let recordedGenerationId: string | null = null
      try {
        const generation = await recordAiGeneration(supabase, {
          id: generationId,
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
        recordedGenerationId = generation.id
      } catch (recordError) {
        // The model has already been billed. Do not abandon the output and let
        // the next sweep pay to generate it again. Persist the suggestion/job
        // without the optional ledger FK and log the bookkeeping gap loudly.
        console.error(`Auto reply generated for ${row.id}, but AI usage could not be recorded:`, recordError)
      }

      const recipientTime = computeRecipientSendTime(now, {
        timeZone: contact.timezone ?? undefined,
        quietStart: contact.quiet_hours_start ?? undefined,
        quietEnd: contact.quiet_hours_end ?? undefined,
      })
      const scheduledAt = ensureMinimumLead(recipientTime, now)
      const suggestionId = randomUUID()
      const replyJobId = randomUUID()

      const { error: artifactError } = await supabase.rpc('create_auto_reply_artifacts', {
        p_workspace_id: row.workspace_id,
        p_inbox_item_id: row.id,
        p_contact_id: contact.id,
        p_suggestion_id: suggestionId,
        p_reply_job_id: replyJobId,
        p_ai_generation_id: recordedGenerationId,
        p_reply_text: result.proposal.reply,
        p_tone: result.proposal.tone,
        p_assumptions: result.proposal.assumptions,
        p_summary: result.proposal.summary,
        p_priority: result.proposal.priority,
        p_send_target: contact.external_contact_id,
        p_scheduled_at: scheduledAt,
        p_created_by: ownerId,
      })

      if (artifactError) {
        // The transaction may have committed but its RPC response may have been
        // lost. Reconcile the stable job id before treating this as a failure.
        const { data: reconciledJob, error: reconcileError } = await supabase
          .from('reply_jobs')
          .select('id')
          .eq('id', replyJobId)
          .eq('workspace_id', row.workspace_id)
          .maybeSingle()

        if (reconcileError) {
          throw new Error(`${artifactError.message} (auto-reply reconciliation failed: ${reconcileError.message})`)
        }
        if (!reconciledJob) throw new Error(artifactError.message)
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        workspace_id: row.workspace_id,
        actor_id: ownerId,
        action: 'inbox_reply_scheduled',
        target_type: 'inbox_item',
        target_id: row.id,
        metadata: {
          platform: 'line',
          replyJobId,
          scheduledAt,
          auto: true,
          aiGenerationId: recordedGenerationId,
          usageRecorded: Boolean(recordedGenerationId),
        },
      })
      if (auditError) console.error(`Failed to audit auto reply ${replyJobId}:`, auditError)

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
      if (cause instanceof AnthropicReplyGenerationError && generationId) {
        await recordAiGeneration(supabase, {
          id: generationId,
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
    } finally {
      if (budgetClaimToken) {
        await releaseWorkspaceAiBudget(supabase, row.workspace_id, budgetClaimToken).catch((cause) =>
          console.error(`Failed to release AI budget claim for workspace ${row.workspace_id}:`, cause),
        )
      }
      if (replyClaimToken) {
        await releaseInboxReplyGeneration(supabase, row.workspace_id, row.id, replyClaimToken).catch((cause) =>
          console.error(`Failed to release reply generation claim for inbox item ${row.id}:`, cause),
        )
      }
    }
  }

  return { scheduled, skipped }
}
