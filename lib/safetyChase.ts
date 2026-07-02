// Subcontractor document requests + expiry chasing - server-only.
//
// sendSafetyEmail: Resend when RESEND_API_KEY is set, DRY-RUN (console log, reports dryRun) when
// not - so the whole feature works end-to-end before the key exists, minus actual delivery.
// requestDocsForCompany: mints a 14-day upload token + emails the subbie the list of documents
// needed with the public upload link. runSafetyChase: the daily sweep - finds documents at the
// expiry thresholds, emails the subbie (fresh token) + alerts the office, deduped per
// (document, threshold, channel, recipient) via sf_expiry_notifications_sent, respecting each
// company's chase_snoozed_until. Renewed docs are new rows, so renewals re-arm naturally.

import { randomBytes } from 'crypto'
import { supabaseAdmin } from './supabaseAdmin'
import { mapContractorCompany, mapPrequalDocument, companyCompliance, docTypeLabel, daysUntil } from './safetyCompliance'

const THRESHOLDS = [30, 14, 7, 0, -7]   // days before expiry (negative = already expired)
const OFFICE_EMAIL = () => (process.env.SAFETY_OFFICE_EMAIL || 'chris@formationlandscapes.com.au').trim()
const FROM = () => (process.env.RESEND_FROM_EMAIL || 'Formation Group <onboarding@resend.dev>').trim()
const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/$/, '')

export interface SendResult { ok: boolean; dryRun: boolean; error?: string }

export async function sendSafetyEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const key = (process.env.RESEND_API_KEY || '').trim()
  if (!key) {
    console.log(`[safety-email DRY RUN] to=${to} subject="${subject}"`)
    return { ok: true, dryRun: true }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [to], subject, html }),
    })
    if (!res.ok) return { ok: false, dryRun: false, error: `resend_${res.status}` }
    return { ok: true, dryRun: false }
  } catch (e) {
    return { ok: false, dryRun: false, error: e instanceof Error ? e.message : 'send_failed' }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function requestEmailHtml(companyName: string, docLabels: string[], uploadUrl: string): string {
  return `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
    <p>Hi ${esc(companyName)},</p>
    <p>To keep your details current for work with Formation Landscapes / Lume Pools, could you please
    upload a current copy of the following:</p>
    <ul>${docLabels.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <p><a href="${uploadUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;
    text-decoration:none;border-radius:6px">Upload documents</a></p>
    <p style="color:#6b6660;font-size:12px">The link works for 14 days and needs no account - it takes
    about a minute per document. Reply to this email if anything is unclear.</p>
    <p>Thanks,<br/>Formation Group</p>
  </div>`
}

function officeAlertHtml(lines: string[]): string {
  return `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
    <p>Subcontractor compliance - documents expiring or expired:</p>
    <ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <p><a href="${APP_URL()}/safety/contractors">Open the contractors dashboard</a></p>
  </div>`
}

/** Mint (or reuse a still-valid) upload token for a company; returns the public upload URL. */
export async function mintUploadUrl(companyId: string): Promise<string | null> {
  if (!supabaseAdmin) return null
  const { data: existing } = await supabaseAdmin.from('sf_upload_tokens')
    .select('token, expires_at').eq('company_id', companyId)
    .gt('expires_at', new Date(Date.now() + 3 * 86400000).toISOString())   // reuse if 3+ days left
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing?.token) return `${APP_URL()}/upload/${existing.token}`
  const token = randomBytes(24).toString('base64url')
  const { error } = await supabaseAdmin.from('sf_upload_tokens').insert({
    token, company_id: companyId, expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  })
  if (error) return null
  return `${APP_URL()}/upload/${token}`
}

/** Email a company asking for the given doc types (defaults to whatever compliance says it needs). */
export async function requestDocsForCompany(companyId: string, docTypes?: string[]): Promise<SendResult & { needs?: string[] }> {
  if (!supabaseAdmin) return { ok: false, dryRun: false, error: 'not_configured' }
  const [companyRes, docsRes] = await Promise.all([
    supabaseAdmin.from('sf_contractor_companies').select('*').eq('id', companyId).maybeSingle(),
    supabaseAdmin.from('sf_prequal_documents').select('*').eq('company_id', companyId),
  ])
  if (!companyRes.data) return { ok: false, dryRun: false, error: 'company_not_found' }
  const company = mapContractorCompany(companyRes.data)
  if (!company.email) return { ok: false, dryRun: false, error: 'no_email' }

  const today = new Date().toISOString().slice(0, 10)
  const compliance = companyCompliance((docsRes.data ?? []).map(mapPrequalDocument), today)
  const needs = docTypes?.length ? docTypes : compliance.needs
  if (needs.length === 0) return { ok: true, dryRun: false, needs: [] }

  const uploadUrl = await mintUploadUrl(companyId)
  if (!uploadUrl) return { ok: false, dryRun: false, error: 'token_failed' }

  const result = await sendSafetyEmail(
    company.email,
    'Document request - Formation Landscapes / Lume Pools',
    requestEmailHtml(company.name, needs.map(docTypeLabel), uploadUrl),
  )
  return { ...result, needs }
}

export interface ChaseResult {
  ok: boolean
  checked: number
  contractor_emails: number
  office_alerts: number
  dry_run: boolean
  error?: string
}

/** The daily sweep. Idempotent (dedupe table), so running it hourly is safe. */
export async function runSafetyChase(): Promise<ChaseResult> {
  const empty = { checked: 0, contractor_emails: 0, office_alerts: 0, dry_run: !process.env.RESEND_API_KEY }
  if (!supabaseAdmin) return { ok: false, ...empty, error: 'not_configured' }
  try {
    const today = new Date().toISOString().slice(0, 10)
    const horizon = new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10)
    const floor = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10)

    const { data: docRows } = await supabaseAdmin.from('sf_prequal_documents')
      .select('*').not('expires_on', 'is', null).gte('expires_on', floor).lte('expires_on', horizon)
    const docs = (docRows ?? []).map(mapPrequalDocument)
    if (docs.length === 0) return { ok: true, ...empty }

    const companyIds = Array.from(new Set(docs.map(d => d.companyId)))
    const [companiesRes, sentRes] = await Promise.all([
      supabaseAdmin.from('sf_contractor_companies').select('*').in('id', companyIds),
      supabaseAdmin.from('sf_expiry_notifications_sent').select('document_id, threshold_days, channel, recipient')
        .in('document_id', docs.map(d => d.id)),
    ])
    const companies = new Map((companiesRes.data ?? []).map(r => [r.id as string, mapContractorCompany(r)]))
    const sent = new Set((sentRes.data ?? []).map(r => `${r.document_id}|${r.threshold_days}|${r.channel}|${r.recipient}`))

    // A doc's active threshold = the smallest threshold >= days-remaining (or -7 once expired past a week's grace).
    const dueByCompany = new Map<string, { doc: (typeof docs)[number]; threshold: number }[]>()
    for (const d of docs) {
      const days = daysUntil(d.expiresOn!, today)
      const threshold = THRESHOLDS.slice().reverse().find(t => days <= t)   // e.g. days=12 -> 14
      if (threshold === undefined) continue
      const arr = dueByCompany.get(d.companyId) ?? []
      arr.push({ doc: d, threshold })
      dueByCompany.set(d.companyId, arr)
    }

    let contractorEmails = 0
    const officeLines: string[] = []
    let anyDryRun = !process.env.RESEND_API_KEY

    for (const [companyId, items] of Array.from(dueByCompany.entries())) {
      const company = companies.get(companyId)
      if (!company) continue
      const snoozed = company.chaseSnoozedUntil && new Date(company.chaseSnoozedUntil) > new Date()

      // Contractor email: one per company covering every doc not yet notified at its threshold.
      const fresh = items.filter(i => !sent.has(`${i.doc.id}|${i.threshold}|contractor_email|${company.email || '-'}`))
      if (fresh.length > 0 && company.email && !snoozed) {
        const uploadUrl = await mintUploadUrl(companyId)
        if (uploadUrl) {
          const labels = fresh.map(i => {
            const days = daysUntil(i.doc.expiresOn!, today)
            return `${docTypeLabel(i.doc.docType)} (${days < 0 ? 'EXPIRED' : `expires in ${days} day${days === 1 ? '' : 's'}`})`
          })
          const res = await sendSafetyEmail(
            company.email,
            'Action needed - document expiring - Formation Landscapes / Lume Pools',
            requestEmailHtml(company.name, labels, uploadUrl),
          )
          if (res.ok) {
            contractorEmails++
            anyDryRun = anyDryRun || res.dryRun
            await supabaseAdmin.from('sf_expiry_notifications_sent').upsert(fresh.map(i => ({
              document_id: i.doc.id, threshold_days: i.threshold, channel: 'contractor_email', recipient: company.email || '-',
            })), { onConflict: 'document_id,threshold_days,channel,recipient', ignoreDuplicates: true })
          }
        }
      }

      // Office alert lines (deduped per doc/threshold too).
      for (const i of items) {
        const key = `${i.doc.id}|${i.threshold}|office_email|${OFFICE_EMAIL()}`
        if (sent.has(key)) continue
        const days = daysUntil(i.doc.expiresOn!, today)
        officeLines.push(`${company.name}: ${docTypeLabel(i.doc.docType)} ${days < 0 ? `expired ${-days}d ago` : `expires in ${days}d`}${snoozed ? ' (chase snoozed)' : ''}`)
        await supabaseAdmin.from('sf_expiry_notifications_sent').upsert([{
          document_id: i.doc.id, threshold_days: i.threshold, channel: 'office_email', recipient: OFFICE_EMAIL(),
        }], { onConflict: 'document_id,threshold_days,channel,recipient', ignoreDuplicates: true })
      }
    }

    let officeAlerts = 0
    if (officeLines.length > 0) {
      const res = await sendSafetyEmail(OFFICE_EMAIL(), `Subbie compliance: ${officeLines.length} document(s) need attention`, officeAlertHtml(officeLines))
      if (res.ok) { officeAlerts = 1; anyDryRun = anyDryRun || res.dryRun }
    }

    return { ok: true, checked: docs.length, contractor_emails: contractorEmails, office_alerts: officeAlerts, dry_run: anyDryRun }
  } catch (e) {
    return { ok: false, ...empty, error: e instanceof Error ? e.message : 'chase_failed' }
  }
}
