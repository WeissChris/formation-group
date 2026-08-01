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

export interface CloseoutRow {
  projectId: string
  entity: string
  name: string
  closedAt: string
  finalRevenue: number
  invoicedTotal: number
  finalCost: number
  finalGpPct: number
  quotedMarginPct: number
  costBasis: 'xero' | 'estimate'
}

/** GET /api/projects/closeouts - completed-job final results, newest first. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, closeouts: [], configured: false })

  const { data, error } = await supabaseAdmin
    .from('fg_project_closeouts')
    .select('*')
    .order('closed_at', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 })

  const closeouts: CloseoutRow[] = (data ?? []).map(r => ({
    projectId: r.project_id as string,
    entity: r.entity as string,
    name: r.name as string,
    closedAt: String(r.closed_at).slice(0, 10),
    finalRevenue: Number(r.final_revenue) || 0,
    invoicedTotal: Number(r.invoiced_total) || 0,
    finalCost: Number(r.final_cost) || 0,
    finalGpPct: Number(r.final_gp_pct) || 0,
    quotedMarginPct: Number(r.quoted_margin_pct) || 0,
    costBasis: (r.cost_basis as 'xero' | 'estimate') || 'estimate',
  }))
  return NextResponse.json({ ok: true, closeouts, configured: true })
}
