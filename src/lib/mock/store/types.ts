import type {
  Asset,
  AuditLog,
  Content,
  InboxItem,
  InboxNote,
  Invitation,
  PublishJob,
  SocialAccount,
  SocialDraft,
  User,
  Workspace,
  WorkspaceMember,
} from '@/lib/domain/types'

export interface MockAppDataState {
  users: User[]
  workspaces: Workspace[]
  members: WorkspaceMember[]
  invitations: Invitation[]
  socialAccounts: SocialAccount[]
  contents: Content[]
  assets: Asset[]
  socialDrafts: SocialDraft[]
  publishJobs: PublishJob[]
  inboxItems: InboxItem[]
  inboxNotes: InboxNote[]
  auditLogs: AuditLog[]
  activeWorkspaceId: string
}
