import type { PublishJob, PublishMode } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface PublishJobRow {
  id: string
  workspace_id: string
  seed_id: string
  draft_id: string
  revision_id: string
  channel: PublishJob['channel']
  publish_mode: PublishMode
  status: PublishJob['status']
  scheduled_at?: string | null
  published_at?: string | null
  error_message?: string | null
  created_by: string
  created_at: string
}

function mapJob(row: PublishJobRow): PublishJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seedId: row.seed_id,
    draftId: row.draft_id,
    revisionId: row.revision_id,
    channel: row.channel,
    publishMode: row.publish_mode,
    status: row.status,
    scheduledAt: row.scheduled_at ?? undefined,
    publishedAt: row.published_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listWorkspacePublishJobs(workspaceId: string): Promise<PublishJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching publish jobs:', error)
    return []
  }

  return (data ?? []).map((row) => mapJob(row as PublishJobRow))
}

export async function listSeedPublishJobs(
  workspaceId: string,
  seedId: string
): Promise<PublishJob[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('seed_id', seedId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching Seed publish jobs:', error)
    return []
  }

  return (data ?? []).map((row) => mapJob(row as PublishJobRow))
}

export interface CreatePublishJobInput {
  workspaceId: string
  seedId: string
  draftId: string
  revisionId: string
  channel: PublishJob['channel']
  publishMode: PublishMode
  scheduledAt?: string
  createdBy: string
}

export async function createPublishJob(input: CreatePublishJobInput): Promise<PublishJob> {
  const supabase = createClient()

  // A manual channel (note) has nothing for a Worker to do — it starts
  // "draft" until a human records completion. Everything else starts
  // "scheduled" so the Worker can pick it up once due.
  const status = input.publishMode === 'manual' ? 'draft' : 'scheduled'

  const { data, error } = await supabase
    .from('publish_jobs')
    .insert({
      workspace_id: input.workspaceId,
      seed_id: input.seedId,
      draft_id: input.draftId,
      revision_id: input.revisionId,
      channel: input.channel,
      publish_mode: input.publishMode,
      status,
      scheduled_at: input.scheduledAt ?? null,
      created_by: input.createdBy,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapJob(data as PublishJobRow)
}

export async function retryPublishJob(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()

  const scheduledAt = new Date()
  scheduledAt.setMinutes(scheduledAt.getMinutes() + 5)

  const { data, error } = await supabase
    .from('publish_jobs')
    .update({
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
      error_message: null,
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapJob(data as PublishJobRow)
}

export async function cancelPublishJob(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .update({
      status: 'cancelled',
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapJob(data as PublishJobRow)
}

export async function markPublishJobManuallyCompleted(
  workspaceId: string,
  jobId: string
): Promise<PublishJob> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('publish_jobs')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', jobId)
    .eq('workspace_id', workspaceId)
    .eq('publish_mode', 'manual')
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapJob(data as PublishJobRow)
}
