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
 * GET /api/projects/:id/cost-periods
 *
 * Time-phased Xero actual cost for the project (fg_xero_cost_periods): weekly supply buckets +
 * monthly labour buckets. Feeds the cumulative budget-vs-actual cost curve. Service-role read,
 * same-origin gated — mirrors /api/projects/:id/costs.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ periods: [], last_pulled_at: null }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ periods: [], last_pulled_at: null })
  }

  const { data } = await supabaseAdmin
    .from('fg_xero_cost_periods')
    .select('account_code, account_name, source, grain, period_end, amount_ex_gst, pulled_at')
    .eq('project_id', params.id)
    .order('period_end', { ascending: true })

  const periods = (data || []).map(r => ({
    account_code: r.account_code as string,
    account_name: (r.account_name as string | null) ?? null,
    source: r.source as 'supply' | 'labour',
    grain: r.grain as 'week' | 'month',
    period_end: r.period_end as string,
    amount_ex_gst: Number(r.amount_ex_gst) || 0,
  }))

  // Freshest pull stamp across all rows — NOT data[0], which is the OLDEST period (rows are ordered by
  // period_end), so it would report a sync from weeks ago.
  const lastPulledAt = (data || []).reduce<string | null>((max, r) => {
    const p = r.pulled_at as string | undefined
    return p && (!max || p > max) ? p : max
  }, null)

  return NextResponse.json({
    periods,
    last_pulled_at: lastPulledAt,
  })
}
