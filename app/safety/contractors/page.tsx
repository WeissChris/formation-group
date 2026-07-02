'use client'

// Subcontractor compliance dashboard (office): companies, their documents with expiry colours,
// request/snooze actions, add-company (with suggestions seeded from project subbie packages).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ContractorCompany, PrequalDocument, CompanyCompliance } from '@/lib/safetyCompliance'
import { docTypeLabel } from '@/lib/safetyCompliance'

type Row = ContractorCompany & { documents: PrequalDocument[]; compliance: CompanyCompliance }

const STATUS_UI: Record<string, { dot: string; label: string }> = {
  ok: { dot: 'bg-green-500', label: 'Compliant' },
  expiring: { dot: 'bg-amber-500', label: 'Expiring soon' },
  missing_or_expired: { dot: 'bg-red-500', label: 'Missing / expired' },
}

export default function ContractorsPage() {
  const [companies, setCompanies] = useState<Row[] | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [form, setForm] = useState({ name: '', abn: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const refresh = () => fetch('/api/safety/contractors', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { if (d.ok) { setCompanies(d.companies); setSuggestions(d.suggestions) } })
  useEffect(() => { refresh() }, [])

  const add = async () => {
    if (!form.name.trim()) return
    setBusy(true); setMsg('')
    const res = await fetch('/api/safety/contractors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setBusy(false)
    if (res.ok) { setForm({ name: '', abn: '', email: '', phone: '' }); refresh() }
    else setMsg('Could not add the company.')
  }

  const requestDocs = async (c: Row) => {
    setMsg('')
    const res = await fetch(`/api/safety/contractors/${c.id}/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setMsg(body.error === 'no_email' ? `${c.name} has no email - add one first.` : 'Request failed.')
    else if (body.needs?.length === 0) setMsg(`${c.name} is fully compliant - nothing to request.`)
    else setMsg(body.dryRun
      ? `Request prepared for ${c.name} (DRY RUN - no email sent: RESEND_API_KEY not configured yet).`
      : `Request emailed to ${c.name}.`)
  }

  const snooze = async (c: Row, days: number | null) => {
    await fetch('/api/safety/contractors', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, snoozeDays: days }),
    })
    refresh()
  }

  const saveEmail = async (c: Row) => {
    const email = window.prompt(`Email for ${c.name}:`, c.email || '')
    if (email === null) return
    await fetch('/api/safety/contractors', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, email }),
    })
    refresh()
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-24 pb-16">
      <Link href="/safety" className="text-xs text-fg-muted">&larr; Safety</Link>
      <div className="flex items-end justify-between flex-wrap gap-4 mt-1 mb-8">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">Contractor compliance</h1>
          <p className="text-sm font-light text-fg-muted mt-1">
            Documents are requested + chased automatically as they go missing or approach expiry.
          </p>
        </div>
      </div>

      {/* Add company */}
      <div className="border border-fg-border bg-white p-4 mb-8">
        <p className="text-xs font-medium text-fg-heading mb-2">Add a contractor company</p>
        <div className="grid md:grid-cols-5 gap-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Company name" list="subbie-suggestions"
            className="border border-fg-border px-2 py-1.5 text-sm bg-white md:col-span-2" />
          <datalist id="subbie-suggestions">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
          <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email (for doc requests)"
            className="border border-fg-border px-2 py-1.5 text-sm bg-white" />
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone"
            className="border border-fg-border px-2 py-1.5 text-sm bg-white" />
          <button onClick={add} disabled={busy || !form.name.trim()}
            className="px-4 py-1.5 bg-fg-dark text-white text-xs font-light tracking-wide uppercase disabled:opacity-40">
            Add
          </button>
        </div>
        {suggestions.length > 0 && (
          <p className="text-2xs text-fg-muted mt-2">
            Suggestions from project subbies: {suggestions.slice(0, 8).join(', ')}{suggestions.length > 8 ? '…' : ''}
          </p>
        )}
      </div>
      {msg && <p className="text-xs text-fg-heading bg-fg-card/40 border border-fg-border px-3 py-2 mb-4">{msg}</p>}

      {companies === null ? (
        <p className="text-sm text-fg-muted">Loading...</p>
      ) : companies.length === 0 ? (
        <p className="text-sm text-fg-muted py-10 text-center border border-dashed border-fg-border">
          No contractor companies yet - add the ones you use above.
        </p>
      ) : (
        <div className="border border-fg-border divide-y divide-fg-border/60 bg-white">
          {companies.map(c => {
            const ui = STATUS_UI[c.compliance.status]
            const isOpen = !!open[c.id]
            const snoozed = c.chaseSnoozedUntil && new Date(c.chaseSnoozedUntil) > new Date()
            return (
              <div key={c.id}>
                <button onClick={() => setOpen(o => ({ ...o, [c.id]: !o[c.id] }))}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-fg-card/20">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ui.dot}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-fg-heading truncate">{c.name}</p>
                      <p className="text-2xs text-fg-muted">
                        {c.email || 'no email'}{snoozed ? ` · chase snoozed until ${new Date(c.chaseSnoozedUntil!).toLocaleDateString('en-AU')}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-2xs uppercase tracking-wide text-fg-muted shrink-0">{ui.label}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 bg-fg-card/10">
                    <table className="w-full text-xs mb-3">
                      <tbody className="divide-y divide-fg-border/40">
                        {c.compliance.perType.map(t => (
                          <tr key={t.docType}>
                            <td className="py-1.5 pr-3">{t.label}{t.required ? ' *' : ''}</td>
                            <td className="py-1.5 pr-3 text-fg-muted">{t.expiresOn ? `expires ${new Date(t.expiresOn + 'T00:00:00').toLocaleDateString('en-AU')}` : '-'}</td>
                            <td className={`py-1.5 text-right ${t.status === 'ok' ? 'text-green-600' : t.status === 'expiring' ? 'text-amber-600' : t.status === 'not_provided' ? 'text-fg-muted/60' : 'text-red-600'}`}>
                              {t.status === 'ok' ? 'current' : t.status === 'expiring' ? 'expiring' : t.status === 'not_provided' ? 'not provided' : 'missing/expired'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {c.documents.length > 0 && (
                      <p className="text-2xs text-fg-muted mb-3">
                        {c.documents.length} file{c.documents.length === 1 ? '' : 's'} on record - latest: {c.documents[0].filename} ({docTypeLabel(c.documents[0].docType)})
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => requestDocs(c)}
                        className="px-3 py-1.5 bg-fg-dark text-white text-2xs font-light tracking-wide uppercase">
                        Request documents
                      </button>
                      <button onClick={() => saveEmail(c)}
                        className="px-3 py-1.5 border border-fg-border text-2xs text-fg-muted uppercase tracking-wide hover:text-fg-heading">
                        {c.email ? 'Change email' : 'Add email'}
                      </button>
                      {snoozed ? (
                        <button onClick={() => snooze(c, null)}
                          className="px-3 py-1.5 border border-fg-border text-2xs text-fg-muted uppercase tracking-wide hover:text-fg-heading">
                          Resume chasing
                        </button>
                      ) : (
                        <button onClick={() => snooze(c, 30)}
                          className="px-3 py-1.5 border border-fg-border text-2xs text-fg-muted uppercase tracking-wide hover:text-fg-heading">
                          Snooze 30 days
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
