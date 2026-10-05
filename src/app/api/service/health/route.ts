import { NextResponse } from 'next/server'
import { getPublishingStrategy } from '@/lib/channels/config'
import { ARTIST_OS_CONTRACT_VERSION, mySnsCapabilities } from '@/lib/service/artist-os-status'
import pkg from '../../../../../package.json'

// Unauthenticated by design: no secrets, no tenant data. It only reports whether
// this deployment is configured to serve Artist OS, so a misconfiguration shows
// up as `degraded` instead of looking healthy.
export const dynamic = 'force-dynamic'

export async function GET() {
  const serviceKeyConfigured = Boolean(process.env.SUPABASE_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
  const artistOsConfigured = Boolean(
    process.env.ARTIST_OS_SERVICE_TOKEN?.trim() && process.env.ARTIST_OS_WORKSPACE_ID?.trim() && process.env.NEXT_PUBLIC_APP_URL?.trim(),
  )
  const ready = serviceKeyConfigured && artistOsConfigured
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
  return NextResponse.json(
    {
      contractVersion: ARTIST_OS_CONTRACT_VERSION,
      service: 'my-sns',
      version: sha ? `${pkg.version}+${sha}` : pkg.version,
      status: ready ? 'healthy' : 'degraded',
      ...(ready ? {} : { degradedReason: 'Artist OS service access is not fully configured (token, workspace binding, app URL or Supabase service key).' }),
      capabilities: mySnsCapabilities({ publishingStrategy: getPublishingStrategy(), serviceKeyConfigured: ready }),
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
