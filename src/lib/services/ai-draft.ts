import type { Content, SocialDraft, SocialPlatform } from '@/lib/domain/types'
import type { AiDraftGeneratorService } from './interfaces'
import { DEFAULT_USER_ID } from '@/lib/mock/seed'

const PLATFORM_TEMPLATES: Record<SocialPlatform, (content: Content, tone: string, length: 'short' | 'medium' | 'long') => string> = {
  instagram: (content, tone, length) => {
    const base = `✨ ${content.title} — ${tone === 'playful' ? '🎉 ' : ''}${content.body ?? ''}`
    const hashtags = content.tags.map((t) => `#${t}`).join(' ')
    return length === 'short'
      ? `${base.slice(0, 100)}... ${hashtags}`
      : `${base}\n\n${hashtags}\n\nLink in bio 👆`
  },
  x: (content, tone) => {
    const prefix = tone === 'inspirational' ? '💡 ' : tone === 'playful' ? '🎊 ' : ''
    const hashtags = content.tags.slice(0, 2).map((t) => `#${t}`).join(' ')
    return `${prefix}${content.title} — ${(content.body ?? '').slice(0, 100)} ${hashtags}`
  },
  youtube: (content, _tone, length) => {
    const desc = content.body ?? ''
    return length === 'long'
      ? `${content.title}\n\n${desc}\n\nSubscribe for more content from Creator Hub! Don't forget to like and hit the bell icon 🔔`
      : `${content.title}\n\n${desc}`
  },
  threads: (content, tone) => {
    const opener = tone === 'casual' ? 'Hey everyone 👋' : tone === 'professional' ? 'We are excited to share' : 'Something big is here'
    return `${opener} — ${content.title}. ${(content.body ?? '').slice(0, 200)}`
  },
  tiktok: (content, tone) => {
    return tone === 'playful'
      ? `POV: you just discovered ${content.title} 👀 #fyp #${content.tags[0] ?? 'trending'}`
      : `${content.title} is live! ${content.tags.map((t) => `#${t}`).join(' ')} #fyp`
  },
  facebook: (content, _tone, length) => {
    const body = content.body ?? ''
    return length === 'long'
      ? `We are thrilled to share: ${content.title}\n\n${body}\n\nShare this with someone who needs to see it! 🙌`
      : `${content.title} — ${body.slice(0, 150)}`
  },
}

export class MockAiDraftGeneratorService implements AiDraftGeneratorService {
  async generateDrafts(
    content: Content,
    platforms: SocialPlatform[],
    tone: string,
    length: 'short' | 'medium' | 'long',
    context?: {
      workspaceName?: string
      createdBy?: string
      variationSeed?: number
    },
  ): Promise<SocialDraft[]> {
    // Simulate async delay
    await new Promise((resolve) => setTimeout(resolve, 600))

    const now = new Date().toISOString()
    const workspaceName = context?.workspaceName ?? 'Creator Hub'
    const variationSuffix = context?.variationSeed
      ? `\n\nVariation ${context.variationSeed + 1}: shift the emphasis slightly.`
      : ''
    return platforms.map((platform, index) => ({
      id: `generated-${Date.now()}-${index}`,
      workspaceId: content.workspaceId,
      contentId: content.id,
      platform,
      draftText: PLATFORM_TEMPLATES[platform](content, tone, length)
        .replace('Creator Hub', workspaceName)
        .concat(variationSuffix),
      tone,
      length,
      status: 'draft' as const,
      createdBy: context?.createdBy ?? DEFAULT_USER_ID,
      createdAt: now,
      updatedAt: now,
    }))
  }
}
