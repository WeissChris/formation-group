import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { CompanyPnlMonth } from '@/lib/companyPnl'

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
 * GET /api/company/pnl
 *
 * The stored company monthly P&L rows, oldest first - the only route in the app that serves
 * overheads / net profit. Behind the single office login like every other office API
 * (same-origin guard; the separate DIRECTOR_ACCESS_KEY gate was dropped at Chris's call -
 * one login for everything).
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'supabase_admin_not_configured' }, { status: 503 })

  const { data, error } = await supabaseAdmin
    .from('fg_company_pnl_months')
    .select('*')
    .order('month', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 })

  const months: CompanyPnlMonth[] = (data ?? []).map(r => ({
    month: String(r.month).slice(0, 10),
    entity: r.entity as CompanyPnlMonth['entity'],
    revenue: Number(r.revenue) || 0,
    costOfSales: Number(r.cost_of_sales) || 0,
    grossProfit: Number(r.gross_profit) || 0,
    overheads: Number(r.overheads) || 0,
    netProfit: Number(r.net_profit) || 0,
    overheadsByAccount: (r.overheads_by_account as Record<string, number>) || {},
    pulledAt: r.pulled_at as string,
  }))
  return NextResponse.json({ ok: true, months })
}
