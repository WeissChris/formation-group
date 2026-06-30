import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  verifySupervisorPasscode,
  createSiteSessionCookieValue,
  SITE_SESSION_COOKIE,
  SITE_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/siteAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

// Node runtime for node:crypto (scrypt).
export const runtime = 'nodejs'

/** POST /api/site/login { supervisorId, passcode } -> sets fg_site_session cookie. */
export async function POST(request: NextRequest) {
  const rl = rateLimit(`site-login:${clientIp(request)}`, 10, 5 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  let body: { supervisorId?: unknown; passcode?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }
  if (typeof body.supervisorId !== 'string' || typeof body.passcode !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  const { data } = await supabaseAdmin
    .from('fg_supervisors')
    .select('id, name, passcode_hash')
    .eq('id', body.supervisorId)
    .maybeSingle()

  // Generic 401 either way — don't reveal whether the supervisor exists or the passcode was wrong.
  if (!data || !verifySupervisorPasscode(body.passcode, data.passcode_hash as string | null)) {
    return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true, name: data.name })
  response.cookies.set({
    name: SITE_SESSION_COOKIE,
    value: createSiteSessionCookieValue(data.id as string, data.name as string),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SITE_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
