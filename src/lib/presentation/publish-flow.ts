import type { PublishingChannel, PublishJob, SocialDraft } from '@/lib/domain/types'

// The "one 発信 in one workspace" step model (UI-PR2). A single 発信 moves through
// four stages: 素材を整える → AI提案を作成 → 内容を確認して承認 → 公開を予約. This is
// a pure presenter over existing data (seed readiness, drafts, publish jobs) — it
// changes no routes, schema, or business logic; it only computes which stage the
// creator is on and the single next action to take, so the seed page can guide
// one publish end-to-end instead of scattering the mental model across screens.

export type PublishStepId = 'prepare' | 'propose' | 'approve' | 'schedule'
export type StepState = 'done' | 'current' | 'todo'

export interface PublishStep {
  id: PublishStepId
  label: string
  description: string
  state: StepState
}

export interface PublishPrimaryAction {
  label: string
  href: string
}

export interface PublishFlow {
  steps: PublishStep[]
  /** The one action to take next, or null when the 発信 is fully scheduled/published. */
  primary: PublishPrimaryAction | null
  /** How many target channels already have an approved draft — for a "3/4 承認済み" summary. */
  approvedChannels: number
  targetChannels: number
  /** True once every step is done (nothing left to do for this 発信). */
  complete: boolean
}

export interface PublishFlowInput {
  seedId: string
  targetChannels: PublishingChannel[]
  /** Seed readiness (title/source/goal/audience/brand/channels all present). */
  isReady: boolean
  drafts: Array<Pick<SocialDraft, 'channel' | 'status'>>
  jobs: Array<Pick<PublishJob, 'channel' | 'status'>>
}

const STEP_META: Record<PublishStepId, { label: string; description: string }> = {
  prepare: { label: '素材を整える', description: '目的・対象・配信媒体など、AIが提案するための情報をそろえます。' },
  propose: { label: 'AI提案を作成', description: '媒体ごとの下書きをAIに提案してもらいます。' },
  approve: { label: '内容を確認して承認', description: 'AIの推測を確認し、必要なら整えてから承認します。' },
  schedule: { label: '公開を予約', description: '承認した内容の公開日時を決めます。' },
}

function draftsStudioHref(seedId: string): string {
  return `/app/drafts?seed=${seedId}`
}

/**
 * Compute the 発信 flow for one seed. Steps complete strictly in order — a later
 * step can't be "done" while an earlier one isn't — so the stepper never shows a
 * confusing out-of-order state.
 */
export function computePublishFlow(input: PublishFlowInput): PublishFlow {
  const { seedId, targetChannels, isReady, drafts, jobs } = input
  const channels = targetChannels

  // A channel is "proposed" once it has at least one draft, "approved" once it has
  // an approved draft, and "queued" once it has a committed job. A job counts as
  // committed when it's 'scheduled' or 'published', OR 'draft' — a manual channel
  // (note) creates its job in status 'draft' (see queue.ts createPublishJob: it
  // has nothing for the Worker to do and awaits manual completion), so a note
  // that's been queued must satisfy the schedule step. 'failed'/'cancelled' never
  // count.
  const COMMITTED_JOB_STATUSES = new Set(['scheduled', 'published', 'draft'])
  const proposedChannels = new Set(drafts.map((draft) => draft.channel))
  const approvedChannelSet = new Set(drafts.filter((draft) => draft.status === 'approved').map((draft) => draft.channel))
  const queuedChannelSet = new Set(
    jobs.filter((job) => COMMITTED_JOB_STATUSES.has(job.status)).map((job) => job.channel),
  )

  const hasChannels = channels.length > 0
  const prepareDone = isReady
  const proposeDone = prepareDone && hasChannels && channels.every((channel) => proposedChannels.has(channel))
  const approveDone = proposeDone && channels.every((channel) => approvedChannelSet.has(channel))
  const scheduleDone = approveDone && channels.every((channel) => queuedChannelSet.has(channel))

  const doneFlags: Record<PublishStepId, boolean> = {
    prepare: prepareDone,
    propose: proposeDone,
    approve: approveDone,
    schedule: scheduleDone,
  }

  const order: PublishStepId[] = ['prepare', 'propose', 'approve', 'schedule']
  const firstIncomplete = order.find((id) => !doneFlags[id]) ?? null

  const steps: PublishStep[] = order.map((id) => ({
    id,
    label: STEP_META[id].label,
    description: STEP_META[id].description,
    state: doneFlags[id] ? 'done' : id === firstIncomplete ? 'current' : 'todo',
  }))

  const primary = firstIncomplete
    ? {
        label: STEP_META[firstIncomplete].label,
        // Preparing happens on this same seed page; every later stage lives in the
        // drafts studio (generate / approve / schedule all wired there today).
        href: firstIncomplete === 'prepare' ? `/app/seeds/${seedId}` : draftsStudioHref(seedId),
      }
    : null

  return {
    steps,
    primary,
    approvedChannels: channels.filter((channel) => approvedChannelSet.has(channel)).length,
    targetChannels: channels.length,
    complete: firstIncomplete === null,
  }
}
