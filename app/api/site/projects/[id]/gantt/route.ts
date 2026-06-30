import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import type { GanttEntry } from '@/types'

export const runtime = 'nodejs'

/** GET /api/site/projects/[id]/gantt -> the project's Gantt entries (ownership-checked). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, entries: [] })

  const { data } = await supabaseAdmin.from('fg_gantt').select('*').eq('project_id', params.id)
  const entries: GanttEntry[] = (data || []).map(row => ({
    id: row.id as string,
    projectId: row.project_id as string,
    estimateId: row.estimate_id as string,
    category: row.category as string,
    crewType: row.crew_type as GanttEntry['crewType'],
    budgetedRevenue: Number(row.budgeted_revenue) || 0,
    budgetedCost: Number(row.budgeted_cost) || 0,
    segments: (row.segments as GanttEntry['segments']) || [],
    subtasks: (row.subtasks as GanttEntry['subtasks']) || [],
    notes: (row.notes as string | null) || undefined,
  }))
  return NextResponse.json({ ok: true, entries })
}

/**
 * POST /api/site/projects/[id]/gantt { entries } -> replace the project's Gantt rows (ownership-checked).
 * Mirrors lib/storageAsync.upsertGanttEntries: upsert-on-id then prune removed categories.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  let body: { entries?: GanttEntry[] }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }
  const entries = Array.isArray(body.entries) ? body.entries : []
  if (entries.length === 0) return NextResponse.json({ ok: true })  // never clobber to empty

  const stamp = new Date().toISOString()
  const rows = entries.map(e => ({
    id: e.id,
    project_id: params.id,
    estimate_id: e.estimateId || null,
    category: e.category,
    crew_type: e.crewType,
    budgeted_revenue: e.budgetedRevenue,
    budgeted_cost: e.budgetedCost,
    segments: e.segments ?? [],
    subtasks: e.subtasks ?? [],
    notes: e.notes ?? null,
    updated_at: stamp,
  }))
  const { error } = await supabaseAdmin.from('fg_gantt').upsert(rows, { onConflict: 'id' })
  if (error) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })

  const keep = new Set(entries.map(e => e.id))
  const { data: existing } = await supabaseAdmin.from('fg_gantt').select('id').eq('project_id', params.id)
  const removed = (existing ?? []).map(r => r.id as string).filter(rid => !keep.has(rid))
  if (removed.length) await supabaseAdmin.from('fg_gantt').delete().in('id', removed)
  return NextResponse.json({ ok: true })
}
