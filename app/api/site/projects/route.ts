import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom } from '@/lib/siteServer'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects -> the session supervisor's own active projects (cards).
 * Scoped by foreman name; only planning/active jobs (finished work drops off the cockpit).
 */
export async function GET(request: NextRequest) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, projects: [] })

  // Office/admin sees every live job; a supervisor sees only their own (foreman name match).
  let query = supabaseAdmin
    .from('fg_projects')
    .select('id, name, address, client_name, status, start_date, planned_completion, stage')
    .in('status', ['planning', 'active'])
  if (!session.office) query = query.eq('foreman', session.name)
  const { data } = await query

  const projects = (data || []).map(r => ({
    id: r.id as string,
    name: r.name as string,
    address: (r.address as string) || '',
    clientName: (r.client_name as string) || '',
    status: r.status as string,
    startDate: (r.start_date as string) || '',
    plannedCompletion: (r.planned_completion as string) || '',
    stage: (r.stage as string) || null,
  }))
  return NextResponse.json({ ok: true, projects })
}
