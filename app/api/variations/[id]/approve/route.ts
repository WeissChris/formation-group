import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendVariationEmail, isValidEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same-origin gate - matches the other internal mutation routes. */
function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

function money(n: number): string { return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

/**
 * POST /api/variations/[id]/approve { message?, ccEmails? }
 *
 * The office releases a foreman-raised variation to the client: mints the acceptance token, flips
 * the status to 'sent', stamps office_approved_at, and emails the client the branded approval link
 * through the SAME sender the office send page uses (lib/email.sendVariationEmail, BCCs Chris).
 * Until this runs, nothing about a foreman variation has left the building.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const rl = rateLimit(`vapprove:${clientIp(request)}`, 30, 10 * 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { message?: string; ccEmails?: string }

  const { data: row } = await supabaseAdmin.from('fg_estimates')
    .select('id, project_id, project_name, variation_number, variation_reason, variation_amount, status, acceptance_token, office_approved_at, parent_estimate_id, send_message')
    .eq('id', params.id).maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!row.parent_estimate_id) return NextResponse.json({ ok: false, error: 'not_a_variation' }, { status: 400 })
  if (row.status === 'accepted' || row.status === 'declined') {
    return NextResponse.json({ ok: false, error: 'already_responded' }, { status: 409 })
  }

  // Who are we sending to? The project carries the client's details.
  const { data: project } = await supabaseAdmin.from('fg_projects')
    .select('name, client_name, client_email, address').eq('id', row.project_id as string).maybeSingle()
  const clientEmail = ((project?.client_email as string | null) || '').trim()
  if (!clientEmail) return NextResponse.json({ ok: false, error: 'no_client_email' }, { status: 400 })
  if (!isValidEmail(clientEmail)) return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })

  const token = (row.acceptance_token as string | null) || randomUUID()
  const nowIso = new Date().toISOString()
  const message = typeof body.message === 'string' && body.message.trim()
    ? body.message.trim() : (row.send_message as string | null) || undefined

  const { error } = await supabaseAdmin.from('fg_estimates').update({
    status: 'sent',
    acceptance_token: token,
    sent_at: nowIso,
    office_approved_at: nowIso,
    office_rejected_at: null,
    office_reject_reason: null,
    send_message: message ?? null,
    archived: false,
    updated_at: nowIso,
  }).eq('id', params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
  const amount = row.variation_amount != null ? Number(row.variation_amount) : 0
  const result = await sendVariationEmail({
    to: clientEmail,
    clientName: (project?.client_name as string | null) || '',
    variationUrl: `${appUrl}/variation/${encodeURIComponent(token)}`,
    variationLabel: `Variation VMO-${row.variation_number ?? '?'}`,
    projectAddress: (project?.address as string | null) || (row.project_name as string) || undefined,
    amountLabel: amount ? `${money(amount)} + GST` : undefined,
    message,
    cc: typeof body.ccEmails === 'string' ? body.ccEmails : undefined,
  })

  // The status change is already committed - report the send outcome rather than rolling back, so a
  // mail outage doesn't leave the office unsure whether it approved. The approval link is returned
  // for manual sharing either way.
  return NextResponse.json({
    ok: true,
    emailed: result.ok,
    emailError: result.ok ? undefined : result.error,
    approvalUrl: `${appUrl}/variation/${encodeURIComponent(token)}`,
    clientEmail,
    officeApprovedAt: nowIso,
    acceptanceToken: token,
  })
}
