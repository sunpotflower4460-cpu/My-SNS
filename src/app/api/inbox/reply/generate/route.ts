import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { getDefaultBrandProfileForClient } from '@/lib/repositories/supabase/brand-profiles'
import { listContactReplyExamples } from '@/lib/repositories/supabase/reply-learning'
import { getMyCreatorStatus } from '@/lib/repositories/supabase/creator-status'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'
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
import type { ReplyProposal } from '@/lib/services/interfaces'

interface GenerateReplyBody {
  workspaceId?: string
  inboxItemId?: string
}

interface ExistingSuggestionRow {
  id: string
  suggested_text: string
  tone: string
  source: 'template' | 'ai'
  assumptions: string[] | null
  ai_generation_id: string | null
}

/**
 * Writes one suggestion with a caller-owned UUID. If the INSERT commits but
 * its HTTP response is lost, re-reading/retrying the SAME id cannot create a
 * second suggestion. This is important because the model call has already been
 * paid for by the time this function runs.
 */
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
      // If the first write definitively did not commit and the database has
      // recovered, one same-id retry is safe. A late/duplicate commit can only
      // conflict with this exact UUID, never create a second suggestion.
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

export async function POST(request: NextRequest) {
  let body: GenerateReplyBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, inboxItemId } = body
  if (!workspaceId || !inboxItemId) {
    return NextResponse.json({ error: 'workspaceIdとinboxItemIdは必須です。' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'reply_inbox')) {
    return NextResponse.json({ error: 'このワークスペースで返信を作成する権限がありません。' }, { status: 403 })
  }

  const { data: item, error: itemError } = await supabase
    .from('inbox_items')
    .select('id, text, platform, contact_id, ai_summary, ai_priority')
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (itemError || !item) return NextResponse.json({ error: '受信メッセージが見つかりません。' }, { status: 404 })

  const brandProfile = await getDefaultBrandProfileForClient(supabase, workspaceId).catch((cause) => {
    console.error('Failed to load Brand Profile for reply generation:', cause)
    return null
  })
  const styleExamples = item.contact_id
    ? await listContactReplyExamples(supabase, workspaceId, item.contact_id).catch((cause) => {
        console.error('Failed to load per-contact reply examples:', cause)
        return []
      })
    : []
  const status = await getMyCreatorStatus(supabase, workspaceId, user.id).catch(() => null)
  const creatorStatus = status?.shareWithContacts ? { mood: status.mood, note: status.note } : undefined

  const serviceClient = createServiceClient()
  let replyClaimToken: string | null
  try {
    replyClaimToken = await claimInboxReplyGeneration(serviceClient, workspaceId, inboxItemId)
  } catch (cause) {
    console.error('Failed to claim reply generation:', cause)
    return NextResponse.json({ error: '返信案の生成ロックを取得できませんでした。少し待ってから再試行してください。' }, { status: 503 })
  }
  if (!replyClaimToken) {
    return NextResponse.json({ error: 'このメッセージの返信案は現在別の処理で生成中です。' }, { status: 409 })
  }

  try {
    // HTTP response loss after a successful suggestion INSERT must not cause a
    // second paid model call. Once the message claim is ours, treat a durable
    // suggestion as the idempotent result of the earlier request.
    const { data: existingRaw, error: existingError } = await serviceClient
      .from('ai_reply_suggestions')
      .select('id, suggested_text, tone, source, assumptions, ai_generation_id')
      .eq('workspace_id', workspaceId)
      .eq('inbox_item_id', inboxItemId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ error: '既存の返信案を確認できないため、安全のためAI生成を開始しませんでした。' }, { status: 503 })
    }
    if (existingRaw) {
      const existing = existingRaw as ExistingSuggestionRow
      return NextResponse.json({
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
      })
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
        return NextResponse.json({
          source: 'template-fallback',
          reason: 'ANTHROPIC_API_KEYが未設定のため、AIではなく定型文を表示しています。',
          summary: proposal.summary,
          reply: proposal.reply,
          tone: proposal.tone,
          assumptions: proposal.assumptions,
          priority: proposal.priority,
          suggestionId,
        })
      } catch (cause) {
        return NextResponse.json({ error: cause instanceof Error ? cause.message : '返信案を保存できませんでした。' }, { status: 502 })
      }
    }

    const monthlyBudgetUsd = configuredMonthlyAiBudgetUsd()
    let budgetClaimToken: string | null = null
    if (monthlyBudgetUsd !== null) {
      try {
        budgetClaimToken = await claimWorkspaceAiBudget(serviceClient, workspaceId)
      } catch (cause) {
        console.error('Failed to claim AI budget slot:', cause)
        return NextResponse.json({ error: 'AI予算の確認を開始できませんでした。少し待ってから再試行してください。' }, { status: 503 })
      }
      if (!budgetClaimToken) {
        return NextResponse.json({ error: 'このワークスペースでは別のAI処理が実行中です。完了後に再試行してください。' }, { status: 409 })
      }
    }

    try {
      if (monthlyBudgetUsd !== null) {
        let spentUsd: number
        try {
          spentUsd = await getWorkspaceMonthlyAiCost(serviceClient, workspaceId)
        } catch (cause) {
          console.error('Failed to read AI budget usage:', cause)
          return NextResponse.json({ error: 'AI予算の使用額を確認できないため、安全のため生成を停止しました。' }, { status: 503 })
        }
        if (spentUsd >= monthlyBudgetUsd) {
          return NextResponse.json(
            { error: `このワークスペースの今月のAI予算（$${monthlyBudgetUsd.toFixed(2)}）に達しました（使用額 $${spentUsd.toFixed(2)}）。ANTHROPIC_MONTHLY_BUDGET_USDを引き上げるか、来月まで待ってください。` },
            { status: 402 },
          )
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
            createdBy: user.id,
          })
          recordedGenerationId = generation.id
        } catch (recordError) {
          console.error('Reply generation succeeded but AI usage ledger persistence failed:', recordError)
          usageWarning = '返信案のAI生成は成功しましたが、使用量の記録だけ保存できませんでした。'
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
          actor_id: user.id,
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

        return NextResponse.json({
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
        })
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
              createdBy: user.id,
            })
          } catch (recordError) {
            console.error('Failed to record AI usage after a failed reply generation:', recordError)
          }
        }
        return NextResponse.json({ error: message }, { status: 502 })
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
