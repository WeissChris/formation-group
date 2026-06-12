import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const STATE_COOKIE = 'xero_oauth_state'

/**
 * Generate a Xero OAuth init URL with a fresh CSRF-resistant `state` value.
 * The state is also written to an httpOnly cookie (10-min expiry) so the callback
 * can verify the response is for a flow this server actually started.
 *
 * GET /api/xero/init  →  { url: string }
 */
export async function GET(request: NextRequest) {
  // Which org is being connected — Formation and Lume are separate Xero organisations. The entity is
  // carried inside `state` (which is also CSRF-verified against the cookie) so the callback knows
  // which connection to save the tokens under.
  const entity = new URL(request.url).searchParams.get('entity') === 'lume' ? 'lume' : 'formation'

  // `.trim()` defends against trailing whitespace/newlines accidentally pasted into env
  // values via the Vercel UI — those get URL-encoded as %0D%0A and Xero rejects the request
  // with the unhelpful "unauthorized_client - Unknown client" error.
  const clientId = (process.env.NEXT_PUBLIC_XERO_CLIENT_ID || '').trim()
  const redirectUri = (
    process.env.NEXT_PUBLIC_XERO_REDIRECT_URI ||
    'https://formation-group.vercel.app/api/xero/callback'
  ).trim()

  if (!clientId) {
    return NextResponse.json({ error: 'Xero not configured' }, { status: 500 })
  }

  // crypto-strong 32-byte random (vs Math.random which gives only ~52 bits of entropy), prefixed
  // with the entity so the callback can route the tokens. The whole string is still CSRF-checked.
  const state = `${entity}.${randomBytes(32).toString('hex')}`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    // New granular scopes (apps created after 2 March 2026 use these, not the broad scopes).
    // All are needed by the cost puller (xeroCostSync.ts):
    //   accounting.settings.read              — /Accounts (classify DIRECTCOSTS vs EXPENSE; resolve labour accounts)
    //   accounting.invoices.read              — /Invoices?Type=ACCPAY (Bills from suppliers)
    //   accounting.banktransactions.read      — /BankTransactions?Type=SPEND (Spend Money)
    //   accounting.reports.profitandloss.read — /Reports/ProfitAndLoss by tracking (production
    //                                           wages + super, which post via payroll not bills)
    //   accounting.transactions               — create draft ACCREC invoices from progress claims (write)
    //   accounting.contacts                   — find/create the client contact when drafting an invoice
    //   offline_access                        — refresh tokens for unattended hourly cron
    scope: 'accounting.settings.read accounting.invoices.read accounting.banktransactions.read accounting.reports.profitandloss.read accounting.transactions accounting.contacts offline_access',
    state,
  })

  const response = NextResponse.json({ url: `${XERO_AUTH_URL}?${params.toString()}` })
  response.cookies.set({
    name: STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  })
  return response
}
