'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadProposals, saveProposal } from '@/lib/storage'
import { formatCurrency } from '@/lib/utils'
import type { DesignProposal } from '@/types'
import { Plus, PenLine } from 'lucide-react'

type FilterStatus = 'all' | 'draft' | 'sent' | 'accepted'

function StatusPill({ status }: { status: DesignProposal['status'] }) {
  const map: Record<string, string> = {
    draft:    'Draft',
    sent:     'Sent',
    pending:  'Pending',
    accepted: 'Accepted',
    declined: 'Declined',
    lost:     'Lost',
  }
  return (
    <span className="text-2xs font-light tracking-wide uppercase text-fg-muted border border-fg-border rounded-sm px-1.5 py-0.5">
      {map[status] ?? status}
    </span>
  )
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`
  return `${Math.floor(diff / 30)} months ago`
}

function needsFollowUp(p: DesignProposal): boolean {
  const refDate = p.lastContactDate || p.updatedAt || p.createdAt
  if (!refDate) return true
  return (Date.now() - new Date(refDate).getTime()) / 86400000 > 6
}

export default function DesignPage() {
  const [proposals, setProposals] = useState<DesignProposal[]>([])
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [editingNextStep, setEditingNextStep] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    setProposals(loadProposals())
  }, [])

  const activeProposals = proposals.filter(p =>
    !p.archived && p.status !== 'lost' && p.status !== 'declined' &&
    (filter === 'all' || p.status === filter)
  )

  const archivedProposals = proposals.filter(p => p.archived || p.status === 'lost' || p.status === 'declined')

  const saveNextStep = (id: string, value: string) => {
    const all = loadProposals()
    const updated = all.map(p =>
      p.id === id ? { ...p, nextStep: value, updatedAt: new Date().toISOString() } : p
    )
    updated.forEach(p => saveProposal(p))
    setProposals(updated)
  }

  const isExpiringSoon = (validUntil: string) => {
    const days = Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 7
  }
  const isExpired = (validUntil: string) => new Date(validUntil) < new Date()
  const daysUntil = (validUntil: string) => Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86400000)

  // KPI calculations
  const accepted = proposals.filter(p => p.status === 'accepted')
  const pending = proposals.filter(p => p.status === 'sent' || p.status === 'pending')
  const closed = proposals.filter(p => p.status === 'accepted' || p.status === 'lost' || p.status === 'declined')
  const totalAcceptedValue = accepted.reduce((s, p) => s + (p.phase1Fee + p.phase2Fee + (p.phase3Fee ?? 0)) * 1.1, 0)
  const totalPipelineValue = pending.reduce((s, p) => s + (p.phase1Fee + p.phase2Fee + (p.phase3Fee ?? 0)) * 1.1, 0)
  const winRate = closed.length > 0 ? Math.round((accepted.length / closed.length) * 100) : null
  const avgFee = accepted.length > 0
    ? Math.round(totalAcceptedValue / accepted.length)
    : 0
  const needsFollowUpCount = pending.filter(p => p.status === 'sent' && needsFollowUp(p)).length

  const filterTabs: { label: string; value: FilterStatus }[] = [
    { label: 'All',      value: 'all' },
    { label: 'Draft',    value: 'draft' },
    { label: 'Sent',     value: 'sent' },
    { label: 'Accepted', value: 'accepted' },
  ]

  const countByStatus = (s: FilterStatus) => {
    if (s === 'all') return proposals.filter(p => !p.archived && p.status !== 'lost' && p.status !== 'declined').length
    return proposals.filter(p => p.status === s && !p.archived).length
  }

  const renderProposalRow = (p: DesignProposal, muted = false) => {
    const total = p.phase1Fee + p.phase2Fee + (p.phase3Fee ?? 0)
    const showExpiryWarning = p.status === 'sent' || p.status === 'pending'
    const updated = timeAgo(p.updatedAt || p.createdAt)

    return (
      <div
        key={p.id}
        className={`py-4 border-b border-fg-border last:border-b-0 ${muted ? 'opacity-50' : ''}`}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Left: client info + next step */}
          <div className="flex-1 min-w-0">
            <Link
              href={`/design/${p.id}`}
              className="text-sm font-light text-fg-heading hover:text-fg-dark transition-colors"
            >
              {p.clientName}
            </Link>
            <p className="text-xs font-light text-fg-muted truncate">{p.projectAddress}</p>

            {showExpiryWarning && isExpired(p.validUntil) && (
              <p className="text-xs font-light text-red-500 mt-0.5">Expired</p>
            )}
            {showExpiryWarning && !isExpired(p.validUntil) && isExpiringSoon(p.validUntil) && (
              <p className="text-xs font-light text-amber-500 mt-0.5">⚠ Expires in {daysUntil(p.validUntil)} days</p>
            )}

            {/* Invoice stage progress for accepted proposals */}
            {p.status === 'accepted' && p.invoiceStages && (
              <div className="flex items-center gap-1 mt-1">
                {p.invoiceStages.map(s => (
                  <div
                    key={s.id}
                    title={`${s.name}: ${s.status}`}
                    className={`w-2 h-2 rounded-full ${
                      s.status === 'paid' ? 'bg-green-500' :
                      s.status === 'sent' ? 'bg-amber-400' :
                      'bg-fg-border'
                    }`}
                  />
                ))}
                <span className="text-2xs text-fg-muted ml-1">
                  {p.invoiceStages.filter(s => s.status === 'paid').length}/{p.invoiceStages.length} paid
                </span>
              </div>
            )}

            {/* Next Step inline editor */}
            {!muted && (
              <div className="mt-1 flex items-center gap-1">
                {editingNextStep === p.id ? (
                  <input
                    autoFocus
                    defaultValue={p.nextStep || ''}
                    onBlur={(e) => {
                      saveNextStep(p.id, e.target.value)
                      setEditingNextStep(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setEditingNextStep(null)
                    }}
                    className="text-xs font-light text-fg-heading bg-transparent border-b border-fg-border outline-none flex-1 py-0.5"
                    placeholder="Add next step..."
                  />
                ) : (
                  <button
                    onClick={() => setEditingNextStep(p.id)}
                    className={`text-xs font-light text-left hover:text-fg-heading transition-colors ${
                      p.nextStep ? 'text-fg-muted' : 'text-fg-muted/40 italic'
                    }`}
                  >
                    {p.nextStep || 'Add next step...'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: date, amount, status */}
          <div className="flex items-center gap-4 shrink-0 flex-wrap justify-end">
            {/* Follow up badge */}
            {p.status === 'sent' && needsFollowUp(p) && (
              <span className="text-2xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-sm font-medium">
                ⏰ Follow up
              </span>
            )}

            <div className="text-right hidden sm:block">
              <p className="text-xs font-light text-fg-muted">Valid until</p>
              <p className="text-xs font-light text-fg-heading">
                {new Date(p.validUntil).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              {updated && (
                <p className="text-2xs font-light text-fg-muted/60 mt-0.5">Updated {updated}</p>
              )}
            </div>

            <div className="text-right">
              <p className="text-sm font-light text-fg-heading tabular-nums">{formatCurrency(total * 1.1)}</p>
              <p className="text-2xs font-light text-fg-muted">inc. GST</p>
              {p.potentialBuildValue && p.potentialBuildValue > 0 && (
                <p className="text-2xs font-light text-fg-muted mt-0.5">
                  + {formatCurrency(p.potentialBuildValue)} build
                </p>
              )}
              <div className="mt-0.5">
                <StatusPill status={p.status} />
              </div>
            </div>

            <Link
              href={`/design/${p.id}`}
              className="text-xs font-light text-fg-muted hover:text-fg-heading transition-colors border border-fg-border px-2 py-1"
            >
              Open
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Formation Landscapes</p>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">Design Proposals</h1>
        </div>
        <Link
          href="/design/new"
          className="flex items-center gap-2 px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          New Proposal
        </Link>
      </div>

      {/* KPI metrics */}
      {proposals.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-fg-border mb-10">
          <div className="bg-fg-bg px-5 py-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Accepted</p>
            <p className="text-xl font-light text-fg-heading tabular-nums">{accepted.length}</p>
            <p className="text-2xs font-light text-fg-muted mt-1">{formatCurrency(totalAcceptedValue)} <span className="text-fg-muted/60">inc. GST</span></p>
          </div>
          <div className="bg-fg-bg px-5 py-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Pending Pipeline</p>
            <p className="text-xl font-light text-fg-heading tabular-nums">{pending.length}</p>
            <p className="text-2xs font-light text-fg-muted mt-1">{formatCurrency(totalPipelineValue)} <span className="text-fg-muted/60">inc. GST</span></p>
          </div>
          {winRate !== null ? (
            <div className="bg-fg-bg px-5 py-5">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Win Rate</p>
              <p className="text-xl font-light text-fg-heading tabular-nums">{winRate}%</p>
              <p className="text-2xs font-light text-fg-muted mt-1">{accepted.length} of {closed.length} closed</p>
            </div>
          ) : (
            <div className="bg-fg-bg px-5 py-5">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Avg Design Fee</p>
              <p className="text-xl font-light text-fg-heading tabular-nums">{avgFee > 0 ? formatCurrency(avgFee) : '—'}</p>
              <p className="text-2xs font-light text-fg-muted mt-1">accepted proposals</p>
            </div>
          )}
          <div className={`px-5 py-5 ${needsFollowUpCount > 0 ? 'bg-amber-50' : 'bg-fg-bg'}`}>
            <p className={`text-2xs font-light tracking-architectural uppercase mb-2 ${needsFollowUpCount > 0 ? 'text-amber-600' : 'text-fg-muted'}`}>Needs Follow Up</p>
            <p className={`text-xl font-light tabular-nums ${needsFollowUpCount > 0 ? 'text-amber-700' : 'text-fg-heading'}`}>{needsFollowUpCount}</p>
            <p className={`text-2xs font-light mt-1 ${needsFollowUpCount > 0 ? 'text-amber-600' : 'text-fg-muted'}`}>sent proposals</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex border border-fg-border mb-8 w-fit">
        {filterTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 text-xs font-light tracking-wide uppercase transition-colors border-r border-fg-border last:border-r-0 ${
              filter === tab.value ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'
            }`}
          >
            {tab.label} ({countByStatus(tab.value)})
          </button>
        ))}
      </div>

      {/* Proposals list */}
      {activeProposals.length === 0 ? (
        proposals.filter(p => !p.archived && p.status !== 'lost' && p.status !== 'declined').length === 0 ? (
          <div className="border border-fg-border py-20 text-center">
            <PenLine className="w-10 h-10 text-fg-muted/30 mx-auto mb-5" />
            <p className="text-sm font-light text-fg-heading mb-2">No proposals yet.</p>
            <p className="text-xs font-light text-[#8A8580] mb-6">
              Create your first design proposal for a client.
            </p>
            <Link
              href="/design/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Proposal
            </Link>
          </div>
        ) : (
          <div className="border border-fg-border py-16 text-center">
            <p className="text-sm font-light text-[#5A5550]">No proposals match this filter.</p>
          </div>
        )
      ) : (
        <div className="border-t border-fg-border">
          {activeProposals
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(p => renderProposalRow(p, false))}
        </div>
      )}

      {activeProposals.length > 0 && (
        <p className="text-xs font-light text-[#8A8580] mt-4">
          {activeProposals.length} proposal{activeProposals.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Archived / lost toggle */}
      {archivedProposals.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs text-fg-muted hover:text-fg-heading transition-colors"
          >
            {showArchived ? 'Hide' : 'Show'} {archivedProposals.length} lost / archived proposal{archivedProposals.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {showArchived && archivedProposals.length > 0 && (
        <div className="mt-4 border-t border-fg-border">
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4 pt-4">Lost / Archived</p>
          {archivedProposals
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(p => renderProposalRow(p, true))}
        </div>
      )}
    </div>
  )
}
