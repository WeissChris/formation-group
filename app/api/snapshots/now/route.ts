import { NextRequest, NextResponse } from 'next/server'
import { writeSnapshots, melbourneISODate, type SnapshotInput } from '@/lib/snapshots'
import { captureServerSnapshots } from '@/lib/serverSnapshots'

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
 * Manual snapshot trigger. The server computes the Live Jobs rows itself from Supabase
 * (projects, estimates and progress claims all sync there now) and writes them to
 * fg_project_snapshots - including the per-account cost map the old browser path could
 * never fill in. The cron's extras task runs the same capture daily; this endpoint exists
 * for the dashboard's "Snapshot now" button and its once-a-day auto-fire.
 *
 * Body: { snapshot_date?: string, inputs?: SnapshotInput[] }
 * If snapshot_date is omitted, defaults to today in Australia/Melbourne.
 * The legacy browser path (explicit `inputs` rows) is still accepted so an old tab that
 * hasn't reloaded keeps working; new clients send no inputs.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  let body: { snapshot_date?: string; inputs?: SnapshotInput[] }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }

  if (Array.isArray(body.inputs)) {
    const snapshotDate = (body.snapshot_date && /^\d{4}-\d{2}-\d{2}$/.test(body.snapshot_date))
      ? body.snapshot_date
      : melbourneISODate()
    const result = await writeSnapshots(body.inputs, snapshotDate)
    return NextResponse.json({ ...result, snapshot_date: snapshotDate }, { status: result.ok ? 200 : 502 })
  }

  const result = await captureServerSnapshots()
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
