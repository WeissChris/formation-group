import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapIncident } from '@/lib/safetyDocs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/** GET /api/safety/incidents -> every incident (office triage), newest first, with project names. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [incRes, projRes] = await Promise.all([
    supabaseAdmin.from('sf_incidents').select('*').order('occurred_at', { ascending: false }).limit(200),
    supabaseAdmin.from('fg_projects').select('id, name'),
  ])
  const names = new Map((projRes.data ?? []).map(p => [p.id as string, p.name as string]))
  const incidents = (incRes.data ?? []).map(r => ({ ...mapIncident(r), projectName: names.get(r.project_id as string) || '' }))
  return NextResponse.json({ ok: true, incidents })
}

/** PATCH /api/safety/incidents { id, status?, worksafeNotified? } -> triage updates. */
export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { id?: string; status?: string; worksafeNotified?: boolean }
  if (!body.id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.status === 'open' || body.status === 'closed') patch.status = body.status
  if (typeof body.worksafeNotified === 'boolean') patch.worksafe_notified = body.worksafeNotified
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'nothing_to_update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('sf_incidents').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
