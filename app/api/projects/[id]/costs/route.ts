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

/**
 * GET /api/projects/:id/costs
 *
 * Returns the cached Xero cost rollup for the project, plus any forecast overrides:
 *   {
 *     costs: [{ account_code, account_name, amount_ex_gst, bill_count, last_bill_date, pulled_at, forecast_final?, comment? }],
 *     cost_to_date: <sum>,
 *     mapped: <bool>,
 *     last_pulled_at: <iso>,
 *   }
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ costs: [], cost_to_date: 0, mapped: false }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ costs: [], cost_to_date: 0, mapped: false })
  }

  const projectId = params.id

  const [{ data: costs }, { data: mapping }, { data: forecasts }] = await Promise.all([
    supabaseAdmin
      .from('fg_xero_project_costs')
      .select('*')
      .eq('project_id', projectId)
      .order('amount_ex_gst', { ascending: false }),
    supabaseAdmin
      .from('fg_project_xero_mapping')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabaseAdmin
      .from('fg_project_cost_forecast')
      .select('*')
      .eq('project_id', projectId),
  ])

  const forecastByAccount = new Map<string, { forecast_final: number | null; comment: string | null }>()
  for (const f of forecasts || []) {
    forecastByAccount.set(f.account_code as string, {
      forecast_final: f.forecast_final != null ? Number(f.forecast_final) : null,
      comment: (f.comment as string | null) ?? null,
    })
  }

  const enriched = (costs || []).map(c => {
    const f = forecastByAccount.get(c.account_code as string)
    return {
      account_code: c.account_code,
      account_name: c.account_name,
      amount_ex_gst: Number(c.amount_ex_gst),
      bill_count: c.bill_count,
      last_bill_date: c.last_bill_date,
      pulled_at: c.pulled_at,
      forecast_final: f?.forecast_final ?? null,
      comment: f?.comment ?? null,
    }
  })

  const costToDate = enriched.reduce((sum, c) => sum + c.amount_ex_gst, 0)
  const lastPulledAt = enriched[0]?.pulled_at ?? null

  return NextResponse.json({
    costs: enriched,
    cost_to_date: Math.round(costToDate * 100) / 100,
    mapped: !!mapping,
    mapping: mapping ?? null,
    last_pulled_at: lastPulledAt,
  })
}
