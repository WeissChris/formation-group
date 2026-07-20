import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
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

/**
 * POST /api/variations/[id]/reject { reason }
 *
 * The office sends a foreman-raised variation back for changes. The status STAYS 'draft' - only the
 * office_rejected_at / office_reject_reason markers move, which is what turns the foreman's chip red
 * and puts a "needs changes" nudge on their cockpit. The foreman edits and resubmits via PATCH
 * /api/site/projects/[id]/variations, which clears these two fields again.
 *
 * This is NOT the same as the client declining - that comes back through the public token RPC and
 * lands as status 'declined' + archived.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const rl = rateLimit(`vreject:${clientIp(request)}`, 60, 10 * 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { reason?: string }
  const reason = (body.reason || '').trim().slice(0, 500)
  if (!reason) return NextResponse.json({ ok: false, error: 'reason_required' }, { status: 400 })

  const { data: row } = await supabaseAdmin.from('fg_estimates')
    .select('id, status, parent_estimate_id, office_approved_at').eq('id', params.id).maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!row.parent_estimate_id) return NextResponse.json({ ok: false, error: 'not_a_variation' }, { status: 400 })
  // Once it has gone to the client, "request changes" is the wrong tool - the client holds a live link.
  if (row.office_approved_at || row.status === 'sent' || row.status === 'accepted' || row.status === 'declined') {
    return NextResponse.json({ ok: false, error: 'already_released' }, { status: 409 })
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabaseAdmin.from('fg_estimates').update({
    status: 'draft', office_rejected_at: nowIso, office_reject_reason: reason, updated_at: nowIso,
  }).eq('id', params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, officeRejectedAt: nowIso, reason })
}
