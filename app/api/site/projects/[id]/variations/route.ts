import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { sendSafetyEmail } from '@/lib/safetyChase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Foremen can raise variations up to this ex-GST value; anything bigger goes through the office. */
const FOREMAN_VARIATION_CAP = 1000

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/$/, '')

function money(n: number): string { return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/** GET /api/site/projects/[id]/variations -> the project's variations (status + approval link). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data } = await supabaseAdmin.from('fg_estimates')
    .select('id, variation_number, variation_reason, variation_amount, status, accepted_by_name, accepted_at, declined_at, acceptance_token, archived')
    .eq('project_id', params.id).not('parent_estimate_id', 'is', null)
    .order('variation_number', { ascending: true })

  const variations = (data ?? []).filter(v => !v.archived).map(v => ({
    id: v.id as string,
    number: Number(v.variation_number) || 0,
    reason: (v.variation_reason as string | null) || '',
    amount: v.variation_amount != null ? Number(v.variation_amount) : 0,
    status: v.status as string,
    acceptedByName: (v.accepted_by_name as string | null) || '',
    acceptedAt: (v.accepted_at as string | null) || null,
    declinedAt: (v.declined_at as string | null) || null,
    approvalUrl: v.acceptance_token && v.status !== 'accepted' && v.status !== 'declined'
      ? `${APP_URL()}/variation/${v.acceptance_token}` : null,
  }))
  return NextResponse.json({ ok: true, variations })
}

/**
 * POST /api/site/projects/[id]/variations { description, amount } -> creates a client-ready
 * VMO (status 'sent', acceptance token) capped at $1000 ex GST, and emails the client the
 * digital approval link (Resend; dry-run without a key). The variation carries one line item
 * with the client price as revenue and NO cost - the office prices the cost side later.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { description?: string; amount?: number }
  const description = (body.description || '').trim().slice(0, 1000)
  const amount = Math.round((Number(body.amount) || 0) * 100) / 100
  if (!description) return NextResponse.json({ ok: false, error: 'description_required' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ ok: false, error: 'amount_required' }, { status: 400 })
  if (amount > FOREMAN_VARIATION_CAP) {
    return NextResponse.json({ ok: false, error: 'over_cap', cap: FOREMAN_VARIATION_CAP }, { status: 422 })
  }

  // Parent = the accepted base estimate (falls back to the latest base, mirroring the BOQ pick).
  const { data: estRows } = await supabaseAdmin.from('fg_estimates').select('*').eq('project_id', params.id)
  const all = (estRows ?? []) as Record<string, unknown>[]
  const bases = all.filter(e => !e.parent_estimate_id)
  const accepted = bases.filter(e => e.status === 'accepted')
  const parent = [...(accepted.length ? accepted : bases)]
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
  if (!parent) return NextResponse.json({ ok: false, error: 'no_base_estimate' }, { status: 409 })

  const variationNumber = all.filter(e => e.parent_estimate_id === parent.id).length + 1
  const id = randomUUID()
  const token = randomUUID()
  const nowIso = new Date().toISOString()
  const lineItem = {
    id: randomUUID(), estimateId: id, displayOrder: '1', category: 'Variation',
    description, type: 'Labour', units: 1, uom: 'EA', unitCost: 0, total: 0,
    markupPercent: 0, revenue: amount, crewType: 'Formation',
  }

  const { error } = await supabaseAdmin.from('fg_estimates').insert({
    id,
    project_id: params.id,
    project_name: (project.name as string) || '',
    name: `VMO-${variationNumber}`,
    version: 1,
    status: 'sent',
    default_markup_formation: Number(parent.default_markup_formation) || 0,
    default_markup_subcontractor: Number(parent.default_markup_subcontractor) || 0,
    line_items: [lineItem],
    category_notes: {},
    parent_estimate_id: parent.id,
    variation_number: variationNumber,
    variation_reason: description,
    variation_amount: amount,
    project_markups: [],
    sent_at: nowIso,
    acceptance_token: token,
    archived: false,
    updated_at: nowIso,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Email the client the approval link (falls back gracefully when they have no email on file).
  const approvalUrl = `${APP_URL()}/variation/${token}`
  const clientEmail = (project.client_email as string | null) || ''
  let emailed = false, dryRun = false
  if (clientEmail) {
    const gst = amount * 0.1
    const res = await sendSafetyEmail(
      clientEmail,
      `Variation VMO-${variationNumber} for your approval - ${(project.name as string) || 'your project'}`,
      `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
        <p>Hi ${esc((project.client_name as string) || '')},</p>
        <p>A small variation has been raised on your project by our site team:</p>
        <p style="border-left:3px solid #3D5A3A;padding-left:12px">${esc(description)}</p>
        <p><strong>${money(amount)}</strong> ex GST (${money(amount + gst)} inc GST)</p>
        <p><a href="${approvalUrl}" style="display:inline-block;background:#3D5A3A;color:#fff;padding:10px 18px;
        text-decoration:none;border-radius:6px">Review and approve</a></p>
        <p style="color:#6b6660;font-size:12px">You can approve or decline online - it takes a few seconds.
        Reply to this email with any questions.</p>
        <p>Thanks,<br/>Formation Landscapes</p>
      </div>`,
    )
    emailed = res.ok && !res.dryRun
    dryRun = res.dryRun
  }

  return NextResponse.json({
    ok: true,
    variation: { id, number: variationNumber, reason: description, amount, status: 'sent', approvalUrl },
    emailed, dryRun, clientEmail: clientEmail || null,
  })
}
