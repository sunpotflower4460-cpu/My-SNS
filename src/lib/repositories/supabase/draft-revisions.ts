import type { DraftRevision, DraftSource, PublishingChannel } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface DraftRevisionRow {
  id: string
  workspace_id: string
  seed_id: string
  social_draft_id: string
  ai_generation_id?: string | null
  channel: PublishingChannel
  title?: string | null
  body: string
  hashtags?: string[] | null
  cta?: string | null
  assumptions?: string[] | null
  metadata?: Record<string, unknown> | null
  source: DraftSource
  approved_by: string
  created_at: string
}

function mapRevision(row: DraftRevisionRow): DraftRevision {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seedId: row.seed_id,
    socialDraftId: row.social_draft_id,
    aiGenerationId: row.ai_generation_id ?? undefined,
    channel: row.channel,
    title: row.title ?? undefined,
    body: row.body,
    hashtags: row.hashtags ?? [],
    cta: row.cta ?? undefined,
    assumptions: row.assumptions ?? [],
    metadata: row.metadata ?? {},
    source: row.source,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  }
}

export interface CreateDraftRevisionInput {
  workspaceId: string
  seedId: string
  socialDraftId: string
  aiGenerationId?: string
  channel: PublishingChannel
  title?: string
  body: string
  hashtags: string[]
  cta?: string
  assumptions: string[]
  metadata: Record<string, unknown>
  source: DraftSource
  approvedBy: string
}

export async function createDraftRevision(input: CreateDraftRevisionInput): Promise<DraftRevision> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('draft_revisions')
    .insert({
      workspace_id: input.workspaceId,
      seed_id: input.seedId,
      social_draft_id: input.socialDraftId,
      ai_generation_id: input.aiGenerationId ?? null,
      channel: input.channel,
      title: input.title?.trim() || null,
      body: input.body,
      hashtags: input.hashtags,
      cta: input.cta?.trim() || null,
      assumptions: input.assumptions,
      metadata: input.metadata,
      source: input.source,
      approved_by: input.approvedBy,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapRevision(data as DraftRevisionRow)
}

export async function listSeedRevisions(workspaceId: string, seedId: string): Promise<DraftRevision[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('draft_revisions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('seed_id', seedId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching draft revisions:', error)
    return []
  }

  return (data ?? []).map((row) => mapRevision(row as DraftRevisionRow))
}
