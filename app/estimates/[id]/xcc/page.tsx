'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, saveEstimate } from '@/lib/storage'
import { getEstimates, upsertEstimate } from '@/lib/storageAsync'
import { activeLineItems } from '@/lib/estimateCalculations'
import { formatCurrency } from '@/lib/utils'
import { loadCachedXeroAccounts, getXeroAccounts, type XeroAccountOption } from '@/lib/xero'
import { loadXccDefaults, resolveXccDefault } from '@/lib/xcc'
import type { Estimate, EstimateLineItem } from '@/types'

const UNALLOCATED = '__unallocated__'

/** Sum line-item cost grouped by XCC code (unallocated bucketed under UNALLOCATED). */
function byXcc(items: EstimateLineItem[]): { code: string; total: number }[] {
  const map = new Map<string, number>()
  for (const li of items) {
    const key = li.xeroCategory || UNALLOCATED
    map.set(key, (map.get(key) || 0) + (li.total || 0))
  }
  return Array.from(map.entries())
    .map(([code, total]) => ({ code, total }))
    // unallocated first (so it's seen), then largest cost
    .sort((a, b) => (a.code === UNALLOCATED ? -1 : b.code === UNALLOCATED ? 1 : b.total - a.total))
}

/**
 * XCC summary — cost by Xero cost code, per category and across the whole project, mirroring the pivot
 * tables Chris keeps in the spreadsheet. Surfaces unallocated lines so nothing slips through before the
 * Gantt-phased budget export. "Fill from defaults" applies the learned category+type defaults to anything
 * still unallocated.
 */
export default function EstimateXccPage() {
  const { id } = useParams() as { id: string }
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [accounts, setAccounts] = useState<XeroAccountOption[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      let est = loadEstimates().find(e => e.id === id) ?? null
      if (!est) est = (await getEstimates()).find(e => e.id === id) ?? null
      setEstimate(est)
      setLoaded(true)
    })()
    setAccounts(loadCachedXeroAccounts())
    void getXeroAccounts().then(setAccounts)
  }, [id])

  if (loaded && !estimate) {
    return <div className="max-w-[900px] mx-auto px-6 py-10"><p className="text-sm font-light text-fg-muted">Estimate not found. <Link href="/estimates" className="underline">Back to estimates</Link></p></div>
  }
  if (!estimate) {
    return <div className="max-w-[900px] mx-auto px-6 py-10"><p className="text-sm font-light text-fg-muted">Loading…</p></div>
  }

  const items = activeLineItems(estimate)
  const accountName = (code: string) =>
    code === UNALLOCATED ? 'Unallocated' : code === '__total__' ? 'Total' : (accounts.find(a => a.code === code)?.name || code)

  const order: string[] = []
  const byCat: Record<string, EstimateLineItem[]> = {}
  for (const li of items) {
    if (!byCat[li.category]) { byCat[li.category] = []; order.push(li.category) }
    byCat[li.category].push(li)
  }

  const projectRows = byXcc(items)
  const grandTotal = items.reduce((s, li) => s + (li.total || 0), 0)
  const unallocatedCount = items.filter(li => !li.xeroCategory).length
  const unallocatedTotal = items.filter(li => !li.xeroCategory).reduce((s, li) => s + (li.total || 0), 0)

  const fillFromDefaults = () => {
    const defaults = loadXccDefaults()
    const est = loadEstimates().find(e => e.id === id)
    if (!est) return
    let changed = 0
    const lineItems = est.lineItems.map(li => {
      if (li.xeroCategory) return li
      const code = resolveXccDefault(defaults, li.category, li.type)
      if (code) { changed++; return { ...li, xeroCategory: code } }
      return li
    })
    if (changed) {
      const next = { ...est, lineItems }
      saveEstimate(next)
      void upsertEstimate(next)
      setEstimate(next)
    }
  }

  const Row = ({ code, total, bold }: { code: string; total: number; bold?: boolean }) => (
    <div className={`flex items-baseline justify-between py-1.5 text-sm font-light ${code === UNALLOCATED ? 'text-amber-600' : 'text-fg-heading'} ${bold ? 'font-medium border-t border-fg-border mt-1 pt-2' : 'border-b border-fg-border/30'}`}>
      <span className="truncate pr-3">{accountName(code)}</span>
      <span className="tabular-nums shrink-0">{formatCurrency(total)}</span>
    </div>
  )

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Xero cost codes — budget allocation</p>
          <h1 className="text-xl font-light text-fg-heading">{estimate.projectName}</h1>
          <p className="text-xs font-light text-fg-muted mt-1">{[estimate.name, `v${estimate.version}`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/estimates/${id}`} className="px-3 py-1.5 border border-fg-border text-fg-muted text-2xs font-light tracking-wide uppercase hover:text-fg-heading transition-colors">← Estimate</Link>
        </div>
      </div>

      {/* Unallocated warning + fill */}
      {unallocatedCount > 0 && (
        <div className="mb-6 border border-amber-300/60 bg-amber-50/40 px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs font-light text-amber-700">
            ⚠ {unallocatedCount} line{unallocatedCount === 1 ? '' : 's'} ({formatCurrency(unallocatedTotal)}) not yet allocated to a Xero cost code.
          </p>
          <button onClick={fillFromDefaults} className="px-3 py-1.5 bg-fg-dark text-white/80 text-2xs font-light tracking-wide uppercase hover:bg-fg-heading/80 transition-colors">
            Fill from defaults
          </button>
        </div>
      )}

      {/* Full project */}
      <div className="mb-10 max-w-md">
        <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted mb-2">Full project</p>
        <div>
          {projectRows.map(r => <Row key={r.code} code={r.code} total={r.total} />)}
          <Row code="__total__" total={grandTotal} bold />
        </div>
      </div>

      {/* Per category */}
      <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted mb-3">By category</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
        {order.map(cat => (
          <div key={cat}>
            <p className="text-xs font-medium text-fg-heading mb-1">{cat}</p>
            {byXcc(byCat[cat]).map(r => <Row key={r.code} code={r.code} total={r.total} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
