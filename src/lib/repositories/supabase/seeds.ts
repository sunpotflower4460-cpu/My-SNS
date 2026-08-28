import type {
  Asset,
  AssetAspectRatio,
  AssetMediaRole,
  BrandProfile,
  PublishingChannel,
  Seed,
  SeedKind,
  SeedStatus,
} from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/client'

interface AssetRow {
  id: string
  workspace_id: string
  seed_id?: string
  name: string
  url: string
  storage_path?: string | null
  type: Asset['type']
  size: number
  uploaded_by: string
  created_at: string
  aspect_ratio?: AssetAspectRatio | null
  media_role?: AssetMediaRole | null
  source_asset_id?: string | null
}

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

export interface SeedRow {
  id: string
  workspace_id: string
  title: string
  source_text?: string | null
  kind: SeedKind
  status: SeedStatus
  goal?: string | null
  audience?: string | null
  key_points?: string[] | null
  call_to_action?: string | null
  target_channels?: PublishingChannel[] | null
  brand_profile_id?: string | null
  tags?: string[] | null
  created_by: string
  created_at: string
  updated_at: string
  creator?: unknown
  brand_profile?: unknown
}

function firstRelation<T>(value: unknown): T | undefined {
  if (Array.isArray(value)) return value[0] as T | undefined
  return value as T | undefined
}

function mapBrandProfile(row?: BrandProfileRow): BrandProfile | undefined {
  if (!row) return undefined

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

export function mapSeed(row: SeedRow): Seed {
  const creator = firstRelation<Record<string, string | null>>(row.creator)
  const brandProfile = mapBrandProfile(firstRelation<BrandProfileRow>(row.brand_profile))

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    sourceText: row.source_text ?? undefined,
    kind: row.kind,
    status: row.status,
    goal: row.goal ?? undefined,
    audience: row.audience ?? undefined,
    keyPoints: row.key_points ?? [],
    callToAction: row.call_to_action ?? undefined,
    targetChannels: row.target_channels ?? [],
    brandProfileId: row.brand_profile_id ?? undefined,
    tags: row.tags ?? [],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: creator?.id ? {
      id: creator.id,
      email: creator.email ?? '',
      name: creator.name ?? '',
      avatarUrl: creator.avatar_url ?? undefined,
      createdAt: creator.created_at ?? row.created_at,
    } : undefined,
    brandProfile,
  }
}

export const SEED_SELECT = `
  *,
  creator:profiles(*),
  brand_profile:brand_profiles(*)
`

async function resolveAssetUrls(rows: AssetRow[]): Promise<Asset[]> {
  const storagePaths = rows.flatMap((row) => row.storage_path ? [row.storage_path] : [])
  const signedUrlByPath = new Map<string, string>()

  if (storagePaths.length > 0) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from('assets').createSignedUrls(storagePaths, 60 * 60)

    if (error) {
      throw new Error(`アセットの署名URLを発行できませんでした。空のURLとして扱わず、再読み込みしてください: ${error.message}`)
    }

    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) signedUrlByPath.set(entry.path, entry.signedUrl)
    }

    const missing = storagePaths.filter((path) => !signedUrlByPath.has(path))
    if (missing.length > 0) {
      throw new Error(
        `アセットの署名URLを一部発行できませんでした（${missing.length}件）。空のURLとして扱わず、再読み込みしてください。`,
      )
    }
  }

  return rows.map((asset) => ({
    id: asset.id,
    workspaceId: asset.workspace_id,
    seedId: asset.seed_id,
    name: asset.name,
    url: asset.storage_path ? signedUrlByPath.get(asset.storage_path) ?? '' : asset.url,
    storagePath: asset.storage_path ?? undefined,
    type: asset.type,
    size: asset.size,
      uploadedBy: asset.uploaded_by,
      createdAt: asset.created_at,
      aspectRatio: asset.aspect_ratio ?? undefined,
      mediaRole: asset.media_role ?? undefined,
      sourceAssetId: asset.source_asset_id ?? undefined,
    }))
}

export async function listWorkspaceSeeds(workspaceId: string): Promise<Seed[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('seeds')
    .select(SEED_SELECT)
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`シードを読み込めませんでした。空の一覧として扱わず、再読み込みしてください: ${error.message}`)
  }

  return (data ?? []).map((seed) => mapSeed(seed as SeedRow))
}

export async function getSeedById(workspaceId: string, seedId: string): Promise<Seed | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('seeds')
    .select(SEED_SELECT)
    .eq('id', seedId)
    .eq('workspace_id', workspaceId)
    .single()

  if (error || !data) {
    console.error('Error fetching Seed:', error)
    return null
  }

  return mapSeed(data as SeedRow)
}

export interface CreateSeedInput {
  workspaceId: string
  createdBy: string
  title: string
  sourceText: string
  kind: SeedKind
  status: SeedStatus
  goal?: string
  audience?: string
  keyPoints: string[]
  callToAction?: string
  targetChannels: PublishingChannel[]
  brandProfileId: string
  tags: string[] | string
}

export async function createSeed(params: CreateSeedInput): Promise<Seed> {
  const supabase = createClient()
  const tags = typeof params.tags === 'string'
    ? params.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : params.tags

  const { data, error } = await supabase
    .from('seeds')
    .insert({
      workspace_id: params.workspaceId,
      created_by: params.createdBy,
      title: params.title.trim(),
      source_text: params.sourceText.trim() || null,
      kind: params.kind,
      status: params.status,
      goal: params.goal?.trim() || null,
      audience: params.audience?.trim() || null,
      key_points: params.keyPoints,
      call_to_action: params.callToAction?.trim() || null,
      target_channels: params.targetChannels,
      brand_profile_id: params.brandProfileId,
      tags,
    })
    .select(SEED_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapSeed(data as SeedRow)
}

export type SeedPatch = Partial<Pick<
  Seed,
  | 'title'
  | 'sourceText'
  | 'kind'
  | 'status'
  | 'goal'
  | 'audience'
  | 'keyPoints'
  | 'callToAction'
  | 'targetChannels'
  | 'brandProfileId'
  | 'tags'
>>

export async function updateSeed(workspaceId: string, seedId: string, patch: SeedPatch): Promise<Seed> {
  const supabase = createClient()
  const updates: Record<string, unknown> = {}

  if (patch.title !== undefined) updates.title = patch.title.trim()
  if (patch.sourceText !== undefined) updates.source_text = patch.sourceText.trim() || null
  if (patch.kind !== undefined) updates.kind = patch.kind
  if (patch.status !== undefined) updates.status = patch.status
  if (patch.goal !== undefined) updates.goal = patch.goal.trim() || null
  if (patch.audience !== undefined) updates.audience = patch.audience.trim() || null
  if (patch.keyPoints !== undefined) updates.key_points = patch.keyPoints
  if (patch.callToAction !== undefined) updates.call_to_action = patch.callToAction.trim() || null
  if (patch.targetChannels !== undefined) updates.target_channels = patch.targetChannels
  if (patch.brandProfileId !== undefined) updates.brand_profile_id = patch.brandProfileId
  if (patch.tags !== undefined) updates.tags = patch.tags

  const { data, error } = await supabase
    .from('seeds')
    .update(updates)
    .eq('id', seedId)
    .eq('workspace_id', workspaceId)
    .select(SEED_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return mapSeed(data as SeedRow)
}

export async function listSeedAssets(workspaceId: string, seedId: string): Promise<Asset[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('seed_id', seedId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`シードのアセットを読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
  }

  return resolveAssetUrls((data ?? []) as AssetRow[])
}

export async function listWorkspaceAssets(workspaceId: string): Promise<Asset[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`アセットを読み込めませんでした。空として扱わず、再読み込みしてください: ${error.message}`)
  }

  return resolveAssetUrls((data ?? []) as AssetRow[])
}
