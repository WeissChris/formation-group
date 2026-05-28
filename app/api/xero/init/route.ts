import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const STATE_COOKIE = 'xero_oauth_state'

/**
 * Generate a Xero OAuth init URL with a fresh CSRF-resistant `state` value.
 * The state is also written to an httpOnly cookie (10-min expiry) so the callback
 * can verify the response is for a flow this server actually started.
 *
 * GET /api/xero/init  →  { url: string }
 */
export async function GET(_request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_XERO_CLIENT_ID
  const redirectUri =
    process.env.NEXT_PUBLIC_XERO_REDIRECT_URI ||
    'https://formation-group.vercel.app/api/xero/callback'

  if (!clientId) {
    return NextResponse.json({ error: 'Xero not configured' }, { status: 500 })
  }

  // crypto-strong 32-byte random (vs Math.random which gives only ~52 bits of entropy)
  const state = randomBytes(32).toString('hex')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope:
      'accounting.transactions.read accounting.contacts.read accounting.settings.read offline_access',
    state,
  })

  const response = NextResponse.json({ url: `${XERO_AUTH_URL}?${params.toString()}` })
  response.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  })
  return response
}
