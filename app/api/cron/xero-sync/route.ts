import { NextRequest, NextResponse } from 'next/server'
import { runFullSync } from '@/lib/xeroCostSync'

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

  const result = await runFullSync('cron_hourly')

  // Treat the "nothing to do yet" cases as 200-skipped, not 502-failed:
  //   - no_xero_tokens                  → Xero not connected yet via Settings page
  //   - supabase_admin_not_configured   → SUPABASE_SERVICE_ROLE_KEY not set
  // These are normal pre-setup states. Returning 502 makes GitHub Actions email a failure
  // notification every hour until setup is done — annoying and unactionable. A 200 with
  // skipped:true keeps the run green while still surfacing the reason in the response body.
  const KNOWN_SKIP_REASONS = new Set(['no_xero_tokens', 'supabase_admin_not_configured'])
  if (!result.ok && result.error && KNOWN_SKIP_REASONS.has(result.error)) {
    return NextResponse.json({ ...result, skipped: true }, { status: 200 })
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
