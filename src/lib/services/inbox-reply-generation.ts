import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { getDefaultBrandProfileForClient } from '@/lib/repositories/supabase/brand-profiles'
import { listContactReplyExamples } from '@/lib/repositories/supabase/reply-learning'
import { getMyCreatorStatus } from '@/lib/repositories/supabase/creator-status'
import { TemplateReplyGeneratorService } from '@/lib/services/ai-reply'
import { AnthropicReplyGenerationError, generateReplyWithAnthropic } from '@/lib/services/anthropic-reply'
import { calculateGenerationCost, isAnthropicConfigured } from '@/lib/services/anthropic-draft'
import {
  claimInboxReplyGeneration,
  claimWorkspaceAiBudget,
  configuredMonthlyAiBudgetUsd,
  releaseInboxReplyGeneration,
  releaseWorkspaceAiBudget,
} from '@/lib/services/ai-generation-claims'
import { hasUnrecordedAiUsageIncident } from '@/lib/services/ai-usage-incidents'
import type { ReplyProposal } from '@/lib/services/interfaces'

// The per-item reply-suggestion generation logic behind /api/inbox/reply/
// generate, extracted so it can be called both for a single item (the
// existing route, now a thin wrapper) and in a loop for a bulk request
// (/api/inbox/reply/generate-bulk) WITHOUT duplicating any of the safety
// machinery: the per-item generation lock, the auto-job conflict check, the
// lost-HTTP-response suggestion reuse window, the AI usage-ledger safety
// check, and the workspace AI budget claim/spend check all stay exactly as
// they were — just callable in a loop, one item fully finishing (including
// releasing its claims) before the next starts.

/** Lost-HTTP idempotency window: reuse a just-written suggestion, but allow
 *  intentional manual regenerates after the window (and after auto-job cancel). */
const SUGGESTION_REUSE_WINDOW_MS = 2 * 60 * 1000

export interface GenerateReplySuggestionParams {
  workspaceId: string
  inboxItemId: string
  userId: string
}

export interface GenerateReplySuggestionOutcome {
  /** HTTP-style status the caller should report for this one item. */
  status: number
  body: Record<string, unknown>
}

interface ExistingSuggestionRow {
  id: string
  suggested_text: string
  tone: string
  source: 'template' | 'ai'
  assumptions: string[] | null
  ai_generation_id: string | null
  created_at: string
}

async function persistReplyArtifacts(
  serviceClient: SupabaseClient,
  params: {
    suggestionId: string
    workspaceId: string
    inboxItemId: string
    proposal: ReplyProposal
    source: 'template' | 'ai'
    aiGenerationId: string | null
  },
): Promise<string> {
  const row = {
    id: params.suggestionId,
    workspace_id: params.workspaceId,
    inbox_item_id: params.inboxItemId,
    suggested_text: params.proposal.reply,
    tone: params.proposal.tone,
    source: params.source,
    assumptions: params.proposal.assumptions,
    ai_generation_id: params.aiGenerationId,
  }

  let { data, error } = await serviceClient
    .from('ai_reply_suggestions')
    .insert(row)
    .select('id')
    .single()

  if (error) {
    const { data: existing, error: readError } = await serviceClient
      .from('ai_reply_suggestions')
      .select('id')
      .eq('id', params.suggestionId)
      .maybeSingle()

    if (readError) throw new Error(`${error.message} (suggestion reconciliation failed: ${readError.message})`)

    if (existing) {
      data = existing
      error = null
    } else {
      const retry = await serviceClient
        .from('ai_reply_suggestions')
        .insert(row)
        .select('id')
        .single()
      data = retry.data
      error = retry.error

      if (error) {
        const { data: reconciled, error: secondReadError } = await serviceClient
          .from('ai_reply_suggestions')
          .select('id')
          .eq('id', params.suggestionId)
          .maybeSingle()
        if (secondReadError) throw new Error(`${error.message} (suggestion reconciliation failed: ${secondReadError.message})`)
        if (reconciled) {
          data = reconciled
          error = null
        }
      }
    }
  }

  if (error || !data) throw new Error(error?.message ?? '返信案を保存できませんでした。')

  const { error: updateError } = await serviceClient
    .from('inbox_items')
    .update({ ai_summary: params.proposal.summary, ai_priority: params.proposal.priority })
    .eq('id', params.inboxItemId)
    .eq('workspace_id', params.workspaceId)
  if (updateError) console.error('Failed to update inbox item summary/priority:', updateError)

  return data.id as string
}

/**
 * Generates (or reuses a very recent) reply suggestion for one inbox item.
 * `supabase` is the caller's session client (item/brandProfile/styleExamples/
 * creatorStatus reads, audit log insert); `serviceClient` is the service-role
 * client (claims, AI usage/budget bookkeeping, suggestion persistence).
 * Never throws — every failure path returns a descriptive {status, body}.
 */
export async function generateReplySuggestionForItem(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  { workspaceId, inboxItemId, userId }: GenerateReplySuggestionParams,
): Promise<GenerateReplySuggestionOutcome> {
  const { data: item, error: itemError } = await supabase
    .from('inbox_items')
    .select('id, text, platform, contact_id, ai_summary, ai_priority')
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (itemError) {
    return { status: 503, body: { error: '受信メッセージを確認できませんでした。少し後でもう一度お試しください。' } }
  }
  if (!item) return { status: 404, body: { error: '受信メッセージが見つかりません。' } }

  let brandProfile
  try {
    brandProfile = await getDefaultBrandProfileForClient(supabase, workspaceId)
  } catch (cause) {
    console.error('Failed to load Brand Profile for reply generation:', cause)
    return {
      status: 503,
      body: { error: 'ブランドプロフィールを読み込めなかったため、安全のため返信案の生成を中止しました。少し待ってから再試行してください。' },
    }
  }

  let styleExamples: Awaited<ReturnType<typeof listContactReplyExamples>> = []
  if (item.contact_id) {
    try {
      styleExamples = await listContactReplyExamples(supabase, workspaceId, item.contact_id)
    } catch (cause) {
      console.error('Failed to load per-contact reply examples:', cause)
      return {
        status: 503,
        body: { error: '返信スタイルの学習データを読み込めなかったため、安全のため返信案の生成を中止しました。少し待ってから再試行してください。' },
      }
    }
  }

  let status
  try {
    status = await getMyCreatorStatus(supabase, workspaceId, userId)
  } catch (cause) {
    console.error('Failed to load creator status for reply generation:', cause)
    return {
      status: 503,
      body: { error: 'クリエイター状態を読み込めなかったため、安全のため返信案の生成を中止しました。少し待ってから再試行してください。' },
    }
  }
  const creatorStatus = status?.shareWithContacts ? { mood: status.mood, note: status.note } : undefined

  let replyClaimToken: string | null
  try {
    replyClaimToken = await claimInboxReplyGeneration(serviceClient, workspaceId, inboxItemId)
  } catch (cause) {
    console.error('Failed to claim reply generation:', cause)
    return { status: 503, body: { error: '返信案の生成ロックを取得できませんでした。少し待ってから再試行してください。' } }
  }
  if (!replyClaimToken) {
    return { status: 409, body: { error: 'このメッセージの返信案は現在別の処理で生成中です。' } }
  }

  try {
    // After the message-level claim, re-check the outbound side as well. An
    // auto-reply sweep may have completed its transaction just before this
    // manual request acquired the claim. Do not create/reuse a competing manual
    // suggestion while an auto job for the same inbound message still exists.
    const { data: autoJob, error: autoJobError } = await serviceClient
      .from('reply_jobs')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('inbox_item_id', inboxItemId)
      .eq('reply_mode', 'auto')
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle()

    if (autoJobError) {
      console.error('Failed to check active auto reply before manual generation:', autoJobError)
      return { status: 503, body: { error: '自動返信の状態を確認できないため、安全のため返信案の生成を開始しませんでした。' } }
    }
    if (autoJob) {
      return {
        status: 409,
        body: { error: 'このメッセージには自動返信ジョブがすでにあります。受信箱でその返信を確認・取り消してから、新しい返信案を作成してください。' },
      }
    }

    // A lost HTTP response after a committed suggestion INSERT must not cause a
    // second paid model call. Once the message claim is ours, a *recent*
    // durable suggestion is treated as that earlier request's result. Older
    // suggestions are left in place as history; a new generate creates a fresh
    // row so "生成" after cancel/edit is not permanently stuck on the first draft.
    const { data: existingRaw, error: existingError } = await serviceClient
      .from('ai_reply_suggestions')
      .select('id, suggested_text, tone, source, assumptions, ai_generation_id, created_at')
      .eq('workspace_id', workspaceId)
      .eq('inbox_item_id', inboxItemId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      return { status: 503, body: { error: '既存の返信案を確認できないため、安全のためAI生成を開始しませんでした。' } }
    }
    if (existingRaw) {
      const existing = existingRaw as ExistingSuggestionRow
      const ageMs = Date.now() - new Date(existing.created_at).getTime()
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < SUGGESTION_REUSE_WINDOW_MS) {
        return {
          status: 200,
          body: {
            source: existing.source === 'ai' ? 'ai' : 'template-fallback',
            reason: existing.source === 'template' ? '保存済みの定型返信案を再利用しました。' : undefined,
            summary: (item.ai_summary as string | null) ?? '',
            reply: existing.suggested_text,
            tone: existing.tone,
            assumptions: existing.assumptions ?? [],
            priority: (item.ai_priority as 'high' | 'normal' | 'low' | null) ?? 'normal',
            suggestionId: existing.id,
            aiGenerationId: existing.ai_generation_id ?? undefined,
            reused: true,
          },
        }
      }
    }

    if (!isAnthropicConfigured()) {
      const proposal = await new TemplateReplyGeneratorService().generateReply(item.text, { brandProfile })
      try {
        const suggestionId = await persistReplyArtifacts(serviceClient, {
          suggestionId: randomUUID(),
          workspaceId,
          inboxItemId,
          proposal,
          source: 'template',
          aiGenerationId: null,
        })
        return {
          status: 200,
          body: {
            source: 'template-fallback',
            reason: 'ANTHROPIC_API_KEYが未設定のため、AIではなく定型文を表示しています。',
            summary: proposal.summary,
            reply: proposal.reply,
            tone: proposal.tone,
            assumptions: proposal.assumptions,
            priority: proposal.priority,
            suggestionId,
          },
        }
      } catch (cause) {
        console.error('Failed to persist template reply suggestion:', cause)
        return { status: 502, body: { error: '返信案を保存できませんでした。少し待ってから再試行してください。' } }
      }
    }

    try {
      if (await hasUnrecordedAiUsageIncident(serviceClient, workspaceId)) {
        return {
          status: 503,
          body: { error: '直近のAI使用量を台帳に記録できなかったため、安全のため追加のAI生成を停止しています。管理者に使用量台帳の確認を依頼してください。' },
        }
      }
    } catch (cause) {
      console.error('Failed to verify AI usage-ledger safety state:', cause)
      return { status: 503, body: { error: 'AI使用量台帳の安全状態を確認できないため、生成を停止しました。' } }
    }

    const monthlyBudgetUsd = configuredMonthlyAiBudgetUsd()
    let budgetClaimToken: string | null = null
    if (monthlyBudgetUsd !== null) {
      try {
        budgetClaimToken = await claimWorkspaceAiBudget(serviceClient, workspaceId)
      } catch (cause) {
        console.error('Failed to claim AI budget slot:', cause)
        return { status: 503, body: { error: 'AI予算の確認を開始できませんでした。少し待ってから再試行してください。' } }
      }
      if (!budgetClaimToken) {
        return { status: 409, body: { error: 'このワークスペースでは別のAI処理が実行中です。完了後に再試行してください。' } }
      }
    }

    try {
      if (monthlyBudgetUsd !== null) {
        let spentUsd: number
        try {
          spentUsd = await getWorkspaceMonthlyAiCost(serviceClient, workspaceId)
        } catch (cause) {
          console.error('Failed to read AI budget usage:', cause)
          return { status: 503, body: { error: 'AI予算の使用額を確認できないため、安全のため生成を停止しました。' } }
        }
        if (spentUsd >= monthlyBudgetUsd) {
          return {
            status: 402,
            body: {
              error: `このワークスペースの今月のAI予算（$${monthlyBudgetUsd.toFixed(2)}）に達しました（使用額 $${spentUsd.toFixed(2)}）。ANTHROPIC_MONTHLY_BUDGET_USDを引き上げるか、来月まで待ってください。`,
            },
          }
        }
      }

      const generationId = randomUUID()
      const suggestionId = randomUUID()

      try {
        const result = await generateReplyWithAnthropic(item.text, { brandProfile, styleExamples, creatorStatus })
        const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)
        let recordedGenerationId: string | null = null
        let usageWarning: string | undefined

        try {
          const generation = await recordAiGeneration(serviceClient, {
            id: generationId,
            workspaceId,
            inboxItemId,
            purpose: 'reply',
            channels: [],
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd,
            createdBy: userId,
          })
          recordedGenerationId = generation.id
        } catch (recordError) {
          console.error('Reply generation succeeded but AI usage ledger persistence failed:', recordError)
          usageWarning = '返信案のAI生成は成功しましたが、使用量の記録だけ保存できませんでした。予算の過小計上を防ぐため、台帳が復旧するまで追加のAI生成は停止します。'
        }

        const durableSuggestionId = await persistReplyArtifacts(serviceClient, {
          suggestionId,
          workspaceId,
          inboxItemId,
          proposal: result.proposal,
          source: 'ai',
          aiGenerationId: recordedGenerationId,
        })

        const { error: auditError } = await supabase.from('audit_logs').insert({
          workspace_id: workspaceId,
          actor_id: userId,
          action: 'inbox_reply_ai_generated',
          target_type: 'inbox_item',
          target_id: inboxItemId,
          metadata: {
            platform: item.platform,
            model: result.model,
            aiGenerationId: recordedGenerationId,
            usageRecorded: Boolean(recordedGenerationId),
            priority: result.proposal.priority,
          },
        })
        if (auditError) console.error('Failed to audit inbox reply AI generation:', auditError)

        return {
          status: 200,
          body: {
            source: 'ai',
            model: result.model,
            aiGenerationId: recordedGenerationId ?? undefined,
            usageRecorded: Boolean(recordedGenerationId),
            usageWarning,
            summary: result.proposal.summary,
            reply: result.proposal.reply,
            tone: result.proposal.tone,
            assumptions: result.proposal.assumptions,
            priority: result.proposal.priority,
            suggestionId: durableSuggestionId,
          },
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'AIによる返信案の生成に失敗しました。'
        if (cause instanceof AnthropicReplyGenerationError) {
          try {
            await recordAiGeneration(serviceClient, {
              id: generationId,
              workspaceId,
              inboxItemId,
              purpose: 'reply',
              channels: [],
              model: cause.usage.model,
              inputTokens: cause.usage.inputTokens,
              outputTokens: cause.usage.outputTokens,
              costUsd: calculateGenerationCost(cause.usage.inputTokens, cause.usage.outputTokens),
              createdBy: userId,
            })
          } catch (recordError) {
            console.error('Failed to record AI usage after a failed reply generation:', recordError)
          }
        }
        return { status: 502, body: { error: message } }
      }
    } finally {
      if (budgetClaimToken) {
        await releaseWorkspaceAiBudget(serviceClient, workspaceId, budgetClaimToken).catch((cause) =>
          console.error('Failed to release AI budget claim:', cause),
        )
      }
    }
  } finally {
    await releaseInboxReplyGeneration(serviceClient, workspaceId, inboxItemId, replyClaimToken).catch((cause) =>
      console.error('Failed to release reply generation claim:', cause),
    )
  }
}
