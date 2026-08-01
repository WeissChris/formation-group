'use client'

// Budget & Targets - Settings section. Edits the fg_company_budget row for the current FY
// via /api/company/budget. These figures drive the Budget vs Actual panel on Financials and
// replace the old hardcoded 40% GP target. The monthly overhead budget feeds the director
// Company P&L page only.

import { useEffect, useState } from 'react'
import { fyStartYearOf, fyLabelOf, emptyBudget, type CompanyBudget } from '@/lib/companyBudget'

const FIELDS: Array<{ key: keyof CompanyBudget; label: string; hint?: string }> = [
  { key: 'revenueTargetFormation', label: 'Formation revenue target (FY, ex GST)' },
  { key: 'revenueTargetLume', label: 'Lume Pools revenue target (FY, ex GST)' },
  { key: 'revenueTargetDesign', label: 'Design revenue target (FY, ex GST)' },
  { key: 'gpTargetPct', label: 'GP % target', hint: 'Company-wide goal shown on Financials (per-job targets stay banded by mix)' },
  { key: 'overheadBudgetMonthly', label: 'Overhead budget / month', hint: 'Only used on the director Company P&L page' },
]

export function BudgetTargetsSection() {
  const fy = fyStartYearOf(new Date())
  const [budget, setBudget] = useState<CompanyBudget>(emptyBudget(fy))
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'unconfigured'>('loading')

  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch(`/api/company/budget?fy=${fy}`, { cache: 'no-store' })
        const body = await resp.json()
        if (body.configured === false) { setStatus('unconfigured'); return }
        if (body.budget) setBudget(body.budget as CompanyBudget)
        setStatus('ready')
      } catch {
        setStatus('error')
      }
    })()
  }, [fy])

  const valueOf = (key: keyof CompanyBudget): string => {
    if (key in drafts) return drafts[key]
    const v = budget[key]
    return typeof v === 'number' && v !== 0 ? String(v) : ''
  }

  const save = async () => {
    const next: CompanyBudget = { ...budget }
    for (const f of FIELDS) {
      if (!(f.key in drafts)) continue
      const parsed = parseFloat(drafts[f.key].replace(/[^0-9.]/g, ''))
      ;(next as unknown as Record<string, number>)[f.key] = Number.isFinite(parsed) ? parsed : 0
    }
    if (!next.gpTargetPct) next.gpTargetPct = 40
    setStatus('saving')
    try {
      const resp = await fetch('/api/company/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!resp.ok) { setStatus('error'); return }
      setBudget(next)
      setDrafts({})
      setStatus('saved')
      setTimeout(() => setStatus('ready'), 2000)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'unconfigured') return null   // no Supabase - nowhere to store a budget

  return (
    <section>
      <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
        Budget &amp; Targets - {fyLabelOf(fy)}
      </p>
      <div className="space-y-px bg-fg-border">
        {FIELDS.map(f => (
          <div key={f.key} className="bg-fg-bg px-5 py-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">{f.label}</p>
              <input
                type="text"
                inputMode="decimal"
                value={valueOf(f.key)}
                onChange={e => setDrafts(d => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.key === 'gpTargetPct' ? '40' : '0'}
                className="w-32 px-2.5 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light text-right tabular-nums rounded-none outline-none focus:border-fg-heading transition-colors"
              />
            </div>
            {f.hint && <p className="text-2xs font-light text-fg-muted/60 mt-1">{f.hint}</p>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={save}
          disabled={status === 'saving' || status === 'loading'}
          className="px-4 py-1.5 bg-fg-dark text-white/80 text-2xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors disabled:opacity-40"
        >
          {status === 'saving' ? 'Saving...' : 'Save budget'}
        </button>
        {status === 'saved' && <span className="text-2xs font-light text-emerald-600">Saved</span>}
        {status === 'error' && <span className="text-2xs font-light text-red-500">Could not save - try again</span>}
      </div>
      <p className="text-xs font-light text-fg-muted/60 mt-3 leading-relaxed">
        Drives the Budget vs Actual panel on Financials and the GP % target across the app.
      </p>
    </section>
  )
}
