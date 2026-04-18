'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
import { appendAuditLog, listTargetAuditLogs, listWorkspaceAuditLogs } from '@/lib/mock/repositories/audit'
import { createContent, getContentById, listContentAssets, listWorkspaceContent, updateContent } from '@/lib/mock/repositories/content'
import { listContentDrafts, listWorkspaceDrafts, upsertSocialDraft } from '@/lib/mock/repositories/drafts'
import { addInboxNote, listInboxNotes, listWorkspaceInbox, updateInboxItem } from '@/lib/mock/repositories/inbox'
import { MOCK_APP_STORAGE_KEY } from '@/lib/mock/repositories/helpers'
import { cancelPublishJob, listContentPublishJobs, listWorkspacePublishJobs, retryPublishJob } from '@/lib/mock/repositories/queue'
import {
  getCurrentMember,
  getCurrentWorkspace,
  getUserWorkspaces,
  inviteWorkspaceMember,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  listWorkspaceSocialAccounts,
  removeWorkspaceMember,
  setActiveWorkspace,
  updateWorkspaceDetails,
  updateWorkspaceMemberRole,
} from '@/lib/mock/repositories/workspaces'
import { useMockSession } from '@/lib/session/mock-session'
import { createInitialMockAppState } from './create-initial-state'
import type { MockAppDataState } from './types'

interface AssetInput {
  name: string
  size: number
  type: Asset['type']
  url?: string
}

interface MockAppContextValue {
  isReady: boolean
  currentWorkspace: Workspace | null
  currentMember: WorkspaceMember | null
  workspaces: Workspace[]
  members: WorkspaceMember[]
  invitations: Invitation[]
  socialAccounts: SocialAccount[]
  contents: Content[]
  publishJobs: PublishJob[]
  inboxItems: InboxItem[]
  auditLogs: AuditLog[]
  drafts: SocialDraft[]
  setActiveWorkspaceId: (workspaceId: string) => void
  createContentItem: (input: {
    title: string
    body: string
    type: ContentType
    status: ContentStatus
    tags: string[] | string
    assets?: AssetInput[]
  }) => Content
  updateContentItem: (contentId: string, patch: Partial<Pick<Content, 'title' | 'body' | 'status' | 'tags'>>) => Content
  getContentDetail: (contentId: string) => {
    content: Content | null
    assets: Asset[]
    drafts: SocialDraft[]
    jobs: PublishJob[]
    inboxItems: InboxItem[]
    auditLogs: AuditLog[]
  }
  inviteMember: (email: string, role: WorkspaceRole) => Invitation
  changeMemberRole: (userId: string, role: WorkspaceRole) => WorkspaceMember
  removeMember: (userId: string) => void
  saveWorkspaceSettings: (name: string, slug: string) => Workspace
  toggleInboxRead: (inboxItemId: string) => InboxItem
  toggleInboxStar: (inboxItemId: string) => InboxItem
  toggleInboxNeedsAction: (inboxItemId: string) => InboxItem
  addInboxNote: (inboxItemId: string, text: string) => InboxNote
  getInboxNotes: (inboxItemId: string) => InboxNote[]
  retryQueueJob: (jobId: string) => PublishJob
  cancelQueueJob: (jobId: string) => PublishJob
  saveDraft: (draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => SocialDraft
  approveDraft: (draftId: string) => SocialDraft
  getDraftsForContent: (contentId: string) => SocialDraft[]
}

const MockAppContext = createContext<MockAppContextValue | null>(null)

function assertDefined<T>(value: T | null | undefined, message: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message)
  }

  return value as NonNullable<T>
}

function readStoredState(): MockAppDataState {
  try {
    const stored = window.localStorage.getItem(MOCK_APP_STORAGE_KEY)
    if (!stored) return createInitialMockAppState()
    return {
      ...createInitialMockAppState(),
      ...JSON.parse(stored),
    }
  } catch {
    return createInitialMockAppState()
  }
}

export function MockAppProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, currentUserId, isReady: sessionReady } = useMockSession()
  const [state, setState] = useState<MockAppDataState>(createInitialMockAppState)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setState(readStoredState())
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    window.localStorage.setItem(MOCK_APP_STORAGE_KEY, JSON.stringify(state))
  }, [state, isHydrated])

  useEffect(() => {
    if (!isHydrated || !sessionReady || !currentUserId) return

    const available = getUserWorkspaces(state, currentUserId)
    if (available.length === 0) return

    if (!available.some((workspace) => workspace.id === state.activeWorkspaceId)) {
      setState((prev) => setActiveWorkspace(prev, available[0].id))
    }
  }, [currentUserId, isHydrated, sessionReady, state])

  const workspaces = useMemo(
    () => (currentUserId ? getUserWorkspaces(state, currentUserId) : []),
    [currentUserId, state],
  )
  const currentWorkspace = useMemo(
    () => (currentUserId ? getCurrentWorkspace(state, currentUserId) : null),
    [currentUserId, state],
  )
  const currentMember = useMemo(
    () =>
      currentWorkspace && currentUserId
        ? getCurrentMember(state, currentWorkspace.id, currentUserId)
        : null,
    [currentUserId, currentWorkspace, state],
  )

  const members = useMemo(
    () => (currentWorkspace ? listWorkspaceMembers(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )
  const invitations = useMemo(
    () => (currentWorkspace ? listWorkspaceInvitations(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )
  const socialAccounts = useMemo(
    () => (currentWorkspace ? listWorkspaceSocialAccounts(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )
  const contents = useMemo(
    () => (currentWorkspace ? listWorkspaceContent(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )
  const publishJobs = useMemo(
    () => (currentWorkspace ? listWorkspacePublishJobs(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )
  const inboxItems = useMemo(
    () => (currentWorkspace ? listWorkspaceInbox(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )
  const auditLogs = useMemo(
    () => (currentWorkspace ? listWorkspaceAuditLogs(state, currentWorkspace.id, 12) : []),
    [currentWorkspace, state],
  )
  const drafts = useMemo(
    () => (currentWorkspace ? listWorkspaceDrafts(state, currentWorkspace.id) : []),
    [currentWorkspace, state],
  )

  const value = useMemo<MockAppContextValue>(() => {
    const assertScope = () => {
      if (!currentUser || !currentUserId || !currentWorkspace || !currentMember) {
        throw new Error('Mock app state is not ready yet.')
      }

      return {
        currentUser,
        currentUserId,
        currentWorkspace,
        currentMember,
      }
    }

    return {
      isReady: isHydrated && sessionReady,
      currentWorkspace,
      currentMember,
      workspaces,
      members,
      invitations,
      socialAccounts,
      contents,
      publishJobs,
      inboxItems,
      auditLogs,
      drafts,
      setActiveWorkspaceId: (workspaceId) => {
        setState((prev) => setActiveWorkspace(prev, workspaceId))
      },
      createContentItem: (input) => {
        const scope = assertScope()
        let nextContent: Content | null = null

        setState((prev) => {
          const created = createContent(prev, {
            workspaceId: scope.currentWorkspace.id,
            authorId: scope.currentUserId,
            ...input,
          })

          const withContentLog = appendAuditLog(created.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'content_created',
            targetType: 'content',
            targetId: created.content.id,
            metadata: { title: created.content.title, status: created.content.status },
          })

          nextContent = created.content
          return withContentLog.state
        })

        return assertDefined(nextContent, 'Unable to create content.')
      },
      updateContentItem: (contentId, patch) => {
        const scope = assertScope()
        let nextContent: Content | null = null

        setState((prev) => {
          const updated = updateContent(prev, contentId, patch)
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'content_updated',
            targetType: 'content',
            targetId: updated.content.id,
            metadata: patch,
          })
          nextContent = updated.content
          return withAudit.state
        })

        return assertDefined(nextContent, 'Unable to update content.')
      },
      getContentDetail: (contentId) => {
        if (!currentWorkspace) {
          return { content: null, assets: [], drafts: [], jobs: [], inboxItems: [], auditLogs: [] }
        }

        const content = getContentById(state, currentWorkspace.id, contentId)
        if (!content) {
          return { content: null, assets: [], drafts: [], jobs: [], inboxItems: [], auditLogs: [] }
        }

        return {
          content,
          assets: listContentAssets(state, currentWorkspace.id, contentId),
          drafts: listContentDrafts(state, currentWorkspace.id, contentId),
          jobs: listContentPublishJobs(state, currentWorkspace.id, contentId),
          inboxItems: inboxItems.filter((item) => item.contentId === contentId),
          auditLogs: listTargetAuditLogs(state, contentId, 6),
        }
      },
      inviteMember: (email, role) => {
        const scope = assertScope()
        let nextInvitation: Invitation | null = null

        setState((prev) => {
          const invited = inviteWorkspaceMember(prev, {
            workspaceId: scope.currentWorkspace.id,
            email,
            role,
            invitedBy: scope.currentUserId,
          })
          const withAudit = appendAuditLog(invited.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'member_invited',
            targetType: 'invitation',
            targetId: invited.invitation.id,
            metadata: { email: invited.invitation.email, role },
          })
          nextInvitation = invited.invitation
          return withAudit.state
        })

        return assertDefined(nextInvitation, 'Unable to create invitation.')
      },
      changeMemberRole: (userId, role) => {
        const scope = assertScope()
        let nextMember: WorkspaceMember | null = null

        setState((prev) => {
          const changed = updateWorkspaceMemberRole(prev, {
            workspaceId: scope.currentWorkspace.id,
            userId,
            role,
            actorId: scope.currentUserId,
          })
          const withAudit = appendAuditLog(changed.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'role_changed',
            targetType: 'member',
            targetId: changed.member.id,
            metadata: { userId, role },
          })
          const relatedUser = prev.users.find((user) => user.id === changed.member.userId)
          if (!relatedUser) {
            throw new Error('Updated member user record is missing.')
          }
          nextMember = {
            ...changed.member,
            user: relatedUser,
          }
          return withAudit.state
        })

        return assertDefined(nextMember, 'Unable to update member.')
      },
      removeMember: (userId) => {
        const scope = assertScope()
        setState((prev) => {
          const nextState = removeWorkspaceMember(prev, {
            workspaceId: scope.currentWorkspace.id,
            userId,
            actorId: scope.currentUserId,
          })
          return appendAuditLog(nextState, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'member_removed',
            targetType: 'member',
            targetId: userId,
            metadata: { userId },
          }).state
        })
      },
      saveWorkspaceSettings: (name, slug) => {
        const scope = assertScope()
        let nextWorkspace: Workspace | null = null

        setState((prev) => {
          const updated = updateWorkspaceDetails(prev, {
            workspaceId: scope.currentWorkspace.id,
            name,
            slug,
          })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'workspace_settings_updated',
            targetType: 'workspace',
            targetId: updated.workspace.id,
            metadata: {
              previousName: updated.previous.name,
              nextName: updated.workspace.name,
              previousSlug: updated.previous.slug,
              nextSlug: updated.workspace.slug,
            },
          })
          nextWorkspace = updated.workspace
          return withAudit.state
        })

        return assertDefined(nextWorkspace, 'Unable to update workspace.')
      },
      toggleInboxRead: (inboxItemId) => {
        const scope = assertScope()
        let nextItem: InboxItem | null = null

        setState((prev) => {
          const current = prev.inboxItems.find((item) => item.id === inboxItemId)
          const updated = updateInboxItem(prev, inboxItemId, { isRead: !current?.isRead })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_item_read',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { isRead: updated.item.isRead },
          })
          nextItem = updated.item
          return withAudit.state
        })

        return assertDefined(nextItem, 'Unable to update inbox item.')
      },
      toggleInboxStar: (inboxItemId) => {
        const scope = assertScope()
        let nextItem: InboxItem | null = null

        setState((prev) => {
          const current = prev.inboxItems.find((item) => item.id === inboxItemId)
          const updated = updateInboxItem(prev, inboxItemId, { isStarred: !current?.isStarred })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_item_starred',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { isStarred: updated.item.isStarred },
          })
          nextItem = updated.item
          return withAudit.state
        })

        return assertDefined(nextItem, 'Unable to update inbox item.')
      },
      toggleInboxNeedsAction: (inboxItemId) => {
        const scope = assertScope()
        let nextItem: InboxItem | null = null

        setState((prev) => {
          const current = prev.inboxItems.find((item) => item.id === inboxItemId)
          const updated = updateInboxItem(prev, inboxItemId, { needsAction: !current?.needsAction })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_item_needs_action',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { needsAction: updated.item.needsAction },
          })
          nextItem = updated.item
          return withAudit.state
        })

        return assertDefined(nextItem, 'Unable to update inbox item.')
      },
      addInboxNote: (inboxItemId, text) => {
        const scope = assertScope()
        let nextNote: InboxNote | null = null

        setState((prev) => {
          const created = addInboxNote(prev, {
            inboxItemId,
            authorId: scope.currentUserId,
            text,
          })
          const withAudit = appendAuditLog(created.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_note_added',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { noteAdded: true },
          })
          nextNote = created.note
          return withAudit.state
        })

        return assertDefined(nextNote, 'Unable to save inbox note.')
      },
      getInboxNotes: (inboxItemId) => listInboxNotes(state, inboxItemId),
      retryQueueJob: (jobId) => {
        const scope = assertScope()
        let nextJob: PublishJob | null = null

        setState((prev) => {
          const retried = retryPublishJob(prev, jobId)
          const withAudit = appendAuditLog(retried.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'queue_item_scheduled',
            targetType: 'publish_job',
            targetId: jobId,
            metadata: { retried: true, scheduledAt: retried.job.scheduledAt },
          })
          nextJob = retried.job
          return withAudit.state
        })

        return assertDefined(nextJob, 'Unable to retry queue job.')
      },
      cancelQueueJob: (jobId) => {
        const scope = assertScope()
        let nextJob: PublishJob | null = null

        setState((prev) => {
          const cancelled = cancelPublishJob(prev, jobId)
          const withAudit = appendAuditLog(cancelled.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'queue_item_cancelled',
            targetType: 'publish_job',
            targetId: jobId,
            metadata: { status: cancelled.job.status },
          })
          nextJob = cancelled.job
          return withAudit.state
        })

        return assertDefined(nextJob, 'Unable to cancel queue job.')
      },
      saveDraft: (draft) => {
        const scope = assertScope()
        let nextDraft: SocialDraft | null = null

        setState((prev) => {
          const saved = upsertSocialDraft(prev, draft)
          const withAudit = appendAuditLog(saved.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'draft_edited',
            targetType: 'social_draft',
            targetId: saved.draft.id,
            metadata: { platform: saved.draft.platform, status: saved.draft.status },
          })
          nextDraft = saved.draft
          return withAudit.state
        })

        return assertDefined(nextDraft, 'Unable to save draft.')
      },
      approveDraft: (draftId) => {
        const scope = assertScope()
        let nextDraft: SocialDraft | null = null

        setState((prev) => {
          const currentDraft = prev.socialDrafts.find((draft) => draft.id === draftId)
          if (!currentDraft) {
            return prev
          }

          const saved = upsertSocialDraft(prev, { ...currentDraft, status: 'approved' })
          const withAudit = appendAuditLog(saved.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'draft_edited',
            targetType: 'social_draft',
            targetId: saved.draft.id,
            metadata: { approved: true, platform: saved.draft.platform },
          })
          nextDraft = saved.draft
          return withAudit.state
        })

        return assertDefined(nextDraft, 'Unable to approve draft.')
      },
      getDraftsForContent: (contentId) => (currentWorkspace ? listContentDrafts(state, currentWorkspace.id, contentId) : []),
    }
  }, [
    auditLogs,
    contents,
    currentMember,
    currentUser,
    currentUserId,
    currentWorkspace,
    drafts,
    inboxItems,
    invitations,
    isHydrated,
    members,
    publishJobs,
    sessionReady,
    socialAccounts,
    state,
    workspaces,
  ])

  return <MockAppContext.Provider value={value}>{children}</MockAppContext.Provider>
}

export function useMockApp() {
  const context = useContext(MockAppContext)
  if (!context) {
    throw new Error('useMockApp must be used within MockAppProvider')
  }

  return context
}
