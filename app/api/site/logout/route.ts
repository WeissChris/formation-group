import { NextResponse } from 'next/server'
import { SITE_SESSION_COOKIE } from '@/lib/siteAuth'

export const runtime = 'nodejs'

/** POST /api/site/logout -> clears the supervisor session cookie. */
export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({ name: SITE_SESSION_COOKIE, value: '', httpOnly: true, path: '/', maxAge: 0 })
  return response
}
