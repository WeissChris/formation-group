import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/lib/xeroCostSync'
import { runHoursSync } from '@/lib/xeroHoursSync'

export const runtime = 'nodejs'
// 24-month backfill can take ~90s; allow margin (matches the cron route).
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
  // Labour HOURS from payroll timesheets - additive and isolated: a failure here never affects
  // the cost result. Manual sync forces past the ~daily throttle.
  const hours = await runHoursSync(true).catch(e => ({
    ok: false as const, timesheets_processed: 0, lines_matched: 0, projects_updated: 0, rows_written: 0,
    error: e instanceof Error ? e.message : 'hours_sync_failed',
  }))
  if (!result.ok) {
    return NextResponse.json({ ...result, hours }, { status: 502 })
  }
  return NextResponse.json({ ...result, hours })
}
