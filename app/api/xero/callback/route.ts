import { NextRequest, NextResponse } from 'next/server'
import { saveTokens } from '@/lib/serverXero'

export const runtime = 'nodejs'

const STATE_COOKIE = 'xero_oauth_state'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app'

  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?xero=error`)
  }

  // CSRF guard — state must match the cookie set at init.
  const expectedState = request.cookies.get(STATE_COOKIE)?.value
  if (!state || !expectedState || state !== expectedState) {
    const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=csrf`)
    reject.cookies.delete(STATE_COOKIE)
    return reject
  }

  try {
    // `.trim()` on every env value — Vercel UI sometimes carries trailing whitespace/newlines
    // through copy-paste; those get URL-encoded as %0D%0A and Xero rejects with the unhelpful
    // "unauthorized_client - Unknown client" error.
    const clientId = (process.env.NEXT_PUBLIC_XERO_CLIENT_ID || '').trim()
    const clientSecret = (process.env.XERO_CLIENT_SECRET || '').trim()
    const redirectUri = (
      process.env.NEXT_PUBLIC_XERO_REDIRECT_URI
        || 'https://formation-group.vercel.app/api/xero/callback'
    ).trim()

    if (!clientId || !clientSecret) {
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=misconfigured`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }

    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }

    const tokenData = await tokenResponse.json()

    const connectionsResponse = await fetch('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    })
    const connections = await connectionsResponse.json()
    const tenant = Array.isArray(connections) ? connections[0] : undefined

    if (!tenant?.tenantId) {
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=no_tenant`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }

    // Persist tokens server-side. Previous version embedded tokens in the redirect URL
    // (history/referrer/log leakage) AND stored them in localStorage (XSS-readable).
    // Now tokens never touch the client — only connection status is exposed.
    const saved = await saveTokens({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (Number(tokenData.expires_in) * 1000),
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName || 'Formation Landscapes',
    })

    if (!saved) {
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=storage`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }

    const success = NextResponse.redirect(`${appUrl}/settings?xero=success`)
    success.cookies.delete(STATE_COOKIE)
    return success
  } catch {
    const reject = NextResponse.redirect(`${appUrl}/settings?xero=error`)
    reject.cookies.delete(STATE_COOKIE)
    return reject
  }
}
