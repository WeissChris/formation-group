import { NextRequest, NextResponse } from 'next/server'
import { checkDirectorKey } from '@/lib/directorGate'
import { runCompanyPnlSync } from '@/lib/xeroPnlSync'

export const runtime = 'nodejs'
// First run backfills 24 monthly report pulls at ~1.2s each - allow margin.
export const maxDuration = 300

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
 * POST /api/company/pnl/sync
 *
 * Director-gated manual trigger for the company P&L pull (the cron also runs it via
 * /api/cron/xero-sync?task=pnl).
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  const gate = checkDirectorKey(request)
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })

  const result = await runCompanyPnlSync()
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
