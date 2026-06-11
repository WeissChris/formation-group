import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendAcceptanceClientEmail, sendAcceptanceNotifyEmail } from '@/lib/email'
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
 * POST /api/proposals/accepted
 *
 * Fired by the public proposal page right after a client accepts. Looks the proposal up by token
 * (server-side, service role), then emails the client a confirmation and notifies Chris. Best
 * effort — never blocks the client's acceptance. Same-origin gated.
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

  const { data } = await supabaseAdmin
    .from('fg_proposals')
    .select('client_name, client_name2, client_email, project_address, accepted_by_name, phases, phase1_fee, phase2_fee, phase3_fee')
    .eq('acceptance_token', token)
    .maybeSingle()
  if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 200 })

  // Total across all phases (variable count) for the internal notification.
  const proposalLike = {
    phases: data.phases as DesignProposal['phases'],
    phase1Fee: Number(data.phase1_fee) || 0, phase1Scope: '',
    phase2Fee: Number(data.phase2_fee) || 0, phase2Scope: '',
    phase3Fee: data.phase3_fee != null ? Number(data.phase3_fee) : undefined,
  } as DesignProposal
  const totalLabel = formatCurrency(phasesTotal(getProposalPhases(proposalLike)))

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
  const proposalUrl = `${appUrl}/proposal/${encodeURIComponent(token)}`

  const acceptance = {
    clientName: (data.client_name as string) || 'A client',
    clientName2: (data.client_name2 as string | null) || undefined,
    acceptedByName: (data.accepted_by_name as string | null) || undefined,
    clientEmail: (data.client_email as string | null) || undefined,
    projectAddress: (data.project_address as string | null) || undefined,
    proposalUrl,
    totalLabel,
  }

  // Send both, best-effort. The internal notification is the one that matters most (so Chris
  // knows to act), so report its result; the client confirmation is fire-and-forget.
  const [clientResult, notifyResult] = await Promise.all([
    acceptance.clientEmail ? sendAcceptanceClientEmail(acceptance) : Promise.resolve({ ok: false, error: 'no_client_email' as const }),
    sendAcceptanceNotifyEmail(acceptance),
  ])

  return NextResponse.json({ ok: notifyResult.ok, client: clientResult.ok, notify: notifyResult.ok })
}
