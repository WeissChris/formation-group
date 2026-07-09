import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { sanitizeZones, type IrrigationZone } from '@/lib/irrigationPlan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The foreman's marked-up irrigation plan. The plan image sits in the project-plans bucket at
// <id>/irrigation/plan.png (a signed upload URL is minted so large PDFs never hit Vercel's body
// limit); this row holds its dimensions + the zones. Session-gated like every /api/site route.
const BUCKET = 'project-plans'
const planKey = (id: string) => `${id}/irrigation/plan.png`

async function guard(request: NextRequest, id: string): Promise<NextResponse | null> {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  return null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad
  const { data } = await supabaseAdmin!.from('fg_handover_irrigation').select('*').eq('project_id', params.id).maybeSingle()
  let planUrl = ''
  if (data?.plan_path) {
    const signed = await supabaseAdmin!.storage.from(BUCKET).createSignedUrl(data.plan_path as string, 3600)
    planUrl = signed.data?.signedUrl ?? ''
  }
  return NextResponse.json({
    ok: true,
    planUrl,
    planW: (data?.plan_w as number) || 0,
    planH: (data?.plan_h as number) || 0,
    zones: sanitizeZones(data?.zones),
  })
}

/**
 * POST body:
 *   { action: 'uploadUrl' }                       -> a signed upload URL for the plan image
 *   { zones, planW, planH }  (save, the default)  -> replace zones + dimensions, stamp plan_path
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad
  const body = await request.json().catch(() => ({})) as
    { action?: string; zones?: IrrigationZone[]; planW?: number; planH?: number }

  if (body.action === 'uploadUrl') {
    const { data, error } = await supabaseAdmin!.storage.from(BUCKET).createSignedUploadUrl(planKey(params.id), { upsert: true })
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
    return NextResponse.json({ ok: true, path: data.path, token: data.token })
  }

  const session = siteSessionFrom(request)!
  const patch: Record<string, unknown> = {
    project_id: params.id,
    zones: sanitizeZones(body.zones),
    plan_path: planKey(params.id),
    updated_by: session.name,
    updated_at: new Date().toISOString(),
  }
  if (Number(body.planW) > 0) patch.plan_w = Math.round(Number(body.planW))
  if (Number(body.planH) > 0) patch.plan_h = Math.round(Number(body.planH))

  const { data: existing } = await supabaseAdmin!.from('fg_handover_irrigation').select('project_id').eq('project_id', params.id).maybeSingle()
  const { error } = existing
    ? await supabaseAdmin!.from('fg_handover_irrigation').update(patch).eq('project_id', params.id)
    : await supabaseAdmin!.from('fg_handover_irrigation').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE -> remove the plan image + clear the row (start over). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad
  await supabaseAdmin!.storage.from(BUCKET).remove([planKey(params.id)])
  await supabaseAdmin!.from('fg_handover_irrigation').delete().eq('project_id', params.id)
  return NextResponse.json({ ok: true })
}
