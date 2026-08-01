import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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

export interface PortfolioTrendPoint {
  date: string           // snapshot_date
  gpPct: number          // revenue-weighted forecast GP% across snapshotted jobs that day
  jobs: number
}

/** GET /api/snapshots/portfolio - the company-wide GP% series from the daily fade snapshots. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, points: [], configured: false })

  const { data, error } = await supabaseAdmin
    .from('fg_project_snapshots')
    .select('snapshot_date, forecast_revenue, forecast_gp_dollars')
    .order('snapshot_date', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 })

  const byDate = new Map<string, { rev: number; gp: number; jobs: number }>()
  for (const r of data ?? []) {
    const d = String(r.snapshot_date).slice(0, 10)
    if (!byDate.has(d)) byDate.set(d, { rev: 0, gp: 0, jobs: 0 })
    const slot = byDate.get(d)!
    slot.rev += Number(r.forecast_revenue) || 0
    slot.gp += Number(r.forecast_gp_dollars) || 0
    slot.jobs++
  }
  const points: PortfolioTrendPoint[] = Array.from(byDate.entries())
    .filter(([, v]) => v.rev > 0)
    .map(([date, v]) => ({ date, gpPct: Math.round((v.gp / v.rev) * 1000) / 10, jobs: v.jobs }))
  return NextResponse.json({ ok: true, points, configured: true })
}
