'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadEstimates, deleteEstimate } from '@/lib/storage'
import { formatCurrency } from '@/lib/utils'
import { getEstimateTotals, calculateLineItemRevenue } from '@/lib/estimateCalculations'
import type { Estimate } from '@/types'
import { Plus, Trash2, FileText, Search, GitBranch } from 'lucide-react'

type FilterStatus = 'all' | Estimate['status']

const STATUS_COLORS: Record<Estimate['status'], string> = {
  draft: 'text-fg-muted border-fg-border',
  sent: 'text-blue-400/80 border-blue-400/40',
  accepted: 'text-green-400/80 border-green-400/40',
  declined: 'text-red-400/80 border-red-400/40',
  variation: 'text-amber-400/80 border-amber-400/40',
}

export default function EstimatesPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setEstimates(loadEstimates())
  }, [])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    const est = estimates.find(est => est.id === id)
    if (est?.isBaseline) {
      alert('This estimate is locked as a project baseline and cannot be deleted.')
      return
    }
    if (est?.status === 'accepted') {
      if (!confirm('This estimate has been accepted. Are you sure you want to delete it? This cannot be undone.')) return
    } else {
      if (!confirm('Delete this estimate?')) return
    }
    deleteEstimate(id)
    setEstimates(loadEstimates())
  }

  const tabs: { label: string; value: FilterStatus }[] = [
    { label: 'All',        value: 'all' },
    { label: 'Draft',      value: 'draft' },
    { label: 'Sent',       value: 'sent' },
    { label: 'Accepted',   value: 'accepted' },
    { label: 'Declined',   value: 'declined' },
    { label: 'Variations', value: 'variation' },
  ]

  const statusCount = (status: FilterStatus) => {
    if (status === 'all') return estimates.length
    return estimates.filter(e => e.status === status).length
  }

  const filtered = estimates.filter(e => {
    if (filter !== 'all' && e.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        e.projectName.toLowerCase().includes(q) ||
        (e.name ?? '').toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Group by project
  const grouped = filtered.reduce<Record<string, Estimate[]>>((acc, est) => {
    const key = est.projectId
    if (!acc[key]) acc[key] = []
    acc[key].push(est)
    return acc
  }, {})

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      {/* Entity tab switcher */}
      <div className="flex border border-fg-border mb-8 w-fit">
        <button className="px-5 py-2 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 border-r border-fg-border">
          Formation
        </button>
        <a
          href="https://lume-quoting.vercel.app/quotes"
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-2 text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors flex items-center gap-1"
        >
          Lume Pools ↗
        </a>
      </div>

      <div className="flex items-baseline justify-between mb-10">
        <h1 className="text-2xl font-light tracking-wide text-fg-heading">Estimates</h1>
        <Link
          href="/estimates/new"
          className="flex items-center gap-2 px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Estimate
        </Link>
      </div>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
        <div className="flex border border-fg-border">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-light tracking-wide uppercase transition-colors border-r border-fg-border last:border-r-0 ${
                filter === tab.value ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'
              }`}
            >
              {tab.label}
              {statusCount(tab.value) > 0 && (
                <span className={`ml-1.5 text-2xs ${filter === tab.value ? 'text-white/50' : 'text-fg-muted/60'}`}>
                  {statusCount(tab.value)}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted" />
          <input
            type="text"
            placeholder="Search estimates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-4 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light placeholder-[#8A8580] rounded-none outline-none focus:border-fg-heading transition-colors w-56"
          />
        </div>
      </div>

      {/* Metrics bar */}
      {estimates.length > 0 && (() => {
        const totalEstimateValue = estimates.reduce((s, e) => s + e.lineItems.reduce((ls, li) => ls + calculateLineItemRevenue(li), 0), 0)
        const acceptedCount = estimates.filter(e => e.status === 'accepted').length
        const avgMargin = estimates.length > 0
          ? estimates.reduce((s, e) => {
              const cost = e.lineItems.reduce((ls, li) => ls + li.total, 0)
              const rev = e.lineItems.reduce((ls, li) => ls + calculateLineItemRevenue(li), 0)
              return s + (rev > 0 ? (rev - cost) / rev * 100 : 0)
            }, 0) / estimates.length
          : 0
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-fg-border mb-8">
            {[
              { label: 'Total Estimates', value: String(estimates.length) },
              { label: 'Total Value',     value: formatCurrency(totalEstimateValue) },
              { label: 'Accepted',        value: String(acceptedCount) },
              { label: 'Avg Margin',      value: `${avgMargin.toFixed(1)}%` },
            ].map(item => (
              <div key={item.label} className="bg-fg-bg px-5 py-4">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{item.label}</p>
                <p className="text-lg font-light text-fg-heading tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {estimates.length === 0 ? (
        <div className="border border-fg-border py-20 text-center">
          <FileText className="w-10 h-10 text-fg-muted/30 mx-auto mb-5" />
          <p className="text-sm font-light text-fg-heading mb-2">No estimates yet.</p>
          <p className="text-xs font-light text-[#8A8580] mb-6">
            Create your first estimate to start tracking project costs.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/estimates/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Estimate
            </Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-fg-border py-16 text-center">
          <p className="text-sm font-light text-[#5A5550]">No estimates match your search.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(grouped).map(([, projectEstimates]) => {
            const first = projectEstimates[0]
            // Separate base estimates from variations
            const baseEstimates = projectEstimates.filter(e => !e.parentEstimateId)
            const allVariations = projectEstimates.filter(e => !!e.parentEstimateId)
            return (
              <div key={first.projectId}>
                
                <div className="divide-y divide-fg-border border-t border-b border-fg-border">
                  {baseEstimates
                    .sort((a, b) => b.version - a.version)
                    .map(est => {
                      const totals = getEstimateTotals(est)
                      // Use project name as primary display — it's always standardised
                      const displayName = est.projectName || est.name || `v${est.version}`
                      const variations = allVariations.filter(v => v.parentEstimateId === est.id)
                      return (
                        <div key={est.id}>
                          <Link
                            href={`/estimates/${est.id}`}
                            className="flex items-center justify-between py-4 hover:bg-fg-card/40 -mx-2 px-2 transition-colors group"
                          >
                            <div className="flex items-center gap-4">
                              <div>
                                <p className="text-sm font-light text-fg-heading tracking-wide">
                                  {displayName}
                                  {est.name && (
                                    <span className="text-xs text-fg-muted ml-2 font-light">v{est.version}</span>
                                  )}
                                </p>
                                <p className="text-xs font-light text-[#8A8580] mt-0.5">
                                  {new Date(est.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  {est.notes && ` · ${est.notes}`}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-6">
                              <div className="text-right">
                                <p className="text-sm font-light text-fg-heading tabular-nums">
                                  {formatCurrency(totals.totalRevenue)}
                                </p>
                                <p className="text-xs font-light text-[#8A8580]">
                                  {(totals.overallMargin * 100).toFixed(1)}% margin
                                </p>
                              </div>
                              <span className={`text-2xs font-light tracking-wide uppercase border rounded-sm px-1.5 py-0.5 ${STATUS_COLORS[est.status]}`}>
                                {est.status}
                              </span>
                              <button
                                onClick={e => handleDelete(est.id, e)}
                                className={`text-fg-muted hover:text-red-400/60 transition-all ${est.status === 'draft' ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </Link>
                          {/* Variations indented below */}
                          {variations.sort((a, b) => (a.variationNumber || 0) - (b.variationNumber || 0)).map(v => {
                            const vTotals = getEstimateTotals(v)
                            const vLabel = `VMO-${v.variationNumber || '?'}`
                            const vAmount = vTotals.totalRevenue
                            const isPositive = vAmount >= 0
                            return (
                              <Link
                                key={v.id}
                                href={`/estimates/${v.id}`}
                                className="flex items-center justify-between py-3 hover:bg-fg-card/20 transition-colors group pl-8 pr-2 border-t border-fg-border/30"
                              >
                                <div className="flex items-center gap-2">
                                  <GitBranch className="w-3 h-3 text-amber-400/50 shrink-0" />
                                  <div>
                                    <p className="text-xs font-light text-fg-muted tracking-wide">
                                      <span className="text-amber-400/80 font-light">{vLabel}</span>
                                      {v.variationReason && <span className="ml-2 text-fg-muted/80">— {v.variationReason}</span>}
                                    </p>
                                    <p className="text-2xs font-light text-fg-muted/60 mt-0.5">
                                      {new Date(v.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-6">
                                  <div className="text-right">
                                    <p className={`text-xs font-light tabular-nums ${isPositive ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                      {isPositive ? '+' : ''}{formatCurrency(vAmount)}
                                    </p>
                                  </div>
                                  <span className={`text-2xs font-light tracking-wide uppercase border rounded-sm px-1.5 py-0.5 ${STATUS_COLORS[v.status]}`}>
                                    {v.status}
                                  </span>
                                  <button
                                    onClick={e => handleDelete(v.id, e)}
                                    className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-red-400/60 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      )
                    })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
