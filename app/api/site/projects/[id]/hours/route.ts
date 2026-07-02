import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { isLabourAccount } from '@/lib/labour'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/hours -> the project's Xero-sourced actuals for the Scorecard:
 *   - totalHours/weeks: REAL logged labour hours from timesheets (fg_xero_project_hours).
 *   - supplyCost: supply-type spend to date from the cost feed (fg_xero_project_costs, the
 *     authoritative GP rollup) - every direct-cost account EXCEPT production labour and
 *     subcontractors. (The subbie lever measures COMMITTED packages, not spend; labour is hours.)
 * Both are null when nothing is synced, so the Scorecard falls back instead of showing a false 0.
 * Ownership enforced (project.foreman === session name).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [hoursRes, costsRes] = await Promise.all([
    supabaseAdmin
      .from('fg_xero_project_hours')
      .select('week_ending, hours')
      .eq('project_id', params.id)
      .order('week_ending', { ascending: true }),
    supabaseAdmin
      .from('fg_xero_project_costs')
      .select('account_name, amount_ex_gst')
      .eq('project_id', params.id),
  ])

  const weeks = (hoursRes.data ?? []).map(r => ({ weekEnding: r.week_ending as string, hours: Number(r.hours) || 0 }))
  const totalHours = weeks.length ? Math.round(weeks.reduce((s, w) => s + w.hours, 0) * 100) / 100 : null

  const costRows = costsRes.data ?? []
  const supplyRows = costRows.filter(r => {
    const name = (r.account_name as string) || ''
    return !isLabourAccount(name) && !/subcontract/i.test(name)
  })
  const supplyCost = costRows.length
    ? Math.round(supplyRows.reduce((s, r) => s + (Number(r.amount_ex_gst) || 0), 0) * 100) / 100
    : null

  return NextResponse.json({ ok: true, totalHours, weeks, supplyCost })
}
