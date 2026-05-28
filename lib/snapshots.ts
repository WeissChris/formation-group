// Month-end snapshot logic — server-only.
//
// At month-end we freeze every active project's forecast row into fg_project_snapshots so
// fade tracking has data to draw on. The snapshot row is intentionally a strict subset of
// what the dashboard renders today; we don't store anything we couldn't reconstruct.
//
// Append-only — the unique constraint (project_id, snapshot_date) blocks duplicates if
// the cron retries.

import { supabaseAdmin } from './supabaseAdmin'
import type { LiveJobRow } from './liveJobs'

/**
 * Detect whether `date` (interpreted in Australia/Melbourne) is the last day of its month.
 *
 * The Vercel/GitHub Action cron fires in UTC. We're running a daily check and need to know
 * "is today the last day of the month in Melbourne". The trick: add a day in Melbourne local
 * time and see if the month rolls over.
 *
 * Implementation uses `Intl.DateTimeFormat` with the IANA tz so it handles DST shifts
 * correctly without needing a tz library.
 *
 * Exported for testability.
 */
export function isEndOfMonthInAEST(now: Date = new Date()): boolean {
  const todayMelb = melbourneYMD(now)
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowMelb = melbourneYMD(tomorrow)
  // Last day of month = today's month differs from tomorrow's month
  return todayMelb.month !== tomorrowMelb.month
}

/**
 * Return the YYYY-MM-DD string for `date` interpreted in Australia/Melbourne.
 * Used to date-stamp snapshots so they sit at the right month boundary regardless of when
 * the cron actually fires (which is UTC).
 */
export function melbourneISODate(date: Date = new Date()): string {
  const { year, month, day } = melbourneYMD(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function melbourneYMD(date: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const parts = fmt.formatToParts(date)
  let year = 0, month = 0, day = 0
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value)
    else if (p.type === 'month') month = Number(p.value)
    else if (p.type === 'day') day = Number(p.value)
  }
  return { year, month, day }
}

export interface SnapshotInput {
  /** Computed LiveJobRow for the project — same shape the dashboard renders */
  row: LiveJobRow
  /** Per-account cost-by-code map at snapshot time. Frozen into JSONB so a year-later
   *  audit can see exactly which Xero accounts contributed. */
  costByAccount: Record<string, number>
}

export interface SnapshotResult {
  ok: boolean
  snapshotted: number
  skipped_duplicate: number
  error?: string
}

/**
 * Write a snapshot row per project at the given snapshot_date.
 *
 * Duplicates (project_id, snapshot_date) are silently skipped — the unique constraint will
 * reject them. Returns counts so the cron can log {snapshotted: N, skipped_duplicate: M}.
 */
export async function writeSnapshots(
  inputs: SnapshotInput[],
  snapshotDate: string,
): Promise<SnapshotResult> {
  if (!supabaseAdmin) {
    return { ok: false, snapshotted: 0, skipped_duplicate: 0, error: 'supabase_admin_not_configured' }
  }
  if (inputs.length === 0) {
    return { ok: true, snapshotted: 0, skipped_duplicate: 0 }
  }

  const rows = inputs.map(({ row, costByAccount }) => ({
    project_id: row.projectId,
    snapshot_date: snapshotDate,
    forecast_revenue: row.forecastRevenue,
    invoiced_to_date: row.invoicedToDate,
    cost_to_date: row.costToDate,
    forecast_final_cost: row.forecastFinalCost,
    forecast_gp_dollars: row.forecastGpDollars,
    forecast_gp_pct: row.forecastGpPct,
    quoted_margin_pct: row.quotedMarginPct,
    target_margin_pct: row.targetMarginPct,
    status: row.status,
    cost_by_account: costByAccount,
  }))

  let snapshotted = 0
  let skipped = 0

  // Insert one-at-a-time so duplicate-key errors only affect the offending row, not the batch
  for (const r of rows) {
    const { error } = await supabaseAdmin.from('fg_project_snapshots').insert(r)
    if (error) {
      // Postgres unique-violation = code 23505
      if (error.code === '23505') {
        skipped++
        continue
      }
      // Real error — abort and surface
      return { ok: false, snapshotted, skipped_duplicate: skipped, error: error.message }
    }
    snapshotted++
  }

  return { ok: true, snapshotted, skipped_duplicate: skipped }
}
