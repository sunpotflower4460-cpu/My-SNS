import type { SupabaseClient } from '@supabase/supabase-js'

const USAGE_INCIDENT_LOOKBACK_HOURS = 24

/**
 * Recent successful AI calls whose usage ledger write failed. Further paid AI
 * must fail closed until an operator investigates, or spend is undercounted.
 */
export async function hasUnrecordedAiUsageIncident(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - USAGE_INCIDENT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('workspace_id', workspaceId)
    .in('action', ['draft_ai_generated', 'inbox_reply_ai_generated', 'schedule_ai_extracted'])
    .contains('metadata', { usageRecorded: false })
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}
