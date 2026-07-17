// Transactional email — server-only. Sends design proposals to clients via Resend.
//
// NEVER import from a client component (it reads RESEND_API_KEY). The send route
// (app/api/proposals/send) is the only caller.
//
// Setup: RESEND_API_KEY on Vercel, and the sending domain (formationlandscapes.com.au)
// verified in Resend (SPF/DKIM DNS records). Sender/reply-to/bcc default to Chris's address
// and can be overridden by env without a redeploy of logic.

import { clientGreetingNames } from './utils'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

const DEFAULT_FROM = 'Formation Landscapes <chris@formationlandscapes.com.au>'
const DEFAULT_REPLY_TO = 'chris@formationlandscapes.com.au'
const DEFAULT_BCC = 'chris@formationlandscapes.com.au'

export interface ProposalEmailInput {
  to: string
  clientName: string
  clientName2?: string   // optional second client — greeted alongside clientName ("Hi A and B,")
  greetingName?: string  // override the "Hi ..," name (e.g. address the email to the architect Ben)
  proposalUrl: string
  projectAddress?: string
  message?: string   // the email body message — separate from the proposal's on-page intro
  cc?: string        // extra recipients (comma/semicolon/space separated) CC'd, visible to the client
}

/** Who the email is addressed to: the override name if set, else the client name(s). */
function greetName(input: ProposalEmailInput): string {
  return (input.greetingName || '').trim() || clientGreetingNames(input.clientName, input.clientName2)
}

/** Parse a free-text recipient list into validated, de-duplicated email addresses. */
export function parseEmailList(input?: string): string[] {
  if (!input) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(/[,;\s]+/)) {
    const e = raw.trim()
    if (!e || !isValidEmail(e)) continue
    const key = e.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

const DEFAULT_EMAIL_MESSAGE =
  'Thank you for the opportunity to discuss your project. Your landscape design proposal is ready to view online — including our design process, the deliverables for each phase, and the associated fees.'

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

export function proposalEmailSubject(): string {
  return 'Your landscape design proposal — Formation Landscapes'
}

/** The email body, split into paragraphs (blank-line separated). Falls back to a sensible default.
 *  The email already opens with "Hi <name>," so a greeting the sender typed as the first line is
 *  dropped to avoid a double greeting. */
function messageParagraphs(message?: string): string[] {
  const trimmed = (message || '').trim()
  const source = trimmed || DEFAULT_EMAIL_MESSAGE
  const paras = source.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  if (paras.length > 1 && /^(hi|hello|hey|dear)\b[^.!?]{0,40},?$/i.test(paras[0].replace(/\s+/g, ' ').trim())) {
    paras.shift()
  }
  return paras
}

/** Plain-text body (improves deliverability and covers text-only clients). */
export function buildProposalEmailText(input: ProposalEmailInput): string {
  return [
    `Hi ${greetName(input)},`,
    '',
    messageParagraphs(input.message).join('\n\n'),
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
  const name = escapeHtml(greetName(input))
  const bodyHtml = messageParagraphs(input.message)
    .map((p, i, arr) => `<p style="margin:0 0 ${i === arr.length - 1 ? 28 : 16}px 0;font-size:14px;line-height:1.7;color:${BODY};">${escapeHtml(p)}</p>`)
    .join('')
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
                ${bodyHtml}
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

/** Low-level Resend send. Returns email_not_configured when no API key is set (soft). */
async function sendViaResend(opts: {
  to: string | string[]
  subject: string
  html: string
  text?: string
  cc?: string[]
  bcc?: string[]
  replyTo?: string
}): Promise<SendResult> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!apiKey) return { ok: false, error: 'email_not_configured' }
  const from = (process.env.PROPOSAL_FROM_EMAIL || DEFAULT_FROM).trim()
  const replyTo = (opts.replyTo || process.env.PROPOSAL_REPLY_TO || DEFAULT_REPLY_TO).trim()

  let resp: Response
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: Array.isArray(opts.to) ? opts.to : [opts.to.trim()],
        ...(opts.cc && opts.cc.length ? { cc: opts.cc } : {}),
        ...(opts.bcc && opts.bcc.length ? { bcc: opts.bcc } : {}),
        reply_to: replyTo,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
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

/**
 * Send a proposal email via Resend. Returns { ok:false, error:'email_not_configured' } when no
 * API key is set (so the UI can show a helpful message rather than a hard failure).
 */
export async function sendProposalEmail(input: ProposalEmailInput): Promise<SendResult> {
  if (!isValidEmail(input.to)) return { ok: false, error: 'invalid_email' }
  const bcc = (process.env.PROPOSAL_BCC || DEFAULT_BCC).trim()
  const toLower = input.to.trim().toLowerCase()
  const cc = parseEmailList(input.cc).filter(e => e.toLowerCase() !== toLower)
  return sendViaResend({
    to: input.to.trim(),
    cc: cc.length ? cc : undefined,
    bcc: bcc ? [bcc] : undefined,
    subject: proposalEmailSubject(),
    html: buildProposalEmailHtml(input),
    text: buildProposalEmailText(input),
  })
}

// ── Variation approval email ─────────────────────────────────────────────────

export interface VariationEmailInput {
  to: string
  clientName: string
  clientName2?: string
  variationUrl: string
  variationLabel?: string   // e.g. "Variation VMO-1"
  projectAddress?: string
  amountLabel?: string      // e.g. "+$2,400 + GST"
  message?: string
  cc?: string
}

function variationParagraphs(message?: string): string[] {
  const source = (message || '').trim() || 'A variation to your project is ready for your review. Please take a look and approve it online.'
  return source.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}

export function buildVariationEmailHtml(input: VariationEmailInput): string {
  const GREEN = '#3D5A3A', INK = '#1a1a1a', BODY = '#2d2d2d', MUTED = '#8A8580'
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
  const name = escapeHtml(clientGreetingNames(input.clientName, input.clientName2))
  const url = escapeHtml(input.variationUrl)
  const label = escapeHtml(input.variationLabel || 'Variation')
  const address = input.projectAddress ? escapeHtml(input.projectAddress.trim()) : ''
  const amount = input.amountLabel ? escapeHtml(input.amountLabel) : ''
  const bodyHtml = variationParagraphs(input.message).map((p, i, arr) => `<p style="margin:0 0 ${i === arr.length - 1 ? 24 : 16}px 0;font-size:14px;line-height:1.7;color:${BODY};">${escapeHtml(p)}</p>`).join('')
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eceae7;font-family:${font};color:${BODY};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceae7;"><tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #e7e4df;">
        <tr><td style="padding:34px 44px 0 44px;">
          <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:${GREEN};font-weight:600;">Formation Landscapes</p>
          <h1 style="margin:0;font-size:24px;font-weight:300;line-height:1.25;color:${INK};">${label} for your approval</h1>
          ${address ? `<p style="margin:8px 0 0 0;font-size:13px;font-weight:300;color:${MUTED};">${address}</p>` : ''}
          ${amount ? `<p style="margin:6px 0 0 0;font-size:14px;color:${INK};">${amount}</p>` : ''}
        </td></tr>
        <tr><td style="padding:24px 44px 0 44px;">
          <p style="margin:0 0 16px 0;font-size:15px;color:${INK};">Hi ${name},</p>
          ${bodyHtml}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;"><tr><td style="background:${GREEN};border-radius:2px;">
            <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:14px;color:#fff;text-decoration:none;letter-spacing:0.04em;">Review &amp; approve &rarr;</a>
          </td></tr></table>
          <p style="margin:0 0 4px 0;font-size:12px;color:${MUTED};">Or paste this link into your browser:</p>
          <p style="margin:0 0 30px 0;font-size:12px;line-height:1.5;"><a href="${url}" style="color:${GREEN};word-break:break-all;">${url}</a></p>
        </td></tr>
        <tr><td style="padding:24px 44px 34px 44px;border-top:1px solid #eeeae5;">
          <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:${BODY};">Any questions? Just reply to this email.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:${BODY};">Kind regards,<br><strong style="font-weight:600;">Chris Weiss</strong><br><span style="color:${MUTED};">Formation Landscapes</span></p>
        </td></tr>
      </table>
    </td></tr></table></body></html>`
}

export function buildVariationEmailText(input: VariationEmailInput): string {
  return [
    `Hi ${clientGreetingNames(input.clientName, input.clientName2)},`, '',
    variationParagraphs(input.message).join('\n\n'), '',
    `Review & approve: ${input.variationUrl}`, '',
    'Any questions, just reply to this email.', '',
    'Kind regards,', 'Chris Weiss', 'Formation Landscapes',
  ].join('\n')
}

export async function sendVariationEmail(input: VariationEmailInput): Promise<SendResult> {
  if (!isValidEmail(input.to)) return { ok: false, error: 'invalid_email' }
  const bcc = (process.env.PROPOSAL_BCC || DEFAULT_BCC).trim()
  const toLower = input.to.trim().toLowerCase()
  const cc = parseEmailList(input.cc).filter(e => e.toLowerCase() !== toLower)
  return sendViaResend({
    to: input.to.trim(),
    cc: cc.length ? cc : undefined,
    bcc: bcc ? [bcc] : undefined,
    subject: `${input.variationLabel || 'Variation'} for approval — Formation Landscapes`,
    html: buildVariationEmailHtml(input),
    text: buildVariationEmailText(input),
  })
}

// ── Acceptance emails ────────────────────────────────────────────────────────

export interface AcceptanceInput {
  clientName: string
  clientName2?: string   // optional second client — greeted alongside clientName
  acceptedByName?: string
  clientEmail?: string
  projectAddress?: string
  proposalUrl: string
  totalLabel?: string   // e.g. "$13,300" — shown in the internal notification
}

/** Branded confirmation sent to the client after they accept. */
export function buildAcceptanceClientHtml(input: AcceptanceInput): string {
  const GREEN = '#3D5A3A', INK = '#1a1a1a', BODY = '#2d2d2d', MUTED = '#8A8580'
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
  const name = escapeHtml(clientGreetingNames(input.clientName, input.clientName2))
  const url = escapeHtml(input.proposalUrl)
  const hero = `${appBaseUrl()}/proposal-hero-7.jpg`
  const address = input.projectAddress ? escapeHtml(input.projectAddress.trim()) : ''
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eceae7;font-family:${font};color:${BODY};">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">Thanks for accepting your proposal — here's what happens next.</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceae7;">
      <tr><td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e4df;">
          <tr><td style="padding:0;line-height:0;background:${GREEN};">
            <img src="${hero}" width="600" alt="Formation Landscapes" style="display:block;width:100%;max-width:600px;height:200px;object-fit:cover;border:0;" />
          </td></tr>
          <tr><td style="padding:34px 44px 0 44px;">
            <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:${GREEN};font-weight:600;">Formation Landscapes</p>
            <h1 style="margin:0;font-size:25px;font-weight:300;line-height:1.25;color:${INK};">Thank you — we&#39;re thrilled to begin</h1>
            ${address ? `<p style="margin:8px 0 0 0;font-size:13px;font-weight:300;color:${MUTED};">${address}</p>` : ''}
          </td></tr>
          <tr><td style="padding:26px 44px 0 44px;">
            <p style="margin:0 0 16px 0;font-size:15px;color:${INK};">Hi ${name},</p>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:${BODY};">Thank you for accepting your landscape design proposal — we&#39;re really looking forward to working with you and bringing your project to life.</p>
            <p style="margin:0 0 28px 0;font-size:14px;line-height:1.7;color:${BODY};">I&#39;ll be in touch shortly to confirm the next steps and get your design underway. In the meantime, you can revisit your proposal any time:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 30px 0;"><tr><td style="background:${GREEN};border-radius:2px;">
              <a href="${url}" style="display:inline-block;padding:14px 32px;font-size:14px;color:#ffffff;text-decoration:none;letter-spacing:0.04em;">View your proposal &rarr;</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:24px 44px 34px 44px;border-top:1px solid #eeeae5;">
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:${BODY};">Any questions in the meantime? Just reply to this email.</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:${BODY};">
              Kind regards,<br>
              <strong style="font-weight:600;">Chris Weiss</strong><br>
              <span style="color:${MUTED};">Formation Landscapes</span><br>
              <a href="https://formationlandscapes.com.au" style="color:${GREEN};text-decoration:none;">formationlandscapes.com.au</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

export function buildAcceptanceClientText(input: AcceptanceInput): string {
  return [
    `Hi ${clientGreetingNames(input.clientName, input.clientName2)},`,
    '',
    'Thank you for accepting your landscape design proposal — we are really looking forward to working with you and bringing your project to life.',
    '',
    'I will be in touch shortly to confirm the next steps and get your design underway. You can revisit your proposal any time:',
    input.proposalUrl,
    '',
    'Any questions in the meantime? Just reply to this email.',
    '',
    'Kind regards,',
    'Chris Weiss',
    'Formation Landscapes',
  ].join('\n')
}

/** Plain internal notification to Chris that a proposal was accepted. */
export function buildAcceptanceNotifyHtml(input: AcceptanceInput): string {
  const GREEN = '#3D5A3A', INK = '#1a1a1a', BODY = '#2d2d2d', MUTED = '#8A8580'
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
  const client = escapeHtml(input.clientName || 'A client')
  const by = input.acceptedByName ? escapeHtml(input.acceptedByName) : ''
  const url = escapeHtml(input.proposalUrl)
  const address = input.projectAddress ? escapeHtml(input.projectAddress.trim()) : ''
  const total = input.totalLabel ? escapeHtml(input.totalLabel) : ''
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;font-size:13px;color:${MUTED};white-space:nowrap;">${label}</td><td style="padding:4px 0;font-size:13px;color:${INK};">${value}</td></tr>`
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eceae7;font-family:${font};color:${BODY};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceae7;">
      <tr><td align="center" style="padding:28px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e7e4df;">
          <tr><td style="padding:30px 36px 0 36px;">
            <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${GREEN};font-weight:600;">Proposal accepted</p>
            <h1 style="margin:0 0 18px 0;font-size:21px;font-weight:300;color:${INK};">${client} accepted their proposal</h1>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
              ${row('Client', client)}
              ${by ? row('Accepted by', by) : ''}
              ${address ? row('Project', address) : ''}
              ${total ? row('Fee', `${total} + GST`) : ''}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;"><tr><td style="background:${GREEN};border-radius:2px;">
              <a href="${url}" style="display:inline-block;padding:12px 26px;font-size:13px;color:#ffffff;text-decoration:none;letter-spacing:0.03em;">View proposal &rarr;</a>
            </td></tr></table>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

/** Send the client their acceptance confirmation (BCC Chris for the record). */
export async function sendAcceptanceClientEmail(input: AcceptanceInput): Promise<SendResult> {
  if (!input.clientEmail || !isValidEmail(input.clientEmail)) return { ok: false, error: 'invalid_email' }
  const bcc = (process.env.PROPOSAL_BCC || DEFAULT_BCC).trim()
  return sendViaResend({
    to: input.clientEmail.trim(),
    bcc: bcc ? [bcc] : undefined,
    subject: 'Thank you — we’ve received your acceptance',
    html: buildAcceptanceClientHtml(input),
    text: buildAcceptanceClientText(input),
  })
}

/** Notify Chris that a proposal was accepted. */
export async function sendAcceptanceNotifyEmail(input: AcceptanceInput): Promise<SendResult> {
  const to = (process.env.PROPOSAL_BCC || DEFAULT_BCC).trim() || DEFAULT_REPLY_TO
  return sendViaResend({
    to,
    subject: `Proposal accepted — ${input.clientName || 'client'}`,
    html: buildAcceptanceNotifyHtml(input),
  })
}

// ── Proposal-viewed notification ──────────────────────────────────────────────

/** Internal notification to Chris that a client opened (viewed) their proposal for the first time. */
export function buildProposalViewedNotifyHtml(input: AcceptanceInput): string {
  const GREEN = '#3D5A3A', INK = '#1a1a1a', BODY = '#2d2d2d', MUTED = '#8A8580'
  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`
  const client = escapeHtml(input.clientName || 'A client')
  const url = escapeHtml(input.proposalUrl)
  const address = input.projectAddress ? escapeHtml(input.projectAddress.trim()) : ''
  const total = input.totalLabel ? escapeHtml(input.totalLabel) : ''
  const when = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;font-size:13px;color:${MUTED};white-space:nowrap;">${label}</td><td style="padding:4px 0;font-size:13px;color:${INK};">${value}</td></tr>`
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eceae7;font-family:${font};color:${BODY};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceae7;">
      <tr><td align="center" style="padding:28px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e7e4df;">
          <tr><td style="padding:30px 36px 0 36px;">
            <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${GREEN};font-weight:600;">Proposal opened</p>
            <h1 style="margin:0 0 18px 0;font-size:21px;font-weight:300;color:${INK};">${client} just opened their proposal</h1>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px 0;">
              ${row('Client', client)}
              ${address ? row('Project', address) : ''}
              ${total ? row('Fee', `${total} + GST`) : ''}
              ${row('Opened', when)}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;"><tr><td style="background:${GREEN};border-radius:2px;">
              <a href="${url}" style="display:inline-block;padding:12px 26px;font-size:13px;color:#ffffff;text-decoration:none;letter-spacing:0.03em;">View proposal &rarr;</a>
            </td></tr></table>
            <p style="margin:0 0 26px 0;font-size:12px;line-height:1.6;color:${MUTED};">They've viewed it but not yet accepted — a good moment to follow up.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

/** Notify Chris that a client first opened their proposal. */
export async function sendProposalViewedNotifyEmail(input: AcceptanceInput): Promise<SendResult> {
  const to = (process.env.PROPOSAL_BCC || DEFAULT_BCC).trim() || DEFAULT_REPLY_TO
  return sendViaResend({
    to,
    subject: `Proposal opened — ${input.clientName || 'client'}`,
    html: buildProposalViewedNotifyHtml(input),
  })
}
