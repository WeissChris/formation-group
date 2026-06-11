// Client-safe wrapper around POST /api/proposals/send. No secrets here.

import type { DesignProposal } from '@/types'

export interface SendProposalResult { ok: boolean; error?: string }

/** Ask the server to email this proposal to its client. */
export async function requestSendProposal(proposal: DesignProposal): Promise<SendProposalResult> {
  try {
    const resp = await fetch('/api/proposals/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: proposal.clientName,
        clientEmail: proposal.clientEmail,
        acceptanceToken: proposal.acceptanceToken,
        projectAddress: proposal.projectAddress,
        introText: proposal.introText,
      }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) return { ok: false, error: data?.error || `http_${resp.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  }
}

/** Friendly message for a send-error code. */
export function sendErrorMessage(error?: string): string {
  switch (error) {
    case 'no_client_email': return 'Add a client email address first.'
    case 'invalid_email': return 'That client email address looks invalid.'
    case 'email_not_configured': return 'Email sending isn’t set up yet — the Resend API key is missing on the server.'
    case undefined: return 'Could not send the email.'
    default:
      if (error.startsWith('resend_')) {
        return `The email service rejected the send (${error}). The most likely cause is the sending domain not being verified yet.`
      }
      return `Could not send the email (${error}).`
  }
}
