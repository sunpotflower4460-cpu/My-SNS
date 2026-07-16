'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import type {
  Asset,
  AuditLog,
  BrandProfile,
  BrandProfileInput,
  InboxItem,
  InboxNote,
  Invitation,
  PublishingChannel,
  PublishJob,
  Seed,
  SeedKind,
  SeedStatus,
  SocialAccount,
  SocialDraft,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '@/lib/domain/types'
import { useAuth } from '@/lib/auth/auth-provider'
import { hasPermission } from '@/lib/permissions'
import { derivePublishMode } from '@/lib/channels/config'
import * as workspacesRepo from '@/lib/repositories/supabase/workspaces'
import * as seedsRepo from '@/lib/repositories/supabase/seeds'
import * as brandProfilesRepo from '@/lib/repositories/supabase/brand-profiles'
import * as draftsRepo from '@/lib/repositories/supabase/drafts'
import * as draftRevisionsRepo from '@/lib/repositories/supabase/draft-revisions'
import * as inboxRepo from '@/lib/repositories/supabase/inbox'
import * as queueRepo from '@/lib/repositories/supabase/queue'
import { recordPublishAttempt } from '@/lib/repositories/supabase/publish-attempts'
import * as auditRepo from '@/lib/repositories/supabase/audit'
import { SupabaseAssetStorage } from '@/lib/storage/supabase/supabase-asset-storage'
import type { AssetUploadInput } from '@/lib/storage/interfaces'
import { createClient } from '@/lib/supabase/client'

interface AppContextValue {
  isReady: boolean
  currentWorkspace: Workspace | null
  currentMember: WorkspaceMember | null
  workspaces: Workspace[]
  workspaceMemberships: WorkspaceMember[]
  members: WorkspaceMember[]
  invitations: Invitation[]
  socialAccounts: SocialAccount[]
  brandProfiles: BrandProfile[]
  defaultBrandProfile: BrandProfile | null
  seeds: Seed[]
  publishJobs: PublishJob[]
  inboxItems: InboxItem[]
  auditLogs: AuditLog[]
  drafts: SocialDraft[]
  setActiveWorkspaceId: (workspaceId: string) => void
  refreshWorkspaceData: () => Promise<void>
  createSeedItem: (input: {
    title: string
    sourceText: string
    kind: SeedKind
    status: SeedStatus
    goal?: string
    audience?: string
    keyPoints: string[]
    callToAction?: string
    targetChannels: PublishingChannel[]
    brandProfileId: string
    tags: string[] | string
    assets?: AssetUploadInput[]
  }) => Promise<Seed>
  updateSeedItem: (
    seedId: string,
    patch: seedsRepo.SeedPatch
  ) => Promise<Seed>
  getSeedDetail: (seedId: string) => {
    seed: Seed | null
    assets: Asset[]
    drafts: SocialDraft[]
    jobs: PublishJob[]
    inboxItems: InboxItem[]
    auditLogs: AuditLog[]
  }
  inviteMember: (email: string, role: WorkspaceRole) => Promise<Invitation>
  changeMemberRole: (userId: string, role: WorkspaceRole) => Promise<WorkspaceMember>
  removeMember: (userId: string) => Promise<void>
  saveWorkspaceSettings: (name: string, slug: string) => Promise<Workspace>
  saveDefaultBrandProfile: (input: BrandProfileInput) => Promise<BrandProfile>
  toggleInboxRead: (inboxItemId: string) => Promise<InboxItem>
  toggleInboxStar: (inboxItemId: string) => Promise<InboxItem>
  toggleInboxNeedsAction: (inboxItemId: string) => Promise<InboxItem>
  addInboxNote: (inboxItemId: string, text: string) => Promise<InboxNote>
  getInboxNotes: (inboxItemId: string) => InboxNote[]
  retryQueueJob: (jobId: string) => Promise<PublishJob>
  cancelQueueJob: (jobId: string) => Promise<PublishJob>
  scheduleDraft: (draftId: string, scheduledAt?: string) => Promise<PublishJob>
  completeManualPublish: (jobId: string, externalUrl?: string) => Promise<PublishJob>
  saveDraft: (draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<SocialDraft>
  approveDraft: (draftId: string) => Promise<SocialDraft>
  saveAndApproveDraft: (draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<SocialDraft>
  getDraftsForSeed: (seedId: string) => SocialDraft[]
  generateChannelDrafts: (
    seedId: string,
    channels: PublishingChannel[],
    tone: string,
    length: 'short' | 'medium' | 'long',
  ) => Promise<{ source: 'ai' | 'template-fallback'; reason?: string; drafts: SocialDraft[] }>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { currentUserId, isReady: authReady } = useAuth()

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [currentMember, setCurrentMember] = useState<WorkspaceMember | null>(null)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([])
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([])
  const [seeds, setSeeds] = useState<Seed[]>([])
  const [workspaceAssets, setWorkspaceAssets] = useState<Asset[]>([])
  const [publishJobs, setPublishJobs] = useState<PublishJob[]>([])
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [inboxNotes, setInboxNotes] = useState<InboxNote[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [drafts, setDrafts] = useState<SocialDraft[]>([])
  const [isReady, setIsReady] = useState(false)

  // Load user workspaces
  useEffect(() => {
    if (!authReady || !currentUserId) {
      setIsReady(false)
      return
    }

    async function loadWorkspaces() {
      try {
        const userWorkspaces = await workspacesRepo.getUserWorkspaces(currentUserId!)
        setWorkspaces(userWorkspaces)

        // Set active workspace
        if (userWorkspaces.length > 0) {
          const savedWorkspaceId = localStorage.getItem('activeWorkspaceId')
          const validSavedWorkspace = savedWorkspaceId && userWorkspaces.find(w => w.id === savedWorkspaceId)
          setActiveWorkspaceId(validSavedWorkspace ? savedWorkspaceId : userWorkspaces[0].id)
        }
      } catch (error) {
        console.error('Error loading workspaces:', error)
      } finally {
        setIsReady(true)
      }
    }

    loadWorkspaces()
  }, [authReady, currentUserId])

  // Load workspace data
  const refreshWorkspaceData = useCallback(async () => {
    if (!activeWorkspaceId || !currentUserId) return

    try {
      const [
        workspace,
        member,
        membersList,
        invitationsList,
        socialAccountsList,
        brandProfilesList,
        seedsList,
        assetsList,
        publishJobsList,
        inboxItemsList,
        inboxNotesList,
        auditLogsList,
        draftsList,
      ] = await Promise.all([
        workspacesRepo.getWorkspaceById(activeWorkspaceId),
        workspacesRepo.getCurrentMember(activeWorkspaceId, currentUserId),
        workspacesRepo.listWorkspaceMembers(activeWorkspaceId),
        workspacesRepo.listWorkspaceInvitations(activeWorkspaceId),
        workspacesRepo.listWorkspaceSocialAccounts(activeWorkspaceId),
        brandProfilesRepo.listWorkspaceBrandProfiles(activeWorkspaceId),
        seedsRepo.listWorkspaceSeeds(activeWorkspaceId),
        seedsRepo.listWorkspaceAssets(activeWorkspaceId),
        queueRepo.listWorkspacePublishJobs(activeWorkspaceId),
        inboxRepo.listWorkspaceInbox(activeWorkspaceId),
        inboxRepo.listWorkspaceInboxNotes(activeWorkspaceId),
        auditRepo.listWorkspaceAuditLogs(activeWorkspaceId, 100),
        draftsRepo.listWorkspaceDrafts(activeWorkspaceId),
      ])

      setCurrentWorkspace(workspace)
      setCurrentMember(member)
      setMembers(membersList)
      setInvitations(invitationsList)
      setSocialAccounts(socialAccountsList)
      setBrandProfiles(brandProfilesList)
      setSeeds(seedsList)
      setWorkspaceAssets(assetsList)
      setPublishJobs(publishJobsList)
      setInboxItems(inboxItemsList)
      setInboxNotes(inboxNotesList)
      setAuditLogs(auditLogsList)
      setDrafts(draftsList)
    } catch (error) {
      console.error('Error loading workspace data:', error)
    }
  }, [activeWorkspaceId, currentUserId])

  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem('activeWorkspaceId', activeWorkspaceId)
      refreshWorkspaceData()
    }
  }, [activeWorkspaceId, refreshWorkspaceData])

  const workspaceMemberships = useMemo(() => {
    return workspaces.map(workspace => {
      const member = members.find(m => m.workspaceId === workspace.id && m.userId === currentUserId)
      return member || ({
        id: '',
        workspaceId: workspace.id,
        userId: currentUserId || '',
        role: 'viewer' as WorkspaceRole,
        joinedAt: '',
      })
    })
  }, [workspaces, members, currentUserId])

  const value = useMemo<AppContextValue>(() => {
    const assetStorage = new SupabaseAssetStorage()

    // Shared by approveDraft (an already-saved draft) and saveAndApproveDraft
    // (a freshly generated, not-yet-saved proposal): ensures the draft exists
    // as a row, then approves it through the approve_social_draft() Postgres
    // function, which sets status='approved' and inserts the Revision in one
    // transaction. A permission-denied trigger or a failed Revision insert
    // rolls the whole call back — a draft can never end up "approved" with no
    // Revision, at the database layer, not just in this client code.
    const approveDraftContent = async (
      draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    ): Promise<SocialDraft> => {
      if (!currentWorkspace || !currentUserId) throw new Error('Not ready')
      if (!currentMember || !hasPermission(currentMember.role, 'approve_drafts')) {
        throw new Error('Your role cannot approve drafts.')
      }

      const saved = await draftsRepo.upsertSocialDraft(currentWorkspace.id, {
        ...draft,
        status: 'draft',
      })

      await draftRevisionsRepo.approveSocialDraft(saved.id)

      await auditRepo.appendAuditLog({
        workspaceId: currentWorkspace.id,
        actorId: currentUserId,
        action: 'draft_revision_approved',
        targetType: 'social_draft',
        targetId: saved.id,
        metadata: { channel: saved.channel, source: saved.source },
      })

      await refreshWorkspaceData()
      return { ...saved, status: 'approved' }
    }

    return {
      isReady: isReady && authReady,
      currentWorkspace,
      currentMember,
      workspaces,
      workspaceMemberships,
      members,
      invitations,
      socialAccounts,
      brandProfiles,
      defaultBrandProfile: brandProfiles.find((profile) => profile.isDefault) ?? brandProfiles[0] ?? null,
      seeds,
      publishJobs,
      inboxItems,
      auditLogs,
      drafts,
      setActiveWorkspaceId,
      refreshWorkspaceData,

      createSeedItem: async (input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const seed = await seedsRepo.createSeed({
          workspaceId: currentWorkspace.id,
          createdBy: currentUserId,
          title: input.title,
          sourceText: input.sourceText,
          kind: input.kind,
          status: input.status,
          goal: input.goal,
          audience: input.audience,
          keyPoints: input.keyPoints,
          callToAction: input.callToAction,
          targetChannels: input.targetChannels,
          brandProfileId: input.brandProfileId,
          tags: input.tags,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'seed_created',
          targetType: 'seed',
          targetId: seed.id,
          metadata: { title: seed.title, status: seed.status, targetChannels: seed.targetChannels },
        })

        if (input.assets && input.assets.length > 0) {
          const preparedAssets = await assetStorage.prepareFiles(input.assets, {
            workspaceId: currentWorkspace.id,
            seedId: seed.id,
          })

          for (const preparedAsset of preparedAssets) {
            await assetStorage.saveAssetMetadata({
              workspaceId: currentWorkspace.id,
              seedId: seed.id,
              uploadedBy: currentUserId,
              preparedAsset,
            })
          }
        }

        await refreshWorkspaceData()
        return seed
      },

      updateSeedItem: async (seedId, patch) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const seed = await seedsRepo.updateSeed(currentWorkspace.id, seedId, patch)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'seed_updated',
          targetType: 'seed',
          targetId: seed.id,
          metadata: patch,
        })

        await refreshWorkspaceData()
        return seed
      },

      getSeedDetail: (seedId) => {
        if (!currentWorkspace) {
          return { seed: null, assets: [], drafts: [], jobs: [], inboxItems: [], auditLogs: [] }
        }

        const seed = seeds.find((entry) => entry.id === seedId) || null
        const assets = workspaceAssets.filter((asset) => asset.seedId === seedId)
        const seedDrafts = drafts.filter((draft) => draft.seedId === seedId)
        const jobs = publishJobs.filter((job) => job.seedId === seedId)
        const relatedInbox = inboxItems.filter((item) => item.seedId === seedId)
        const logs = auditLogs.filter((log) => log.targetId === seedId).slice(0, 10)

        return {
          seed,
          assets,
          drafts: seedDrafts,
          jobs,
          inboxItems: relatedInbox,
          auditLogs: logs,
        }
      },

      inviteMember: async (email, role) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const invitation = await workspacesRepo.inviteWorkspaceMember({
          workspaceId: currentWorkspace.id,
          email,
          role,
          invitedBy: currentUserId,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'member_invited',
          targetType: 'invitation',
          targetId: invitation.id,
          metadata: { email, role },
        })

        await refreshWorkspaceData()
        return invitation
      },

      changeMemberRole: async (userId, role) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const member = await workspacesRepo.updateWorkspaceMemberRole({
          workspaceId: currentWorkspace.id,
          userId,
          role,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'role_changed',
          targetType: 'member',
          targetId: member.id,
          metadata: { userId, role },
        })

        await refreshWorkspaceData()
        return member
      },

      removeMember: async (userId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        await workspacesRepo.removeWorkspaceMember({
          workspaceId: currentWorkspace.id,
          userId,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'member_removed',
          targetType: 'member',
          targetId: userId,
          metadata: { userId },
        })

        await refreshWorkspaceData()
      },

      saveWorkspaceSettings: async (name, slug) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const updated = await workspacesRepo.updateWorkspaceDetails({
          workspaceId: currentWorkspace.id,
          name,
          slug,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'workspace_settings_updated',
          targetType: 'workspace',
          targetId: updated.id,
          metadata: { name, slug },
        })

        await refreshWorkspaceData()
        return updated
      },

      saveDefaultBrandProfile: async (input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const currentDefault = brandProfiles.find((profile) => profile.isDefault) ?? brandProfiles[0]
        const saved = await brandProfilesRepo.saveBrandProfile({
          workspaceId: currentWorkspace.id,
          createdBy: currentUserId,
          profileId: currentDefault?.id,
          input,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'brand_profile_updated',
          targetType: 'brand_profile',
          targetId: saved.id,
          metadata: { name: saved.name, language: saved.language },
        })

        await refreshWorkspaceData()
        return saved
      },

      toggleInboxRead: async (inboxItemId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const current = inboxItems.find((item) => item.id === inboxItemId)
        const updated = await inboxRepo.updateInboxItem(currentWorkspace.id, inboxItemId, {
          isRead: !current?.isRead,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'inbox_item_read',
          targetType: 'inbox_item',
          targetId: inboxItemId,
          metadata: { isRead: updated.isRead },
        })

        await refreshWorkspaceData()
        return updated
      },

      toggleInboxStar: async (inboxItemId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const current = inboxItems.find((item) => item.id === inboxItemId)
        const updated = await inboxRepo.updateInboxItem(currentWorkspace.id, inboxItemId, {
          isStarred: !current?.isStarred,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'inbox_item_starred',
          targetType: 'inbox_item',
          targetId: inboxItemId,
          metadata: { isStarred: updated.isStarred },
        })

        await refreshWorkspaceData()
        return updated
      },

      toggleInboxNeedsAction: async (inboxItemId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const current = inboxItems.find((item) => item.id === inboxItemId)
        const updated = await inboxRepo.updateInboxItem(currentWorkspace.id, inboxItemId, {
          needsAction: !current?.needsAction,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'inbox_item_needs_action',
          targetType: 'inbox_item',
          targetId: inboxItemId,
          metadata: { needsAction: updated.needsAction },
        })

        await refreshWorkspaceData()
        return updated
      },

      addInboxNote: async (inboxItemId, text) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const note = await inboxRepo.addInboxNote({
          workspaceId: currentWorkspace.id,
          inboxItemId,
          authorId: currentUserId,
          text,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'inbox_note_added',
          targetType: 'inbox_item',
          targetId: inboxItemId,
          metadata: { noteAdded: true },
        })

        await refreshWorkspaceData()
        return note
      },

      getInboxNotes: (inboxItemId) => {
        return inboxNotes.filter((note) => note.inboxItemId === inboxItemId)
      },

      retryQueueJob: async (jobId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const job = await queueRepo.retryPublishJob(currentWorkspace.id, jobId)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'queue_item_scheduled',
          targetType: 'publish_job',
          targetId: jobId,
          metadata: { retried: true, scheduledAt: job.scheduledAt },
        })

        await refreshWorkspaceData()
        return job
      },

      cancelQueueJob: async (jobId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const job = await queueRepo.cancelPublishJob(currentWorkspace.id, jobId)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'queue_item_cancelled',
          targetType: 'publish_job',
          targetId: jobId,
          metadata: { status: job.status },
        })

        await refreshWorkspaceData()
        return job
      },

      scheduleDraft: async (draftId, scheduledAt) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_queue')) {
          throw new Error('Your role cannot schedule publishing.')
        }

        const draft = drafts.find((entry) => entry.id === draftId)
        if (!draft) throw new Error('Draft not found')
        if (draft.status !== 'approved') throw new Error('Only an approved draft can be scheduled.')

        // Always the latest approval, not the (possibly since-edited) mutable
        // draft row — a schedule always publishes an immutable Revision.
        const revision = await draftRevisionsRepo.getLatestDraftRevision(currentWorkspace.id, draftId)
        if (!revision) throw new Error('No approved Revision found for this draft.')

        const publishMode = derivePublishMode(draft.channel)
        const job = await queueRepo.createPublishJob({
          workspaceId: currentWorkspace.id,
          seedId: draft.seedId,
          draftId: draft.id,
          revisionId: revision.id,
          channel: draft.channel,
          publishMode,
          scheduledAt,
          createdBy: currentUserId,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'queue_item_scheduled',
          targetType: 'publish_job',
          targetId: job.id,
          metadata: { channel: job.channel, publishMode: job.publishMode, scheduledAt: job.scheduledAt },
        })

        await refreshWorkspaceData()
        return job
      },

      completeManualPublish: async (jobId, externalUrl) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_queue')) {
          throw new Error('Your role cannot complete a manual publish.')
        }

        // Record the attempt first: if this fails, the job is never marked
        // published, so the Queue never shows a success with no record of it.
        await recordPublishAttempt(createClient(), {
          workspaceId: currentWorkspace.id,
          publishJobId: jobId,
          status: 'success',
          externalUrl,
          createdBy: currentUserId,
        })

        const job = await queueRepo.markPublishJobManuallyCompleted(currentWorkspace.id, jobId)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'queue_item_manual_completed',
          targetType: 'publish_job',
          targetId: jobId,
          metadata: { channel: job.channel, externalUrl },
        })

        await refreshWorkspaceData()
        return job
      },

      saveDraft: async (draft) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const saved = await draftsRepo.upsertSocialDraft(currentWorkspace.id, draft)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'draft_edited',
          targetType: 'social_draft',
          targetId: saved.id,
          metadata: { channel: saved.channel, status: saved.status },
        })

        await refreshWorkspaceData()
        return saved
      },

      approveDraft: async (draftId) => {
        const currentDraft = drafts.find((d) => d.id === draftId)
        if (!currentDraft) throw new Error('Draft not found')
        return approveDraftContent(currentDraft)
      },

      saveAndApproveDraft: async (draft) => approveDraftContent(draft),

      getDraftsForSeed: (seedId) => {
        return drafts.filter((draft) => draft.seedId === seedId)
      },

      generateChannelDrafts: async (seedId, channels, tone, length) => {
        if (!currentWorkspace) throw new Error('Not ready')

        const response = await fetch('/api/drafts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, seedId, channels, tone, length }),
        })

        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to generate drafts.')
        }

        return payload as { source: 'ai' | 'template-fallback'; reason?: string; drafts: SocialDraft[] }
      },
    }
  }, [
    isReady,
    authReady,
    currentWorkspace,
    currentMember,
    workspaces,
    workspaceMemberships,
    members,
    invitations,
    socialAccounts,
    brandProfiles,
    seeds,
    workspaceAssets,
    publishJobs,
    inboxItems,
    inboxNotes,
    auditLogs,
    drafts,
    currentUserId,
    refreshWorkspaceData,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
