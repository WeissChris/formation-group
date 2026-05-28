import { NextRequest, NextResponse } from 'next/server'
import { writeSnapshots, melbourneISODate, type SnapshotInput } from '@/lib/snapshots'

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
 * POST /api/snapshots/now
 *
 * Manual snapshot trigger. Accepts the computed LiveJobRows from the browser (where local
 * progress-claim data lives) and writes them to fg_project_snapshots.
 *
 * Why browser-side rather than server-side: progress claims are currently localStorage-only
 * (no Supabase mirror yet). The browser is the only place that can compute invoicedToDate.
 * Once progress claims sync to Supabase we can flip to a fully server-side snapshot route.
 *
 * Body: { snapshot_date?: string, inputs: SnapshotInput[] }
 * If snapshot_date is omitted, defaults to today in Australia/Melbourne.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  let body: { snapshot_date?: string; inputs?: SnapshotInput[] }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }

  if (!Array.isArray(body.inputs)) {
    return NextResponse.json({ ok: false, error: 'missing_inputs' }, { status: 400 })
  }

  const snapshotDate = (body.snapshot_date && /^\d{4}-\d{2}-\d{2}$/.test(body.snapshot_date))
    ? body.snapshot_date
    : melbourneISODate()

  const result = await writeSnapshots(body.inputs, snapshotDate)
  return NextResponse.json({ ...result, snapshot_date: snapshotDate }, { status: result.ok ? 200 : 502 })
}
