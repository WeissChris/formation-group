'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates } from '@/lib/storage'
import { getEstimates } from '@/lib/storageAsync'
import { activeLineItems } from '@/lib/estimateCalculations'
import { formatCurrency } from '@/lib/utils'
import type { Estimate, EstimateLineItem } from '@/types'

const TYPE_LABEL: Record<string, string> = {
  Labour: 'Labour', Material: 'Material', Subcontractor: 'Subbie', Equipment: 'Equip',
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

/**
 * Bill of Quantities — site reference. Shows the COST ALLOWANCE (qty + rate + amount) per item,
 * grouped by category, with an overall summary, so the site team can see what's been allowed for.
 * No sell price or margin (commercial). Print / Save PDF, same pattern as the financial report.
 */
export default function EstimateBoQPage() {
  const { id } = useParams() as { id: string }
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [generatedAt, setGeneratedAt] = useState('')

  useEffect(() => {
    ;(async () => {
      let est = loadEstimates().find(e => e.id === id) ?? null
      if (!est) est = (await getEstimates()).find(e => e.id === id) ?? null
      setEstimate(est)
      setGeneratedAt(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))
      setLoaded(true)
    })()
  }, [id])

  if (loaded && !estimate) {
    return <div className="max-w-[900px] mx-auto px-6 py-10"><p className="text-sm font-light text-fg-muted">Estimate not found. <Link href="/estimates" className="underline">Back to estimates</Link></p></div>
  }
  if (!estimate) {
    return <div className="max-w-[900px] mx-auto px-6 py-10"><p className="text-sm font-light text-fg-muted">Loading…</p></div>
  }

  const items = activeLineItems(estimate)
  const order: string[] = []
  const byCat: Record<string, EstimateLineItem[]> = {}
  for (const li of items) {
    if (!byCat[li.category]) { byCat[li.category] = []; order.push(li.category) }
    byCat[li.category].push(li)
  }
  const catTotal = (cat: string) => byCat[cat].reduce((s, li) => s + (li.total || 0), 0)
  const grandTotal = items.reduce((s, li) => s + (li.total || 0), 0)

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Bill of Quantities — cost allowance</p>
          <h1 className="text-xl font-light text-fg-heading">{estimate.projectName}</h1>
          <p className="text-xs font-light text-fg-muted mt-1">
            {[estimate.name, `v${estimate.version}`].filter(Boolean).join(' · ')} · Generated {generatedAt || '…'}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href={`/estimates/${id}`} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">Back to estimate</Link>
          <button onClick={() => window.print()} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-heading text-fg-heading hover:bg-fg-heading hover:text-white transition-colors">Print / Save PDF</button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm font-light text-fg-muted py-10 text-center">This estimate has no active line items.</p>
      ) : (
        <>
          {/* Summary by category */}
          <section className="mb-8 break-inside-avoid">
            <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Summary by category</p>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-2xs font-light tracking-architectural uppercase text-fg-muted border-b border-fg-border/50">
                  <th className="py-1.5 pr-3">Category</th>
                  <th className="py-1.5 px-2 text-right">Items</th>
                  <th className="py-1.5 pl-2 text-right">Allowance</th>
                </tr>
              </thead>
              <tbody>
                {order.map(cat => (
                  <tr key={cat} className="border-b border-fg-border/20">
                    <td className="py-1.5 pr-3 text-xs font-light text-fg-heading">{cat}</td>
                    <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-muted">{byCat[cat].length}</td>
                    <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(catTotal(cat))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-fg-border">
                  <td className="py-2 pr-3 text-2xs uppercase tracking-architectural text-fg-muted">Total cost allowance</td>
                  <td />
                  <td className="py-2 pl-2 text-right text-sm tabular-nums font-normal text-fg-heading">{formatCurrency(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-2xs font-light text-fg-muted/70 mt-2">Cost allowance excludes GST and contract markup — it is the budget allowed for each item, for site reference.</p>
          </section>

          {/* Per-category detail */}
          {order.map(cat => (
            <section key={cat} className="mb-7 break-inside-avoid">
              <div className="flex items-baseline justify-between border-b border-fg-border pb-1 mb-2">
                <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted">{cat}</p>
                <p className="text-xs tabular-nums text-fg-heading">{formatCurrency(catTotal(cat))}</p>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-2xs font-light tracking-architectural uppercase text-fg-muted border-b border-fg-border/40">
                    <th className="py-1 pr-3">Item</th>
                    <th className="py-1 px-2 text-right">Qty</th>
                    <th className="py-1 px-2 text-left">Unit</th>
                    <th className="py-1 px-2 text-right">Rate</th>
                    <th className="py-1 pl-2 text-right">Allowance</th>
                  </tr>
                </thead>
                <tbody>
                  {byCat[cat].map(li => (
                    <tr key={li.id} className="border-b border-fg-border/15 align-top">
                      <td className="py-1.5 pr-3 text-xs font-light text-fg-heading">
                        {li.description || li.subcategory || '—'}
                        {li.subcategory && li.subcategory !== li.description && <span className="text-fg-muted"> · {li.subcategory}</span>}
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-fg-muted/70">{TYPE_LABEL[li.type] ?? li.type}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{fmtQty(li.units || 0)}</td>
                      <td className="py-1.5 px-2 text-left text-xs text-fg-muted">{li.uom}</td>
                      <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(li.unitCost || 0)}</td>
                      <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(li.total || 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-fg-border/60">
                    <td colSpan={4} className="py-1.5 pr-3 text-2xs uppercase tracking-architectural text-fg-muted text-right">{cat} subtotal</td>
                    <td className="py-1.5 pl-2 text-right text-xs tabular-nums font-normal text-fg-heading">{formatCurrency(catTotal(cat))}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
