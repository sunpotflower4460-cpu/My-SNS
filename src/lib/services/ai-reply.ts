import type { ReplyGenerationContext, ReplyGeneratorService, ReplyProposal } from './interfaces'

// Deterministic fallback shown honestly when Anthropic is unconfigured — it is
// never presented as an AI proposal. It makes no guesses (assumptions: []) and
// offers a neutral, polite acknowledgment the human can rewrite.

function truncate(text: string, limit: number): string {
  const normalized = text.trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

export class TemplateReplyGeneratorService implements ReplyGeneratorService {
  async generateReply(inboundText: string, context?: ReplyGenerationContext): Promise<ReplyProposal> {
    const cta = context?.brandProfile?.defaultCallToAction?.trim()
    const reply = ['メッセージありがとうございます。確認のうえ、あらためてご連絡します。', cta].filter(Boolean).join('\n\n')

    return {
      summary: truncate(inboundText, 80) || '（本文なし）',
      reply,
      tone: 'calm',
      assumptions: [],
      priority: 'normal',
    }
  }
}
