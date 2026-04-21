import type { InboxItem, InboxNote } from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'
import { createId, nowIso } from './helpers'

export function listWorkspaceInbox(state: MockAppDataState, workspaceId: string): InboxItem[] {
  return state.inboxItems.filter((item) => item.workspaceId === workspaceId)
}

export function updateInboxItem(
  state: MockAppDataState,
  workspaceId: string,
  inboxItemId: string,
  patch: Partial<Pick<InboxItem, 'isRead' | 'isStarred' | 'needsAction'>>,
): { state: MockAppDataState; item: InboxItem; previous: InboxItem } {
  const item = state.inboxItems.find(
    (entry) => entry.workspaceId === workspaceId && entry.id === inboxItemId,
  )
  if (!item) {
    throw new Error('Inbox item not found.')
  }

  const nextItem: InboxItem = { ...item, ...patch }

  return {
    state: {
      ...state,
      inboxItems: state.inboxItems.map((entry) => (entry.id === inboxItemId ? nextItem : entry)),
    },
    item: nextItem,
    previous: item,
  }
}

export function listInboxNotes(
  state: MockAppDataState,
  workspaceId: string,
  inboxItemId: string,
): InboxNote[] {
  const relatedInboxItem = state.inboxItems.find(
    (item) => item.workspaceId === workspaceId && item.id === inboxItemId,
  )

  if (!relatedInboxItem) {
    return []
  }

  return state.inboxNotes.filter((note) => note.inboxItemId === inboxItemId)
}

export function addInboxNote(
  state: MockAppDataState,
  params: { workspaceId: string; inboxItemId: string; authorId: string; text: string },
): { state: MockAppDataState; note: InboxNote } {
  const relatedInboxItem = state.inboxItems.find(
    (item) => item.workspaceId === params.workspaceId && item.id === params.inboxItemId,
  )
  if (!relatedInboxItem) {
    throw new Error('Inbox item not found.')
  }

  const note: InboxNote = {
    id: createId('note'),
    inboxItemId: params.inboxItemId,
    authorId: params.authorId,
    text: params.text.trim(),
    createdAt: nowIso(),
  }

  return {
    state: {
      ...state,
      inboxNotes: [note, ...state.inboxNotes],
    },
    note,
  }
}
