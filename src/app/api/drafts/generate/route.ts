import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isNextResponse, requireWorkspaceMember } from '@/lib/api/workspace-access'
import { createServiceClient } from '@/lib/supabase/service'
import { mapSeed, SEED_SELECT, type SeedRow } from '@/lib/repositories/supabase/seeds'
import { getWorkspaceMonthlyAiCost, recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { listRecentAiRevisionsForStyleLearning } from '@/lib/repositories/supabase/draft-revisions'
import { summarizeStyleTendencies } from '@/lib/services/draft-style-learning'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import type { PublishingChannel } from '@/lib/domain/types'
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
import { hasUnrecordedAiUsageIncident } from '@/lib/services/ai-usage-incidents'

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

  const membership = await requireWorkspaceMember(supabase, workspaceId, user.id, 'create_drafts', 'このワークスペースで下書きを作成する権限がありません。')
  if (isNextResponse(membership)) return membership

  const { data: seedRow, error: seedError } = await supabase
    .from('seeds')
    .select(SEED_SELECT)
    .eq('id', seedId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (seedError) {
    return NextResponse.json({ error: 'シードを確認できませんでした。少し後でもう一度お試しください。' }, { status: 503 })
  }
  if (!seedRow) {
    return NextResponse.json({ error: 'シードが見つかりません。' }, { status: 404 })
  }

  const seed = mapSeed(seedRow as unknown as SeedRow)
  const typedChannels = channels as PublishingChannel[]
  const typedLength = length as 'short' | 'medium' | 'long'
  let styleExamples
  try {
    styleExamples = await listRecentAiRevisionsForStyleLearning(supabase, workspaceId, typedChannels)
  } catch (cause) {
    console.error('Failed to load style examples for draft generation:', cause)
    return NextResponse.json(
      { error: 'スタイル学習データを読み込めなかったため、安全のため下書き生成を中止しました。少し待ってから再試行してください。' },
      { status: 503 },
    )
  }
  const styleTendencies = summarizeStyleTendencies(styleExamples)
  const context = {
    createdBy: user.id,
    brandProfile: seed.brandProfile ?? null,
    styleExamples,
    styleTendencies,
  }

  if (!isAnthropicConfigured()) {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(seed, typedChannels, tone, typedLength, context)
    return NextResponse.json({
      source: 'template-fallback',
      reason: 'ANTHROPIC_API_KEYが未設定のため、AI提案の代わりに固定テンプレートを表示しています。',
      drafts,
      styleExamplesUsed: 0,
    })
  }

  // Once Anthropic is configured, every paid call must be able to use the
  // service-role ledger/claim path. Do not let a missing server credential turn
  // into an unhandled 500 or a paid generation whose usage cannot be tracked.
  let serviceClient: SupabaseClient
  try {
    serviceClient = createServiceClient()
  } catch (cause) {
    console.error('AI draft service client is unavailable:', cause)
    return NextResponse.json(
      { error: 'AI生成に必要なサーバー設定を確認できませんでした。管理者に設定確認を依頼してください。' },
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
    try {
      if (await hasUnrecordedAiUsageIncident(serviceClient, workspaceId)) {
        return NextResponse.json(
          {
            error:
              '直近のAI使用量を台帳に記録できなかったため、安全のため追加のAI生成を停止しています。管理者に使用量台帳の確認を依頼してください。',
          },
          { status: 503 },
        )
      }
    } catch (cause) {
      console.error('Failed to verify AI usage-ledger safety state:', cause)
      return NextResponse.json({ error: 'AI使用量台帳の安全状態を確認できないため、生成を停止しました。' }, { status: 503 })
    }

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
          {
            error: `このワークスペースの今月のAI予算（$${monthlyBudgetUsd.toFixed(2)}）に達しました（使用額 $${spentUsd.toFixed(2)}）。ANTHROPIC_MONTHLY_BUDGET_USDを引き上げるか、来月まで待ってください。`,
          },
          { status: 402 },
        )
      }
    }

    const generationId = randomUUID()

    try {
      const result = await generateChannelDraftsWithAnthropic(seed, typedChannels, tone, typedLength, context)
      const costUsd = calculateGenerationCost(result.inputTokens, result.outputTokens)

      let recordedGenerationId: string | undefined
      let usageWarning: string | undefined
      try {
        const generation = await recordAiGeneration(serviceClient, {
          id: generationId,
          workspaceId,
          seedId,
          channels: typedChannels,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd,
          createdBy: user.id,
        })
        recordedGenerationId = generation.id
      } catch (recordError) {
        console.error('AI draft generation succeeded but usage ledger persistence failed:', recordError)
        usageWarning =
          'AI生成は成功しましたが、使用量の記録だけ保存できませんでした。予算の過小計上を防ぐため、台帳が復旧するまで追加のAI生成は停止します。'
      }

      const { error: auditError } = await supabase.from('audit_logs').insert({
        workspace_id: workspaceId,
        actor_id: user.id,
        action: 'draft_ai_generated',
        target_type: 'seed',
        target_id: seedId,
        metadata: {
          channels: typedChannels,
          model: result.model,
          aiGenerationId: recordedGenerationId ?? null,
          usageRecorded: Boolean(recordedGenerationId),
          styleExamplesUsed: styleExamples.length,
          styleTendencies: styleTendencies,
        },
      })
      if (auditError) console.error('Failed to audit draft AI generation:', auditError)

      return NextResponse.json({
        source: 'ai',
        model: result.model,
        aiGenerationId: recordedGenerationId,
        usageRecorded: Boolean(recordedGenerationId),
        usageWarning,
        styleExamplesUsed: styleExamples.length,
        drafts: result.drafts,
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'AIによる下書き生成に失敗しました。'

      if (cause instanceof AnthropicGenerationError) {
        try {
          await recordAiGeneration(serviceClient, {
            id: generationId,
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
