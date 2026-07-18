'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import type {
  AiGeneration,
  AiReplySuggestion,
  Asset,
  AuditLog,
  BrandProfile,
  BrandProfileInput,
  CalendarEvent,
  CalendarEventInput,
  DraftRevision,
  InboxItem,
  InboxNote,
  Invitation,
  MessagingContact,
  Notification,
  PostMetrics,
  PublishAttempt,
  PublishingChannel,
  PublishJob,
  ReplyJob,
  Seed,
  SeedKind,
  SeedStatus,
  SocialAccount,
  SocialDraft,
  SocialPlatform,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '@/lib/domain/types'
import { useAuth } from '@/lib/auth/auth-provider'
import { hasPermission } from '@/lib/permissions'
import { derivePublishMode } from '@/lib/channels/config'
import * as workspacesRepo from '@/lib/repositories/supabase/workspaces'
import * as socialAccountsRepo from '@/lib/repositories/supabase/social-accounts'
import * as seedsRepo from '@/lib/repositories/supabase/seeds'
import * as brandProfilesRepo from '@/lib/repositories/supabase/brand-profiles'
import * as draftsRepo from '@/lib/repositories/supabase/drafts'
import * as draftRevisionsRepo from '@/lib/repositories/supabase/draft-revisions'
import * as inboxRepo from '@/lib/repositories/supabase/inbox'
import { listWorkspaceMessagingContacts, setContactAutoSend as setContactAutoSendRepo } from '@/lib/repositories/supabase/messaging-contacts'
import { listWorkspaceReplySuggestions } from '@/lib/repositories/supabase/reply-suggestions'
import { listWorkspaceReplyJobs, cancelReplyJob as cancelReplyJobRepo } from '@/lib/repositories/supabase/reply-queue'
import {
  listWorkspaceCalendarEvents,
  createCalendarEvent as createCalendarEventRepo,
  updateCalendarEvent as updateCalendarEventRepo,
  deleteCalendarEvent as deleteCalendarEventRepo,
} from '@/lib/repositories/supabase/calendar-events'
import * as notificationsRepo from '@/lib/repositories/supabase/notifications'
import * as queueRepo from '@/lib/repositories/supabase/queue'
import { recordPublishAttempt, listWorkspacePublishAttempts } from '@/lib/repositories/supabase/publish-attempts'
import { listWorkspaceAiGenerations } from '@/lib/repositories/supabase/ai-generations'
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
  draftRevisions: DraftRevision[]
  publishAttempts: PublishAttempt[]
  aiGenerations: AiGeneration[]
  notifications: Notification[]
  messagingContacts: MessagingContact[]
  replySuggestions: AiReplySuggestion[]
  replyJobs: ReplyJob[]
  calendarEvents: CalendarEvent[]
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
  disconnectSocialAccount: (accountId: string) => Promise<SocialAccount>
  connectLineAccount: () => Promise<void>
  syncInboxFromPlatform: (platform: SocialPlatform) => Promise<{ ingested: number }>
  saveDefaultBrandProfile: (input: BrandProfileInput) => Promise<BrandProfile>
  toggleInboxRead: (inboxItemId: string) => Promise<InboxItem>
  toggleInboxStar: (inboxItemId: string) => Promise<InboxItem>
  toggleInboxNeedsAction: (inboxItemId: string) => Promise<InboxItem>
  addInboxNote: (inboxItemId: string, text: string) => Promise<InboxNote>
  getInboxNotes: (inboxItemId: string) => InboxNote[]
  generateInboxReply: (inboxItemId: string) => Promise<{ source: 'ai' | 'template-fallback'; reason?: string; summary: string; reply: string; tone: string; assumptions: string[]; priority: 'high' | 'normal' | 'low'; suggestionId: string }>
  getReplySuggestion: (inboxItemId: string) => AiReplySuggestion | null
  approveAndSendReply: (input: { inboxItemId: string; replyText: string; suggestionId?: string; sendNow?: boolean }) => Promise<{ status: 'scheduled' | 'sent' | 'failed'; job: ReplyJob }>
  triggerReplyJob: (jobId: string) => Promise<void>
  cancelReplyJob: (jobId: string) => Promise<ReplyJob>
  getReplyJob: (inboxItemId: string) => ReplyJob | null
  getMessagingContact: (contactId: string) => MessagingContact | null
  setContactAutoSend: (contactId: string, enabled: boolean) => Promise<MessagingContact>
  createCalendarEvent: (input: CalendarEventInput) => Promise<CalendarEvent>
  updateCalendarEvent: (eventId: string, input: CalendarEventInput) => Promise<CalendarEvent>
  deleteCalendarEvent: (eventId: string) => Promise<void>
  retryQueueJob: (jobId: string) => Promise<PublishJob>
  cancelQueueJob: (jobId: string) => Promise<PublishJob>
  scheduleDraft: (draftId: string, scheduledAt?: string) => Promise<PublishJob>
  completeManualPublish: (jobId: string, externalUrl?: string) => Promise<PublishJob>
  triggerPublishJob: (jobId: string) => Promise<{ success: boolean }>
  /** Live engagement counts for one published job's post — not cached, see PostMetrics. Throws (does not return zeros) if the platform has no metrics endpoint available. */
  fetchPostMetrics: (jobId: string) => Promise<PostMetrics>
  markNotificationRead: (notificationId: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  exportWorkspaceData: () => Promise<void>
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
  const [draftRevisions, setDraftRevisions] = useState<DraftRevision[]>([])
  const [publishAttempts, setPublishAttempts] = useState<PublishAttempt[]>([])
  const [aiGenerations, setAiGenerations] = useState<AiGeneration[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [messagingContacts, setMessagingContacts] = useState<MessagingContact[]>([])
  const [replySuggestions, setReplySuggestions] = useState<AiReplySuggestion[]>([])
  const [replyJobs, setReplyJobs] = useState<ReplyJob[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
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
        draftRevisionsList,
        publishAttemptsList,
        aiGenerationsList,
        notificationsList,
        messagingContactsList,
        replySuggestionsList,
        replyJobsList,
        calendarEventsList,
      ] = await Promise.all([
        workspacesRepo.getWorkspaceById(activeWorkspaceId),
        workspacesRepo.getCurrentMember(activeWorkspaceId, currentUserId),
        workspacesRepo.listWorkspaceMembers(activeWorkspaceId),
        workspacesRepo.listWorkspaceInvitations(activeWorkspaceId),
        socialAccountsRepo.listWorkspaceSocialAccounts(activeWorkspaceId),
        brandProfilesRepo.listWorkspaceBrandProfiles(activeWorkspaceId),
        seedsRepo.listWorkspaceSeeds(activeWorkspaceId),
        seedsRepo.listWorkspaceAssets(activeWorkspaceId),
        queueRepo.listWorkspacePublishJobs(activeWorkspaceId),
        inboxRepo.listWorkspaceInbox(activeWorkspaceId),
        inboxRepo.listWorkspaceInboxNotes(activeWorkspaceId),
        auditRepo.listWorkspaceAuditLogs(activeWorkspaceId, 100),
        draftsRepo.listWorkspaceDrafts(activeWorkspaceId),
        draftRevisionsRepo.listWorkspaceDraftRevisions(activeWorkspaceId),
        listWorkspacePublishAttempts(activeWorkspaceId),
        listWorkspaceAiGenerations(activeWorkspaceId),
        notificationsRepo.listMyNotifications(activeWorkspaceId),
        listWorkspaceMessagingContacts(activeWorkspaceId),
        listWorkspaceReplySuggestions(activeWorkspaceId),
        listWorkspaceReplyJobs(activeWorkspaceId),
        listWorkspaceCalendarEvents(activeWorkspaceId),
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
      setDraftRevisions(draftRevisionsList)
      setPublishAttempts(publishAttemptsList)
      setAiGenerations(aiGenerationsList)
      setNotifications(notificationsList)
      setMessagingContacts(messagingContactsList)
      setReplySuggestions(replySuggestionsList)
      setReplyJobs(replyJobsList)
      setCalendarEvents(calendarEventsList)
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
      if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
      if (!currentMember || !hasPermission(currentMember.role, 'approve_drafts')) {
        throw new Error('あなたの役割では下書きを承認できません。')
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
      draftRevisions,
      publishAttempts,
      aiGenerations,
      notifications,
      messagingContacts,
      replySuggestions,
      replyJobs,
      calendarEvents,
      setActiveWorkspaceId,
      refreshWorkspaceData,

      createSeedItem: async (input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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

      disconnectSocialAccount: async (accountId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_social_accounts')) {
          throw new Error('あなたの役割ではSNSアカウントを管理できません。')
        }

        // Deleting the stored credential requires the service-role client,
        // so this goes through a server route rather than a direct Supabase
        // call — see src/app/api/social/disconnect/route.ts.
        const response = await fetch('/api/social/disconnect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, accountId }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'このアカウントの接続を解除できませんでした。')

        await refreshWorkspaceData()
        return payload.account as SocialAccount
      },

      connectLineAccount: async () => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_social_accounts')) {
          throw new Error('あなたの役割ではSNSアカウントを接続できません。')
        }

        // LINE connects with a channel token from the environment (no OAuth
        // redirect), so this is a plain POST — see src/app/api/social/line/connect.
        const response = await fetch('/api/social/line/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'LINEの接続に失敗しました。')

        await refreshWorkspaceData()
      },

      syncInboxFromPlatform: async (platform) => {
        if (!currentWorkspace) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_social_accounts')) {
          throw new Error('あなたの役割では受信箱を同期できません。')
        }

        // Fetching from the platform requires the decrypted access token, so
        // this goes through a server route with the service-role client —
        // see src/app/api/inbox/sync/route.ts.
        const response = await fetch('/api/inbox/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, platform }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? '受信箱を同期できませんでした。')

        await refreshWorkspaceData()
        return payload as { ingested: number }
      },

      saveDefaultBrandProfile: async (input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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

        // Only when someone flags it *on*, not off — flagging something off
        // is "handled," not a new thing for the team to notice.
        if (updated.needsAction) {
          const recipients = members.filter((m) => m.userId !== currentUserId && hasPermission(m.role, 'reply_inbox'))
          if (recipients.length > 0) {
            await notificationsRepo
              .createNotifications(
                createClient(),
                recipients.map((recipient) => ({
                  workspaceId: currentWorkspace.id,
                  userId: recipient.userId,
                  type: 'inbox_needs_action',
                  title: `${updated.authorHandle}さん（${updated.platform}）からのメッセージに返信が必要です`,
                  targetType: 'inbox_item',
                  targetId: inboxItemId,
                })),
              )
              .catch((cause) => console.error('Failed to notify teammates:', cause))
          }
        }

        await refreshWorkspaceData()
        return updated
      },

      addInboxNote: async (inboxItemId, text) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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

      generateInboxReply: async (inboxItemId) => {
        if (!currentWorkspace) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'reply_inbox')) {
          throw new Error('あなたの役割では返信を作成できません。')
        }

        const response = await fetch('/api/inbox/reply/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, inboxItemId }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? '返信案を生成できませんでした。')

        await refreshWorkspaceData()
        return payload as {
          source: 'ai' | 'template-fallback'
          reason?: string
          summary: string
          reply: string
          tone: string
          assumptions: string[]
          priority: 'high' | 'normal' | 'low'
          suggestionId: string
        }
      },

      getReplySuggestion: (inboxItemId) => {
        // replySuggestions is ordered newest-first by the repo, so the first
        // match is the latest suggestion for this item.
        return replySuggestions.find((suggestion) => suggestion.inboxItemId === inboxItemId) ?? null
      },

      approveAndSendReply: async ({ inboxItemId, replyText, suggestionId, sendNow }) => {
        if (!currentWorkspace) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'reply_inbox')) {
          throw new Error('あなたの役割では返信を送信できません。')
        }

        const response = await fetch('/api/inbox/reply/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, inboxItemId, replyText, suggestionId, sendNow }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? '返信を送信できませんでした。')

        await refreshWorkspaceData()
        return payload as { status: 'scheduled' | 'sent' | 'failed'; job: ReplyJob }
      },

      triggerReplyJob: async (jobId) => {
        if (!currentWorkspace) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'reply_inbox')) {
          throw new Error('あなたの役割では返信を送信できません。')
        }

        const response = await fetch('/api/messaging/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, jobId }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? '返信を送信できませんでした。')

        await refreshWorkspaceData()
      },

      cancelReplyJob: async (jobId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'reply_inbox')) {
          throw new Error('あなたの役割では返信を取り消せません。')
        }

        const job = await cancelReplyJobRepo(currentWorkspace.id, jobId)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'inbox_reply_cancelled',
          targetType: 'inbox_item',
          targetId: job.inboxItemId,
          metadata: { replyJobId: jobId },
        })

        await refreshWorkspaceData()
        return job
      },

      getReplyJob: (inboxItemId) => {
        // replyJobs is ordered newest-first by the repo (created_at desc), so the
        // first match is the most recent reply job for this item.
        return replyJobs.find((job) => job.inboxItemId === inboxItemId) ?? null
      },

      getMessagingContact: (contactId) => {
        return messagingContacts.find((contact) => contact.id === contactId) ?? null
      },

      setContactAutoSend: async (contactId, enabled) => {
        if (!currentWorkspace) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'reply_inbox')) {
          throw new Error('あなたの役割では自動送信の設定を変更できません。')
        }

        const contact = await setContactAutoSendRepo(currentWorkspace.id, contactId, enabled)
        await refreshWorkspaceData()
        return contact
      },

      createCalendarEvent: async (input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_calendar')) {
          throw new Error('あなたの役割ではカレンダーを編集できません。')
        }

        const event = await createCalendarEventRepo(createClient(), {
          workspaceId: currentWorkspace.id,
          createdBy: currentUserId,
          input,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'calendar_event_created',
          targetType: 'calendar_event',
          targetId: event.id,
          metadata: { title: event.title, source: event.source },
        })

        await refreshWorkspaceData()
        return event
      },

      updateCalendarEvent: async (eventId, input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_calendar')) {
          throw new Error('あなたの役割ではカレンダーを編集できません。')
        }

        const event = await updateCalendarEventRepo(currentWorkspace.id, eventId, input)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'calendar_event_updated',
          targetType: 'calendar_event',
          targetId: eventId,
          metadata: { title: event.title },
        })

        await refreshWorkspaceData()
        return event
      },

      deleteCalendarEvent: async (eventId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_calendar')) {
          throw new Error('あなたの役割ではカレンダーを編集できません。')
        }

        await deleteCalendarEventRepo(currentWorkspace.id, eventId)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'calendar_event_deleted',
          targetType: 'calendar_event',
          targetId: eventId,
        })

        await refreshWorkspaceData()
      },

      retryQueueJob: async (jobId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_queue')) {
          throw new Error('あなたの役割では公開予約ができません。')
        }

        const draft = drafts.find((entry) => entry.id === draftId)
        if (!draft) throw new Error('下書きが見つかりません')
        if (draft.status !== 'approved') throw new Error('承認済みの下書きのみ予約できます。')

        // Always the latest approval, not the (possibly since-edited) mutable
        // draft row — a schedule always publishes an immutable Revision.
        const revision = await draftRevisionsRepo.getLatestDraftRevision(currentWorkspace.id, draftId)
        if (!revision) throw new Error('この下書きの承認版（Revision）が見つかりません。')

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
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')
        if (!currentMember || !hasPermission(currentMember.role, 'manage_queue')) {
          throw new Error('あなたの役割では手動公開を記録できません。')
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

      triggerPublishJob: async (jobId) => {
        if (!currentWorkspace) throw new Error('準備ができていません')

        const response = await fetch('/api/publish/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, jobId }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'この投稿を公開できませんでした。')

        await refreshWorkspaceData()
        return payload as { success: boolean }
      },

      fetchPostMetrics: async (jobId) => {
        if (!currentWorkspace) throw new Error('準備ができていません')

        const response = await fetch('/api/analytics/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, jobId }),
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'この投稿の指標を取得できませんでした。')

        return payload as PostMetrics
      },

      markNotificationRead: async (notificationId) => {
        await notificationsRepo.markNotificationRead(notificationId)
        await refreshWorkspaceData()
      },

      markAllNotificationsRead: async () => {
        if (!currentWorkspace) throw new Error('準備ができていません')
        await notificationsRepo.markAllNotificationsRead(currentWorkspace.id)
        await refreshWorkspaceData()
      },

      // Client-side only: everything here is already loaded into this
      // provider's state (RLS-scoped to the caller), so this is a plain
      // JSON serialization + browser download, not a server export
      // pipeline. Approved Revisions, not mutable in-progress drafts, are
      // what's exported — per master-plan principle 6, that's the durable
      // "asset" worth having an offline copy of.
      exportWorkspaceData: async () => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

        const payload = {
          exportedAt: new Date().toISOString(),
          workspace: { id: currentWorkspace.id, name: currentWorkspace.name, slug: currentWorkspace.slug },
          brandProfiles,
          seeds,
          approvedRevisions: draftRevisions,
          publishAttempts,
        }

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${currentWorkspace.slug || 'workspace'}-export-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'workspace_data_exported',
          targetType: 'workspace',
          targetId: currentWorkspace.id,
          metadata: { seeds: seeds.length, revisions: draftRevisions.length },
        })
      },

      saveDraft: async (draft) => {
        if (!currentWorkspace || !currentUserId) throw new Error('準備ができていません')

        const isFirstSave = !draft.id
        const saved = await draftsRepo.upsertSocialDraft(currentWorkspace.id, draft)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'draft_edited',
          targetType: 'social_draft',
          targetId: saved.id,
          metadata: { channel: saved.channel, status: saved.status },
        })

        // Only on a draft's first save, not every subsequent edit — otherwise
        // tweaking wording a few times would re-notify approvers each time.
        // saveAndApproveDraft (below) skips this entirely: it saves and
        // approves in the same call, so there is never a "needs approval"
        // window to notify anyone about.
        if (isFirstSave && saved.status === 'draft') {
          const approvers = members.filter((m) => m.userId !== currentUserId && hasPermission(m.role, 'approve_drafts'))
          if (approvers.length > 0) {
            await notificationsRepo
              .createNotifications(
                createClient(),
                approvers.map((approver) => ({
                  workspaceId: currentWorkspace.id,
                  userId: approver.userId,
                  type: 'draft_needs_approval',
                  title: `${saved.channel}の下書きが確認待ちです`,
                  targetType: 'social_draft',
                  targetId: saved.id,
                })),
              )
              .catch((cause) => console.error('Failed to notify approvers:', cause))
          }
        }

        await refreshWorkspaceData()
        return saved
      },

      approveDraft: async (draftId) => {
        const currentDraft = drafts.find((d) => d.id === draftId)
        if (!currentDraft) throw new Error('下書きが見つかりません')
        return approveDraftContent(currentDraft)
      },

      saveAndApproveDraft: async (draft) => approveDraftContent(draft),

      getDraftsForSeed: (seedId) => {
        return drafts.filter((draft) => draft.seedId === seedId)
      },

      generateChannelDrafts: async (seedId, channels, tone, length) => {
        if (!currentWorkspace) throw new Error('準備ができていません')

        const response = await fetch('/api/drafts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id, seedId, channels, tone, length }),
        })

        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? '下書きを生成できませんでした。')
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
    draftRevisions,
    publishAttempts,
    aiGenerations,
    notifications,
    messagingContacts,
    replySuggestions,
    replyJobs,
    calendarEvents,
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
