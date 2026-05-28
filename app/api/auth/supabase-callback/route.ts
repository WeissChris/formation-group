import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

/**
 * Supabase Auth handles its own session cookies via @supabase/ssr's createBrowserClient,
 * so for password-only sign-in we typically don't need a callback route. This endpoint
 * exists for completeness — it handles the OAuth code-exchange flow if you ever add
 * Google / Microsoft / magic-link sign-in.
 *
 * GET /api/auth/supabase-callback?code=...  →  exchange code, set cookies, redirect to `/`
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/'

  if (!code) return NextResponse.redirect(`${origin}/?auth=error&reason=no_code`)

  const supabase = getSupabaseServer()
  if (!supabase) return NextResponse.redirect(`${origin}/?auth=error&reason=not_configured`)

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/?auth=error&reason=exchange_failed`)

  return NextResponse.redirect(`${origin}${next}`)
}
