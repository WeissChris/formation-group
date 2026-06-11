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
  projectAddress?: string
  introText?: string
}

/** Absolute base URL for hosted assets (hero image) in the email. */
function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
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
  const INK = '#1a1a1a'
  const BODY = '#2d2d2d'
  const MUTED = '#8A8580'
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
  const name = escapeHtml(firstName(input.clientName))
  const lead = escapeHtml(leadParagraph(input.introText))
  const url = escapeHtml(input.proposalUrl)
  const hero = `${appBaseUrl()}/proposal-hero-8.jpg`
  const address = input.projectAddress ? escapeHtml(input.projectAddress.trim()) : ''
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eceae7;font-family:${font};color:${BODY};">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">Your landscape design proposal from Formation Landscapes is ready to view.</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceae7;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e4df;">
            <!-- Hero photo -->
            <tr>
              <td style="padding:0;line-height:0;background:${GREEN};">
                <img src="${hero}" width="600" alt="Formation Landscapes" style="display:block;width:100%;max-width:600px;height:200px;object-fit:cover;border:0;" />
              </td>
            </tr>
            <!-- Brand + heading -->
            <tr>
              <td style="padding:34px 44px 0 44px;">
                <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:${GREEN};font-weight:600;">Formation Landscapes</p>
                <h1 style="margin:0;font-size:25px;font-weight:300;line-height:1.25;color:${INK};letter-spacing:0.01em;">Your landscape design proposal</h1>
                ${address ? `<p style="margin:8px 0 0 0;font-size:13px;font-weight:300;color:${MUTED};">${address}</p>` : ''}
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:26px 44px 0 44px;">
                <p style="margin:0 0 16px 0;font-size:15px;color:${INK};">Hi ${name},</p>
                <p style="margin:0 0 28px 0;font-size:14px;line-height:1.7;color:${BODY};">${lead}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
                  <tr>
                    <td style="background:${GREEN};border-radius:2px;">
                      <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:14px;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">View your proposal &rarr;</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">Or paste this link into your browser:</p>
                <p style="margin:0 0 30px 0;font-size:12px;line-height:1.5;"><a href="${url}" style="color:${GREEN};word-break:break-all;">${url}</a></p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:24px 44px 34px 44px;border-top:1px solid #eeeae5;">
                <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:${BODY};">
                  Any questions? Just reply to this email and I&#39;d be glad to talk it through.
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;color:${BODY};">
                  Kind regards,<br>
                  <strong style="font-weight:600;">Chris Weiss</strong><br>
                  <span style="color:${MUTED};">Formation Landscapes</span><br>
                  <a href="https://formationlandscapes.com.au" style="color:${GREEN};text-decoration:none;">formationlandscapes.com.au</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:11px;letter-spacing:0.04em;color:#b3aea7;">Formation Landscapes &middot; Landscape design &amp; construction</p>
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
