import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import type { WeeklyRevenue } from '@/types'

export const runtime = 'nodejs'

/** GET /api/site/projects/[id]/revenue -> the project's weekly revenue rows (forecast seed). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, rows: [] })
  const { data } = await supabaseAdmin.from('fg_revenue').select('*').eq('project_id', params.id)
  return NextResponse.json({ ok: true, rows: data ?? [] })
}

/**
 * POST /api/site/projects/[id]/revenue { rows } -> replace the project's Gantt-generated forecast rows.
 * Mirrors lib/storageAsync.replaceGanttRevenueRemote: delete the prior "(Gantt)"-tagged rows (manual
 * rows untouched), then insert the fresh forecast. This is how the foreman's schedule edits move the
 * office's revenue + cost forecast.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  let body: { rows?: WeeklyRevenue[] }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }
  const rows = Array.isArray(body.rows) ? body.rows : []

  const { data: existing } = await supabaseAdmin.from('fg_revenue').select('id, notes').eq('project_id', params.id)
  const staleIds = (existing ?? [])
    .filter(r => ((r.notes as string | null) ?? '').trim().endsWith('(Gantt)'))
    .map(r => r.id as string)
  if (staleIds.length > 0) await supabaseAdmin.from('fg_revenue').delete().in('id', staleIds)

  if (rows.length > 0) {
    const mapped = rows.map(r => ({
      id: r.id,
      project_id: r.projectId,
      project_name: r.projectName,
      entity: r.entity,
      week_ending: r.weekEnding,
      week_number: r.weekNumber,
      planned_revenue: r.plannedRevenue,
      actual_invoiced: r.actualInvoiced,
      scheduled_cost: r.scheduledCost ?? null,
      is_deposit: r.isDeposit,
      notes: r.notes,
      updated_at: r.updatedAt ?? new Date().toISOString(),
    }))
    const { error } = await supabaseAdmin.from('fg_revenue').insert(mapped)
    if (error) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
