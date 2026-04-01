import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { refreshToken } = await request.json()

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 400 })
  }

  try {
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Refresh failed' }, { status: 401 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
