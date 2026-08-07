import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { sendSafetyEmail } from '@/lib/safetyChase'
import { isForemanEditable } from '@/lib/variationStatus'
import { STD_LABOUR_RATE, VARIATION_LABOUR_MARKUP_PCT, VARIATION_MATERIALS_MARKUP_PCT, variationClientPrice } from '@/lib/estimateCalculations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/$/, '')
const OFFICE_EMAIL = () => process.env.SAFETY_OFFICE_EMAIL || 'chris@formationlandscapes.com.au'

function money(n: number): string { return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

const SELECT = 'id, variation_number, variation_reason, variation_amount, status, accepted_by_name, ' +
  'accepted_at, declined_at, acceptance_token, archived, raised_by, submitted_at, office_approved_at, ' +
  'office_rejected_at, office_reject_reason, first_viewed_at, variation_labour_hours, variation_materials_cost'

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
    labourHours: v.variation_labour_hours != null ? Number(v.variation_labour_hours) : null,
    materialsCost: v.variation_materials_cost != null ? Number(v.variation_materials_cost) : null,
    // Only worth sharing once the office has actually released it to the client.
    approvalUrl: v.acceptance_token && v.office_approved_at && v.status !== 'accepted' && v.status !== 'declined'
      ? `${APP_URL()}/variation/${v.acceptance_token}` : null,
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Labour + materials lines for a breakdown variation - the foreman's real inputs become proper
 * typed line items so job tracking (cost budget by discipline, labour-hour allowance) counts the
 * variation correctly. Revenue carries the standing auto-markup (labour +75%, materials +45% -
 * lib/estimateCalculations.variationClientPrice), so the variation arrives PRICED; the office can
 * still override the total at approval, which rescales these proportionally.
 */
function breakdownLines(estimateId: string, description: string, hours: number, materials: number) {
  const price = variationClientPrice(hours, materials)
  const lines: Record<string, unknown>[] = []
  if (hours > 0) {
    lines.push({
      id: randomUUID(), estimateId, displayOrder: '1', category: 'Variation',
      description: `${description} - labour`, type: 'Labour', units: hours, uom: 'HR',
      unitCost: STD_LABOUR_RATE, total: price.labourCost,
      markupPercent: VARIATION_LABOUR_MARKUP_PCT, revenue: price.labourPrice, crewType: 'Formation',
    })
  }
  if (materials > 0) {
    lines.push({
      id: randomUUID(), estimateId, displayOrder: '2', category: 'Variation',
      description: `${description} - materials`, type: 'Material', units: 1, uom: 'EA',
      unitCost: materials, total: price.materialsCost,
      markupPercent: VARIATION_MATERIALS_MARKUP_PCT, revenue: price.materialsPrice, crewType: 'Formation',
    })
  }
  return lines
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

  const body = await request.json().catch(() => ({})) as { description?: string; amount?: number; labourHours?: number; materialsCost?: number }
  const description = (body.description || '').trim().slice(0, 1000)
  const labourHours = r2(Math.max(0, Number(body.labourHours) || 0))
  const materialsCost = r2(Math.max(0, Number(body.materialsCost) || 0))
  const priced = variationClientPrice(labourHours, materialsCost)
  const breakdownCost = priced.cost
  // Breakdown (hours + materials) is the standard path - the amount is the AUTO-PRICED client
  // total (labour +75%, materials +45%). A bare amount is kept for legacy callers.
  const amount = breakdownCost > 0 ? priced.total : Math.round((Number(body.amount) || 0) * 100) / 100
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
  const lineItems = breakdownCost > 0
    ? breakdownLines(id, description, labourHours, materialsCost)
    : [{
        id: randomUUID(), estimateId: id, displayOrder: '1', category: 'Variation',
        description, type: 'Labour', units: 1, uom: 'EA', unitCost: 0, total: 0,
        markupPercent: 0, revenue: amount, crewType: 'Formation',
      }]

  const { error } = await supabaseAdmin!.from('fg_estimates').insert({
    id,
    project_id: params.id,
    project_name: (project!.name as string) || '',
    name: `VMO-${variationNumber}`,
    version: 1,
    status: 'draft',
    default_markup_formation: Number(parent.default_markup_formation) || 0,
    default_markup_subcontractor: Number(parent.default_markup_subcontractor) || 0,
    line_items: lineItems,
    category_notes: {},
    parent_estimate_id: parent.id,
    variation_number: variationNumber,
    variation_reason: description,
    variation_amount: amount,
    variation_labour_hours: breakdownCost > 0 ? labourHours : null,
    variation_materials_cost: breakdownCost > 0 ? materialsCost : null,
    project_markups: [],
    raised_by: session!.name,
    submitted_at: nowIso,
    archived: false,
    updated_at: nowIso,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await notifyOffice({
    projectName: (project!.name as string) || 'a project', projectId: params.id, variationNumber,
    description, amount, raisedBy: session!.name,
    labourHours: breakdownCost > 0 ? labourHours : null, materialsCost: breakdownCost > 0 ? materialsCost : null,
  })

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

  const body = await request.json().catch(() => ({})) as { id?: string; description?: string; amount?: number; labourHours?: number; materialsCost?: number }
  const vid = (body.id || '').trim()
  if (!vid) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 })

  const { data } = await supabaseAdmin!.from('fg_estimates')
    .select(SELECT).eq('id', vid).eq('project_id', params.id).maybeSingle()
  const row = data as unknown as Record<string, unknown> | null
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!isForemanEditable(mapRow(row))) return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })

  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : ''
  const labourHours = body.labourHours != null ? r2(Math.max(0, Number(body.labourHours) || 0)) : null
  const materialsCost = body.materialsCost != null ? r2(Math.max(0, Number(body.materialsCost) || 0)) : null
  const breakdownCost = labourHours != null || materialsCost != null
    ? variationClientPrice(labourHours ?? 0, materialsCost ?? 0).cost : null
  const amount = breakdownCost != null
    ? variationClientPrice(labourHours ?? 0, materialsCost ?? 0).total
    : body.amount != null ? Math.round((Number(body.amount) || 0) * 100) / 100 : null
  if (body.description != null && !description) return NextResponse.json({ ok: false, error: 'description_required' }, { status: 400 })
  if (amount != null && !(amount > 0)) return NextResponse.json({ ok: false, error: 'amount_required' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    // Resubmitting clears the office's bounce, so the stage falls back to "with office".
    submitted_at: nowIso, office_rejected_at: null, office_reject_reason: null, updated_at: nowIso,
  }
  const desc = description || (row.variation_reason as string) || ''
  if (breakdownCost != null) {
    patch.variation_labour_hours = labourHours ?? 0
    patch.variation_materials_cost = materialsCost ?? 0
    patch.line_items = breakdownLines(vid, desc, labourHours ?? 0, materialsCost ?? 0)
  } else if (description) {
    // Description-only edit: keep the stored breakdown lines if the variation has one.
    const storedH = row.variation_labour_hours != null ? Number(row.variation_labour_hours) : null
    const storedM = row.variation_materials_cost != null ? Number(row.variation_materials_cost) : null
    patch.line_items = (storedH ?? 0) > 0 || (storedM ?? 0) > 0
      ? breakdownLines(vid, description, storedH ?? 0, storedM ?? 0)
      : [{
          id: randomUUID(), estimateId: vid, displayOrder: '1', category: 'Variation',
          description, type: 'Labour', units: 1, uom: 'EA', unitCost: 0, total: 0,
          markupPercent: 0, revenue: amount ?? (Number(row.variation_amount) || 0), crewType: 'Formation',
        }]
  }
  if (description) patch.variation_reason = description
  if (amount != null) patch.variation_amount = amount

  const { error } = await supabaseAdmin!.from('fg_estimates').update(patch).eq('id', vid)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await notifyOffice({
    projectName: (project!.name as string) || 'a project', projectId: params.id,
    variationNumber: Number(row.variation_number) || 0,
    description: description || (row.variation_reason as string) || '',
    amount: amount ?? (Number(row.variation_amount) || 0),
    raisedBy: session!.name, resubmitted: true,
    labourHours: labourHours ?? (row.variation_labour_hours != null ? Number(row.variation_labour_hours) : null),
    materialsCost: materialsCost ?? (row.variation_materials_cost != null ? Number(row.variation_materials_cost) : null),
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
  labourHours?: number | null; materialsCost?: number | null
}): Promise<void> {
  // Deep-link to the Invoicing tab - that's where the approval queue renders.
  const link = `${APP_URL()}/projects/${input.projectId}?tab=operations`
  const verb = input.resubmitted ? 'updated and resent' : 'raised'
  const hasBreakdown = (input.labourHours ?? 0) > 0 || (input.materialsCost ?? 0) > 0
  const costLine = hasBreakdown
    ? `${input.labourHours || 0}h labour (${money((input.labourHours || 0) * STD_LABOUR_RATE)} cost) + ${money(input.materialsCost || 0)} materials = <strong>${money(input.amount)}</strong> ex GST auto-priced (labour +${VARIATION_LABOUR_MARKUP_PCT}%, materials +${VARIATION_MATERIALS_MARKUP_PCT}%) - adjust it when you approve if needed`
    : `<strong>${money(input.amount)}</strong> ex GST`
  await sendSafetyEmail(
    OFFICE_EMAIL(),
    `Variation VMO-${input.variationNumber} needs your approval - ${input.projectName}`,
    `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
      <p>${esc(input.raisedBy)} has ${verb} a variation on <strong>${esc(input.projectName)}</strong>.</p>
      <p style="border-left:3px solid #3D5A3A;padding-left:12px">${esc(input.description)}</p>
      <p>${costLine}</p>
      <p><a href="${link}" style="display:inline-block;background:#3D5A3A;color:#fff;padding:10px 18px;
      text-decoration:none;border-radius:6px">Review it</a></p>
      <p style="color:#6b6660;font-size:12px">Financial Operations -&gt; Variations. Nothing has gone to
      the client yet - approving it there is what sends it.</p>
    </div>`,
  ).catch(() => undefined)
}
