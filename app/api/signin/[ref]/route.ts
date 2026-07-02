import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSafetySite, mapSiteBoard, normalisePhone, DEFAULT_BOARD_HAZARDS } from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The public QR sign-in API (no login - the QR on the site board opens /signin/[ref] which
 * calls this). Identity = name + phone; the site induction must be accepted on first visit.
 * Deliberately NO SMS OTP: the compliance value is the RECORD (who was inducted, who was on
 * site when), not phone-number proof - and requiring codes on a muddy site kills adoption.
 */

/** GET /api/signin/[ref]?phone= -> public site info + this person's induction/open-visit state. */
export async function GET(request: NextRequest, { params }: { params: { ref: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const { data: siteRow } = await supabaseAdmin.from('sf_sites').select('*').eq('short_ref', params.ref).maybeSingle()
  if (!siteRow) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const site = mapSafetySite(siteRow)
  if (site.status !== 'active') return NextResponse.json({ ok: false, error: 'site_inactive' }, { status: 410 })

  const { data: boardRow } = await supabaseAdmin.from('sf_site_boards').select('*').eq('site_id', site.id).maybeSingle()
  const board = boardRow ? mapSiteBoard(boardRow) : null
  const hazards = (board?.hazards?.length ? board.hazards : DEFAULT_BOARD_HAZARDS).filter(h => h.checked)

  const phone = normalisePhone(new URL(request.url).searchParams.get('phone') || '')
  let inducted = false
  let openVisitId: number | null = null
  if (phone) {
    const [indRes, visitRes] = await Promise.all([
      supabaseAdmin.from('sf_inductions').select('id').eq('site_id', site.id).eq('phone', phone).maybeSingle(),
      supabaseAdmin.from('sf_site_visits').select('id').eq('site_id', site.id).eq('phone', phone)
        .is('signed_out_at', null).order('signed_in_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    inducted = !!indRes.data
    openVisitId = visitRes.data ? Number(visitRes.data.id) : null
  }

  return NextResponse.json({
    ok: true,
    site: { shortRef: site.shortRef, address: site.address, entity: site.entity },
    // Induction content shown on first visit: emergency info + the hazards currently ticked.
    induction: {
      supervisor: board?.supervisorNameNumber || '',
      firstAider: board?.firstAider || '',
      firstAidContact: board?.firstAidContact || '',
      firstAidLocation: board?.firstAidLocation || '',
      assemblyArea: board?.assemblyArea || '',
      emergencySignal: board?.emergencySignal || '',
      nearestMedical: board?.nearestMedical || '',
      hazards,
    },
    inducted,
    openVisitId,
  })
}

/** POST /api/signin/[ref] { action: 'in'|'out', name, company, phone, role, acceptInduction? } */
export async function POST(request: NextRequest, { params }: { params: { ref: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const { data: siteRow } = await supabaseAdmin.from('sf_sites').select('*').eq('short_ref', params.ref).maybeSingle()
  if (!siteRow) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const site = mapSafetySite(siteRow)
  if (site.status !== 'active') return NextResponse.json({ ok: false, error: 'site_inactive' }, { status: 410 })

  const body = await request.json().catch(() => ({})) as {
    action?: 'in' | 'out'; name?: string; company?: string; phone?: string; role?: string; acceptInduction?: boolean
  }
  const name = (body.name || '').trim().slice(0, 120)
  const company = (body.company || '').trim().slice(0, 120)
  const phone = normalisePhone(body.phone || '')
  const role = body.role === 'visitor' ? 'visitor' : 'worker'
  if (!name || phone.length < 8) return NextResponse.json({ ok: false, error: 'name_and_phone_required' }, { status: 400 })

  if (body.action === 'out') {
    const { data: open } = await supabaseAdmin.from('sf_site_visits').select('id').eq('site_id', site.id)
      .eq('phone', phone).is('signed_out_at', null).order('signed_in_at', { ascending: false }).limit(1).maybeSingle()
    if (!open) return NextResponse.json({ ok: false, error: 'not_signed_in' }, { status: 409 })
    await supabaseAdmin.from('sf_site_visits').update({ signed_out_at: new Date().toISOString() }).eq('id', open.id)
    return NextResponse.json({ ok: true, signedOut: true })
  }

  // Sign IN: induction must exist (or be accepted right now) before the visit is recorded.
  const { data: induction } = await supabaseAdmin.from('sf_inductions').select('id').eq('site_id', site.id).eq('phone', phone).maybeSingle()
  if (!induction) {
    if (!body.acceptInduction) return NextResponse.json({ ok: false, error: 'induction_required' }, { status: 412 })
    const { error } = await supabaseAdmin.from('sf_inductions')
      .insert({ site_id: site.id, person_name: name, company, phone })
    if (error && !/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  // Dedupe: an open visit means they're already signed in - don't stack a second row.
  const { data: open } = await supabaseAdmin.from('sf_site_visits').select('id').eq('site_id', site.id)
    .eq('phone', phone).is('signed_out_at', null).limit(1).maybeSingle()
  if (open) return NextResponse.json({ ok: true, alreadyIn: true })

  const { error } = await supabaseAdmin.from('sf_site_visits')
    .insert({ site_id: site.id, person_name: name, company, phone, role })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, signedIn: true })
}
