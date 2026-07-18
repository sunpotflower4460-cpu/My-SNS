import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'
import { AnthropicScheduleGenerationError, extractScheduleWithAnthropic } from '@/lib/services/anthropic-schedule'
import { calculateGenerationCost, isAnthropicConfigured } from '@/lib/services/anthropic-draft'

// Extracts proposed calendar events from one inbound DM. Proposal-only: it
// returns events for the human to approve — it never writes to the calendar
// (that happens through the normal manage_calendar create path once approved).
// Mirrors /api/inbox/reply/generate's spine: auth → manage_calendar → load item
// → fail-closed when Anthropic unconfigured (no template guessing of dates) →
// monthly budget cap → extract → record cost → return; 502 (still records billed
// usage) on an AI error.

interface ExtractScheduleBody {
  workspaceId?: string
  inboxItemId?: string
}

export async function POST(request: NextRequest) {
  let body: ExtractScheduleBody
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
  if (!role || !hasPermission(role, 'manage_calendar')) {
    return NextResponse.json({ error: 'このワークスペースでカレンダーを編集する権限がありません。' }, { status: 403 })
  }

  const { data: item, error: itemError } = await supabase
    .from('inbox_items')
    .select('id, text, contact_id')
    .eq('id', inboxItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (itemError || !item) {
    return NextResponse.json({ error: '受信メッセージが見つかりません。' }, { status: 404 })
  }

  // Fail-closed: without AI there is no safe way to resolve relative dates
  // ("来週火曜") into calendar entries — there is deliberately no template
  // fallback here (a wrong auto-guessed date is worse than none).
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { source: 'unavailable', reason: 'ANTHROPIC_API_KEYが未設定のため、会話からの予定抽出は利用できません。', proposals: [] },
      { status: 200 },
    )
  }

  const monthlyBudgetUsd = Number(process.env.ANTHROPIC_MONTHLY_BUDGET_USD)
  if (Number.isFinite(monthlyBudgetUsd) && monthlyBudgetUsd > 0) {
    const spentUsd = await getWorkspaceMonthlyAiCost(supabase, workspaceId)
    if (spentUsd >= monthlyBudgetUsd) {
      return NextResponse.json(
        {
          error: `このワークスペースの今月のAI予算（$${monthlyBudgetUsd.toFixed(2)}）に達しました（使用額 $${spentUsd.toFixed(2)}）。`,
        },
        { status: 402 },
      )
    }
  }

  // The model resolves relative dates against "now" in JST (the sole user's tz).
  const nowJst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T')

  // Look up the contact's display name (best-effort) for nicer event titles.
  let contactDisplayName: string | undefined
  if (item.contact_id) {
    const { data: contact } = await supabase
      .from('messaging_contacts')
      .select('display_name')
      .eq('id', item.contact_id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    contactDisplayName = (contact?.display_name as string | null) ?? undefined
  }

  try {
    const result = await extractScheduleWithAnthropic(item.text, { nowJst, contactDisplayName })
    const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)

    await recordAiGeneration(supabase, {
      workspaceId,
      inboxItemId,
      purpose: 'schedule',
      channels: [],
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      createdBy: user.id,
    })

    return NextResponse.json({ source: 'ai', model: result.model, proposals: result.proposals })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '予定の抽出に失敗しました。'

    if (cause instanceof AnthropicScheduleGenerationError) {
      try {
        await recordAiGeneration(supabase, {
          workspaceId,
          inboxItemId,
          purpose: 'schedule',
          channels: [],
          model: cause.usage.model,
          inputTokens: cause.usage.inputTokens,
          outputTokens: cause.usage.outputTokens,
          costUsd: calculateGenerationCost(cause.usage.inputTokens, cause.usage.outputTokens),
          createdBy: user.id,
        })
      } catch (recordError) {
        console.error('Failed to record AI usage after a failed schedule extraction:', recordError)
      }
    }

    return NextResponse.json({ error: message }, { status: 502 })
  }
}
