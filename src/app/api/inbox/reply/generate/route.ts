import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { getDefaultBrandProfileForClient } from '@/lib/repositories/supabase/brand-profiles'
import { listContactReplyExamples } from '@/lib/repositories/supabase/reply-learning'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'
import { TemplateReplyGeneratorService } from '@/lib/services/ai-reply'
import { AnthropicReplyGenerationError, generateReplyWithAnthropic } from '@/lib/services/anthropic-reply'
import { calculateGenerationCost, isAnthropicConfigured } from '@/lib/services/anthropic-draft'
import type { ReplyProposal } from '@/lib/services/interfaces'

// Generates an AI (or template-fallback) reply proposal for one inbound DM,
// mirroring /api/drafts/generate's spine: auth → reply_inbox → best-effort
// Brand Profile → template when Anthropic unconfigured → monthly budget cap →
// generate → record cost → persist suggestion + summary → audit; fail-closed
// (502, still record billed usage) on an AI error. Generation is read-only
// assistance, so it is allowed for BOTH LINE and Instagram DMs (IG is
// receive-only for *sending* — that gate lives in the approve/send route).

interface GenerateReplyBody {
  workspaceId?: string
  inboxItemId?: string
}

/** Writes the suggestion row + the inbox item's summary/priority via the service client (both are service-role-written, like ingestion). */
async function persistReplyArtifacts(
  serviceClient: SupabaseClient,
  params: { workspaceId: string; inboxItemId: string; proposal: ReplyProposal; source: 'template' | 'ai'; aiGenerationId: string | null },
): Promise<string> {
  const { data, error } = await serviceClient
    .from('ai_reply_suggestions')
    .insert({
      workspace_id: params.workspaceId,
      inbox_item_id: params.inboxItemId,
      suggested_text: params.proposal.reply,
      tone: params.proposal.tone,
      source: params.source,
      assumptions: params.proposal.assumptions,
      ai_generation_id: params.aiGenerationId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  const { error: updateError } = await serviceClient
    .from('inbox_items')
    .update({ ai_summary: params.proposal.summary, ai_priority: params.proposal.priority })
    .eq('id', params.inboxItemId)
    .eq('workspace_id', params.workspaceId)

  // A failed summary update is not worth discarding a good suggestion over.
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
  if (!user) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })
  }

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
    .select('id, text, platform, contact_id')
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (itemError || !item) {
    return NextResponse.json({ error: '受信メッセージが見つかりません。' }, { status: 404 })
  }

  // Voice source for a DM (no Seed): the workspace default Brand Profile.
  // Best-effort — a failure here must never block reply generation.
  const brandProfile = await getDefaultBrandProfileForClient(supabase, workspaceId).catch((cause) => {
    console.error('Failed to load Brand Profile for reply generation:', cause)
    return null
  })

  // Per-contact learning (Phase 2): the creator's past approved replies to THIS
  // contact become few-shot style examples, so the proposal drifts toward how
  // they actually write to this person. Best-effort — never blocks generation,
  // and only meaningful once there's approved history (empty otherwise).
  const styleExamples = item.contact_id
    ? await listContactReplyExamples(supabase, workspaceId, item.contact_id).catch((cause) => {
        console.error('Failed to load per-contact reply examples:', cause)
        return []
      })
    : []

  const serviceClient = createServiceClient()

  if (!isAnthropicConfigured()) {
    const proposal = await new TemplateReplyGeneratorService().generateReply(item.text, { brandProfile })
    try {
      const suggestionId = await persistReplyArtifacts(serviceClient, { workspaceId, inboxItemId, proposal, source: 'template', aiGenerationId: null })
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

  // Same opt-in monthly budget cap as draft generation — reply spend counts
  // toward the same ledger (see getWorkspaceMonthlyAiCost).
  const monthlyBudgetUsd = Number(process.env.ANTHROPIC_MONTHLY_BUDGET_USD)
  if (Number.isFinite(monthlyBudgetUsd) && monthlyBudgetUsd > 0) {
    const spentUsd = await getWorkspaceMonthlyAiCost(supabase, workspaceId)
    if (spentUsd >= monthlyBudgetUsd) {
      return NextResponse.json(
        {
          error: `このワークスペースの今月のAI予算（$${monthlyBudgetUsd.toFixed(2)}）に達しました（使用額 $${spentUsd.toFixed(2)}）。ANTHROPIC_MONTHLY_BUDGET_USDを引き上げるか、来月まで待ってください。`,
        },
        { status: 402 },
      )
    }
  }

  try {
    const result = await generateReplyWithAnthropic(item.text, { brandProfile, styleExamples })
    const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)

    const generation = await recordAiGeneration(supabase, {
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

    const suggestionId = await persistReplyArtifacts(serviceClient, {
      workspaceId,
      inboxItemId,
      proposal: result.proposal,
      source: 'ai',
      aiGenerationId: generation.id,
    })

    await supabase.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      action: 'inbox_reply_ai_generated',
      target_type: 'inbox_item',
      target_id: inboxItemId,
      metadata: { platform: item.platform, model: result.model, aiGenerationId: generation.id, priority: result.proposal.priority },
    })

    return NextResponse.json({
      source: 'ai',
      model: result.model,
      aiGenerationId: generation.id,
      summary: result.proposal.summary,
      reply: result.proposal.reply,
      tone: result.proposal.tone,
      assumptions: result.proposal.assumptions,
      priority: result.proposal.priority,
      suggestionId,
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'AIによる返信案の生成に失敗しました。'

    // The Anthropic call may have succeeded (and been billed) even though the
    // response couldn't be parsed — record the spend so cost isn't under-reported.
    if (cause instanceof AnthropicReplyGenerationError) {
      try {
        await recordAiGeneration(supabase, {
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

    // Fail closed: no silent template substitution for a failed AI call.
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
