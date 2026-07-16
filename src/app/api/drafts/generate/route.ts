import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapSeed, SEED_SELECT, type SeedRow } from '@/lib/repositories/supabase/seeds'
import { recordAiGeneration } from '@/lib/repositories/supabase/ai-generations'
import { PUBLISHING_CHANNEL_CONFIG } from '@/lib/channels/config'
import { hasPermission } from '@/lib/permissions'
import type { PublishingChannel, WorkspaceRole } from '@/lib/domain/types'
import { TemplateDraftGeneratorService } from '@/lib/services/ai-draft'
import {
  calculateGenerationCost,
  generateChannelDraftsWithAnthropic,
  isAnthropicConfigured,
} from '@/lib/services/anthropic-draft'

const VALID_CHANNELS = new Set(Object.keys(PUBLISHING_CHANNEL_CONFIG))
const VALID_LENGTHS = new Set(['short', 'medium', 'long'])

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
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { workspaceId, seedId, channels, tone, length } = body

  if (!workspaceId || !seedId) {
    return NextResponse.json({ error: 'workspaceId and seedId are required.' }, { status: 400 })
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: 'At least one channel is required.' }, { status: 400 })
  }
  const invalidChannels = channels.filter((channel) => !VALID_CHANNELS.has(channel))
  if (invalidChannels.length > 0) {
    return NextResponse.json({ error: `Unknown channels: ${invalidChannels.join(', ')}` }, { status: 400 })
  }
  if (typeof tone !== 'string' || !tone.trim()) {
    return NextResponse.json({ error: 'tone is required.' }, { status: 400 })
  }
  if (typeof length !== 'string' || !VALID_LENGTHS.has(length)) {
    return NextResponse.json({ error: 'length must be short, medium, or long.' }, { status: 400 })
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  const role = member?.role as WorkspaceRole | undefined
  if (!role || !hasPermission(role, 'create_drafts')) {
    return NextResponse.json({ error: 'Not permitted to generate drafts in this workspace.' }, { status: 403 })
  }

  const { data: seedRow, error: seedError } = await supabase
    .from('seeds')
    .select(SEED_SELECT)
    .eq('id', seedId)
    .eq('workspace_id', workspaceId)
    .single()

  if (seedError || !seedRow) {
    return NextResponse.json({ error: 'Seed not found.' }, { status: 404 })
  }

  const seed = mapSeed(seedRow as unknown as SeedRow)
  const typedChannels = channels as PublishingChannel[]
  const typedLength = length as 'short' | 'medium' | 'long'
  const context = {
    createdBy: user.id,
    brandProfile: seed.brandProfile ?? null,
  }

  if (!isAnthropicConfigured()) {
    const drafts = await new TemplateDraftGeneratorService().generateDrafts(seed, typedChannels, tone, typedLength, context)
    return NextResponse.json({
      source: 'template-fallback',
      reason: 'ANTHROPIC_API_KEY is not configured yet. Showing deterministic templates instead of AI proposals.',
      drafts,
    })
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
      metadata: { channels: typedChannels, model: result.model, aiGenerationId: generation.id },
    })

    return NextResponse.json({
      source: 'ai',
      model: result.model,
      aiGenerationId: generation.id,
      drafts: result.drafts,
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'AI draft generation failed.'
    // Fail closed: no fallback here. Silently substituting templates for a
    // failed AI call would misrepresent them as intentional, reviewed output.
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
