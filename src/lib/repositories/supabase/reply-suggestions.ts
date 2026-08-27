import type { AiReplySuggestion } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface AiReplySuggestionRow {
  id: string
  workspace_id: string
  inbox_item_id: string
  suggested_text: string
  tone: string
  source: 'template' | 'ai'
  assumptions: string[] | null
  ai_generation_id: string | null
  created_at: string
}

export function mapReplySuggestion(row: AiReplySuggestionRow): AiReplySuggestion {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    inboxItemId: row.inbox_item_id,
    suggestedText: row.suggested_text,
    tone: row.tone,
    source: row.source,
    assumptions: row.assumptions ?? [],
    aiGenerationId: row.ai_generation_id ?? undefined,
    createdAt: row.created_at,
  }
}

// See WORKSPACE_PUBLISH_ATTEMPTS_LIMIT's comment in publish-attempts.ts —
// bound the working set so a busy inbox can't grow this fetch without limit.
// The inbox only needs the latest suggestion per item, which lives at the top.
export const WORKSPACE_REPLY_SUGGESTIONS_LIMIT = 2000

/** All reply suggestions in the workspace, newest first (the inbox picks the latest per item). */
export async function listWorkspaceReplySuggestions(
  workspaceId: string,
  limit = WORKSPACE_REPLY_SUGGESTIONS_LIMIT,
): Promise<AiReplySuggestion[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('ai_reply_suggestions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`返信案を読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((row) => mapReplySuggestion(row as AiReplySuggestionRow))
}
