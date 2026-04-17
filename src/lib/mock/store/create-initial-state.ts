import {
  DEFAULT_WORKSPACE_ID,
  MOCK_ASSETS,
  MOCK_AUDIT_LOGS,
  MOCK_CONTENTS,
  MOCK_INBOX_ITEMS,
  MOCK_INVITATIONS,
  MOCK_MEMBERS,
  MOCK_PUBLISH_JOBS,
  MOCK_SOCIAL_ACCOUNTS,
  MOCK_SOCIAL_DRAFTS,
  MOCK_USERS,
  MOCK_WORKSPACES,
} from '@/lib/mock/seed'
import type { MockAppDataState } from './types'

function stripMemberRelations() {
  return MOCK_MEMBERS.map(({ user, ...member }) => ({ ...member }))
}

function stripContentRelations() {
  return MOCK_CONTENTS.map(({ author, ...content }) => ({ ...content }))
}

function stripAuditRelations() {
  return MOCK_AUDIT_LOGS.map(({ actor, ...log }) => ({ ...log }))
}

export function createInitialMockAppState(): MockAppDataState {
  return {
    users: MOCK_USERS.map((user) => ({ ...user })),
    workspaces: MOCK_WORKSPACES.map((workspace) => ({ ...workspace })),
    members: stripMemberRelations(),
    invitations: MOCK_INVITATIONS.map((invitation) => ({ ...invitation })),
    socialAccounts: MOCK_SOCIAL_ACCOUNTS.map((account) => ({ ...account })),
    contents: stripContentRelations(),
    assets: MOCK_ASSETS.map((asset) => ({ ...asset })),
    socialDrafts: MOCK_SOCIAL_DRAFTS.map((draft) => ({ ...draft })),
    publishJobs: MOCK_PUBLISH_JOBS.map((job) => ({ ...job })),
    inboxItems: MOCK_INBOX_ITEMS.map((item) => ({ ...item })),
    inboxNotes: [],
    auditLogs: stripAuditRelations(),
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  }
}
