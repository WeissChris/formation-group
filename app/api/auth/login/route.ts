import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSessionCookieValue, SESSION_COOKIE, COOKIE_MAX_AGE_SECONDS } from '@/lib/serverAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'

// Force the Node.js runtime so `node:crypto` (scrypt) is available; the default edge runtime
// only exposes Web Crypto.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // Throttle password attempts per IP — blunts online brute-force and the scrypt-CPU DOS of hammering
  // this route. 10 / 5 min is generous for a human, tight for a script. (Best-effort per instance.)
  const rl = rateLimit(`login:${clientIp(request)}`, 10, 5 * 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
  }

  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }
  if (typeof body.password !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  if (!verifyPassword(body.password)) {
    return NextResponse.json({ ok: false, error: 'invalid_password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionCookieValue(),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
