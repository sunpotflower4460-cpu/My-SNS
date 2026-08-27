import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { hasPermission } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/domain/types'
import { AnthropicScheduleGenerationError, extractScheduleWithAnthropic } from '@/lib/services/anthropic-schedule'
import { calculateGenerationCost, isAnthropicConfigured } from '@/lib/services/anthropic-draft'
import {
  claimWorkspaceAiBudget,
  configuredMonthlyAiBudgetUsd,
  releaseWorkspaceAiBudget,
} from '@/lib/services/ai-generation-claims'

// Extracts proposed calendar events from one inbound DM. Proposal-only: it
// returns events for the human to approve — it never writes to the calendar.

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
  if (!user) return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 })

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
  if (itemError || !item) return NextResponse.json({ error: '受信メッセージが見つかりません。' }, { status: 404 })

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { source: 'unavailable', reason: 'ANTHROPIC_API_KEYが未設定のため、会話からの予定抽出は利用できません。', proposals: [] },
      { status: 200 },
    )
  }

  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('Schedule extraction service client is unavailable:', cause)
    return NextResponse.json(
      { error: '予定抽出に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
      { status: 503 },
    )
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
        return NextResponse.json({ error: 'AI予算の使用額を確認できないため、安全のため予定抽出を停止しました。' }, { status: 503 })
      }
      if (spentUsd >= monthlyBudgetUsd) {
        return NextResponse.json(
          { error: `このワークスペースの今月のAI予算（$${monthlyBudgetUsd.toFixed(2)}）に達しました（使用額 $${spentUsd.toFixed(2)}）。` },
          { status: 402 },
        )
      }
    }

    const nowJst = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T')
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

    const generationId = randomUUID()

    try {
      const result = await extractScheduleWithAnthropic(item.text, { nowJst, contactDisplayName })
      const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)
      let usageRecorded = false
      let usageWarning: string | undefined

      try {
        await recordAiGeneration(serviceClient, {
          id: generationId,
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
        usageRecorded = true
      } catch (recordError) {
        console.error('Schedule extraction succeeded but AI usage ledger persistence failed:', recordError)
        usageWarning = '予定抽出は成功しましたが、AI使用量の記録だけ保存できませんでした。抽出結果はそのまま利用できます。'
      }

      return NextResponse.json({
        source: 'ai',
        model: result.model,
        proposals: result.proposals,
        usageRecorded,
        usageWarning,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '予定の抽出に失敗しました。'
      if (cause instanceof AnthropicScheduleGenerationError) {
        try {
          await recordAiGeneration(serviceClient, {
            id: generationId,
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
  } finally {
    if (budgetClaimToken) {
      await releaseWorkspaceAiBudget(serviceClient, workspaceId, budgetClaimToken).catch((cause) =>
        console.error('Failed to release AI budget claim:', cause),
      )
    }
  }
}
