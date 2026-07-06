import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { emptyHandoverData, handoverProgress, type HandoverData } from '@/lib/handoverChecklist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The pre-handover walkthrough state (Blue Tape audit). One blob per project; the checklist
// content itself lives in the repo. Session-gated like every /api/site route.

function mapRow(row: Record<string, unknown> | null) {
  if (!row) return { data: emptyHandoverData(), signedOffBy: null, signedOffAt: null }
  const d = (row.data as Partial<HandoverData>) || {}
  return {
    data: {
      items: d.items && typeof d.items === 'object' ? d.items : {},
      subbieTasks: Array.isArray(d.subbieTasks) ? d.subbieTasks : [],
      plantLog: Array.isArray(d.plantLog) ? d.plantLog : [],
    } as HandoverData,
    signedOffBy: (row.signed_off_by as string | null) ?? null,
    signedOffAt: (row.signed_off_at as string | null) ?? null,
    updatedAt: row.updated_at as string | undefined,
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, checklist: mapRow(null) })

  const { data } = await supabaseAdmin.from('fg_handover_checklists').select('*').eq('project_id', params.id).maybeSingle()
  return NextResponse.json({ ok: true, checklist: mapRow(data) })
}

/** POST { data } -> replace the checklist blob; { signOff: true } -> stamp sign-off (or
 *  { signOff: false } to withdraw it while items are being rectified). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { data?: HandoverData; signOff?: boolean }
  const patch: Record<string, unknown> = {
    project_id: params.id, updated_by: session.name, updated_at: new Date().toISOString(),
  }
  if (body.data && typeof body.data === 'object') {
    patch.data = {
      items: body.data.items && typeof body.data.items === 'object' ? body.data.items : {},
      subbieTasks: Array.isArray(body.data.subbieTasks) ? body.data.subbieTasks.slice(0, 50) : [],
      plantLog: Array.isArray(body.data.plantLog) ? body.data.plantLog.slice(0, 100) : [],
    }
  }
  const { data: existing } = await supabaseAdmin.from('fg_handover_checklists')
    .select('project_id, data').eq('project_id', params.id).maybeSingle()

  if (body.signOff === true) {
    // Hard gate: the walkthrough can't be signed off until every checklist item is ticked.
    // Enforced server-side so a stale client can't slip through.
    const effective = (patch.data ?? existing?.data ?? emptyHandoverData()) as HandoverData
    const hp = handoverProgress(effective)
    if (hp.done < hp.total) {
      return NextResponse.json({ ok: false, error: 'items_outstanding', done: hp.done, total: hp.total }, { status: 409 })
    }
    patch.signed_off_by = session.name
    patch.signed_off_at = new Date().toISOString()
  }
  if (body.signOff === false) { patch.signed_off_by = null; patch.signed_off_at = null }

  const { error } = existing
    ? await supabaseAdmin.from('fg_handover_checklists').update(patch).eq('project_id', params.id)
    : await supabaseAdmin.from('fg_handover_checklists').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
