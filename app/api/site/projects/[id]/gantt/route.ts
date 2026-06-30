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
