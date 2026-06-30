import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import type { WeeklyActual } from '@/types'

export const runtime = 'nodejs'

/** GET /api/site/projects/[id]/actuals -> the project's weekly cost actuals (ownership-checked). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, actuals: [] })

  const { data } = await supabaseAdmin.from('fg_actuals').select('*').eq('project_id', params.id)
  const actuals: WeeklyActual[] = (data || []).map(row => ({
    id: row.id as string,
    projectId: row.project_id as string,
    category: row.category as string,
    weekEnding: row.week_ending as string,
    supplyCost: Number(row.supply_cost) || 0,
    labourCost: Number(row.labour_cost) || 0,
    notes: (row.notes as string | null) || undefined,
  }))
  return NextResponse.json({ ok: true, actuals })
}

/**
 * POST /api/site/projects/[id]/actuals -> log a weekly cost actual (ownership-checked).
 * Body: { category, weekEnding, supplyCost, labourCost, notes? }.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  let b: { category?: unknown; weekEnding?: unknown; supplyCost?: unknown; labourCost?: unknown; notes?: unknown }
  try { b = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }
  if (typeof b.category !== 'string' || typeof b.weekEnding !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }
  const row = {
    id: randomUUID(),
    project_id: params.id,
    category: b.category,
    week_ending: b.weekEnding,
    supply_cost: Number(b.supplyCost) || 0,
    labour_cost: Number(b.labourCost) || 0,
    notes: typeof b.notes === 'string' ? b.notes : '',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabaseAdmin.from('fg_actuals').insert(row)
  if (error) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
