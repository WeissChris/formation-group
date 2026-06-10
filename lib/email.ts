// Transactional email — server-only. Sends design proposals to clients via Resend.
//
// NEVER import from a client component (it reads RESEND_API_KEY). The send route
// (app/api/proposals/send) is the only caller.
//
// Setup: RESEND_API_KEY on Vercel, and the sending domain (formationlandscapes.com.au)
// verified in Resend (SPF/DKIM DNS records). Sender/reply-to/bcc default to Chris's address
// and can be overridden by env without a redeploy of logic.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

const DEFAULT_FROM = 'Formation Landscapes <chris@formationlandscapes.com.au>'
const DEFAULT_REPLY_TO = 'chris@formationlandscapes.com.au'
const DEFAULT_BCC = 'chris@formationlandscapes.com.au'

export interface ProposalEmailInput {
  to: string
  clientName: string
  proposalUrl: string
  introText?: string
}

/** Basic, permissive email-shape check (server-side guard; the real validation is delivery). */
export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function firstName(clientName: string): string {
  const first = clientName.trim().split(/\s+/)[0]
  return first || 'there'
}

export function proposalEmailSubject(): string {
  return 'Your landscape design proposal — Formation Landscapes'
}

/**
 * The opening line. Uses the proposal's intro text first sentence if present, otherwise a
 * sensible default — kept short so the email reads like a personal note, with the full detail
 * living on the proposal page itself.
 */
function leadParagraph(introText?: string): string {
  const trimmed = (introText || '').trim()
  if (trimmed) {
    const firstPara = trimmed.split(/\n\s*\n/)[0].trim()
    if (firstPara) return firstPara
  }
  return 'Thank you for the opportunity to discuss your project. Your landscape design proposal is ready to view online — including our design process, the deliverables for each phase, and the associated fees.'
}

/** Plain-text body (improves deliverability and covers text-only clients). */
export function buildProposalEmailText(input: ProposalEmailInput): string {
  return [
    `Hi ${firstName(input.clientName)},`,
    '',
    leadParagraph(input.introText),
    '',
    `View your proposal: ${input.proposalUrl}`,
    '',
    'If you have any questions, just reply to this email.',
    '',
    'Kind regards,',
    'Chris Weiss',
    'Formation Landscapes',
  ].join('\n')
}

/** Branded HTML body with inline styles (email clients ignore <style>/external CSS). */
export function buildProposalEmailHtml(input: ProposalEmailInput): string {
  const GREEN = '#3D5A3A'
  const name = escapeHtml(firstName(input.clientName))
  const lead = escapeHtml(leadParagraph(input.introText))
  const url = escapeHtml(input.proposalUrl)
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f3f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3f1;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:${GREEN};font-weight:600;">Formation Landscapes</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <p style="margin:0 0 16px 0;font-size:16px;color:#1a1a1a;">Hi ${name},</p>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#2d2d2d;">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td style="background:${GREEN};">
                      <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:14px;color:#ffffff;text-decoration:none;letter-spacing:0.03em;">View your proposal &rarr;</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 24px 0;font-size:12px;line-height:1.6;color:#6b6b6b;">
                  Or copy this link into your browser:<br>
                  <a href="${url}" style="color:${GREEN};word-break:break-all;">${url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px;border-top:1px solid #eee;">
                <p style="margin:20px 0 0 0;font-size:14px;line-height:1.6;color:#2d2d2d;">
                  If you have any questions, just reply to this email.
                </p>
                <p style="margin:16px 0 0 0;font-size:14px;line-height:1.5;color:#2d2d2d;">
                  Kind regards,<br>
                  <strong style="font-weight:600;">Chris Weiss</strong><br>
                  <span style="color:#6b6b6b;">Formation Landscapes</span>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export interface SendResult {
  ok: boolean
  error?: string
  id?: string
}

/**
 * Send a proposal email via Resend. Returns { ok:false, error:'email_not_configured' } when no
 * API key is set (so the UI can show a helpful message rather than a hard failure).
 */
export async function sendProposalEmail(input: ProposalEmailInput): Promise<SendResult> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return { ok: false, error: 'email_not_configured' }
  if (!isValidEmail(input.to)) return { ok: false, error: 'invalid_email' }

  const from = (process.env.PROPOSAL_FROM_EMAIL || DEFAULT_FROM).trim()
  const replyTo = (process.env.PROPOSAL_REPLY_TO || DEFAULT_REPLY_TO).trim()
  const bcc = (process.env.PROPOSAL_BCC || DEFAULT_BCC).trim()

  let resp: Response
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.to.trim()],
        ...(bcc ? { bcc: [bcc] } : {}),
        reply_to: replyTo,
        subject: proposalEmailSubject(),
        html: buildProposalEmailHtml(input),
        text: buildProposalEmailText(input),
      }),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' }
  }

  if (!resp.ok) {
    let detail = ''
    try { detail = (await resp.text()).slice(0, 300) } catch { /* ignore */ }
    return { ok: false, error: `resend_${resp.status}: ${detail}` }
  }
  const data = await resp.json().catch(() => ({}))
  return { ok: true, id: data?.id }
}
