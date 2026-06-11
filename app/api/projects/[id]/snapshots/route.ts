import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
 * GET /api/projects/:id/snapshots
 *
 * Month/day-stamped forecast snapshots for the project (fg_project_snapshots) — the fade history
 * ("GP was 38% then, 35% now"). Service-role read, same-origin gated.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ snapshots: [] }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ snapshots: [] })
  }

  const { data } = await supabaseAdmin
    .from('fg_project_snapshots')
    .select('snapshot_date, forecast_revenue, invoiced_to_date, cost_to_date, forecast_final_cost, forecast_gp_pct, quoted_margin_pct, target_margin_pct, status')
    .eq('project_id', params.id)
    .order('snapshot_date', { ascending: true })

  const snapshots = (data || []).map(r => ({
    snapshot_date: r.snapshot_date as string,
    forecast_revenue: Number(r.forecast_revenue) || 0,
    invoiced_to_date: Number(r.invoiced_to_date) || 0,
    cost_to_date: Number(r.cost_to_date) || 0,
    forecast_final_cost: Number(r.forecast_final_cost) || 0,
    forecast_gp_pct: Number(r.forecast_gp_pct) || 0,
    quoted_margin_pct: r.quoted_margin_pct != null ? Number(r.quoted_margin_pct) : null,
    target_margin_pct: r.target_margin_pct != null ? Number(r.target_margin_pct) : null,
    status: r.status as 'on_target' | 'watch' | 'below_target',
  }))

  return NextResponse.json({ snapshots })
}
