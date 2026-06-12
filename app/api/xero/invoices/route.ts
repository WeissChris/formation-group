import { NextRequest, NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/serverXero'

export const runtime = 'nodejs'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

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
 * Server proxy for Xero client invoices (accounts receivable).
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ items: [] }, { status: 403 })
  const tokens = await getValidTokens()
  if (!tokens) return NextResponse.json({ items: [] }, { status: 401 })
  try {
    const url = `${XERO_API_BASE}/Invoices?Type=ACCREC&Status=AUTHORISED,PAID`
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        'Accept': 'application/json',
      },
    })
    if (!resp.ok) return NextResponse.json({ items: [] }, { status: resp.status })
    const data = await resp.json()
    return NextResponse.json({ items: data.Invoices || [] })
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 })
  }
}

// Revenue account the draft invoice lines post to, per org. Formation and Lume can have different
// charts of accounts, so each has its own override; falls back to the shared var, then Xero's default
// Sales account "200". Drafts are reviewable, so a wrong code is easily fixed in Xero.
function salesAccountCode(entity: 'formation' | 'lume'): string {
  const perEntity = entity === 'lume'
    ? process.env.XERO_SALES_ACCOUNT_CODE_LUME
    : process.env.XERO_SALES_ACCOUNT_CODE_FORMATION
  return (perEntity || process.env.XERO_SALES_ACCOUNT_CODE || '200').trim()
}

type DraftInvoiceBody = {
  entity?: 'formation' | 'lume'   // which Xero org — Formation and Lume are separate accounts
  contactName: string
  reference?: string
  dueDate?: string  // ISO yyyy-mm-dd
  lineItems: { description: string; amount: number }[]
}

/**
 * Create a DRAFT accounts-receivable invoice in Xero from a progress claim. Draft only — it lands in
 * Xero for the user to review and approve/send; nothing is sent to a client automatically. Requires
 * the connection to have the `accounting.transactions` scope (a 403 means it's still read-only and
 * the user needs to reconnect).
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: DraftInvoiceBody
  try { body = await request.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }

  // Formation and Lume are separate Xero orgs — post the invoice to the project's org.
  const entity = body.entity === 'lume' ? 'lume' : 'formation'
  const orgLabel = entity === 'lume' ? 'Lume' : 'Formation'
  const tokens = await getValidTokens(entity)
  if (!tokens) return NextResponse.json({ error: `${orgLabel} isn't connected to Xero — connect it in Settings, then try again.` }, { status: 401 })

  const contactName = (body.contactName || '').trim()
  const lines = (body.lineItems || []).filter(l => l && Math.abs(Number(l.amount)) > 0.005)
  if (!contactName) return NextResponse.json({ error: 'A client name is required for the Xero contact.' }, { status: 400 })
  if (lines.length === 0) return NextResponse.json({ error: 'No invoice lines with an amount to send.' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)
  const invoice = {
    Type: 'ACCREC',
    Status: 'DRAFT',
    Contact: { Name: contactName },
    Date: today,
    DueDate: body.dueDate || today,
    Reference: body.reference || '',
    LineAmountTypes: 'Exclusive',   // amounts are ex-GST; Xero adds GST per TaxType
    LineItems: lines.map(l => ({
      Description: (l.description || 'Progress claim').slice(0, 3900),
      Quantity: 1,
      UnitAmount: Math.round(Number(l.amount) * 100) / 100,
      AccountCode: salesAccountCode(entity),
      TaxType: 'OUTPUT',            // GST on Income (10%) — AU
    })),
  }

  try {
    const resp = await fetch(`${XERO_API_BASE}/Invoices`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Invoices: [invoice] }),
    })
    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      // 403 almost always means the connection lacks the write scope — prompt a reconnect.
      const needsReconnect = resp.status === 403
      const message = needsReconnect
        ? 'Xero is connected read-only. Reconnect it in Settings to grant invoice-create access.'
        : (data?.Elements?.[0]?.ValidationErrors?.[0]?.Message || data?.Message || `Xero rejected the invoice (${resp.status}).`)
      return NextResponse.json({ error: message, needsReconnect }, { status: resp.status })
    }
    const inv = data?.Invoices?.[0]
    return NextResponse.json({ invoiceId: inv?.InvoiceID || null, invoiceNumber: inv?.InvoiceNumber || null })
  } catch {
    return NextResponse.json({ error: 'Could not reach Xero.' }, { status: 502 })
  }
}
