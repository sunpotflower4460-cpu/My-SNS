import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        // Rebuild the response so the refreshed cookies are forwarded to the
        // route handlers / server components on this same request, not only set
        // on the browser. A response created before setAll snapshots the old
        // request headers.
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        // Cache-Control etc. from @supabase/ssr: a response that carries a
        // refreshed session must never be cached and served to someone else.
        Object.entries(headers ?? {}).forEach(([key, value]) => supabaseResponse.headers.set(key, value))
      },
    },
  })

  // Refresh session if expired
  await supabase.auth.getUser()

  return supabaseResponse
}
