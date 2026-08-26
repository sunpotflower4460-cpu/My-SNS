import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mapSeed, SEED_SELECT, type SeedRow } from '@/lib/repositories/supabase/seeds'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { listRecentAiRevisionsForStyleLearning } from '@/lib/repositories/supabase/draft-revisions'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { hasPermission } from '@/lib/permissions'
import type { PublishingChannel, WorkspaceRole } from '@/lib/domain/types'
import { CORE_PUBLISHING_CHANNELS } from '@/lib/domain/types'
import { TemplateDraftGeneratorService } from '@/lib/services/ai-draft'
import {
  AnthropicGenerationError,
  calculateGenerationCost,
  generateChannelDraftsWithAnthropic,
  isAnthropicConfigured,
} from '@/lib/services/anthropic-draft'
import {
  claimWorkspaceAiBudget,
  configuredMonthlyAiBudgetUsd,
  releaseWorkspaceAiBudget,
} from '@/lib/services/ai-generation-claims'

const VALID_CHANNELS = new Set(Object.keys(PUBLISHING_CHANNEL_CONFIG))
const VALID_LENGTHS = new Set(['short', 'medium', 'long'])
const MAX_CHANNELS_PER_REQUEST = CORE_PUBLISHING_CHANNELS.length

interface GenerateRequestBody {
  workspaceId?: string
  seedId?: string
  channels?: string[]
  tone?: string
  length?: string
}

export async function POST(request: NextRequest) {
  let body: GenerateRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が正しくありません。' }, { status: 400 })
  }

  const { workspaceId, seedId, channels, tone, length } = body

  if (!workspaceId || !seedId) {
    return NextResponse.json({ error: 'workspaceIdとseedIdは必須です。' }, { status: 400 })
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: '媒体を1つ以上選択してください。' }, { status: 400 })
  }
  if (channels.length > MAX_CHANNELS_PER_REQUEST) {
    return NextResponse.json(
      { error: `一度に生成できる媒体は最大${MAX_CHANNELS_PER_REQUEST}件までです。` },
      { status: 400 },
    )
  }
  const invalidChannels = channels.filter((channel) => !VALID_CHANNELS.has(channel))
  if (invalidChannels.length > 0) {
    return NextResponse.json({ error: `不明な媒体です: ${invalidChannels.join(', ')}` }, { status: 400 })
  }
  if (typeof tone !== 'string' || !tone.trim()) {
    return NextResponse.json({ error: 'トーンを指定してください。' }, { status: 400 })
  }
  if (typeof length !== 'string' || !VALID_LENGTHS.has(length)) {
    return NextResponse.json({ error: '長さはshort・medium・longのいずれかにしてください。' }, { status: 400 })
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
  if (!role || !hasPermission(role, 'create_drafts')) {
    return NextResponse.json({ error: 'このワークスペースで下書きを生成する権限がありません。' }, { status: 403 })
  }

  const { data: seedRow, error: seedError } = await supabase
    .from('seeds')
    .select(SEED_SELECT)
    .eq('id', seedId)
    .eq('workspace_id', workspaceId)
    .single()

  if (seedError || !seedRow) {
    return NextResponse.json({ error: 'シードが見つかりません。' }, { status: 404 })
  }

  const seed = mapSeed(seedRow as unknown as SeedRow)
  const typedChannels = channels as PublishingChannel[]
  const typedLength = length as 'short' | 'medium' | 'long'
  // Best-effort: a failure here must never block draft generation itself —
  // style learning is a quality nudge, not a required input.
  const styleExamples = await listRecentAiRevisionsForStyleLearning(supabase, workspaceId, typedChannels).catch((cause) => {
    console.error('Failed to load style examples for draft generation:', cause)
    return []
  })
  const context = {
    createdBy: user.id,
    brandProfile: seed.brandProfile ?? null,
    styleExamples,
  }

  if (!isAnthropicConfigured()) {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(seed, typedChannels, tone, typedLength, context)
    return NextResponse.json({
      source: 'template-fallback',
      reason: 'ANTHROPIC_API_KEYが未設定のため、AI提案の代わりに固定テンプレートを表示しています。',
      drafts,
    })
  }

  const monthlyBudgetUsd = configuredMonthlyAiBudgetUsd()
  const serviceClient = monthlyBudgetUsd !== null ? createServiceClient() : null
  let budgetClaimToken: string | null = null

  if (monthlyBudgetUsd !== null && serviceClient) {
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
    // Re-read spend only after the workspace mutex is held. This closes the
    // old race where many simultaneous requests all saw the same pre-call total
    // and each proceeded independently. One individual call can still cross a
    // small remaining balance because its exact token cost is only known after
    // Anthropic returns usage.
    if (monthlyBudgetUsd !== null && serviceClient) {
      let spentUsd: number
      try {
        spentUsd = await getWorkspaceMonthlyAiCost(serviceClient, workspaceId)
      } catch (cause) {
        console.error('Failed to read AI budget usage:', cause)
        return NextResponse.json({ error: 'AI予算の使用額を確認できないため、安全のため生成を停止しました。' }, { status: 503 })
      }
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
      const result = await generateChannelDraftsWithAnthropic(seed, typedChannels, tone, typedLength, context)
      const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)

      const generation = await recordAiGeneration(supabase, {
        workspaceId,
        seedId,
        channels: typedChannels,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        createdBy: user.id,
      })

      await supabase.from('audit_logs').insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        action: 'draft_ai_generated',
        target_type: 'seed',
        target_id: seedId,
        // styleExamplesUsed: traceability for PR7's cross-Seed style learning —
        // this generation's prompt may have included wording a human approved
        // on a *different* Seed (see listRecentAiRevisionsForStyleLearning),
        // so the audit log should say when that happened, not just that a
        // generation occurred.
        metadata: { channels: typedChannels, model: result.model, aiGenerationId: generation.id, styleExamplesUsed: styleExamples.length },
      })

      return NextResponse.json({
        source: 'ai',
        model: result.model,
        aiGenerationId: generation.id,
        drafts: result.drafts,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'AIによる下書き生成に失敗しました。'

      // The Anthropic call itself may have succeeded (and been billed) even
      // though the response couldn't be turned into valid drafts. Record what
      // was actually spent so ai_generations doesn't silently under-report cost.
      if (cause instanceof AnthropicGenerationError) {
        try {
          await recordAiGeneration(supabase, {
            workspaceId,
            seedId,
            channels: typedChannels,
            model: cause.usage.model,
            inputTokens: cause.usage.inputTokens,
            outputTokens: cause.usage.outputTokens,
            costUsd: calculateGenerationCost(cause.usage.inputTokens, cause.usage.outputTokens),
            createdBy: user.id,
          })
        } catch (recordError) {
          console.error('Failed to record AI generation usage after a failed generation:', recordError)
        }
      }

      // Fail closed: no fallback here. Silently substituting templates for a
      // failed AI call would misrepresent them as intentional, reviewed output.
      return NextResponse.json({ error: message }, { status: 502 })
    }
  } finally {
    if (budgetClaimToken && serviceClient) {
      await releaseWorkspaceAiBudget(serviceClient, workspaceId, budgetClaimToken).catch((cause) =>
        console.error('Failed to release AI budget claim:', cause),
      )
    }
  }
}
