'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import type {
  Asset,
  AuditLog,
  Content,
  ContentStatus,
  ContentType,
  InboxItem,
  InboxNote,
  Invitation,
  PublishJob,
  SocialAccount,
  SocialDraft,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '@/lib/domain/types'
import { useAuth } from '@/lib/auth/auth-provider'
import * as workspacesRepo from '@/lib/repositories/supabase/workspaces'
import * as contentRepo from '@/lib/repositories/supabase/content'
import * as draftsRepo from '@/lib/repositories/supabase/drafts'
import * as inboxRepo from '@/lib/repositories/supabase/inbox'
import * as queueRepo from '@/lib/repositories/supabase/queue'
import * as auditRepo from '@/lib/repositories/supabase/audit'
import { SupabaseAssetStorage } from '@/lib/storage/supabase/supabase-asset-storage'
import type { AssetUploadInput } from '@/lib/storage/interfaces'

interface AppContextValue {
  isReady: boolean
  currentWorkspace: Workspace | null
  currentMember: WorkspaceMember | null
  workspaces: Workspace[]
  workspaceMemberships: WorkspaceMember[]
  members: WorkspaceMember[]
  invitations: Invitation[]
  socialAccounts: SocialAccount[]
  contents: Content[]
  publishJobs: PublishJob[]
  inboxItems: InboxItem[]
  auditLogs: AuditLog[]
  drafts: SocialDraft[]
  setActiveWorkspaceId: (workspaceId: string) => void
  refreshWorkspaceData: () => Promise<void>
  createContentItem: (input: {
    title: string
    body: string
    type: ContentType
    status: ContentStatus
    tags: string[] | string
    assets?: AssetUploadInput[]
  }) => Promise<Content>
  updateContentItem: (
    contentId: string,
    patch: Partial<Pick<Content, 'title' | 'body' | 'status' | 'tags'>>
  ) => Promise<Content>
  getContentDetail: (contentId: string) => {
    content: Content | null
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
  toggleInboxRead: (inboxItemId: string) => Promise<InboxItem>
  toggleInboxStar: (inboxItemId: string) => Promise<InboxItem>
  toggleInboxNeedsAction: (inboxItemId: string) => Promise<InboxItem>
  addInboxNote: (inboxItemId: string, text: string) => Promise<InboxNote>
  getInboxNotes: (inboxItemId: string) => InboxNote[]
  retryQueueJob: (jobId: string) => Promise<PublishJob>
  cancelQueueJob: (jobId: string) => Promise<PublishJob>
  saveDraft: (draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<SocialDraft>
  approveDraft: (draftId: string) => Promise<SocialDraft>
  getDraftsForContent: (contentId: string) => SocialDraft[]
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
  const [contents, setContents] = useState<Content[]>([])
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
        contentsList,
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
        contentRepo.listWorkspaceContent(activeWorkspaceId),
        contentRepo.listWorkspaceAssets(activeWorkspaceId),
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
      setContents(contentsList)
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

    return {
      isReady: isReady && authReady,
      currentWorkspace,
      currentMember,
      workspaces,
      workspaceMemberships,
      members,
      invitations,
      socialAccounts,
      contents,
      publishJobs,
      inboxItems,
      auditLogs,
      drafts,
      setActiveWorkspaceId,
      refreshWorkspaceData,

      createContentItem: async (input) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const content = await contentRepo.createContent({
          workspaceId: currentWorkspace.id,
          authorId: currentUserId,
          title: input.title,
          body: input.body,
          type: input.type,
          status: input.status,
          tags: input.tags,
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'content_created',
          targetType: 'content',
          targetId: content.id,
          metadata: { title: content.title, status: content.status },
        })

        if (input.assets && input.assets.length > 0) {
          const preparedAssets = await assetStorage.prepareFiles(input.assets, {
            workspaceId: currentWorkspace.id,
            contentId: content.id,
          })

          for (const preparedAsset of preparedAssets) {
            await assetStorage.saveAssetMetadata({
              workspaceId: currentWorkspace.id,
              contentId: content.id,
              uploadedBy: currentUserId,
              preparedAsset,
            })
          }
        }

        await refreshWorkspaceData()
        return content
      },

      updateContentItem: async (contentId, patch) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const content = await contentRepo.updateContent(currentWorkspace.id, contentId, patch)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'content_updated',
          targetType: 'content',
          targetId: content.id,
          metadata: patch,
        })

        await refreshWorkspaceData()
        return content
      },

      getContentDetail: (contentId) => {
        if (!currentWorkspace) {
          return { content: null, assets: [], drafts: [], jobs: [], inboxItems: [], auditLogs: [] }
        }

        const content = contents.find((c) => c.id === contentId) || null
        const assets = workspaceAssets.filter((asset) => asset.contentId === contentId)
        const contentDrafts = drafts.filter((d) => d.contentId === contentId)
        const jobs = publishJobs.filter((j) => j.contentId === contentId)
        const relatedInbox = inboxItems.filter((item) => item.contentId === contentId)
        const logs = auditLogs.filter((log) => log.targetId === contentId).slice(0, 10)

        return {
          content,
          assets,
          drafts: contentDrafts,
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

      saveDraft: async (draft) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const saved = await draftsRepo.upsertSocialDraft(currentWorkspace.id, draft)

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'draft_edited',
          targetType: 'social_draft',
          targetId: saved.id,
          metadata: { platform: saved.platform, status: saved.status },
        })

        await refreshWorkspaceData()
        return saved
      },

      approveDraft: async (draftId) => {
        if (!currentWorkspace || !currentUserId) throw new Error('Not ready')

        const currentDraft = drafts.find((d) => d.id === draftId)
        if (!currentDraft) throw new Error('Draft not found')

        const approved = await draftsRepo.upsertSocialDraft(currentWorkspace.id, {
          ...currentDraft,
          status: 'approved',
        })

        await auditRepo.appendAuditLog({
          workspaceId: currentWorkspace.id,
          actorId: currentUserId,
          action: 'draft_edited',
          targetType: 'social_draft',
          targetId: approved.id,
          metadata: { approved: true, platform: approved.platform },
        })

        await refreshWorkspaceData()
        return approved
      },

      getDraftsForContent: (contentId) => {
        return drafts.filter((d) => d.contentId === contentId)
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
    contents,
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
