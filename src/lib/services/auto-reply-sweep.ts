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
// Background generation has no human watching the response. If one paid call
// succeeds but its usage row cannot be saved, pause further automatic AI calls
// for this workspace long enough for the owner/admin to see the notification and
// for a transient database incident to recover. Manual AI flows surface their
// own warning directly in the UI.
const AI_USAGE_INCIDENT_COOLDOWN_HOURS = 1

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

interface AutoReplyArtifactInput {
  workspaceId: string
  inboxItemId: string
  contactId: string
  suggestionId: string
  replyJobId: string
  aiGenerationId: string | null
  replyText: string
  tone: string
  assumptions: string[]
  summary: string
  priority: 'high' | 'normal' | 'low'
  sendTarget: string
  scheduledAt: string
  createdBy: string
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
  autoAiUsageBlocked: boolean
}

async function loadWorkspaceContext(
  supabase: SupabaseClient,
  workspaceId: string,
  now: Date,
): Promise<WorkspaceContext> {
  const usageIncidentSince = new Date(now.getTime() - AI_USAGE_INCIDENT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString()
  const [
    { data: owner, error: ownerError },
    { data: account, error: accountError },
    { data: usageIncident, error: usageIncidentError },
  ] = await Promise.all([
    supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'owner').limit(1).maybeSingle(),
    supabase.from('social_accounts').select('id').eq('workspace_id', workspaceId).eq('platform', 'line').eq('connected', true).limit(1).maybeSingle(),
    supabase
      .from('audit_logs')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('action', 'inbox_reply_ai_generated')
      .contains('metadata', { auto: true, usageRecorded: false })
      .gte('created_at', usageIncidentSince)
      .limit(1)
      .maybeSingle(),
  ])

  if (ownerError) {
    throw new Error(`Could not load workspace owner for auto-reply: ${ownerError.message}`)
  }
  if (accountError) {
    throw new Error(`Could not verify LINE connection for auto-reply: ${accountError.message}`)
  }
  if (usageIncidentError) {
    throw new Error(`Could not verify automatic AI usage-ledger safety state: ${usageIncidentError.message}`)
  }

  // Brand Profile is optional (null when unset) but a DB read failure must not
  // silently become "no brand voice".
  const brandProfile = await getDefaultBrandProfileForClient(supabase, workspaceId)

  const ownerId = (owner?.user_id as string | undefined) ?? null
  const status = ownerId ? await getMyCreatorStatus(supabase, workspaceId, ownerId) : null
  const creatorStatus = status?.shareWithContacts ? { mood: status.mood, note: status.note } : undefined

  return {
    ownerId,
    lineConnected: Boolean(account),
    brandProfile,
    creatorStatus,
    autoAiUsageBlocked: Boolean(usageIncident),
  }
}

async function isAlreadyHandledNow(supabase: SupabaseClient, inboxItemId: string): Promise<boolean> {
  const [{ data: job, error: jobError }, { data: suggestion, error: suggestionError }] = await Promise.all([
    // Any job means a human/system already made a decision about this inbound
    // message. In particular, cancellation is an explicit human veto and must
    // not be ignored by a sweep racing immediately afterwards.
    supabase.from('reply_jobs').select('id').eq('inbox_item_id', inboxItemId).limit(1).maybeSingle(),
    supabase.from('ai_reply_suggestions').select('id').eq('inbox_item_id', inboxItemId).limit(1).maybeSingle(),
  ])

  if (jobError) throw new Error(jobError.message)
  if (suggestionError) throw new Error(suggestionError.message)
  return Boolean(job || suggestion)
}

async function reconcileAutoReplyJob(
  supabase: SupabaseClient,
  workspaceId: string,
  replyJobId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('reply_jobs')
    .select('id')
    .eq('id', replyJobId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/**
 * The model has already been billed when this runs. The RPC is atomic, and the
 * caller owns stable suggestion/job UUIDs, so one same-id retry is safe: a late
 * first commit can only collide with the exact same ids, never create a second
 * outbound job. Reconcile after each ambiguous response before giving up.
 */
async function persistAutoReplyArtifacts(
  supabase: SupabaseClient,
  input: AutoReplyArtifactInput,
): Promise<void> {
  const rpcArgs = {
    p_workspace_id: input.workspaceId,
    p_inbox_item_id: input.inboxItemId,
    p_contact_id: input.contactId,
    p_suggestion_id: input.suggestionId,
    p_reply_job_id: input.replyJobId,
    p_ai_generation_id: input.aiGenerationId,
    p_reply_text: input.replyText,
    p_tone: input.tone,
    p_assumptions: input.assumptions,
    p_summary: input.summary,
    p_priority: input.priority,
    p_send_target: input.sendTarget,
    p_scheduled_at: input.scheduledAt,
    p_created_by: input.createdBy,
  }

  let lastError = '自動返信の保存に失敗しました。'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await supabase.rpc('create_auto_reply_artifacts', rpcArgs)
    if (!error) return
    lastError = error.message

    try {
      if (await reconcileAutoReplyJob(supabase, input.workspaceId, input.replyJobId)) return
    } catch (cause) {
      // The read may be failing for the same transient reason as the RPC. One
      // same-id retry below is still safe and may recover once DB connectivity
      // returns; after the final attempt, surface the combined error to logs.
      lastError = `${lastError} (reconciliation failed: ${cause instanceof Error ? cause.message : 'unknown error'})`
    }
  }

  // A second RPC may have returned duplicate-key after a late first commit; one
  // final authoritative read converts that ambiguous response into success.
  if (await reconcileAutoReplyJob(supabase, input.workspaceId, input.replyJobId)) return
  throw new Error(lastError)
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
  const [
    { data: existingJobs, error: existingJobsError },
    { data: existingSuggestions, error: existingSuggestionsError },
  ] = await Promise.all([
    supabase.from('reply_jobs').select('inbox_item_id').in('inbox_item_id', itemIds),
    supabase.from('ai_reply_suggestions').select('inbox_item_id').in('inbox_item_id', itemIds),
  ])
  if (existingJobsError || existingSuggestionsError) {
    return {
      scheduled: 0,
      skipped: 0,
      reason:
        existingJobsError?.message ??
        existingSuggestionsError?.message ??
        '既存の自動返信状態を確認できないため、安全のためスイープを中止しました。',
    }
  }
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
      try {
        context = await loadWorkspaceContext(supabase, row.workspace_id, now)
        workspaceContexts.set(row.workspace_id, context)
      } catch (cause) {
        console.error(`Auto-reply workspace context failed for ${row.workspace_id}:`, cause)
        // Cache a blocked context so we do not retry the same failing reads for
        // every remaining item in this workspace during the same sweep.
        context = {
          ownerId: null,
          lineConnected: false,
          brandProfile: null,
          creatorStatus: undefined,
          autoAiUsageBlocked: true,
        }
        workspaceContexts.set(row.workspace_id, context)
        skipped += 1
        continue
      }
    }

    const ownerId = context.ownerId
    if (!context.lineConnected || !ownerId || context.autoAiUsageBlocked) {
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

      let styleExamples
      try {
        styleExamples = await listContactReplyExamples(supabase, row.workspace_id, contact.id)
      } catch (cause) {
        console.error(`Could not load reply style examples for contact ${contact.id}:`, cause)
        skipped += 1
        continue
      }
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
        console.error(`Auto reply generated for ${row.id}, but AI usage could not be recorded:`, recordError)
        context.autoAiUsageBlocked = true
        const { error: incidentAuditError } = await supabase.from('audit_logs').insert({
          workspace_id: row.workspace_id,
          actor_id: ownerId,
          action: 'inbox_reply_ai_generated',
          target_type: 'inbox_item',
          target_id: row.id,
          metadata: {
            platform: 'line',
            auto: true,
            model: result.model,
            aiGenerationId: null,
            usageRecorded: false,
          },
        })
        if (incidentAuditError) {
          console.error(`Failed to persist AI usage-ledger incident for auto reply ${row.id}:`, incidentAuditError)
        }
      }

      const recipientTime = computeRecipientSendTime(now, {
        timeZone: contact.timezone ?? undefined,
        quietStart: contact.quiet_hours_start ?? undefined,
        quietEnd: contact.quiet_hours_end ?? undefined,
      })
      const scheduledAt = ensureMinimumLead(recipientTime, now)
      const suggestionId = randomUUID()
      const replyJobId = randomUUID()

      await persistAutoReplyArtifacts(supabase, {
        workspaceId: row.workspace_id,
        inboxItemId: row.id,
        contactId: contact.id,
        suggestionId,
        replyJobId,
        aiGenerationId: recordedGenerationId,
        replyText: result.proposal.reply,
        tone: result.proposal.tone,
        assumptions: result.proposal.assumptions,
        summary: result.proposal.summary,
        priority: result.proposal.priority,
        sendTarget: contact.external_contact_id,
        scheduledAt,
        createdBy: ownerId,
      })

      const usageRecorded = Boolean(recordedGenerationId)
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
          usageRecorded,
        },
      })
      if (auditError) console.error(`Failed to audit auto reply ${replyJobId}:`, auditError)

      await createNotifications(supabase, [
        {
          workspaceId: row.workspace_id,
          userId: ownerId,
          type: 'auto_reply_scheduled',
          title: usageRecorded ? '自動返信を予約しました' : '自動返信を予約しました（AI使用量の記録を確認してください）',
          body: usageRecorded
            ? `${contact.display_name ?? '相手'}さんへの返信を${new Date(scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}に送信予定です。内容の確認・取り消しができます。`
            : `${contact.display_name ?? '相手'}さんへの返信を${new Date(scheduledAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}に送信予定です。ただし今回のAI使用量を台帳へ保存できなかったため、このワークスペースの後続自動AI処理を一時停止しています。内容を確認し、必要なら返信を取り消したうえで管理者に台帳確認を依頼してください。`,
          targetType: 'inbox_item',
          targetId: row.id,
        },
      ]).catch((cause) => console.error('Failed to notify about an auto-scheduled reply:', cause))

      scheduled += 1
    } catch (cause) {
      if (cause instanceof AnthropicReplyGenerationError && generationId) {
        try {
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
          })
        } catch (recordError) {
          console.error('Failed to record AI usage after a failed auto reply:', recordError)
          context.autoAiUsageBlocked = true
          const { error: incidentAuditError } = await supabase.from('audit_logs').insert({
            workspace_id: row.workspace_id,
            actor_id: ownerId,
            action: 'inbox_reply_ai_generated',
            target_type: 'inbox_item',
            target_id: row.id,
            metadata: {
              platform: 'line',
              auto: true,
              generationFailed: true,
              model: cause.usage.model,
              aiGenerationId: null,
              usageRecorded: false,
            },
          })
          if (incidentAuditError) {
            console.error(`Failed to persist failed-generation usage incident for auto reply ${row.id}:`, incidentAuditError)
          }
          await createNotifications(supabase, [
            {
              workspaceId: row.workspace_id,
              userId: ownerId,
              type: 'reply_failed',
              title: '自動返信AIを一時停止しました',
              body: '自動返信のAI処理に失敗し、その処理で発生したAI使用量も台帳へ保存できませんでした。安全のため、このワークスペースの後続自動AI処理を一時停止しています。管理者に使用量台帳の確認を依頼してください。',
              targetType: 'inbox_item',
              targetId: row.id,
            },
          ]).catch((notificationError) => console.error('Failed to notify about an automatic AI usage incident:', notificationError))
        }
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
