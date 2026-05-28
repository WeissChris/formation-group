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
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
