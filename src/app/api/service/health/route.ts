import { NextResponse } from 'next/server'
import { getPublishingStrategy } from '@/lib/channels/config'
import { ARTIST_OS_CONTRACT_VERSION, mySnsCapabilities } from '@/lib/service/artist-os-status'
import { resolveArtistOsMode } from '@/lib/service/artist-os-mode'
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
  const { mode, modeInvalid } = resolveArtistOsMode()
  const managed = mode === 'artist_os_managed'
  // In managed mode My-SNS sends external replies only through the Artist OS Action Ledger, so it must be configured.
  const ledgerConfigured = Boolean(process.env.ARTIST_OS_LEDGER_URL?.trim() && process.env.ARTIST_OS_LEDGER_TOKEN?.trim())
  const ready = serviceKeyConfigured && artistOsConfigured && !modeInvalid && (!managed || ledgerConfigured)
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12)
  return NextResponse.json(
    {
      contractVersion: ARTIST_OS_CONTRACT_VERSION,
      service: 'my-sns',
      version: sha ? `${pkg.version}+${sha}` : pkg.version,
      status: ready ? 'healthy' : 'degraded',
      ...(ready
        ? {}
        : {
            degradedReason: modeInvalid
              ? 'ARTIST_OS_MODE has an invalid value (treated as artist_os_managed).'
              : managed && !ledgerConfigured
                ? 'Managed mode: ARTIST_OS_LEDGER_URL / ARTIST_OS_LEDGER_TOKEN are not set, so external inbound replies fail closed.'
                : 'Artist OS service access is not fully configured (token, workspace binding, app URL or Supabase service key).',
          }),
      runtimeMode: mode,
      modeInvalid,
      ownership: {
        // LINE is the only surface My-SNS actually sends on; Instagram DM approval returns 409 and Instagram comment send is not wired.
        inboundReplyExecution: { line: true, instagram: false },
        // My-SNS receives its own Meta webhook in both modes; in managed mode it is THE canonical receiver.
        canonicalMetaWebhookReceiver: true,
      },
      capabilities: [
        ...mySnsCapabilities({ publishingStrategy: getPublishingStrategy(), serviceKeyConfigured: serviceKeyConfigured && artistOsConfigured }),
        'reply.line.dm.execute',
        ...(managed ? ['webhook.meta.canonical', 'inbox.inbound-events.read'] : []),
      ],
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
