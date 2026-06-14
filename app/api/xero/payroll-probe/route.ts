import { NextRequest, NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/serverXero'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAYROLL_BASE = 'https://api.xero.com/payroll.xro/1.0'

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
 * GET /api/xero/payroll-probe  (Formation only, same-origin, diagnostic — not user-facing)
 *
 * One-off verification step for the labour-hours feature. Fetches recent AU Payroll timesheets and
 * reports STRUCTURAL info only — counts, distinct tracking/earnings IDs (UUIDs), total hours, the
 * shape of one line. NO employee names, NO pay dollars. The point is to confirm timesheet lines are
 * tagged with the job's tracking option before building the per-job hours pull: it returns the
 * distinct tracking IDs seen on timesheet lines AND the project→tracking-option mapping the cost
 * feed uses, plus their overlap. Non-empty overlap ⇒ we can attribute hours per job directly.
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const tokens = await getValidTokens('formation')
  if (!tokens) return NextResponse.json({ error: 'not_connected' }, { status: 401 })

  let resp: Response
  try {
    resp = await fetch(`${PAYROLL_BASE}/Timesheets`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        Accept: 'application/json',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'fetch_failed', detail: String(e) }, { status: 502 })
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    // 403 here usually means the payroll scope wasn't granted on the reconnect.
    return NextResponse.json({ error: 'xero_error', status: resp.status, body: body.slice(0, 600) }, { status: 200 })
  }

  const data = await resp.json()
  const timesheets: Array<Record<string, unknown>> = data.Timesheets || []

  const trackingIds = new Set<string>()
  const earningsRateIds = new Set<string>()
  let lineCount = 0
  let linesWithTracking = 0
  let hoursTotal = 0
  const dates: string[] = []

  for (const ts of timesheets) {
    if (ts.StartDate) dates.push(String(ts.StartDate))
    if (ts.EndDate) dates.push(String(ts.EndDate))
    const lines = (ts.TimesheetLines || ts.Lines || []) as Array<Record<string, unknown>>
    for (const line of lines) {
      lineCount++
      const trackId = (line.TrackingItemID || line.TrackingOptionID) as string | undefined
      if (trackId) { trackingIds.add(trackId); linesWithTracking++ }
      if (line.EarningsRateID) earningsRateIds.add(String(line.EarningsRateID))
      const units = line.NumberOfUnits
      hoursTotal += Array.isArray(units)
        ? units.reduce((s: number, n: unknown) => s + (Number(n) || 0), 0)
        : (Number(units) || 0)
    }
  }

  // Compare to the project→tracking-option mapping (accounting tracking) the cost feed uses.
  let mappingOptionIds: string[] = []
  if (supabaseAdmin) {
    const { data: maps } = await supabaseAdmin.from('fg_project_xero_mapping').select('tracking_option_id')
    mappingOptionIds = (maps || []).map((m: { tracking_option_id: string }) => m.tracking_option_id)
  }
  const trackingIdList = Array.from(trackingIds)
  const sortedDates = [...dates].sort()
  const firstLine = (timesheets[0]?.TimesheetLines || timesheets[0]?.Lines || []) as Array<Record<string, unknown>>

  return NextResponse.json({
    ok: true,
    timesheetCount: timesheets.length,
    lineCount,
    linesWithTracking,
    hoursTotal,
    distinctTrackingIds: trackingIdList,
    distinctEarningsRateIds: Array.from(earningsRateIds),
    mappingTrackingOptionIds: mappingOptionIds,
    trackingOverlapWithMapping: trackingIdList.filter(id => mappingOptionIds.includes(id)),
    dateRangeRaw: sortedDates.length ? { min: sortedDates[0], max: sortedDates[sortedDates.length - 1] } : null,
    sampleTimesheetKeys: timesheets[0] ? Object.keys(timesheets[0]) : [],
    sampleLine: firstLine[0] ?? null,
  })
}
