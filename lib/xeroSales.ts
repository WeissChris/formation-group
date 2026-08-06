// Xero sales blend - client-safe pure helpers.
//
// Some jobs' sales invoicing predates the platform (invoices raised directly in Xero, no
// progress claim behind them). The sync writes those ACCREC invoices to fg_xero_project_sales;
// these helpers add the ones the platform DOESN'T already know about to invoiced-to-date.
// Dedupe is by normalised invoice number against the claim's invoiceNumber AND
// xeroInvoiceNumber (Xero may renumber a pushed draft), so a claim-raised invoice that also
// appears in the Xero feed never counts twice.

import type { ProgressClaim } from '@/types'

export interface XeroSaleRow {
  invoiceNumber: string | null
  totalEx: number
}

/** "INV-0042" / "inv 42"-style variance-proof key: uppercase alphanumerics, leading zeros kept
 *  (stripping them would collide INV-0042 with INV-42 across different numbering schemes only
 *  when they really are the same sequence - Xero keeps a single sequence, so keep it exact). */
export function normInvoiceNo(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** The Xero sales rows NOT already represented by a platform claim (any status - a draft claim
 *  with the same number is still the same invoice). Generic so callers carrying extra fields
 *  (e.g. invoice dates for the monthly report) keep them through the filter. */
export function unmatchedXeroSales<T extends XeroSaleRow>(sales: T[], claims: ProgressClaim[]): T[] {
  const claimed = new Set<string>()
  for (const c of claims) {
    const a = normInvoiceNo(c.invoiceNumber)
    const b = normInvoiceNo(c.xeroInvoiceNumber)
    if (a) claimed.add(a)
    if (b) claimed.add(b)
  }
  return sales.filter(s => {
    const key = normInvoiceNo(s.invoiceNumber)
    return !(key && claimed.has(key))
  })
}

/** Dollars (ex GST) of Xero sales invoices the platform's claims don't cover. */
export function xeroSalesExtra(sales: XeroSaleRow[] | null | undefined, claims: ProgressClaim[]): number {
  if (!sales || sales.length === 0) return 0
  const extra = unmatchedXeroSales(sales, claims).reduce((s, r) => s + (Number(r.totalEx) || 0), 0)
  return Math.round(extra * 100) / 100
}
