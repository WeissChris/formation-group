'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, loadProjects, loadProposals } from '@/lib/storage'
import { formatCurrency } from '@/lib/utils'
import { getEstimateTotals, calculateLineItemRevenue } from '@/lib/estimateCalculations'
import type { Estimate, Project } from '@/types'
import { Printer, ArrowLeft } from 'lucide-react'

export default function QuotePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')

  useEffect(() => {
    const all = loadEstimates()
    const found = all.find(e => e.id === id)
    if (!found) return router.push('/estimates')
    setEstimate(found)

    const projects = loadProjects()
    const p = projects.find(p => p.id === found.projectId)
    if (p) setProject(p)

    // Resolve client details: project > linked proposal > estimate name
    const linkedProposal = found.proposalId
      ? loadProposals().find(pr => pr.id === found.proposalId)
      : null
    setClientName(p?.clientName || linkedProposal?.clientName || found.projectName || 'Client')
    setClientAddress(p?.address || linkedProposal?.projectAddress || found.projectName || '')
  }, [id, router])

  if (!estimate) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const totals = getEstimateTotals(estimate)

  // Group line items by category and sum revenue per category
  const categories = Array.from(new Set(estimate.lineItems.map(i => i.category)))
  const categoryTotals = categories.map(category => {
    const items = estimate.lineItems.filter(i => i.category === category)
    const totalRevenue = items.reduce((s, i) => s + calculateLineItemRevenue(i), 0)
    return { category, totalRevenue }
  })

  const today = new Date()
  const validUntil = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  // Use estimate ID for uniqueness when no project is linked, project ID + version otherwise
  const quoteRef = estimate.projectId
    ? `${estimate.projectId.slice(-4).toUpperCase()}-${estimate.version.toString().padStart(2, '0')}`
    : `${estimate.id.slice(-6).toUpperCase()}`
  const quoteNumber = `FG-${quoteRef}`

  return (
    <div className="min-h-screen bg-white">
      {/* Print toolbar (hidden in print) */}
      <div className="print:hidden bg-fg-darker px-6 py-3 flex items-center justify-between">
        <Link
          href={`/estimates/${estimate.id}`}
          className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Estimate
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      {/* Quote document */}
      <div className="max-w-[800px] mx-auto px-8 py-12 print:px-0 print:py-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-12">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/formation-primary-dark.svg"
              alt="Formation Landscapes"
              className="h-10 w-auto mb-1"
              onError={(e) => {
                const t = e.target as HTMLImageElement
                t.style.display = 'none'
                // Show text fallback when logo is unavailable
                const fallback = t.nextElementSibling as HTMLElement
                if (fallback) fallback.style.display = 'block'
              }}
            />
            <p className="text-lg font-light tracking-wide text-gray-900 mb-1 hidden">FORMATION</p>
            <p className="text-xs text-gray-400 font-light mt-2">Formation Landscapes Pty Ltd</p>
            <p className="text-xs text-gray-400 font-light">Melbourne, Victoria</p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-light tracking-wide text-gray-900 mb-1">QUOTE</h1>
            <p className="text-xs text-gray-500 font-light">No. {quoteNumber}</p>
            <p className="text-xs text-gray-500 font-light mt-1">
              Date: {today.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-xs text-gray-500 font-light">
              Valid until: {validUntil.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Client details */}
        <div className="mb-10 border-t border-gray-200 pt-6">
          <p className="text-2xs font-light tracking-widest uppercase text-gray-400 mb-3">Prepared for</p>
          <p className="text-base font-light text-gray-900">{clientName}</p>
          <p className="text-sm font-light text-gray-500">{clientAddress}</p>
        </div>

        {/* Line items by category */}
        <table className="w-full mb-10">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left pb-3 text-xs font-normal tracking-widest uppercase text-gray-500">Scope Item</th>
              <th className="text-right pb-3 text-xs font-normal tracking-widest uppercase text-gray-500">Amount</th>
            </tr>
          </thead>
          <tbody>
            {categoryTotals.map(({ category, totalRevenue }) => (
              <tr key={category} className="border-b border-gray-100">
                <td className="py-3.5 text-sm font-light text-gray-800">{category}</td>
                <td className="py-3.5 text-sm font-light text-gray-900 text-right tabular-nums">
                  {formatCurrency(totalRevenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto max-w-xs space-y-2 mb-12">
          <div className="flex justify-between text-sm font-light text-gray-600">
            <span>Subtotal (ex. GST)</span>
            <span className="tabular-nums">{formatCurrency(totals.totalRevenue)}</span>
          </div>
          <div className="flex justify-between text-sm font-light text-gray-600">
            <span>GST (10%)</span>
            <span className="tabular-nums">{formatCurrency(totals.gst)}</span>
          </div>
          <div className="flex justify-between text-base font-light text-gray-900 border-t border-gray-900 pt-2 mt-2">
            <span>Total (inc. GST)</span>
            <span className="tabular-nums">{formatCurrency(totals.totalIncGst)}</span>
          </div>
        </div>

        {/* Exclusions */}
        <div className="mb-10 bg-gray-50 px-6 py-5">
          <p className="text-xs font-normal tracking-widest uppercase text-gray-400 mb-3">Exclusions</p>
          <ul className="space-y-1.5 text-xs font-light text-gray-500">
            <li>· Council permits and approvals</li>
            <li>· Structural engineering (unless specified)</li>
            <li>· Electrical works beyond scope</li>
            {estimate.projectType !== 'pool_only' && estimate.projectType !== 'landscape_and_pool' && (
              <li>· Pool construction (quoted separately)</li>
            )}
            {estimate.projectType === 'pool_only' && (
              <li>· Landscape works (quoted separately)</li>
            )}
            <li>· Any works not specifically listed above</li>
          </ul>
        </div>

        {/* Notes */}
        {estimate.notes && (
          <div className="mb-10">
            <p className="text-2xs font-light tracking-widest uppercase text-gray-400 mb-2">Notes</p>
            <p className="text-sm font-light text-gray-600">{estimate.notes}</p>
          </div>
        )}

        {/* Validity */}
        <div className="mb-10 border-t border-gray-100 pt-6">
          <p className="text-xs font-light text-gray-400 italic">
            This quote is valid for 30 days from the date of issue. Prices are subject to change after this period.
          </p>
        </div>

        {/* Acceptance block */}
        <div className="border border-gray-200 p-6">
          <p className="text-xs font-normal tracking-widest uppercase text-gray-400 mb-6">Acceptance</p>
          <p className="text-xs font-light text-gray-500 mb-8">
            By signing below, you authorise Formation Landscapes Pty Ltd to proceed with the works described in this quote on the terms and conditions provided.
          </p>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="border-b border-gray-300 pb-1 mb-1.5 h-10" />
              <p className="text-2xs font-light text-gray-400 tracking-wide">Client Signature</p>
            </div>
            <div>
              <div className="border-b border-gray-300 pb-1 mb-1.5 h-10" />
              <p className="text-2xs font-light text-gray-400 tracking-wide">Date</p>
            </div>
            <div>
              <div className="border-b border-gray-300 pb-1 mb-1.5 h-10" />
              <p className="text-2xs font-light text-gray-400 tracking-wide">Print Name</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
