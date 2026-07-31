// The client-facing tax invoice - one A4 PDF attached to the invoice email. Payment details,
// terms, business address and ABN live HERE, on the document, not in the email body. Server-only.

import React from 'react'
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import { FormationLogoPdf } from './formationLogoPdf'

Font.registerHyphenationCallback(word => [word])

// Fixed remittance / entity details printed on every invoice.
export const INVOICE_PAY_TO = 'Formation Landscapes Pty Ltd'
export const INVOICE_BSB = '063-103'
export const INVOICE_ACCOUNT = '1034 7062'
export const INVOICE_TERMS_DAYS = 7
export const INVOICE_BUSINESS_ADDRESS = '261-263 Canterbury Road, Canterbury VIC 3126'
export const INVOICE_ABN = '21 148 216 031'

export interface InvoicePdfInput {
  invoiceNumber: string
  invoiceDate: string   // ISO date the invoice is issued (the send date)
  description?: string
  clientName: string
  projectAddress?: string
  // Per-category detail (all ex GST). claimedToDate/remaining are the position BEFORE this claim;
  // absent on the whole-claim fallback line, whose columns render as dashes.
  lines: { description: string; amount: number; claimedToDate?: number; remaining?: number }[]
  subtotalEx: number
  gst: number
  total: number
  comments?: string
}

const INK = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#8A8580'
const GREEN = '#3D5A3A'
const LINE = '#E7E4DF'
const WARM = '#F7F5F2'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: BODY, padding: 48, paddingBottom: 64 },
  // Understated, tracked small caps - the house style's section-heading language, not a shouty
  // banner. The logo carries the brand; the title just names the document.
  title: { fontSize: 11, color: INK, marginTop: 14, textTransform: 'uppercase', letterSpacing: 3 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, marginBottom: 18 },
  metaLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
  metaValue: { fontSize: 10, color: INK, marginTop: 1, marginBottom: 6 },
  billLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  billName: { fontSize: 11, color: INK },
  tableHead: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4, marginTop: 18 },
  th: { fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: LINE, paddingVertical: 7 },
  // Wide numeric columns - the description rarely needs half the page, so let the money use it.
  tdDesc: { flex: 1, paddingRight: 10 },
  tdNum: { width: 100, textAlign: 'right', fontSize: 9.5, color: MUTED, paddingLeft: 10 },
  tdClaim: { width: 104, textAlign: 'right', color: INK, paddingLeft: 10 },
  // Per-column totals directly under the table.
  colTotals: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: INK, paddingVertical: 7 },
  colTotalNum: { width: 100, textAlign: 'right', fontSize: 9.5, color: INK, paddingLeft: 10, fontFamily: 'Helvetica-Bold' },
  colTotalClaim: { width: 104, textAlign: 'right', fontSize: 10, color: INK, paddingLeft: 10, fontFamily: 'Helvetica-Bold' },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3 },
  totalsLabel: { width: 140, fontSize: 9, color: MUTED },
  totalsValue: { width: 104, textAlign: 'right', fontSize: 9.5, color: INK },
  grand: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: INK, marginTop: 4, paddingTop: 6 },
  grandLabel: { width: 140, fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK },
  grandValue: { width: 104, textAlign: 'right', fontSize: 11, fontFamily: 'Helvetica-Bold', color: INK },
  payBox: { backgroundColor: WARM, borderWidth: 1, borderColor: LINE, paddingVertical: 9, paddingHorizontal: 12, marginTop: 18 },
  payTitle: { fontSize: 8, color: INK, textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  payLine: { fontSize: 9.5, color: BODY, marginBottom: 1.5 },
  comments: { fontSize: 9.5, color: BODY, marginTop: 16, lineHeight: 1.5 },
  footer: { position: 'absolute', left: 48, right: 48, bottom: 28, borderTopWidth: 0.75, borderTopColor: LINE, paddingTop: 8 },
  footerText: { fontSize: 8, color: MUTED, lineHeight: 1.5 },
})

const money = (v: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

const dueDateIso = (invoiceDateIso: string) => {
  const d = new Date(`${invoiceDateIso.slice(0, 10)}T00:00:00`)
  d.setDate(d.getDate() + INVOICE_TERMS_DAYS)
  return d.toISOString()
}

export function InvoicePdf({ inv }: { inv: InvoicePdfInput }) {
  return (
    <Document title={`Invoice ${inv.invoiceNumber}`} author={INVOICE_PAY_TO}>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <FormationLogoPdf width={150} />
            <Text style={s.title}>Tax Invoice</Text>
            {inv.description ? <Text style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{inv.description}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.metaLabel}>Invoice no.</Text>
            <Text style={s.metaValue}>{inv.invoiceNumber}</Text>
            <Text style={s.metaLabel}>Invoice date</Text>
            <Text style={s.metaValue}>{fmtDate(inv.invoiceDate)}</Text>
            <Text style={s.metaLabel}>Due date</Text>
            <Text style={s.metaValue}>{fmtDate(dueDateIso(inv.invoiceDate))}</Text>
          </View>
        </View>

        <View>
          <Text style={s.billLabel}>Invoice to</Text>
          <Text style={s.billName}>{inv.clientName}</Text>
          {inv.projectAddress ? <Text style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>{inv.projectAddress}</Text> : null}
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, s.tdDesc]}>Description</Text>
          <Text style={[s.th, { width: 100, textAlign: 'right', paddingLeft: 10 }]}>Claimed to date</Text>
          <Text style={[s.th, { width: 104, textAlign: 'right', paddingLeft: 10 }]}>This claim (ex)</Text>
          <Text style={[s.th, { width: 100, textAlign: 'right', paddingLeft: 10 }]}>Remaining</Text>
        </View>
        {inv.lines.map((l, i) => {
          // Standard progress-claim reading: previously claimed / this claim / balance still to
          // come after this claim.
          const remainingAfter = l.remaining !== undefined ? Math.max(0, l.remaining - l.amount) : undefined
          return (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.tdDesc}>{l.description}</Text>
              <Text style={s.tdNum}>{l.claimedToDate !== undefined ? money(l.claimedToDate) : '-'}</Text>
              <Text style={s.tdClaim}>{money(l.amount)}</Text>
              <Text style={s.tdNum}>{remainingAfter !== undefined ? money(remainingAfter) : '-'}</Text>
            </View>
          )
        })}
        {/* Column totals - the deposit / prior claims and the balance to come, totalled in place */}
        {(() => {
          const prior = inv.lines.reduce((sum, l) => sum + (l.claimedToDate ?? 0), 0)
          const remaining = inv.lines.reduce((sum, l) => sum + (l.remaining !== undefined ? Math.max(0, l.remaining - l.amount) : 0), 0)
          const thisClaim = inv.lines.reduce((sum, l) => sum + l.amount, 0)
          return (
            <View style={s.colTotals} wrap={false}>
              <Text style={[s.tdDesc, { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: INK }]}>Total</Text>
              <Text style={s.colTotalNum}>{money(prior)}</Text>
              <Text style={s.colTotalClaim}>{money(thisClaim)}</Text>
              <Text style={s.colTotalNum}>{money(remaining)}</Text>
            </View>
          )
        })()}

        <View style={{ marginTop: 10 }}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>This claim (ex GST)</Text>
            <Text style={s.totalsValue}>{money(inv.subtotalEx)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>GST (10%)</Text>
            <Text style={s.totalsValue}>{money(inv.gst)}</Text>
          </View>
          <View style={s.grand}>
            <Text style={s.grandLabel}>Total (inc GST)</Text>
            <Text style={s.grandValue}>{money(inv.total)}</Text>
          </View>
        </View>

        {(inv.comments ?? '').trim() ? <Text style={s.comments}>{(inv.comments ?? '').trim()}</Text> : null}

        <View style={s.payBox} wrap={false}>
          <Text style={s.payTitle}>Payment details</Text>
          <Text style={s.payLine}>{INVOICE_PAY_TO}</Text>
          <Text style={s.payLine}>BSB: {INVOICE_BSB}    Account: {INVOICE_ACCOUNT}</Text>
          <Text style={s.payLine}>Payment terms: {INVOICE_TERMS_DAYS} days from invoice date</Text>
          <Text style={[s.payLine, { color: MUTED, marginTop: 4 }]}>Please quote invoice {inv.invoiceNumber} as the payment reference.</Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>{INVOICE_PAY_TO}  ·  ABN {INVOICE_ABN}</Text>
          <Text style={s.footerText}>{INVOICE_BUSINESS_ADDRESS}</Text>
        </View>
      </Page>
    </Document>
  )
}
