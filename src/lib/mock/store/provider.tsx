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
import { readStoredMockAppState, writeStoredMockAppState } from './persistence'
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

export function MockAppProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, currentUserId, isReady: sessionReady } = useMockSession()
  const [state, setState] = useState<MockAppDataState>(createInitialMockAppState)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setState(readStoredMockAppState())
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    writeStoredMockAppState(state)
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
  const workspaceMemberships = useMemo(
    () =>
      currentUserId
        ? state.members
            .filter((member) => member.userId === currentUserId)
            .map((member) => ({
              ...member,
              user: state.users.find((user) => user.id === member.userId),
            }))
        : [],
    [currentUserId, state.members, state.users],
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

    const commitState = <T,>(update: (currentState: MockAppDataState) => { state: MockAppDataState; result: T }) => {
      const next = update(state)
      setState(next.state)
      return next.result
    }

    return {
      isReady: isHydrated && sessionReady,
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
      setActiveWorkspaceId: (workspaceId) => {
        setState((prev) => setActiveWorkspace(prev, workspaceId))
      },
      createContentItem: (input) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const created = createContent(currentState, {
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

          return {
            state: withContentLog.state,
            result: created.content,
          }
        })
      },
      updateContentItem: (contentId, patch) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const updated = updateContent(currentState, scope.currentWorkspace.id, contentId, patch)
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'content_updated',
            targetType: 'content',
            targetId: updated.content.id,
            metadata: patch,
          })
          return {
            state: withAudit.state,
            result: updated.content,
          }
        })
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
          auditLogs: listTargetAuditLogs(state, currentWorkspace.id, contentId, 6),
        }
      },
      inviteMember: (email, role) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const invited = inviteWorkspaceMember(currentState, {
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
          return {
            state: withAudit.state,
            result: invited.invitation,
          }
        })
      },
      changeMemberRole: (userId, role) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const changed = updateWorkspaceMemberRole(currentState, {
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
          const relatedUser = currentState.users.find((user) => user.id === changed.member.userId)
          if (!relatedUser) {
            throw new Error('Updated member user record is missing.')
          }
          return {
            state: withAudit.state,
            result: {
              ...changed.member,
              user: relatedUser,
            },
          }
        })
      },
      removeMember: (userId) => {
        const scope = assertScope()
        commitState((currentState) => {
          const nextState = removeWorkspaceMember(currentState, {
            workspaceId: scope.currentWorkspace.id,
            userId,
            actorId: scope.currentUserId,
          })
          return {
            state: appendAuditLog(nextState, {
              workspaceId: scope.currentWorkspace.id,
              actorId: scope.currentUserId,
              action: 'member_removed',
              targetType: 'member',
              targetId: userId,
              metadata: { userId },
            }).state,
            result: undefined,
          }
        })
      },
      saveWorkspaceSettings: (name, slug) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const updated = updateWorkspaceDetails(currentState, {
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
          return {
            state: withAudit.state,
            result: updated.workspace,
          }
        })
      },
      toggleInboxRead: (inboxItemId) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const current = currentState.inboxItems.find((item) => item.id === inboxItemId)
          const updated = updateInboxItem(currentState, scope.currentWorkspace.id, inboxItemId, {
            isRead: !current?.isRead,
          })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_item_read',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { isRead: updated.item.isRead },
          })
          return {
            state: withAudit.state,
            result: updated.item,
          }
        })
      },
      toggleInboxStar: (inboxItemId) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const current = currentState.inboxItems.find((item) => item.id === inboxItemId)
          const updated = updateInboxItem(currentState, scope.currentWorkspace.id, inboxItemId, {
            isStarred: !current?.isStarred,
          })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_item_starred',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { isStarred: updated.item.isStarred },
          })
          return {
            state: withAudit.state,
            result: updated.item,
          }
        })
      },
      toggleInboxNeedsAction: (inboxItemId) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const current = currentState.inboxItems.find((item) => item.id === inboxItemId)
          const updated = updateInboxItem(currentState, scope.currentWorkspace.id, inboxItemId, {
            needsAction: !current?.needsAction,
          })
          const withAudit = appendAuditLog(updated.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'inbox_item_needs_action',
            targetType: 'inbox_item',
            targetId: inboxItemId,
            metadata: { needsAction: updated.item.needsAction },
          })
          return {
            state: withAudit.state,
            result: updated.item,
          }
        })
      },
      addInboxNote: (inboxItemId, text) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const created = addInboxNote(currentState, {
            workspaceId: scope.currentWorkspace.id,
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
          return {
            state: withAudit.state,
            result: created.note,
          }
        })
      },
      getInboxNotes: (inboxItemId) =>
        currentWorkspace ? listInboxNotes(state, currentWorkspace.id, inboxItemId) : [],
      retryQueueJob: (jobId) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const retried = retryPublishJob(currentState, scope.currentWorkspace.id, jobId)
          const withAudit = appendAuditLog(retried.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'queue_item_scheduled',
            targetType: 'publish_job',
            targetId: jobId,
            metadata: { retried: true, scheduledAt: retried.job.scheduledAt },
          })
          return {
            state: withAudit.state,
            result: retried.job,
          }
        })
      },
      cancelQueueJob: (jobId) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const cancelled = cancelPublishJob(currentState, scope.currentWorkspace.id, jobId)
          const withAudit = appendAuditLog(cancelled.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'queue_item_cancelled',
            targetType: 'publish_job',
            targetId: jobId,
            metadata: { status: cancelled.job.status },
          })
          return {
            state: withAudit.state,
            result: cancelled.job,
          }
        })
      },
      saveDraft: (draft) => {
        const scope = assertScope()
        return commitState((currentState) => {
          const saved = upsertSocialDraft(currentState, scope.currentWorkspace.id, draft)
          const withAudit = appendAuditLog(saved.state, {
            workspaceId: scope.currentWorkspace.id,
            actorId: scope.currentUserId,
            action: 'draft_edited',
            targetType: 'social_draft',
            targetId: saved.draft.id,
            metadata: { platform: saved.draft.platform, status: saved.draft.status },
          })
          return {
            state: withAudit.state,
            result: saved.draft,
          }
        })
      },
      approveDraft: (draftId) => {
        const scope = assertScope()
        return assertDefined(
          commitState((currentState) => {
            const currentDraft = currentState.socialDrafts.find((draft) => draft.id === draftId)
            if (!currentDraft) {
              return { state: currentState, result: null }
            }

            const saved = upsertSocialDraft(currentState, scope.currentWorkspace.id, {
              ...currentDraft,
              status: 'approved',
            })
            const withAudit = appendAuditLog(saved.state, {
              workspaceId: scope.currentWorkspace.id,
              actorId: scope.currentUserId,
              action: 'draft_edited',
              targetType: 'social_draft',
              targetId: saved.draft.id,
              metadata: { approved: true, platform: saved.draft.platform },
            })
            return {
              state: withAudit.state,
              result: saved.draft,
            }
          }),
          'Unable to approve draft.',
        )
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
    workspaceMemberships,
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
