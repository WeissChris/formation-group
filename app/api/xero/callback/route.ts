import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app'

  if (!code) {
    return NextResponse.redirect(`${appUrl}/settings?xero=error`)
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NEXT_PUBLIC_XERO_REDIRECT_URI || 'https://formation-group.vercel.app/settings/xero/callback',
      }),
    })

    if (!tokenResponse.ok) {
      return NextResponse.redirect(`${appUrl}/settings?xero=error`)
    }

    const tokenData = await tokenResponse.json()

    // Get tenant info
    const connectionsResponse = await fetch('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    })
    const connections = await connectionsResponse.json()
    const tenant = connections[0] // First connected org

    // Pass token data back to client via query params (client will store in localStorage)
    const params = new URLSearchParams({
      xero: 'success',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: String(tokenData.expires_in),
      tenant_id: tenant?.tenantId || '',
      tenant_name: tenant?.tenantName || 'Formation Landscapes',
    })

    return NextResponse.redirect(`${appUrl}/settings?${params.toString()}`)
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?xero=error`)
  }
}
