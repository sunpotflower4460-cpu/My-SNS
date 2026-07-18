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

/** All reply suggestions in the workspace, newest first (the inbox picks the latest per item). */
export async function listWorkspaceReplySuggestions(workspaceId: string): Promise<AiReplySuggestion[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('ai_reply_suggestions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching reply suggestions:', error)
    return []
  }

  return (data ?? []).map((row) => mapReplySuggestion(row as AiReplySuggestionRow))
}
