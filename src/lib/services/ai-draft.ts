import type { Content, SocialDraft, SocialPlatform } from '@/lib/domain/types'
import type { DraftGeneratorService } from './interfaces'

type DraftLength = 'short' | 'medium' | 'long'

function truncate(text: string, limit: number): string {
  const normalized = text.trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function hashtags(content: Content, limit = content.tags.length): string {
  return content.tags.slice(0, limit).map((tag) => `#${tag}`).join(' ')
}

const PLATFORM_TEMPLATES: Record<SocialPlatform, (content: Content, tone: string, length: DraftLength) => string> = {
  instagram: (content, _tone, length) => {
    const bodyLimit = length === 'short' ? 120 : length === 'medium' ? 360 : 900
    return [content.title, truncate(content.body ?? '', bodyLimit), hashtags(content)].filter(Boolean).join('\n\n')
  },
  x: (content) => {
    return truncate([content.title, content.body, hashtags(content, 2)].filter(Boolean).join(' — '), 280)
  },
  youtube: (content) => {
    return [content.title, content.body, hashtags(content)].filter(Boolean).join('\n\n')
  },
  threads: (content, _tone, length) => {
    const bodyLimit = length === 'short' ? 180 : length === 'medium' ? 360 : 700
    return [content.title, truncate(content.body ?? '', bodyLimit)].filter(Boolean).join('\n\n')
  },
  tiktok: (content) => {
    return [content.title, truncate(content.body ?? '', 180), hashtags(content, 4)].filter(Boolean).join('\n\n')
  },
  facebook: (content, _tone, length) => {
    const bodyLimit = length === 'short' ? 180 : length === 'medium' ? 500 : 1200
    return [content.title, truncate(content.body ?? '', bodyLimit)].filter(Boolean).join('\n\n')
  },
}

export function resetTemplateDraft(draft: SocialDraft, content: Content): string {
  return PLATFORM_TEMPLATES[draft.platform](content, draft.tone, draft.length)
}

export class TemplateDraftGeneratorService implements DraftGeneratorService {
  async generateDrafts(
    content: Content,
    platforms: SocialPlatform[],
    tone: string,
    length: DraftLength,
    context?: {
      workspaceName?: string
      createdBy?: string
    },
  ): Promise<SocialDraft[]> {
    const now = new Date().toISOString()

    return platforms.map((platform, index) => ({
      id: `generated-${Date.now()}-${index}`,
      workspaceId: content.workspaceId,
      contentId: content.id,
      platform,
      draftText: PLATFORM_TEMPLATES[platform](content, tone, length),
      tone,
      length,
      status: 'draft' as const,
      createdBy: context?.createdBy ?? content.authorId,
      createdAt: now,
      updatedAt: now,
    }))
  }
}
