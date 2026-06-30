import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import type { Milestone } from '@/lib/storageAsync'

export const runtime = 'nodejs'

/** GET /api/site/projects/[id]/milestones -> the project's gantt milestones (seed). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, milestones: [] })
  const { data } = await supabaseAdmin.from('fg_gantt_milestones').select('milestones').eq('project_id', params.id).maybeSingle()
  return NextResponse.json({ ok: true, milestones: (data?.milestones as Milestone[]) ?? [] })
}

/** POST /api/site/projects/[id]/milestones { milestones } -> upsert (ownership-checked). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  let body: { milestones?: Milestone[] }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }
  const { error } = await supabaseAdmin.from('fg_gantt_milestones').upsert({
    project_id: params.id,
    milestones: Array.isArray(body.milestones) ? body.milestones : [],
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
