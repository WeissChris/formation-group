import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { CompanyBudget } from '@/lib/companyBudget'

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

function mapBudget(r: Record<string, unknown>): CompanyBudget {
  return {
    fyStartYear: Number(r.fy_start_year),
    revenueTargetFormation: Number(r.revenue_target_formation) || 0,
    revenueTargetLume: Number(r.revenue_target_lume) || 0,
    revenueTargetDesign: Number(r.revenue_target_design) || 0,
    gpTargetPct: Number(r.gp_target_pct) || 0,
    overheadBudgetMonthly: Number(r.overhead_budget_monthly) || 0,
    updatedAt: r.updated_at as string,
  }
}

/** GET /api/company/budget?fy=2026 - the stored budget for that FY (null when unset). */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, budget: null, configured: false })

  const fy = Number(new URL(request.url).searchParams.get('fy'))
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) {
    return NextResponse.json({ ok: false, error: 'invalid_fy' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.from('fg_company_budget').select('*').eq('fy_start_year', fy).maybeSingle()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 })
  return NextResponse.json({ ok: true, budget: data ? mapBudget(data) : null, configured: true })
}

/** PUT /api/company/budget - upsert one FY's budget. Body: CompanyBudget. */
export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'supabase_admin_not_configured' }, { status: 503 })

  let body: Partial<CompanyBudget>
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }
  const fy = Number(body.fyStartYear)
  if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) {
    return NextResponse.json({ ok: false, error: 'invalid_fy' }, { status: 400 })
  }
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

  const { error } = await supabaseAdmin.from('fg_company_budget').upsert({
    fy_start_year: fy,
    revenue_target_formation: num(body.revenueTargetFormation),
    revenue_target_lume: num(body.revenueTargetLume),
    revenue_target_design: num(body.revenueTargetDesign),
    gp_target_pct: num(body.gpTargetPct) || 40,
    overhead_budget_monthly: num(body.overheadBudgetMonthly),
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 })
  return NextResponse.json({ ok: true })
}
