'use client'

// Opinion of Probable Cost - the preliminary-pricing document sent before formal quoting.
// Generated from the estimate: categories become rows priced at their contract value (revenue +
// their share of project markups) rounded to the nearest $100; the client-facing "Scope of Works"
// prose is written here (stored on estimate.opc, seeded from templates) and edits autosave.
// Print-styled like the Quote page: edit affordances are print:hidden, prose prints as clean text.

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, loadProjects, loadProposals, saveEstimate } from '@/lib/storage'
import { getEstimates, upsertEstimate } from '@/lib/storageAsync'
import { formatCurrency } from '@/lib/utils'
import { activeLineItems, getEstimateContract, itemsContractValue } from '@/lib/estimateCalculations'
import type { Estimate, EstimateOpc } from '@/types'
import { Printer, ArrowLeft, X, Plus } from 'lucide-react'

const round100 = (n: number) => Math.round(n / 100) * 100

const DEFAULT_EXCLUSIONS: { title: string; blurb: string }[] = [
  { title: 'Electrical Works', blurb: '240V electrical and licensed plumbing work is excluded from all scopes.' },
  { title: 'Excavation', blurb: 'No allowance has been made for bulk excavation unless specifically noted in a scope.' },
  { title: 'LPOD Connections', blurb: 'Light grading of subsurface and drain installation only - no LPOD (Legal Point of Discharge) connections. These are usually provided by the house plumber.' },
]

function defaultIntro(projectName: string, hasPool: boolean): string {
  return `This document presents the Opinion of Probable Cost (OPC) for the ${projectName} project, prepared by Formation. It covers ${
    hasPool ? 'both the landscape construction estimate and the pool & spa build quote' : 'the landscape construction estimate'}.`
}

/** Auto-growing textarea that prints as clean text (textarea hidden in print, div shown). */
function ProseField({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string
}) {
  return (
    <>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
        className={`print:hidden w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 rounded-none outline-none resize-none transition-colors ${className}`}
        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }}
        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px` }}
      />
      <div className={`hidden print:block whitespace-pre-wrap ${className}`}>{value}</div>
    </>
  )
}

export default function OpcPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [opc, setOpc] = useState<EstimateOpc | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let found = loadEstimates().find(e => e.id === id)
      if (!found) {
        found = (await getEstimates()).find(e => e.id === id)
        if (found) saveEstimate(found)
      }
      if (cancelled) return
      if (!found) { router.push('/estimates'); return }
      setEstimate(found)
      const hasPool = found.projectType === 'landscape_and_pool' || found.projectType === 'pool_only'
      setOpc({
        date: found.opc?.date ?? new Date().toISOString().slice(0, 10),
        intro: found.opc?.intro ?? defaultIntro(found.name || found.projectName || 'client', hasPool),
        scopes: found.opc?.scopes ?? {},
        poolSubtotalExGst: found.opc?.poolSubtotalExGst ?? null,
        exclusions: found.opc?.exclusions ?? DEFAULT_EXCLUSIONS,
        excludedItems: found.opc?.excludedItems ?? [],
      })

      const p = loadProjects().find(p => p.id === found.projectId)
      const linkedProposal = found.proposalId ? loadProposals().find(pr => pr.id === found.proposalId) : null
      setClientName(p?.clientName || linkedProposal?.clientName || found.clientName || found.projectName || 'Client')
      setClientAddress(p?.address || linkedProposal?.projectAddress || found.projectAddress || '')
    })()
    return () => { cancelled = true }
  }, [id, router])

  // Debounced autosave of the OPC data onto the estimate (local + Supabase), flushed on leave.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<EstimateOpc | null>(null)
  const estimateRef = useRef<Estimate | null>(null)
  estimateRef.current = estimate
  const mutate = (patch: Partial<EstimateOpc>) => {
    setOpc(prev => {
      const next = { ...(prev ?? {}), ...patch }
      pendingRef.current = next
      setSaveState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const est = estimateRef.current
        if (!est) return
        pendingRef.current = null
        const updated = { ...est, opc: next, updatedAt: new Date().toISOString() }
        setEstimate(updated)
        void upsertEstimate(updated).then(() => setSaveState('saved'))
      }, 800)
      return next
    })
  }
  useEffect(() => {
    const flush = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      const est = estimateRef.current
      if (pendingRef.current && est) {
        void upsertEstimate({ ...est, opc: pendingRef.current, updatedAt: new Date().toISOString() })
        pendingRef.current = null
      }
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); flush() }
  }, [])

  if (!estimate || !opc) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const active = activeLineItems(estimate)
  const contract = getEstimateContract(estimate)
  const categories = Array.from(new Set(active.map(i => i.category).filter(Boolean)))
  const rows = categories.map(category => ({
    category,
    price: round100(itemsContractValue(active.filter(i => i.category === category), contract)),
  }))

  // The document must add up for the client: the landscape subtotal is the SUM OF THE ROUNDED ROWS
  // (not the exact contract), GST and totals follow from it. Pool & spa is the manual Lume figure.
  const landscapeExGst = rows.reduce((s, r) => s + r.price, 0)
  const poolExGst = opc.poolSubtotalExGst ?? 0
  const hasPoolFigure = poolExGst > 0
  const combinedExGst = landscapeExGst + poolExGst
  const money = (n: number) => formatCurrency(n)

  const docDate = opc.date ? new Date(opc.date) : new Date()
  const scopes = opc.scopes ?? {}
  const exclusions = opc.exclusions ?? []
  const excludedItems = opc.excludedItems ?? []

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar (hidden in print) */}
      <div className="print:hidden bg-fg-darker px-6 py-3 flex items-center justify-between">
        <Link
          href={`/estimates/${estimate.id}`}
          className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Estimate
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-2xs text-white/40 w-14">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}</span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      <div className="max-w-[800px] mx-auto px-8 py-12 print:px-0 print:py-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/formation-primary-dark.svg" alt="Formation Landscapes" className="h-10 w-auto mb-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <p className="text-xs text-gray-400 font-light mt-2">Formation Landscapes Pty Ltd</p>
            <p className="text-xs text-gray-400 font-light">Melbourne, Victoria</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-light tracking-wide text-gray-900 mb-1">Opinion of Probable Cost</h1>
            <input
              type="date"
              value={opc.date ?? ''}
              onChange={e => mutate({ date: e.target.value })}
              className="print:hidden text-xs text-gray-500 font-light bg-transparent border border-transparent hover:border-gray-200 rounded-none outline-none text-right"
            />
            <p className="hidden print:block text-xs text-gray-500 font-light">
              {docDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Client + intro */}
        <div className="mb-10 border-t border-gray-200 pt-6">
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <p className="text-2xs font-light tracking-widest uppercase text-gray-400 mb-2">Client</p>
              <p className="text-base font-light text-gray-900">{clientName}</p>
            </div>
            <div>
              <p className="text-2xs font-light tracking-widest uppercase text-gray-400 mb-2">Site Address</p>
              <p className="text-base font-light text-gray-900">{clientAddress || '—'}</p>
            </div>
          </div>
          <ProseField
            value={opc.intro ?? ''}
            onChange={v => mutate({ intro: v })}
            placeholder="Intro paragraph…"
            className="text-sm font-light text-gray-600 leading-relaxed"
          />
        </div>

        {/* Landscape Construction Estimate */}
        <h2 className="text-lg font-light tracking-wide text-gray-900 mb-4">Landscape Construction Estimate</h2>
        <table className="w-full mb-10">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left pb-2 pr-4 text-xs font-normal tracking-widest uppercase text-gray-500 w-[170px]">Category</th>
              <th className="text-left pb-2 pr-4 text-xs font-normal tracking-widest uppercase text-gray-500">Scope of Works</th>
              <th className="text-right pb-2 text-xs font-normal tracking-widest uppercase text-gray-500 w-[90px]">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ category, price }) => (
              <tr key={category} className="border-b border-gray-100 align-top break-inside-avoid">
                <td className="py-3 pr-4 text-sm font-light text-gray-900">{category}</td>
                <td className="py-3 pr-4">
                  <ProseField
                    value={scopes[category] ?? ''}
                    onChange={v => mutate({ scopes: { ...scopes, [category]: v } })}
                    placeholder="Client-facing scope of works for this category…"
                    className="text-xs font-light text-gray-600 leading-relaxed"
                  />
                </td>
                <td className="py-3 text-sm font-light text-gray-900 text-right tabular-nums whitespace-nowrap">
                  {price > 0 ? money(price) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Project Cost Summary */}
        <h2 className="text-lg font-light tracking-wide text-gray-900 mb-4 break-before-auto">Project Cost Summary</h2>
        <div className="mb-10 space-y-3">
          <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
            <p className="text-sm font-light text-gray-900">Landscape Construction</p>
            <p className="text-xs font-light text-gray-600 tabular-nums">
              Subtotal ex. GST: {money(landscapeExGst)} &nbsp;|&nbsp; GST: {money(landscapeExGst * 0.1)} &nbsp;|&nbsp; Total: {money(landscapeExGst * 1.1)}
            </p>
          </div>
          <div className="flex items-baseline justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-light text-gray-900">Pool &amp; Spa</p>
              <label className="print:hidden text-2xs text-gray-400 flex items-center gap-1">
                ex GST $
                <input
                  type="number"
                  value={opc.poolSubtotalExGst ?? ''}
                  onChange={e => mutate({ poolSubtotalExGst: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })}
                  placeholder="from Lume quote"
                  className="w-28 px-1.5 py-0.5 border border-gray-200 rounded-none outline-none focus:border-gray-400 text-xs tabular-nums"
                />
              </label>
            </div>
            <p className="text-xs font-light text-gray-600 tabular-nums">
              {hasPoolFigure
                ? <>Subtotal ex. GST: {money(poolExGst)} &nbsp;|&nbsp; GST: {money(poolExGst * 0.1)} &nbsp;|&nbsp; Total: {money(poolExGst * 1.1)}</>
                : <span className="print:hidden text-gray-400">enter the Lume figure to include</span>}
            </p>
          </div>
          {hasPoolFigure && (
            <div className="flex items-baseline justify-between border-t-2 border-gray-900 pt-3">
              <p className="text-sm font-normal text-gray-900">Combined Project Total</p>
              <p className="text-xs font-normal text-gray-900 tabular-nums">
                Ex. GST: {money(combinedExGst)} &nbsp;|&nbsp; GST: {money(combinedExGst * 0.1)} &nbsp;|&nbsp; Total inc. GST: {money(combinedExGst * 1.1)}
              </p>
            </div>
          )}
          {!hasPoolFigure && (
            <div className="flex items-baseline justify-between border-t-2 border-gray-900 pt-3">
              <p className="text-sm font-normal text-gray-900">Total inc. GST</p>
              <p className="text-sm font-normal text-gray-900 tabular-nums">{money(landscapeExGst * 1.1)}</p>
            </div>
          )}
        </div>

        {/* Exclusions & Key Notes */}
        <h2 className="text-lg font-light tracking-wide text-gray-900 mb-4">Exclusions &amp; Key Notes</h2>
        <div className="mb-8 bg-gray-50 px-6 py-5 break-inside-avoid">
          <p className="text-xs font-normal tracking-widest uppercase text-gray-400 mb-4">
            {hasPoolFigure ? 'Excluded from Both Quotes' : 'Excluded'}
          </p>
          <div className="grid grid-cols-3 gap-6 print:grid-cols-3">
            {exclusions.map((ex, i) => (
              <div key={i} className="relative group">
                <button
                  onClick={() => mutate({ exclusions: exclusions.filter((_, j) => j !== i) })}
                  title="Remove" className="print:hidden absolute -top-1 -right-1 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
                <input
                  value={ex.title}
                  onChange={e => mutate({ exclusions: exclusions.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                  className="print:hidden w-full text-xs font-normal text-gray-800 bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 rounded-none outline-none mb-1"
                />
                <p className="hidden print:block text-xs font-normal text-gray-800 mb-1">{ex.title}</p>
                <ProseField
                  value={ex.blurb}
                  onChange={v => mutate({ exclusions: exclusions.map((x, j) => j === i ? { ...x, blurb: v } : x) })}
                  placeholder="Why / what exactly is excluded…"
                  className="text-2xs font-light text-gray-500 leading-relaxed"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => mutate({ exclusions: [...exclusions, { title: 'New exclusion', blurb: '' }] })}
            className="print:hidden mt-3 flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
            <Plus className="w-3 h-3" /> Add exclusion
          </button>
        </div>

        {/* Excluded items list */}
        <div className="mb-10 bg-gray-50 px-6 py-5 break-inside-avoid">
          <p className="text-xs font-normal tracking-widest uppercase text-gray-400 mb-3">Items</p>
          <ul className="space-y-1.5">
            {excludedItems.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-xs font-light text-gray-500">
                <span>·</span>
                <input
                  value={item}
                  onChange={e => mutate({ excludedItems: excludedItems.map((x, j) => j === i ? e.target.value : x) })}
                  className="print:hidden flex-1 bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 rounded-none outline-none"
                />
                <span className="hidden print:inline">{item}</span>
                <button
                  onClick={() => mutate({ excludedItems: excludedItems.filter((_, j) => j !== i) })}
                  className="print:hidden text-gray-300 hover:text-red-400"><X className="w-3 h-3" /></button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => mutate({ excludedItems: [...excludedItems, ''] })}
            className="print:hidden mt-3 flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
            <Plus className="w-3 h-3" /> Add item
          </button>
        </div>

        {/* Footnote */}
        <div className="mb-10 border-t border-gray-100 pt-6">
          <p className="text-xs font-light text-gray-400 italic">
            This Opinion of Probable Cost is preliminary pricing prepared from the design documentation
            available at the date above. It is not a fixed-price quotation; a formal quote will follow
            once the design and scope are finalised.
          </p>
        </div>
      </div>
    </div>
  )
}
