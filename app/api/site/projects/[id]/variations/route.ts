import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { sendSafetyEmail } from '@/lib/safetyChase'
import { isForemanEditable } from '@/lib/variationStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/$/, '')
const OFFICE_EMAIL = () => process.env.SAFETY_OFFICE_EMAIL || 'chris@formationlandscapes.com.au'

function money(n: number): string { return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

const SELECT = 'id, variation_number, variation_reason, variation_amount, status, accepted_by_name, ' +
  'accepted_at, declined_at, acceptance_token, archived, raised_by, submitted_at, office_approved_at, ' +
  'office_rejected_at, office_reject_reason, first_viewed_at'

function mapRow(v: Record<string, unknown>) {
  return {
    id: v.id as string,
    number: Number(v.variation_number) || 0,
    reason: (v.variation_reason as string | null) || '',
    amount: v.variation_amount != null ? Number(v.variation_amount) : 0,
    status: v.status as string,
    acceptedByName: (v.accepted_by_name as string | null) || '',
    acceptedAt: (v.accepted_at as string | null) || null,
    declinedAt: (v.declined_at as string | null) || null,
    raisedBy: (v.raised_by as string | null) || '',
    submittedAt: (v.submitted_at as string | null) || null,
    officeApprovedAt: (v.office_approved_at as string | null) || null,
    officeRejectedAt: (v.office_rejected_at as string | null) || null,
    officeRejectReason: (v.office_reject_reason as string | null) || '',
    firstViewedAt: (v.first_viewed_at as string | null) || null,
    // Only worth sharing once the office has actually released it to the client.
    approvalUrl: v.acceptance_token && v.office_approved_at && v.status !== 'accepted' && v.status !== 'declined'
      ? `${APP_URL()}/variation/${v.acceptance_token}` : null,
  }
}

/** Shared session + ownership gate. Returns the project row, or a response to bail with. */
async function guard(request: NextRequest, id: string) {
  const session = siteSessionFrom(request)
  if (!session) return { bail: NextResponse.json({ ok: false }, { status: 401 }) }
  const project = await loadOwnedProjectRow(session, id)
  if (!project) return { bail: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }) }
  if (!supabaseAdmin) return { bail: NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 }) }
  return { session, project }
}

/** GET /api/site/projects/[id]/variations -> the project's variations with their workflow state. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(request, params.id)
  if (g.bail) return g.bail

  const { data } = await supabaseAdmin!.from('fg_estimates')
    .select(SELECT)
    .eq('project_id', params.id).not('parent_estimate_id', 'is', null)
    .order('variation_number', { ascending: true })

  // SELECT is a const string rather than a literal, so supabase-js can't infer the row shape.
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  const variations = rows.filter(v => !v.archived).map(mapRow)
  return NextResponse.json({ ok: true, variations })
}

/**
 * POST /api/site/projects/[id]/variations { description, amount }
 *
 * The foreman raises a variation. It is created as a DRAFT with no acceptance token and NOTHING is
 * sent to the client - the office reviews and releases it (see /api/variations/[id]/approve). That
 * office gate is why there is no longer a dollar cap on what a foreman can raise. The variation
 * carries one line item with the client price as revenue and NO cost; the office prices the cost
 * side later.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(request, params.id)
  if (g.bail) return g.bail
  const { session, project } = g

  const body = await request.json().catch(() => ({})) as { description?: string; amount?: number }
  const description = (body.description || '').trim().slice(0, 1000)
  const amount = Math.round((Number(body.amount) || 0) * 100) / 100
  if (!description) return NextResponse.json({ ok: false, error: 'description_required' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ ok: false, error: 'amount_required' }, { status: 400 })

  // Parent = the accepted base estimate (falls back to the latest base, mirroring the BOQ pick).
  const { data: estRows } = await supabaseAdmin!.from('fg_estimates').select('*').eq('project_id', params.id)
  const all = (estRows ?? []) as Record<string, unknown>[]
  const bases = all.filter(e => !e.parent_estimate_id)
  const accepted = bases.filter(e => e.status === 'accepted')
  const parent = [...(accepted.length ? accepted : bases)]
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
  if (!parent) return NextResponse.json({ ok: false, error: 'no_base_estimate' }, { status: 409 })

  const variationNumber = all.filter(e => e.parent_estimate_id === parent.id).length + 1
  const id = randomUUID()
  const nowIso = new Date().toISOString()
  const lineItem = {
    id: randomUUID(), estimateId: id, displayOrder: '1', category: 'Variation',
    description, type: 'Labour', units: 1, uom: 'EA', unitCost: 0, total: 0,
    markupPercent: 0, revenue: amount, crewType: 'Formation',
  }

  const { error } = await supabaseAdmin!.from('fg_estimates').insert({
    id,
    project_id: params.id,
    project_name: (project!.name as string) || '',
    name: `VMO-${variationNumber}`,
    version: 1,
    status: 'draft',
    default_markup_formation: Number(parent.default_markup_formation) || 0,
    default_markup_subcontractor: Number(parent.default_markup_subcontractor) || 0,
    line_items: [lineItem],
    category_notes: {},
    parent_estimate_id: parent.id,
    variation_number: variationNumber,
    variation_reason: description,
    variation_amount: amount,
    project_markups: [],
    raised_by: session!.name,
    submitted_at: nowIso,
    archived: false,
    updated_at: nowIso,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await notifyOffice({ projectName: (project!.name as string) || 'a project', projectId: params.id, variationNumber, description, amount, raisedBy: session!.name })

  return NextResponse.json({
    ok: true,
    variation: { id, number: variationNumber, reason: description, amount, status: 'draft', raisedBy: session!.name, submittedAt: nowIso },
  })
}

/**
 * PATCH /api/site/projects/[id]/variations { id, description?, amount? }
 * Edit + resubmit a draft the office sent back. Refused once the office has released it.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(request, params.id)
  if (g.bail) return g.bail
  const { session, project } = g

  const body = await request.json().catch(() => ({})) as { id?: string; description?: string; amount?: number }
  const vid = (body.id || '').trim()
  if (!vid) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })

  const { data } = await supabaseAdmin!.from('fg_estimates')
    .select(SELECT).eq('id', vid).eq('project_id', params.id).maybeSingle()
  const row = data as unknown as Record<string, unknown> | null
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!isForemanEditable(mapRow(row))) return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })

  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : ''
  const amount = body.amount != null ? Math.round((Number(body.amount) || 0) * 100) / 100 : null
  if (body.description != null && !description) return NextResponse.json({ ok: false, error: 'description_required' }, { status: 400 })
  if (amount != null && !(amount > 0)) return NextResponse.json({ ok: false, error: 'amount_required' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    // Resubmitting clears the office's bounce, so the stage falls back to "with office".
    submitted_at: nowIso, office_rejected_at: null, office_reject_reason: null, updated_at: nowIso,
  }
  if (description) {
    patch.variation_reason = description
    patch.line_items = [{
      id: randomUUID(), estimateId: vid, displayOrder: '1', category: 'Variation',
      description, type: 'Labour', units: 1, uom: 'EA', unitCost: 0, total: 0,
      markupPercent: 0, revenue: amount ?? (Number(row.variation_amount) || 0), crewType: 'Formation',
    }]
  }
  if (amount != null) patch.variation_amount = amount

  const { error } = await supabaseAdmin!.from('fg_estimates').update(patch).eq('id', vid)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await notifyOffice({
    projectName: (project!.name as string) || 'a project', projectId: params.id,
    variationNumber: Number(row.variation_number) || 0,
    description: description || (row.variation_reason as string) || '',
    amount: amount ?? (Number(row.variation_amount) || 0),
    raisedBy: session!.name, resubmitted: true,
  })
  return NextResponse.json({ ok: true })
}

/** DELETE /api/site/projects/[id]/variations?vid=... -> bin a draft the client has never seen. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(request, params.id)
  if (g.bail) return g.bail

  const vid = new URL(request.url).searchParams.get('vid') || ''
  if (!vid) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })

  const { data } = await supabaseAdmin!.from('fg_estimates')
    .select(SELECT).eq('id', vid).eq('project_id', params.id).maybeSingle()
  const row = data as unknown as Record<string, unknown> | null
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!isForemanEditable(mapRow(row))) return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })

  const { error } = await supabaseAdmin!.from('fg_estimates').delete().eq('id', vid)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Tell the office a variation is waiting. Best-effort - a mail failure must not fail the raise. */
async function notifyOffice(input: {
  projectName: string; projectId: string; variationNumber: number
  description: string; amount: number; raisedBy: string; resubmitted?: boolean
}): Promise<void> {
  const link = `${APP_URL()}/projects/${input.projectId}`
  const verb = input.resubmitted ? 'updated and resent' : 'raised'
  await sendSafetyEmail(
    OFFICE_EMAIL(),
    `Variation VMO-${input.variationNumber} needs your approval - ${input.projectName}`,
    `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
      <p>${esc(input.raisedBy)} has ${verb} a variation on <strong>${esc(input.projectName)}</strong>.</p>
      <p style="border-left:3px solid #3D5A3A;padding-left:12px">${esc(input.description)}</p>
      <p><strong>${money(input.amount)}</strong> ex GST</p>
      <p><a href="${link}" style="display:inline-block;background:#3D5A3A;color:#fff;padding:10px 18px;
      text-decoration:none;border-radius:6px">Review it</a></p>
      <p style="color:#6b6660;font-size:12px">Financial Operations -&gt; Variations. Nothing has gone to
      the client yet - approving it there is what sends it.</p>
    </div>`,
  ).catch(() => undefined)
}
