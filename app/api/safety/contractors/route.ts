import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapContractorCompany, mapPrequalDocument, companyCompliance } from '@/lib/safetyCompliance'

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

/** GET /api/safety/contractors -> companies + docs + compliance + unlinked subbie-name suggestions. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [companiesRes, docsRes, subbiesRes] = await Promise.all([
    supabaseAdmin.from('sf_contractor_companies').select('*').order('name'),
    supabaseAdmin.from('sf_prequal_documents').select('*').order('uploaded_at', { ascending: false }),
    supabaseAdmin.from('fg_subcontractors').select('name, safety_company_id'),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const docs = (docsRes.data ?? []).map(mapPrequalDocument)
  const companies = (companiesRes.data ?? []).map(mapContractorCompany).map(c => ({
    ...c,
    documents: docs.filter(d => d.companyId === c.id),
    compliance: companyCompliance(docs.filter(d => d.companyId === c.id), today),
  }))
  const companyNames = new Set(companies.map(c => c.name.trim().toLowerCase()))
  const suggestions = Array.from(new Set((subbiesRes.data ?? [])
    .filter(s => !s.safety_company_id)
    .map(s => (s.name as string).trim())
    .filter(n => n && !companyNames.has(n.toLowerCase()))))

  return NextResponse.json({ ok: true, companies, suggestions })
}

/** POST /api/safety/contractors { name, abn?, email?, phone? } -> create a company; also links
 *  any fg_subcontractors packages with the same name. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { name?: string; abn?: string; email?: string; phone?: string }
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('sf_contractor_companies').insert({
    name, abn: (body.abn || '').trim() || null, email: (body.email || '').trim() || null, phone: (body.phone || '').trim() || null,
  }).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Link same-named subbie packages so foreman compliance badges light up without manual linking.
  await supabaseAdmin.from('fg_subcontractors').update({ safety_company_id: data.id })
    .ilike('name', name).is('safety_company_id', null)

  return NextResponse.json({ ok: true, company: mapContractorCompany(data) })
}

/** PATCH /api/safety/contractors { id, email?, phone?, abn?, notes?, snoozeDays? } */
export async function PATCH(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as {
    id?: string; email?: string; phone?: string; abn?: string; notes?: string; snoozeDays?: number | null
  }
  if (!body.id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.email !== undefined) patch.email = body.email.trim() || null
  if (body.phone !== undefined) patch.phone = body.phone.trim() || null
  if (body.abn !== undefined) patch.abn = body.abn.trim() || null
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.snoozeDays !== undefined) {
    patch.chase_snoozed_until = body.snoozeDays == null ? null
      : new Date(Date.now() + body.snoozeDays * 86400000).toISOString()
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: 'nothing_to_update' }, { status: 400 })
  const { error } = await supabaseAdmin.from('sf_contractor_companies').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
