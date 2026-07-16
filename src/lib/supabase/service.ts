import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only, RLS-bypassing client for the publish Worker. It has to see
// and update every workspace's due jobs, not just one user's — never import
// this from a client component or an API route that isn't itself gated by
// CRON_SECRET.
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase service credentials. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY')
  }

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
