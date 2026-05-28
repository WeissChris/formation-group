import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/lib/xeroCostSync'

export const runtime = 'nodejs'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/**
 * POST /api/xero/sync-now
 *
 * Trigger a full Xero cost pull. Same-origin gated. Returns the SyncResult
 * with bills_processed / projects_updated counts. Idempotent — running twice
 * just refreshes the cache twice.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const result = await runFullSync('manual')
  if (!result.ok) {
    return NextResponse.json(result, { status: 502 })
  }
  return NextResponse.json(result)
}
