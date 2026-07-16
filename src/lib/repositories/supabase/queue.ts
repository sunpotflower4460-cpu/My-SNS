import type { PublishJob } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

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

  return (data || []).map((j) => ({
    id: j.id,
    workspaceId: j.workspace_id,
    seedId: j.seed_id,
    draftId: j.draft_id,
    channel: j.channel,
    status: j.status,
    scheduledAt: j.scheduled_at,
    publishedAt: j.published_at,
    errorMessage: j.error_message,
    createdBy: j.created_by,
    createdAt: j.created_at,
  }))
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

  return (data || []).map((j) => ({
    id: j.id,
    workspaceId: j.workspace_id,
    seedId: j.seed_id,
    draftId: j.draft_id,
    channel: j.channel,
    status: j.status,
    scheduledAt: j.scheduled_at,
    publishedAt: j.published_at,
    errorMessage: j.error_message,
    createdBy: j.created_by,
    createdAt: j.created_at,
  }))
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

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    seedId: data.seed_id,
    draftId: data.draft_id,
    channel: data.channel,
    status: data.status,
    scheduledAt: data.scheduled_at,
    publishedAt: data.published_at,
    errorMessage: data.error_message,
    createdBy: data.created_by,
    createdAt: data.created_at,
  }
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

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    seedId: data.seed_id,
    draftId: data.draft_id,
    channel: data.channel,
    status: data.status,
    scheduledAt: data.scheduled_at,
    publishedAt: data.published_at,
    errorMessage: data.error_message,
    createdBy: data.created_by,
    createdAt: data.created_at,
  }
}
