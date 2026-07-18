import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandProfile, BrandProfileInput } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface BrandProfileRow {
  id: string
  workspace_id: string
  name: string
  description?: string | null
  audience?: string | null
  voice_traits?: string[] | null
  values?: string[] | null
  preferred_terms?: string[] | null
  avoided_terms?: string[] | null
  default_call_to_action?: string | null
  language: string
  is_default: boolean
  created_by: string
  created_at: string
  updated_at: string
}

function mapBrandProfile(row: BrandProfileRow): BrandProfile {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description ?? undefined,
    audience: row.audience ?? undefined,
    voiceTraits: row.voice_traits ?? [],
    values: row.values ?? [],
    preferredTerms: row.preferred_terms ?? [],
    avoidedTerms: row.avoided_terms ?? [],
    defaultCallToAction: row.default_call_to_action ?? undefined,
    language: row.language,
    isDefault: row.is_default,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * The workspace's default Brand Profile (or its first, or null), fetched with a
 * caller-provided client — used server-side (API routes) where the browser
 * client isn't available. Mirrors how the app-provider derives defaultBrandProfile.
 */
export async function getDefaultBrandProfileForClient(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<BrandProfile | null> {
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? mapBrandProfile(data as BrandProfileRow) : null
}

export async function listWorkspaceBrandProfiles(workspaceId: string): Promise<BrandProfile[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching Brand Profiles:', error)
    return []
  }

  return (data ?? []).map((row) => mapBrandProfile(row as BrandProfileRow))
}

export async function saveBrandProfile(params: {
  workspaceId: string
  createdBy: string
  profileId?: string
  input: BrandProfileInput
}): Promise<BrandProfile> {
  const supabase = createClient()
  const values = {
    name: params.input.name.trim(),
    description: params.input.description?.trim() || null,
    audience: params.input.audience?.trim() || null,
    voice_traits: params.input.voiceTraits,
    values: params.input.values,
    preferred_terms: params.input.preferredTerms,
    avoided_terms: params.input.avoidedTerms,
    default_call_to_action: params.input.defaultCallToAction?.trim() || null,
    language: params.input.language.trim(),
  }

  const query = params.profileId
    ? supabase
        .from('brand_profiles')
        .update(values)
        .eq('id', params.profileId)
        .eq('workspace_id', params.workspaceId)
    : supabase
        .from('brand_profiles')
        .insert({
          ...values,
          workspace_id: params.workspaceId,
          created_by: params.createdBy,
          is_default: true,
        })

  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)

  return mapBrandProfile(data as BrandProfileRow)
}
