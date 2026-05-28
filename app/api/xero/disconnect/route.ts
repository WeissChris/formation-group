import { NextRequest, NextResponse } from 'next/server'
import { clearTokens } from '@/lib/serverXero'

export const runtime = 'nodejs'

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
  const ok = await clearTokens()
  return NextResponse.json({ ok })
}
