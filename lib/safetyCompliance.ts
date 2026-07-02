// Subcontractor compliance - doc types, per-company status maths (pure, tested), and the
// company/document row mappers. Server-side chase/email lives in lib/safetyChase.ts.

export const DOC_TYPES = [
  { key: 'public_liability', label: 'Public Liability Insurance', required: true },
  { key: 'workers_comp', label: 'WorkCover / Workers Compensation', required: true },
  { key: 'trade_licence', label: 'Trade Licence / Registration', required: false },
  { key: 'white_card', label: 'White Card (Construction Induction)', required: false },
  { key: 'swms', label: 'Company SWMS', required: false },
  { key: 'other', label: 'Other', required: false },
] as const
export type DocTypeKey = (typeof DOC_TYPES)[number]['key']
export const REQUIRED_DOC_TYPES = DOC_TYPES.filter(d => d.required).map(d => d.key)
export function docTypeLabel(key: string): string {
  return DOC_TYPES.find(d => d.key === key)?.label ?? key
}

export interface ContractorCompany {
  id: string
  name: string
  abn: string
  email: string
  phone: string
  notes: string
  chaseSnoozedUntil: string | null
  createdAt: string
}

export interface PrequalDocument {
  id: string
  companyId: string
  docType: string
  filename: string
  storagePath: string
  issuedOn: string | null
  expiresOn: string | null
  policyNumber: string
  source: string
  uploadedAt: string
}

export type ComplianceStatus = 'ok' | 'expiring' | 'missing_or_expired'

export interface CompanyCompliance {
  status: ComplianceStatus
  perType: { docType: string; label: string; required: boolean; status: ComplianceStatus | 'not_provided'; expiresOn: string | null }[]
  /** Doc types that should be requested right now (required + missing/expired/expiring). */
  needs: string[]
}

/** Days from todayIso to dateIso (negative = past). */
export function daysUntil(dateIso: string, todayIso: string): number {
  return Math.round((new Date(`${dateIso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86400000)
}

/**
 * A company's compliance from its documents (latest doc per type wins):
 *   - a REQUIRED type with no doc, or whose latest doc is expired -> missing_or_expired (red)
 *   - any doc (required or not) expiring within 14 days -> expiring (amber)
 *   - otherwise ok (green). Pure - tested.
 */
export function companyCompliance(docs: PrequalDocument[], todayIso: string): CompanyCompliance {
  const latestByType = new Map<string, PrequalDocument>()
  for (const d of docs) {
    const ex = latestByType.get(d.docType)
    if (!ex || d.uploadedAt > ex.uploadedAt) latestByType.set(d.docType, d)
  }

  const perType: CompanyCompliance['perType'] = []
  const needs: string[] = []
  let worst: ComplianceStatus = 'ok'
  const bump = (s: ComplianceStatus) => {
    if (s === 'missing_or_expired') worst = 'missing_or_expired'
    else if (s === 'expiring' && worst === 'ok') worst = 'expiring'
  }

  for (const t of DOC_TYPES) {
    const doc = latestByType.get(t.key)
    if (!doc) {
      if (t.required) { perType.push({ docType: t.key, label: t.label, required: true, status: 'missing_or_expired', expiresOn: null }); needs.push(t.key); bump('missing_or_expired') }
      else perType.push({ docType: t.key, label: t.label, required: false, status: 'not_provided', expiresOn: null })
      continue
    }
    let s: ComplianceStatus = 'ok'
    if (doc.expiresOn) {
      const days = daysUntil(doc.expiresOn, todayIso)
      if (days < 0) s = 'missing_or_expired'
      else if (days <= 14) s = 'expiring'
    }
    perType.push({ docType: t.key, label: t.label, required: t.required, status: s, expiresOn: doc.expiresOn })
    if (s !== 'ok') { needs.push(t.key); bump(t.required ? s : (s === 'missing_or_expired' ? 'expiring' : s)) }
  }

  return { status: worst, perType, needs }
}

export function mapContractorCompany(row: Record<string, unknown>): ContractorCompany {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    abn: (row.abn as string | null) || '',
    email: (row.email as string | null) || '',
    phone: (row.phone as string | null) || '',
    notes: (row.notes as string | null) || '',
    chaseSnoozedUntil: (row.chase_snoozed_until as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

export function mapPrequalDocument(row: Record<string, unknown>): PrequalDocument {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    docType: (row.doc_type as string) || 'other',
    filename: (row.filename as string) || '',
    storagePath: (row.storage_path as string) || '',
    issuedOn: (row.issued_on as string | null) ?? null,
    expiresOn: (row.expires_on as string | null) ?? null,
    policyNumber: (row.policy_number as string | null) || '',
    source: (row.source as string) || 'upload',
    uploadedAt: row.uploaded_at as string,
  }
}
