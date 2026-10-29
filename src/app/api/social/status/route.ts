import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConnectionSetupStatus } from '@/lib/services/connectors/platform-status'

// Tells the Settings screen which platforms can actually start an OAuth
// connection in this environment. Signed-in users only; returns env var names
// and booleans, never values.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 })
  }

  return NextResponse.json(getConnectionSetupStatus(), { headers: { 'Cache-Control': 'no-store' } })
}
