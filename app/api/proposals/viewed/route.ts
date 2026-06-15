import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendProposalViewedNotifyEmail } from '@/lib/email'
import { getProposalPhases, phasesTotal } from '@/lib/proposalPhases'
import { formatCurrency } from '@/lib/utils'
import type { DesignProposal } from '@/types'

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

/**
 * POST /api/proposals/viewed
 *
 * Fired by the public proposal page when a client opens it. Records the first-view timestamp on
 * fg_proposals and, on the FIRST view only, emails Chris that the client opened the proposal.
 * Idempotent: a conditional UPDATE (first_viewed_at IS NULL) is the atomic guard — only the request
 * that actually sets the timestamp sends the email, so reloads/concurrent opens don't re-notify.
 * Only 'sent'/'pending' proposals count, so Chris previewing a draft (or an already-accepted
 * proposal) doesn't trigger a notification. Same-origin gated; best-effort.
 *
 * Body: { acceptanceToken }
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const token = typeof body?.acceptanceToken === 'string' ? body.acceptanceToken.trim() : ''
  if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 200 })

  // Look up the proposal. Only track a view for a proposal that's actually out with the client.
  const { data: existing } = await supabaseAdmin
    .from('fg_proposals')
    .select('id, status, first_viewed_at')
    .eq('acceptance_token', token)
    .maybeSingle()
  if (!existing) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 200 })
  if (existing.first_viewed_at) return NextResponse.json({ ok: true, firstView: false }, { status: 200 })
  if (existing.status !== 'sent' && existing.status !== 'pending') {
    return NextResponse.json({ ok: true, firstView: false, skipped: existing.status }, { status: 200 })
  }

  // Atomic first-view claim: only the request that flips first_viewed_at from NULL gets a row back.
  const now = new Date().toISOString()
  const { data: claimed } = await supabaseAdmin
    .from('fg_proposals')
    .update({ first_viewed_at: now })
    .eq('acceptance_token', token)
    .is('first_viewed_at', null)
    .select('client_name, client_name2, project_address, phases, phase1_fee, phase2_fee, phase3_fee')

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, firstView: false }, { status: 200 })
  }
  const data = claimed[0]

  const proposalLike = {
    phases: data.phases as DesignProposal['phases'],
    phase1Fee: Number(data.phase1_fee) || 0, phase1Scope: '',
    phase2Fee: Number(data.phase2_fee) || 0, phase2Scope: '',
    phase3Fee: data.phase3_fee != null ? Number(data.phase3_fee) : undefined,
  } as DesignProposal
  const totalLabel = formatCurrency(phasesTotal(getProposalPhases(proposalLike)))

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
  const proposalUrl = `${appUrl}/proposal/${encodeURIComponent(token)}`

  const notifyResult = await sendProposalViewedNotifyEmail({
    clientName: (data.client_name as string) || 'A client',
    clientName2: (data.client_name2 as string | null) || undefined,
    projectAddress: (data.project_address as string | null) || undefined,
    proposalUrl,
    totalLabel,
  })

  return NextResponse.json({ ok: true, firstView: true, notify: notifyResult.ok })
}
