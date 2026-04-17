import type { PublishJob } from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'
import { nowIso } from './helpers'

export function listWorkspacePublishJobs(state: MockAppDataState, workspaceId: string): PublishJob[] {
  return state.publishJobs.filter((job) => job.workspaceId === workspaceId)
}

export function listContentPublishJobs(
  state: MockAppDataState,
  workspaceId: string,
  contentId: string,
): PublishJob[] {
  return state.publishJobs.filter(
    (job) => job.workspaceId === workspaceId && job.contentId === contentId,
  )
}

export function retryPublishJob(
  state: MockAppDataState,
  jobId: string,
): { state: MockAppDataState; job: PublishJob; previous: PublishJob } {
  const job = state.publishJobs.find((entry) => entry.id === jobId)
  if (!job) {
    throw new Error('Publish job not found.')
  }

  const nextJob: PublishJob = {
    ...job,
    status: 'scheduled',
    errorMessage: undefined,
    scheduledAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
  }

  return {
    state: {
      ...state,
      publishJobs: state.publishJobs.map((entry) => (entry.id === jobId ? nextJob : entry)),
    },
    job: nextJob,
    previous: job,
  }
}

export function cancelPublishJob(
  state: MockAppDataState,
  jobId: string,
): { state: MockAppDataState; job: PublishJob; previous: PublishJob } {
  const job = state.publishJobs.find((entry) => entry.id === jobId)
  if (!job) {
    throw new Error('Publish job not found.')
  }

  const nextJob: PublishJob = {
    ...job,
    status: 'cancelled',
    errorMessage: job.status === 'failed' ? job.errorMessage : undefined,
    publishedAt: job.publishedAt,
    scheduledAt: job.scheduledAt ?? nowIso(),
  }

  return {
    state: {
      ...state,
      publishJobs: state.publishJobs.map((entry) => (entry.id === jobId ? nextJob : entry)),
    },
    job: nextJob,
    previous: job,
  }
}
