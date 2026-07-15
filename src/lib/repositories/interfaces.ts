import type {
  BrandProfile,
  BrandProfileInput,
  Seed,
  Workspace,
  WorkspaceMember,
  InboxItem,
  PublishJob,
  AuditLog,
} from '@/lib/domain/types'

// ─── Seed Repository ─────────────────────────────────────────────────────────
export interface SeedRepository {
  findById(id: string): Promise<Seed | null>
  findByWorkspace(workspaceId: string): Promise<Seed[]>
  create(data: Omit<Seed, 'id' | 'createdAt' | 'updatedAt'>): Promise<Seed>
  update(id: string, data: Partial<Seed>): Promise<Seed>
  delete(id: string): Promise<void>
}

// ─── Brand Profile Repository ────────────────────────────────────────────────
export interface BrandProfileRepository {
  findByWorkspace(workspaceId: string): Promise<BrandProfile[]>
  save(profileId: string | undefined, data: BrandProfileInput): Promise<BrandProfile>
}

// ─── Workspace Repository ─────────────────────────────────────────────────────
export interface WorkspaceRepository {
  findById(id: string): Promise<Workspace | null>
  findBySlug(slug: string): Promise<Workspace | null>
  findByUserId(userId: string): Promise<Workspace[]>
  create(data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>): Promise<Workspace>
  update(id: string, data: Partial<Workspace>): Promise<Workspace>
  delete(id: string): Promise<void>
  findMembers(workspaceId: string): Promise<WorkspaceMember[]>
  addMember(workspaceId: string, userId: string, role: WorkspaceMember['role']): Promise<WorkspaceMember>
  removeMember(workspaceId: string, userId: string): Promise<void>
  updateMemberRole(workspaceId: string, userId: string, role: WorkspaceMember['role']): Promise<WorkspaceMember>
}

// ─── Inbox Repository ─────────────────────────────────────────────────────────
export interface InboxRepository {
  findById(id: string): Promise<InboxItem | null>
  findByWorkspace(workspaceId: string): Promise<InboxItem[]>
  markRead(id: string): Promise<InboxItem>
  markStarred(id: string, starred: boolean): Promise<InboxItem>
  markNeedsAction(id: string, needsAction: boolean): Promise<InboxItem>
}

// ─── Publish Queue Repository ─────────────────────────────────────────────────
export interface PublishQueueRepository {
  findById(id: string): Promise<PublishJob | null>
  findByWorkspace(workspaceId: string): Promise<PublishJob[]>
  findBySeed(seedId: string): Promise<PublishJob[]>
  create(data: Omit<PublishJob, 'id' | 'createdAt'>): Promise<PublishJob>
  update(id: string, data: Partial<PublishJob>): Promise<PublishJob>
  cancel(id: string): Promise<PublishJob>
  retry(id: string): Promise<PublishJob>
}

// ─── Audit Log Repository ─────────────────────────────────────────────────────
export interface AuditLogRepository {
  findByWorkspace(workspaceId: string, limit?: number): Promise<AuditLog[]>
  findByTarget(targetType: string, targetId: string): Promise<AuditLog[]>
  create(data: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>
}
