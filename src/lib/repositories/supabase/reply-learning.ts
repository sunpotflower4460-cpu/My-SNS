import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReplyStyleExample } from '@/lib/services/interfaces'

// Per-contact learning (Phase 2): turn a contact's past approved replies into
// few-shot style examples for the next proposal. Each example is the triple
// (what they said, what the AI first proposed, what the creator actually sent) —
// the same "AI original vs. human-approved" diff signal the draft side already
// uses (ai_original_snapshot → styleExamples), moved onto the messaging side.
//
// Only replies the human actually approved (a reply_job exists) and that had an
// AI proposal to compare against (source='ai') teach anything, so those are the
// only rows considered. Examples where the human EDITED the AI text carry the
// strongest signal and are preferred over verbatim approvals.

// A to-one embedded relation comes back as an object, but the generated types
// can widen it to an array; accept either and normalize.
type Embedded<T> = T | T[] | null

export interface ReplyExampleRow {
  reply_text: string
  ai_reply_suggestions: Embedded<{ suggested_text: string; source: string }>
  inbox_items: Embedded<{ text: string }>
}

function firstOf<T>(value: Embedded<T>): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * Pure: map raw joined rows (newest-first) to at most `limit` style examples.
 * Drops rows missing the inbound text or the AI proposal, then orders
 * human-edited examples ahead of verbatim approvals (stable within each group,
 * preserving the newest-first order the query produced).
 */
export function buildStyleExamples(rows: ReplyExampleRow[], limit = 3): ReplyStyleExample[] {
  const examples: Array<ReplyStyleExample & { edited: boolean }> = []

  for (const row of rows) {
    const suggestion = firstOf(row.ai_reply_suggestions)
    const inbox = firstOf(row.inbox_items)
    const aiProposed = suggestion?.suggested_text?.trim()
    const inbound = inbox?.text?.trim()
    const humanApproved = row.reply_text?.trim()

    if (!aiProposed || !inbound || !humanApproved) continue

    examples.push({ inbound, aiProposed, humanApproved, edited: humanApproved !== aiProposed })
  }

  // Edited examples first (strongest signal), otherwise keep newest-first order.
  const ordered = [
    ...examples.filter((example) => example.edited),
    ...examples.filter((example) => !example.edited),
  ]

  return ordered.slice(0, limit).map(({ inbound, aiProposed, humanApproved }) => ({ inbound, aiProposed, humanApproved }))
}

/**
 * A contact's most recent approved replies as few-shot style examples. Uses the
 * caller's request-scoped client (RLS: reply_jobs / ai_reply_suggestions /
 * inbox_items are all member-readable in-workspace). Best-effort — a failure
 * here must never block reply generation, so the caller catches.
 */
export async function listContactReplyExamples(
  supabase: SupabaseClient,
  workspaceId: string,
  contactId: string,
  limit = 3,
): Promise<ReplyStyleExample[]> {
  const { data, error } = await supabase
    .from('reply_jobs')
    .select('reply_text, created_at, ai_reply_suggestions!inner(suggested_text, source), inbox_items!inner(text)')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .in('status', ['sent', 'scheduled'])
    .eq('ai_reply_suggestions.source', 'ai')
    .order('created_at', { ascending: false })
    // Pull a few more than `limit` so the edited-first re-ordering has candidates.
    .limit(limit * 3)

  if (error) throw new Error(error.message)

  return buildStyleExamples((data ?? []) as unknown as ReplyExampleRow[], limit)
}
