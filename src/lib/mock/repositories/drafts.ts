import type { Content, SocialDraft, SocialPlatform } from '@/lib/domain/types'
import type { MockAppDataState } from '@/lib/mock/store/types'
import { createId, nowIso } from './helpers'

function createDraftVariation(text: string, seed: number): string {
  const suffixes = [
    'Fresh angle: lead with the mood before the details.',
    'Variation: make the call-to-action a little warmer.',
    'Alternate take: spotlight the audience invitation first.',
    'New spin: keep the energy calm but a touch more urgent.',
  ]

  const sanitized = text.replace(/\n\n(?:Fresh angle:|Variation:|Alternate take:|New spin:)[\s\S]*/, '')
  return `${sanitized}\n\n${suffixes[seed % suffixes.length]}`
}

export function listWorkspaceDrafts(state: MockAppDataState, workspaceId: string): SocialDraft[] {
  return state.socialDrafts.filter((draft) => draft.workspaceId === workspaceId)
}

export function listContentDrafts(
  state: MockAppDataState,
  workspaceId: string,
  contentId: string,
): SocialDraft[] {
  return state.socialDrafts.filter(
    (draft) => draft.workspaceId === workspaceId && draft.contentId === contentId,
  )
}

export function upsertSocialDraft(
  state: MockAppDataState,
  draft: Omit<SocialDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): { state: MockAppDataState; draft: SocialDraft; isNew: boolean } {
  const existing = draft.id ? state.socialDrafts.find((entry) => entry.id === draft.id) : null
  const timestamp = nowIso()

  const nextDraft: SocialDraft = existing
    ? {
        ...existing,
        ...draft,
        updatedAt: timestamp,
      }
    : {
        ...draft,
        id: createId('sd'),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

  return {
    state: {
      ...state,
      socialDrafts: existing
        ? state.socialDrafts.map((entry) => (entry.id === existing.id ? nextDraft : entry))
        : [nextDraft, ...state.socialDrafts],
    },
    draft: nextDraft,
    isNew: !existing,
  }
}

export function regenerateDraftText(
  draft: SocialDraft,
  content: Content,
  seed: number,
): string {
  const lead = `${content.title} — ${content.body ?? ''}`.trim()
  return createDraftVariation(`${lead}\n\n${draft.draftText}`, seed)
}

export function buildGeneratedDraft(
  params: {
    workspaceId: string
    contentId: string
    platform: SocialPlatform
    tone: string
    length: 'short' | 'medium' | 'long'
    createdBy: string
    draftText: string
  },
): SocialDraft {
  const timestamp = nowIso()

  return {
    id: createId('generated'),
    workspaceId: params.workspaceId,
    contentId: params.contentId,
    platform: params.platform,
    tone: params.tone,
    length: params.length,
    draftText: params.draftText,
    status: 'draft',
    createdBy: params.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
