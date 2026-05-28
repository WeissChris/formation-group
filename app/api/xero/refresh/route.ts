import { NextRequest, NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/serverXero'

export const runtime = 'nodejs'

/**
 * Trigger a Xero token refresh.
 *
 * Previous version: accepted any refresh token from the request body and exchanged it — an
 * open proxy for anyone with a stolen token. Now: reads the stored singleton row, refreshes
 * if expired, returns just `{ ok }`. The client never sees the tokens.
 *
 * Same-origin guard still in place as defence-in-depth even though tokens are no longer
 * accepted from the body — keeps off-origin abuse out of the proxy entirely.
 */
function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) {
    try { return new URL(origin).host === host } catch { return false }
  }
  if (referer) {
    try { return new URL(referer).host === host } catch { return false }
  }
  return false
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const tokens = await getValidTokens()
  if (!tokens) {
    return NextResponse.json({ ok: false, error: 'no_tokens_or_refresh_failed' }, { status: 401 })
  }
  // Return only safe status — never the tokens themselves
  return NextResponse.json({ ok: true, expiresAt: tokens.expiresAt })
}
