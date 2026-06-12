import { NextRequest, NextResponse } from 'next/server'
import { saveTokens, getTokens, type XeroEntity } from '@/lib/serverXero'

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

  // The init route prefixed `state` with the entity (`formation.<hex>` / `lume.<hex>`).
  const entity: XeroEntity = state.split('.')[0] === 'lume' ? 'lume' : 'formation'

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
    const list: Array<{ tenantId?: string; tenantName?: string }> = Array.isArray(connections) ? connections : []

    // Formation and Lume are different Xero orgs, but the app can be authorised to several tenants at
    // once and /connections lists them all — so don't just take [0]. Prefer a tenant NOT already linked
    // to the other entity, then refuse to save the SAME org for both (that means the wrong org was
    // authorised — e.g. the browser was signed into the other org's Xero account).
    const otherEntity: XeroEntity = entity === 'lume' ? 'formation' : 'lume'
    const other = await getTokens(otherEntity)
    const candidates = other?.tenantId ? list.filter(c => c.tenantId !== other.tenantId) : list
    const tenant = candidates[0] ?? list[0]

    if (!tenant?.tenantId) {
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=no_tenant`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }
    if (other?.tenantId && tenant.tenantId === other.tenantId) {
      // The only org authorised is the one already linked to the other entity — don't clobber it.
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=same_org`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }

    // Persist tokens server-side. Previous version embedded tokens in the redirect URL
    // (history/referrer/log leakage) AND stored them in localStorage (XSS-readable).
    // Now tokens never touch the client — only connection status is exposed.
    const saved = await saveTokens(entity, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (Number(tokenData.expires_in) * 1000),
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName || (entity === 'lume' ? 'Lume Pools' : 'Formation Landscapes'),
    })

    if (!saved) {
      const reject = NextResponse.redirect(`${appUrl}/settings?xero=error&reason=storage`)
      reject.cookies.delete(STATE_COOKIE)
      return reject
    }

    const success = NextResponse.redirect(`${appUrl}/settings?xero=success&entity=${entity}`)
    success.cookies.delete(STATE_COOKIE)
    return success
  } catch {
    const reject = NextResponse.redirect(`${appUrl}/settings?xero=error`)
    reject.cookies.delete(STATE_COOKIE)
    return reject
  }
}
