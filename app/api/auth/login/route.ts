import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, createSessionCookieValue, SESSION_COOKIE, COOKIE_MAX_AGE_SECONDS } from '@/lib/serverAuth'

// Force the Node.js runtime so `node:crypto` (scrypt) is available; the default edge runtime
// only exposes Web Crypto.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
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
