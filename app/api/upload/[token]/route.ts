import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapContractorCompany, mapPrequalDocument, companyCompliance, DOC_TYPES } from '@/lib/safetyCompliance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// The subbie's public upload endpoint - token-gated (the token was emailed to them), no account.

async function resolveToken(token: string) {
  if (!supabaseAdmin) return null
  const { data } = await supabaseAdmin.from('sf_upload_tokens')
    .select('token, company_id, expires_at').eq('token', token).maybeSingle()
  if (!data) return null
  if (new Date(data.expires_at as string) < new Date()) return null
  return data
}

/** GET /api/upload/[token] -> company name + doc types + what's currently needed. */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const tok = await resolveToken(params.token)
  if (!tok) return NextResponse.json({ ok: false, error: 'invalid_or_expired' }, { status: 410 })

  const [companyRes, docsRes] = await Promise.all([
    supabaseAdmin.from('sf_contractor_companies').select('*').eq('id', tok.company_id).maybeSingle(),
    supabaseAdmin.from('sf_prequal_documents').select('*').eq('company_id', tok.company_id),
  ])
  if (!companyRes.data) return NextResponse.json({ ok: false, error: 'invalid_or_expired' }, { status: 410 })
  const company = mapContractorCompany(companyRes.data)
  const today = new Date().toISOString().slice(0, 10)
  const compliance = companyCompliance((docsRes.data ?? []).map(mapPrequalDocument), today)

  return NextResponse.json({
    ok: true,
    companyName: company.name,
    docTypes: DOC_TYPES.map(d => ({ key: d.key, label: d.label, required: d.required })),
    needs: compliance.needs,
  })
}

/** POST /api/upload/[token] multipart: file, docType, issuedOn?, expiresOn?, policyNumber? */
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const tok = await resolveToken(params.token)
  if (!tok) return NextResponse.json({ ok: false, error: 'invalid_or_expired' }, { status: 410 })

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'bad_form' }, { status: 400 })
  const file = form.get('file')
  const docType = String(form.get('docType') || '')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: 'file_required' }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 413 })
  if (!DOC_TYPES.some(d => d.key === docType)) return NextResponse.json({ ok: false, error: 'bad_doc_type' }, { status: 400 })

  const safeName = (file.name || 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 150)
  const path = `${tok.company_id}/${docType}/${Date.now()}-${safeName}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error: upErr } = await supabaseAdmin.storage.from('safety-prequal')
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream' })
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })

  const dateOrNull = (v: unknown) => {
    const s = String(v || '')
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  }
  const { error } = await supabaseAdmin.from('sf_prequal_documents').insert({
    company_id: tok.company_id,
    doc_type: docType,
    filename: safeName,
    storage_path: path,
    issued_on: dateOrNull(form.get('issuedOn')),
    expires_on: dateOrNull(form.get('expiresOn')),
    policy_number: String(form.get('policyNumber') || '').slice(0, 120) || null,
    source: 'upload',
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await supabaseAdmin.from('sf_upload_tokens').update({ last_used_at: new Date().toISOString() }).eq('token', params.token)
  return NextResponse.json({ ok: true })
}
