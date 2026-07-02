// Xero labour-HOURS sync - server-only.
//
// Pulls AU Payroll TIMESHEETS from Xero, attributes each line's daily hours to a project via
// the SAME fg_project_xero_mapping tracking options the cost feed uses (timesheet lines carry
// TrackingItemID - the payroll probe proved 186/187 lines are job-tagged), buckets them by
// week-ending Friday, and replace-per-project writes fg_xero_project_hours.
//
// WHY hours and not $: real pay rates vary per staff member while the costed rate is a fixed
// $68/hr, so deriving hours from labour $ / rate gives wrong hours. The timesheet units ARE the
// logged hours. Consumers: the /site Scorecard labour lever ("hours used vs allowed"), later the
// office Position tab.
//
// Run from the hourly cron AFTER the cost sync, throttled to ~daily (timesheets are entered
// weekly; a full pull pages the whole timesheet history). NEVER imported from a client component.

import { supabaseAdmin } from './supabaseAdmin'
import { getValidTokens } from './serverXero'

const PAYROLL_BASE = 'https://api.xero.com/payroll.xro/1.0'

// Only weeks in this window are written - hours matter for ACTIVE jobs, and the window keeps
// the table (and the replace-per-project delete) bounded.
const HOURS_LOOKBACK_MONTHS = 18

/** Minimal timesheet shape (AU Payroll v1). NumberOfUnits is usually a per-day array starting
 *  at StartDate; older/simple lines can carry a scalar. */
export interface XeroTimesheet {
  TimesheetID?: string
  StartDate?: string   // "/Date(ms)/" wire format
  EndDate?: string
  Status?: string      // DRAFT | PROCESSED | APPROVED - all are logged time, all count
  TimesheetLines?: XeroTimesheetLine[]
  Lines?: XeroTimesheetLine[]
}
export interface XeroTimesheetLine {
  EarningsRateID?: string
  TrackingItemID?: string
  NumberOfUnits?: number[] | number
}

/** Row written to fg_xero_project_hours. */
export interface ProjectHoursRow {
  project_id: string
  week_ending: string   // YYYY-MM-DD Friday
  hours: number
}

export interface HoursSyncResult {
  ok: boolean
  timesheets_processed: number
  lines_matched: number
  projects_updated: number
  rows_written: number
  skipped?: boolean     // throttle window - nothing pulled
  error?: string
}

/** Convert Xero's "/Date(1716115200000+0000)/" wire format to "YYYY-MM-DD" (UTC). */
export function parseXeroMsDate(raw: string | undefined): string | null {
  if (!raw) return null
  const match = raw.match(/\/Date\((-?\d+)/)
  if (match) return new Date(parseInt(match[1], 10)).toISOString().slice(0, 10)
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Snap YYYY-MM-DD to its week-ending Friday (same rule as the cost feed / revenue calendar). */
export function weekEndingFriday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const day = d.getDay()                 // 0 Sun .. 6 Sat
  const diff = day === 6 ? -1 : 5 - day  // Sat -> back to Fri; Sun-Thu -> forward to Fri; Fri stays
  d.setDate(d.getDate() + diff)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dd}`
}

/**
 * Aggregate timesheets into per-project week-ending-Friday hour buckets.
 *
 * A line's NumberOfUnits array is day-indexed from the timesheet's StartDate, so each day's
 * hours land in ITS week - a fortnightly timesheet straddling two weeks splits correctly. A
 * scalar NumberOfUnits (no per-day detail) lands on the timesheet's END date's week. Lines
 * without a mapped TrackingItemID are skipped (not job-tagged = not attributable). Weeks
 * ending before `sinceIso` are dropped.
 *
 * Pure + exported for testing.
 */
export function aggregateTimesheetHours(
  timesheets: XeroTimesheet[],
  projectByTrackingId: Map<string, string>,
  sinceIso: string,
): { rows: ProjectHoursRow[]; linesMatched: number } {
  const acc = new Map<string, { project_id: string; week_ending: string; hours: number }>()
  let linesMatched = 0

  for (const ts of timesheets) {
    const startIso = parseXeroMsDate(ts.StartDate)
    const endIso = parseXeroMsDate(ts.EndDate) || startIso
    if (!startIso) continue
    const lines = ts.TimesheetLines || ts.Lines || []
    for (const line of lines) {
      const projectId = line.TrackingItemID ? projectByTrackingId.get(line.TrackingItemID) : undefined
      if (!projectId) continue
      const units = line.NumberOfUnits
      const dayHours: Array<{ iso: string; hours: number }> = []
      if (Array.isArray(units)) {
        units.forEach((u, i) => {
          const h = Number(u) || 0
          if (h > 0) dayHours.push({ iso: addDaysIso(startIso, i), hours: h })
        })
      } else {
        const h = Number(units) || 0
        if (h > 0 && endIso) dayHours.push({ iso: endIso, hours: h })
      }
      if (dayHours.length === 0) continue
      linesMatched++
      for (const dh of dayHours) {
        const we = weekEndingFriday(dh.iso)
        if (we < sinceIso) continue
        const key = `${projectId}|${we}`
        const ex = acc.get(key)
        if (ex) ex.hours += dh.hours
        else acc.set(key, { project_id: projectId, week_ending: we, hours: dh.hours })
      }
    }
  }

  const rows = Array.from(acc.values()).map(r => ({ ...r, hours: Math.round(r.hours * 100) / 100 }))
  return { rows, linesMatched }
}

/**
 * Page through recent AU Payroll timesheets (100/page, capped, 429-aware - mirrors fetchBills).
 *
 * `modifiedSince` is CRITICAL: the endpoint pages the ENTIRE timesheet history oldest-first
 * (back to 2015 here), and paging it all inside sync-now blew Vercel's 300s maxDuration - the
 * function was killed before any hour rows were written. If-Modified-Since cuts the pull to
 * timesheets touched in the window (they're entered weekly, so modified ~= worked); a month of
 * buffer over the lookback covers late entries. Weeks outside the lookback are filtered in
 * aggregation regardless.
 */
async function fetchTimesheets(accessToken: string, tenantId: string, modifiedSince: Date): Promise<XeroTimesheet[]> {
  const collected: XeroTimesheet[] = []
  let page = 1
  let retries = 0
  while (page <= 60) {
    const resp = await fetch(`${PAYROLL_BASE}/Timesheets?page=${page}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        Accept: 'application/json',
        'If-Modified-Since': modifiedSince.toUTCString(),
      },
    })
    if (resp.status === 304) break   // nothing modified in the window
    if (resp.status === 429) {
      if (retries >= 2) throw new Error('rate_limited')
      retries++
      const retryAfter = parseInt(resp.headers.get('retry-after') || '60', 10)
      await new Promise(r => setTimeout(r, (retryAfter + 5) * 1000))
      continue
    }
    retries = 0
    if (!resp.ok) throw new Error(`Xero Timesheets page ${page} failed: ${resp.status}`)
    const data = await resp.json()
    const items: XeroTimesheet[] = data.Timesheets || []
    if (items.length === 0) break
    collected.push(...items)
    if (items.length < 100) break
    page++
    await new Promise(r => setTimeout(r, 1200))   // polite - Xero payroll limit is 60 calls/min
  }
  return collected
}

/**
 * Full hours sync. `force` skips the ~daily throttle (the manual Sync button). Throttle: if the
 * newest pulled_at in fg_xero_project_hours is under 20h old, skip - timesheets are entered
 * weekly, and a full pull pages the entire timesheet history.
 */
export async function runHoursSync(force = false): Promise<HoursSyncResult> {
  const empty = { timesheets_processed: 0, lines_matched: 0, projects_updated: 0, rows_written: 0 }
  if (!supabaseAdmin) return { ok: false, ...empty, error: 'supabase_admin_not_configured' }

  try {
    if (!force) {
      const { data: last } = await supabaseAdmin
        .from('fg_xero_project_hours')
        .select('pulled_at')
        .order('pulled_at', { ascending: false })
        .limit(1)
      const stamp = last?.[0]?.pulled_at as string | undefined
      if (stamp && (Date.now() - new Date(stamp).getTime()) / 3_600_000 < 20) {
        return { ok: true, ...empty, skipped: true }
      }
    }

    const tokens = await getValidTokens('formation')
    if (!tokens) return { ok: false, ...empty, error: 'no_xero_tokens' }

    // Timesheet lines carry the tracking OPTION UUID directly (TrackingItemID), so the option-ID
    // map alone is enough - no name fallback needed (that's a bulk-Invoices quirk).
    const { data: mappingRows } = await supabaseAdmin
      .from('fg_project_xero_mapping')
      .select('project_id, tracking_option_id')
    const projectByTrackingId = new Map<string, string>()
    for (const row of mappingRows || []) {
      if (row.tracking_option_id) projectByTrackingId.set(row.tracking_option_id as string, row.project_id as string)
    }
    if (projectByTrackingId.size === 0) return { ok: true, ...empty }

    const since = new Date()
    since.setMonth(since.getMonth() - HOURS_LOOKBACK_MONTHS)
    const sinceIso = since.toISOString().slice(0, 10)
    const modifiedSince = new Date(since)
    modifiedSince.setMonth(modifiedSince.getMonth() - 1)   // buffer for late-entered timesheets

    const timesheets = await fetchTimesheets(tokens.accessToken, tokens.tenantId, modifiedSince)
    const { rows, linesMatched } = aggregateTimesheetHours(timesheets, projectByTrackingId, sinceIso)

    // Replace-per-project (mirrors the cost feed): delete each updated project's rows, insert fresh.
    const projects = Array.from(new Set(rows.map(r => r.project_id)))
    if (projects.length > 0) {
      await supabaseAdmin.from('fg_xero_project_hours').delete().in('project_id', projects)
      await supabaseAdmin.from('fg_xero_project_hours')
        .insert(rows.map(r => ({ ...r, pulled_at: new Date().toISOString() })))
    }

    return {
      ok: true,
      timesheets_processed: timesheets.length,
      lines_matched: linesMatched,
      projects_updated: projects.length,
      rows_written: rows.length,
    }
  } catch (err) {
    return { ok: false, ...empty, error: err instanceof Error ? err.message : 'unknown_error' }
  }
}
