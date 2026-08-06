import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/lib/xeroCostSync'
import { runHoursSync } from '@/lib/xeroHoursSync'
import { runSafetyChase } from '@/lib/safetyChase'
import { runProgressSnapshots } from '@/lib/runProgressSnapshots'
import { captureServerSnapshots } from '@/lib/serverSnapshots'
import { runCompanyPnlSync } from '@/lib/xeroPnlSync'
import { runCloseoutBackstop } from '@/lib/serverCloseouts'
import { runSalesSync } from '@/lib/xeroSalesSync'

export const runtime = 'nodejs'
// Vercel function timeout — initial 24-month backfill can take ~60-90s. Allow margin.
export const maxDuration = 300

/**
 * POST /api/cron/xero-sync
 *
 * Cron-only endpoint. Triggered by the .github/workflows/xero-sync.yml hourly schedule.
 * Authorised by a shared secret in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * If CRON_SECRET isn't set in the environment, the endpoint refuses all requests
 * (defensive: an unset secret would otherwise let anyone trigger pulls).
 */
export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: 'cron_not_configured' }, { status: 503 })
  }

  const auth = request.headers.get('authorization') || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : ''
  if (!provided || provided !== expectedSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  // SPLIT INVOCATION (?task=extras): the combined cost sync + timesheet pull + compliance chase
  // intermittently blew Vercel's 300s ceiling (504 Runtime Timeout - a single Xero 429 backoff
  // sleeps ~65s, and stacking three Xero-bound jobs left no headroom). The GitHub workflow now
  // calls this endpoint twice: once for the cost sync, once with ?task=extras for the
  // timesheet-hours pull + subbie compliance chase - each invocation well under the limit.
  const task = new URL(request.url).searchParams.get('task')

  // Company monthly P&L pull (?task=pnl) - its own invocation, like extras: the first run
  // backfills 24 report calls (~30-60s) and must not eat into the cost sync's window.
  if (task === 'pnl') {
    const result = await runCompanyPnlSync().catch(e => ({
      ok: false as const, months_pulled: 0, months_skipped: 0, unmatched_rows: 0,
      error: e instanceof Error ? e.message : 'company_pnl_sync_failed',
    }))
    const PNL_SKIP_REASONS = new Set(['no_xero_tokens', 'supabase_admin_not_configured', 'rate_limited'])
    if (!result.ok && result.error && PNL_SKIP_REASONS.has(result.error)) {
      return NextResponse.json({ ...result, skipped: true }, { status: 200 })
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  }

  if (task === 'extras') {
    const hours = await runHoursSync().catch(e => ({
      ok: false as const, timesheets_processed: 0, lines_matched: 0, projects_updated: 0, rows_written: 0,
      error: e instanceof Error ? e.message : 'hours_sync_failed',
    }))
    const safetyChase = await runSafetyChase().catch(e => ({
      ok: false as const, checked: 0, contractor_emails: 0, office_alerts: 0, dry_run: true,
      error: e instanceof Error ? e.message : 'safety_chase_failed',
    }))
    // Safety-net progress snapshots for live jobs overdue a capture (invoice sends capture on their own).
    const snapshots = await runProgressSnapshots().catch(e => ({
      ok: false as const, checked: 0, captured: 0,
      error: e instanceof Error ? e.message : 'progress_snapshots_failed',
    }))
    // Daily GP-fade snapshot (fg_project_snapshots) - server-side, Supabase-only (no Xero calls),
    // deduped per (project, Melbourne date) so the twice-daily cron writes once. Replaces the
    // dashboard-open capture as the reliable heartbeat of the margin-trend history.
    const fadeSnapshots = await captureServerSnapshots().catch(e => ({
      ok: false as const, snapshotted: 0, skipped_duplicate: 0, projects: 0,
      snapshot_date: '', error: e instanceof Error ? e.message : 'fade_snapshots_failed',
    }))
    // Job closeout backstop: freeze the final result of any newly-completed project
    // (first run backfills every already-completed job).
    const closeouts = await runCloseoutBackstop().catch(e => ({
      ok: false as const, checked: 0, captured: 0,
      error: e instanceof Error ? e.message : 'closeouts_failed',
    }))
    // Sales (ACCREC) invoices - fills invoiced-to-date for pre-platform jobs.
    const sales = await runSalesSync().catch(e => ({
      ok: false as const, invoices_processed: 0, rows_written: 0, projects_updated: 0,
      error: e instanceof Error ? e.message : 'sales_sync_failed',
    }))
    // Pre-setup state: no service role key. Skip quietly like the cost sync does.
    const fadeOk = fadeSnapshots.ok || fadeSnapshots.error === 'supabase_admin_not_configured'
    const closeoutsOk = closeouts.ok || closeouts.error === 'supabase_admin_not_configured'
    const salesOk = sales.ok || sales.error === 'supabase_admin_not_configured' || sales.error === 'no_xero_tokens'
    const extrasOk = hours.ok && safetyChase.ok && snapshots.ok && fadeOk && closeoutsOk && salesOk
    return NextResponse.json({ ok: extrasOk, hours, safetyChase, snapshots, fadeSnapshots, closeouts, sales },
      { status: extrasOk ? 200 : 502 })
  }

  const result = await runFullSync('cron_hourly')

  // Treat the "nothing to do yet" cases as 200-skipped, not 502-failed:
  //   - no_xero_tokens                  → Xero not connected yet via Settings page
  //   - supabase_admin_not_configured   → SUPABASE_SERVICE_ROLE_KEY not set
  // These are normal pre-setup states. Returning 502 makes GitHub Actions email a failure
  // notification every hour until setup is done — annoying and unactionable. A 200 with
  // skipped:true keeps the run green while still surfacing the reason in the response body.
  // Transient / pre-setup states that shouldn't trigger a failure notification:
  //   no_xero_tokens                  → Xero not connected yet
  //   supabase_admin_not_configured   → SUPABASE_SERVICE_ROLE_KEY not set
  //   rate_limited                    → Xero 429; will auto-retry next hour with back-off
  const KNOWN_SKIP_REASONS = new Set(['no_xero_tokens', 'supabase_admin_not_configured', 'rate_limited'])
  if (!result.ok && result.error && KNOWN_SKIP_REASONS.has(result.error)) {
    return NextResponse.json({ ...result, skipped: true }, { status: 200 })
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
