'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  loadEstimates, saveEstimate, loadWeeklyActuals,
  loadProgressClaims, saveProgressClaim, deleteProgressClaim,
} from '@/lib/storage'
import { formatCurrency, generateId } from '@/lib/utils'
import { getEstimateTotals } from '@/lib/estimateCalculations'
import type { ProgressPaymentStage, Estimate, WeeklyActual, ProgressClaim, ProgressClaimLineItem } from '@/types'
import { Plus, X, FileText, Receipt, GitBranch, Eye, Check, ChevronRight, ArrowLeft } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function mapVariationStatus(status: Estimate['status']): string {
  switch (status) {
    case 'sent': return 'SUBMITTED'
    case 'accepted': return 'APPROVED'
    case 'declined': return 'REJECTED'
    case 'variation':
    case 'draft':
    default: return 'DRAFT'
  }
}

function variationStatusColor(status: Estimate['status']): string {
  switch (status) {
    case 'accepted': return 'text-green-400/80 border-green-400/40'
    case 'sent': return 'text-blue-400/80 border-blue-400/40'
    case 'declined': return 'text-red-400/80 border-red-400/40'
    default: return 'text-fg-muted border-fg-border'
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OpsSubTab = 'invoices' | 'variations' | 'activity'

// ── Activity Feed ─────────────────────────────────────────────────────────────

interface ActivityEvent {
  date: string
  icon: string
  description: string
  sortKey: number
}

function buildActivityFeed(
  claims: ProgressClaim[],
  variations: Estimate[],
  actuals: WeeklyActual[],
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  for (const c of claims) {
    events.push({
      date: c.createdAt,
      icon: '📄',
      description: `Invoice created — ${c.invoiceNumber}${c.description ? ` — ${c.description}` : ''}${c.subtotalEx > 0 ? ` — ${formatCurrency(c.subtotalEx)} ex GST` : ''}`,
      sortKey: new Date(c.createdAt).getTime(),
    })
    if (c.status === 'paid' && c.paidAt) {
      events.push({
        date: c.paidAt,
        icon: '✓',
        description: `Payment received — ${c.invoiceNumber} — ${formatCurrency(c.total)}`,
        sortKey: new Date(c.paidAt).getTime() + 1,
      })
    }
    if (c.status === 'sent' && c.sentAt) {
      events.push({
        date: c.sentAt,
        icon: '📬',
        description: `Invoice sent — ${c.invoiceNumber}`,
        sortKey: new Date(c.sentAt).getTime() + 1,
      })
    }
  }

  for (const v of variations) {
    if (v.createdAt) {
      events.push({
        date: v.createdAt,
        icon: '⊕',
        description: `Variation created — VMO-${v.variationNumber ?? '?'}${v.variationReason ? ` — ${v.variationReason}` : ''}`,
        sortKey: new Date(v.createdAt).getTime(),
      })
    }
    if (v.status === 'accepted' && v.updatedAt) {
      events.push({
        date: v.updatedAt,
        icon: '✓',
        description: `Variation approved — VMO-${v.variationNumber ?? '?'}${v.variationReason ? ` — ${v.variationReason}` : ''}`,
        sortKey: new Date(v.updatedAt).getTime() + 1,
      })
    }
  }

  for (const a of actuals) {
    if (a.weekEnding) {
      const cost = a.supplyCost + a.labourCost
      events.push({
        date: a.weekEnding,
        icon: '📋',
        description: `Costs entered for week of ${formatDateShort(a.weekEnding)}${cost > 0 ? ` — ${formatCurrency(cost)}` : ''}`,
        sortKey: new Date(a.weekEnding).getTime(),
      })
    }
  }

  return events.sort((a, b) => b.sortKey - a.sortKey)
}

// ── Progress Claim Builder ────────────────────────────────────────────────────

// Local-state input — only fires onCommit on blur, prevents per-keystroke re-renders
function ClaimInput({ value, placeholder, className, onCommit }: {
  value: number
  placeholder?: string
  className?: string
  onCommit: (v: number) => void
}) {
  const [local, setLocal] = useState(value === 0 ? '' : String(value))
  // Keep in sync if external value changes (e.g. when filling from % or $)
  const prevValue = useState(value)[0]
  if (value !== prevValue && value === 0 && local !== '') {
    // don't reset while typing
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={local}
      placeholder={placeholder}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => {
        const parsed = parseFloat(local.replace(/[^0-9.]/g, '')) || 0
        setLocal(parsed === 0 ? '' : String(parsed))
        onCommit(parsed)
      }}
      className={`px-2 py-1 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums ${className || ''}`}
    />
  )
}

function ProgressClaimBuilder({
  projectId,
  projectName,
  estimates,
  existingClaims,
  editingClaim,
  onSave,
  onCancel,
}: {
  projectId: string
  projectName: string
  estimates: Estimate[]
  existingClaims: ProgressClaim[]
  editingClaim: ProgressClaim | null
  onSave: (claim: ProgressClaim) => void
  onCancel: () => void
}) {
  // Build initial line items from estimate categories + variations
  const buildInitialLineItems = useCallback((): ProgressClaimLineItem[] => {
    if (editingClaim) return editingClaim.lineItems

    const baseEstimates = estimates.filter(e => !e.parentEstimateId && e.status === 'accepted')
    const variationEstimates = estimates.filter(e => !!e.parentEstimateId && (e.status === 'accepted' || e.status === 'variation'))

    const items: ProgressClaimLineItem[] = []

    // Group base estimate line items by category
    if (baseEstimates.length > 0) {
      const latestBase = baseEstimates[baseEstimates.length - 1]
      const categoryKeys: string[] = []
      const categoryAmounts: Record<string, number> = {}
      for (const li of latestBase.lineItems) {
        const cat = li.category || 'General'
        if (!categoryAmounts[cat]) {
          categoryKeys.push(cat)
          categoryAmounts[cat] = 0
        }
        categoryAmounts[cat] += li.revenue
      }

      // Calculate claimed to date for each category from previous claims
      const prevClaims = existingClaims
      for (const cat of categoryKeys) {
        const contractAmount = categoryAmounts[cat]
        const claimedToDate = prevClaims.reduce((sum, claim) => {
          const li = claim.lineItems.find(l => l.categoryId === cat && l.type === 'category')
          return sum + (li?.claimAmount ?? 0)
        }, 0)
        const remaining = Math.max(0, contractAmount - claimedToDate)
        items.push({
          categoryId: cat,
          description: cat,
          type: 'category',
          contractAmount,
          claimedToDate,
          remaining,
          claimAmount: 0,
          claimPercent: 0,
          included: true,
        })
      }
    }

    // Add variation line items
    for (const v of variationEstimates) {
      const contractAmount = getEstimateTotals(v).totalRevenue
      const claimedToDate = existingClaims.reduce((sum, claim) => {
        const li = claim.lineItems.find(l => l.categoryId === v.id && l.type === 'variation')
        return sum + (li?.claimAmount ?? 0)
      }, 0)
      const remaining = Math.max(0, contractAmount - claimedToDate)
      items.push({
        categoryId: v.id,
        description: v.variationReason || v.name || `VMO-${v.variationNumber}`,
        type: 'variation',
        contractAmount,
        claimedToDate,
        remaining,
        claimAmount: 0,
        claimPercent: 0,
        included: true,
      })
    }

    return items
  }, [editingClaim, estimates, existingClaims])

  const invoiceNumber = editingClaim?.invoiceNumber ?? `INV-${String(existingClaims.length + 1).padStart(3, '0')}`
  const [description, setDescription] = useState(editingClaim?.description ?? '')
  const [status, setStatus] = useState<ProgressClaim['status']>(editingClaim?.status ?? 'pending')
  const [lineItems, setLineItems] = useState<ProgressClaimLineItem[]>(buildInitialLineItems)
  const [comments, setComments] = useState(editingClaim?.comments ?? '')
  const [roundingAdjustment, setRoundingAdjustment] = useState(editingClaim?.roundingAdjustment ?? 0)

  // Grouping state — groups only affect display, underlying lineItems are preserved
  type ClaimGroup = { id: string; name: string; categoryIds: string[] }
  const [groups, setGroups] = useState<ClaimGroup[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupingMode, setGroupingMode] = useState(false)
  const [pendingGroupName, setPendingGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const toggleSelect = (categoryId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId)
      return next
    })
  }

  const createGroup = () => {
    if (selectedIds.size < 2 || !pendingGroupName.trim()) return
    const newGroup: ClaimGroup = { id: generateId(), name: pendingGroupName.trim(), categoryIds: Array.from(selectedIds) }
    setGroups(prev => [...prev, newGroup])
    setSelectedIds(new Set())
    setPendingGroupName('')
    setGroupingMode(false)
  }

  const ungroup = (groupId: string) => setGroups(prev => prev.filter(g => g.id !== groupId))

  const renameGroup = (groupId: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name } : g))
    setEditingGroupId(null)
  }

  // Returns the group a categoryId belongs to, or null
  const groupOf = (categoryId: string) => groups.find(g => g.categoryIds.includes(categoryId)) ?? null

  // Update all lineItems in a group proportionally when group amount changes
  const updateGroupAmount = (group: ClaimGroup, totalAmount: number) => {
    setLineItems(prev => {
      const updated = [...prev]
      const groupItems = prev.filter(li => group.categoryIds.includes(li.categoryId))
      const totalRemaining = groupItems.reduce((s, li) => s + li.remaining, 0)
      groupItems.forEach(li => {
        const idx = prev.findIndex(x => x.categoryId === li.categoryId)
        if (idx < 0) return
        const share = totalRemaining > 0 ? (li.remaining / totalRemaining) * totalAmount : 0
        updated[idx] = { ...updated[idx], claimAmount: share, claimPercent: li.remaining > 0 ? (share / li.remaining) * 100 : 0 }
      })
      return updated
    })
  }

  const updateLineItem = (idx: number, updates: Partial<ProgressClaimLineItem>) => {
    setLineItems(prev => {
      const updated = [...prev]
      const item = { ...updated[idx], ...updates }
      // Sync claimAmount and claimPercent
      if ('claimAmount' in updates) {
        item.claimPercent = item.remaining > 0 ? (item.claimAmount / item.remaining) * 100 : 0
      } else if ('claimPercent' in updates) {
        item.claimAmount = (item.claimPercent / 100) * item.remaining
      }
      updated[idx] = item
      return updated
    })
  }

  const fillRemaining = (idx: number) => {
    setLineItems(prev => {
      const updated = [...prev]
      const item = { ...updated[idx] }
      item.claimAmount = item.remaining
      item.claimPercent = 100
      updated[idx] = item
      return updated
    })
  }

  const categoryItems = lineItems.filter(l => l.type === 'category')
  const variationItems = lineItems.filter(l => l.type === 'variation')

  // Inclusion is automatic: item is included if claimAmount > 0
  const subtotalEx = lineItems
    .filter(l => l.claimAmount > 0)
    .reduce((s, l) => s + l.claimAmount, 0) + roundingAdjustment
  const gst = subtotalEx * 0.10
  const total = subtotalEx + gst

  const categoriesTotal = categoryItems.filter(l => l.claimAmount > 0).reduce((s, l) => s + l.claimAmount, 0)
  const variationsTotal = variationItems.filter(l => l.claimAmount > 0).reduce((s, l) => s + l.claimAmount, 0)

  const handleSave = () => {
    const claim: ProgressClaim = {
      id: editingClaim?.id ?? generateId(),
      projectId,
      invoiceNumber,
      description,
      status,
      lineItems,
      comments,
      subtotalEx,
      gst,
      total,
      roundingAdjustment,
      createdAt: editingClaim?.createdAt ?? new Date().toISOString(),
      sentAt: editingClaim?.sentAt,
      paidAt: editingClaim?.paidAt,
    }
    onSave(claim)
  }

  const LineItemRow = ({
    item,
    idx,
    globalIdx,
    rowNum,
  }: {
    item: ProgressClaimLineItem
    idx: number
    globalIdx: number
    rowNum: number
  }) => {
    const isIncluded = item.claimAmount > 0 || item.claimPercent > 0
    return (
      <tr className={`border-b border-fg-border/30 transition-colors ${isIncluded ? 'bg-fg-card/20' : ''}`}>
        <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums w-8">{rowNum}</td>
        <td className={`py-2 pr-3 text-xs font-light ${isIncluded ? 'text-fg-heading font-normal' : 'text-fg-muted/70'}`}>{item.description}</td>
        <td className="py-2 pr-3 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap">{formatCurrency(item.contractAmount)}</td>
        <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">{formatCurrency(item.claimedToDate)}</td>
        <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">{formatCurrency(item.remaining)}</td>
        <td className="py-2 pr-2 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-fg-muted">$</span>
            <ClaimInput
              value={item.claimAmount}
              placeholder="0.00"
              className="w-24"
              onCommit={v => updateLineItem(globalIdx, { claimAmount: v, claimPercent: item.remaining > 0 ? (v / item.remaining) * 100 : 0 })}
            />
            <button onClick={() => fillRemaining(globalIdx)} title="Fill remaining" className="p-1 text-fg-muted hover:text-fg-heading border border-fg-border transition-colors">
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </td>
        <td className="py-2 pr-2 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <ClaimInput value={item.claimPercent} placeholder="0" className="w-20" onCommit={v => updateLineItem(globalIdx, { claimPercent: v, claimAmount: (v / 100) * item.remaining })} />
            <span className="text-xs text-fg-muted">%</span>
          </div>
        </td>
      </tr>
    )
  }

  const colHeaders = ['#', 'Description', 'Contract (Ex)', 'Claimed to Date', 'Remaining', 'Claim Amount', 'Claim %']

  return (
    <div className="fixed inset-0 z-50 bg-fg-bg overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-1">
              INVOICE: {invoiceNumber}
            </p>
            <h1 className="text-xl font-light tracking-wide text-fg-heading">{projectName}</h1>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 text-xs font-light text-fg-muted hover:text-fg-heading transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </div>

        {/* Description + Status row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="sm:col-span-2">
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Progress claim description…"
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors"
            />
          </div>
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as ProgressClaim['status'])}
              className="w-full px-3 py-2.5 bg-fg-bg border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none"
            >
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        {/* Cost Categories */}
        {categoryItems.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-light tracking-architectural uppercase text-fg-muted">Cost Categories</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-light text-fg-heading tabular-nums">Total (Ex): {formatCurrency(categoriesTotal)}</span>
                <button
                  onClick={() => { setGroupingMode(g => !g); setSelectedIds(new Set()); setPendingGroupName('') }}
                  className={`text-2xs font-light tracking-wide uppercase px-2.5 py-1 border transition-colors ${groupingMode ? 'bg-fg-dark text-white/80 border-fg-dark' : 'border-fg-border text-fg-muted hover:text-fg-heading'}`}
                >
                  {groupingMode ? 'Cancel' : 'Group'}
                </button>
              </div>
            </div>

            {/* Grouping toolbar */}
            {groupingMode && (
              <div className="flex items-center gap-3 mb-3 p-3 border border-fg-border/60 bg-fg-card/20">
                <span className="text-2xs text-fg-muted">{selectedIds.size} selected</span>
                <input
                  type="text"
                  value={pendingGroupName}
                  onChange={e => setPendingGroupName(e.target.value)}
                  placeholder="Group name (e.g. Paving Works)"
                  className="flex-1 px-2.5 py-1 bg-transparent border border-fg-border text-fg-heading text-xs font-light outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40"
                  onKeyDown={e => e.key === 'Enter' && createGroup()}
                />
                <button
                  onClick={createGroup}
                  disabled={selectedIds.size < 2 || !pendingGroupName.trim()}
                  className="text-2xs font-light tracking-wide uppercase px-3 py-1 bg-fg-dark text-white/80 disabled:opacity-30 transition-opacity"
                >
                  Create Group
                </button>
                <span className="text-2xs text-fg-muted/60">Select 2+ categories, then name and create</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-fg-border">
                <thead>
                  <tr className="border-b border-fg-border bg-fg-card/20">
                    {groupingMode && <th className="px-2 py-2.5 w-8" />}
                    {colHeaders.map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap">{h}</th>
                    ))}
                    <th className="px-2 py-2.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const renderedGroups = new Set<string>()
                    let rowNum = 0
                    return categoryItems.map(item => {
                      const group = groupOf(item.categoryId)

                      // If this item is in a group, render group row once then skip members
                      if (group) {
                        if (renderedGroups.has(group.id)) return null
                        renderedGroups.add(group.id)
                        rowNum++
                        const groupLineItems = categoryItems.filter(li => group.categoryIds.includes(li.categoryId))
                        const groupContract  = groupLineItems.reduce((s, li) => s + li.contractAmount, 0)
                        const groupClaimed   = groupLineItems.reduce((s, li) => s + li.claimedToDate, 0)
                        const groupRemaining = groupLineItems.reduce((s, li) => s + li.remaining, 0)
                        const groupClaimAmt  = groupLineItems.reduce((s, li) => s + li.claimAmount, 0)
                        const groupClaimPct  = groupRemaining > 0 ? (groupClaimAmt / groupRemaining) * 100 : 0
                        return (
                          <tr key={group.id} className="border-b border-fg-border/30 bg-fg-card/10">
                            {groupingMode && <td />}
                            <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums w-8">{rowNum}</td>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                {editingGroupId === group.id ? (
                                  <input
                                    autoFocus
                                    defaultValue={group.name}
                                    className="text-xs font-light text-fg-heading border-b border-fg-border outline-none bg-transparent"
                                    onBlur={e => renameGroup(group.id, e.target.value || group.name)}
                                    onKeyDown={e => { if (e.key === 'Enter') renameGroup(group.id, (e.target as HTMLInputElement).value || group.name) }}
                                  />
                                ) : (
                                  <button onClick={() => setEditingGroupId(group.id)} className="text-xs font-light text-fg-heading hover:underline text-left">
                                    {group.name}
                                  </button>
                                )}
                                <span className="text-2xs text-fg-muted border border-fg-border/50 px-1 py-0.5 rounded-sm">{group.categoryIds.length} items</span>
                                <button onClick={() => ungroup(group.id)} className="text-2xs text-fg-muted/50 hover:text-red-400 transition-colors" title="Ungroup">✕</button>
                              </div>
                              <p className="text-2xs text-fg-muted/60 mt-0.5">{group.categoryIds.join(', ')}</p>
                            </td>
                            <td className="py-2 pr-3 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap">{formatCurrency(groupContract)}</td>
                            <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">{formatCurrency(groupClaimed)}</td>
                            <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">{formatCurrency(groupRemaining)}</td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-fg-muted">$</span>
                                <ClaimInput
                                  value={groupClaimAmt}
                                  placeholder="0.00"
                                  className="w-24"
                                  onCommit={v => updateGroupAmount(group, v)}
                                />
                                <button onClick={() => updateGroupAmount(group, groupRemaining)} title="Fill remaining" className="p-1 text-fg-muted hover:text-fg-heading border border-fg-border transition-colors">
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <ClaimInput value={groupClaimPct} placeholder="0" className="w-20" onCommit={v => updateGroupAmount(group, (v / 100) * groupRemaining)} />
                                <span className="text-xs text-fg-muted">%</span>
                              </div>
                            </td>
                            <td />
                          </tr>
                        )
                      }

                      // Ungrouped item
                      rowNum++
                      const globalIdx = lineItems.findIndex(l => l.categoryId === item.categoryId && l.type === 'category')
                      return (
                        <tr key={item.categoryId} className={`border-b border-fg-border/30 transition-colors ${item.claimAmount > 0 ? 'bg-fg-card/20' : ''}`}>
                          {groupingMode && (
                            <td className="py-2 px-2 text-center">
                              <input type="checkbox" checked={selectedIds.has(item.categoryId)} onChange={() => toggleSelect(item.categoryId)} className="w-3 h-3 accent-fg-dark" />
                            </td>
                          )}
                          <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums w-8">{rowNum}</td>
                          <td className="py-2 pr-3 text-xs font-light text-fg-heading">{item.description}</td>
                          <td className="py-2 pr-3 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap">{formatCurrency(item.contractAmount)}</td>
                          <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">{formatCurrency(item.claimedToDate)}</td>
                          <td className="py-2 pr-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">{formatCurrency(item.remaining)}</td>
                          <td className="py-2 pr-2 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-fg-muted">$</span>
                              <ClaimInput value={item.claimAmount} placeholder="0.00" className="w-24" onCommit={v => updateLineItem(globalIdx, { claimAmount: v, claimPercent: item.remaining > 0 ? (v / item.remaining) * 100 : 0 })} />
                              <button onClick={() => fillRemaining(globalIdx)} title="Fill remaining" className="p-1 text-fg-muted hover:text-fg-heading border border-fg-border transition-colors">
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <ClaimInput value={item.claimPercent} placeholder="0" className="w-20" onCommit={v => updateLineItem(globalIdx, { claimPercent: v, claimAmount: (v / 100) * item.remaining })} />
                              <span className="text-xs text-fg-muted">%</span>
                            </div>
                          </td>
                          <td />
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Variations */}
        {variationItems.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-light tracking-architectural uppercase text-fg-muted">Variations</h2>
              <span className="text-xs font-light text-fg-heading tabular-nums">
                Total (Ex): {formatCurrency(variationsTotal)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-fg-border">
                <thead>
                  <tr className="border-b border-fg-border bg-fg-card/20">
                    {['#', 'Description', 'Type', 'Contract (Ex)', 'Claimed to Date', 'Remaining', 'Claim Amount', 'Claim %'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {variationItems.map((item, idx) => {
                    const globalIdx = lineItems.findIndex(l => l.categoryId === item.categoryId && l.type === 'variation')
                    return (
                      <tr key={item.categoryId} className={`border-b border-fg-border/30 transition-colors ${item.claimAmount > 0 ? 'bg-fg-card/20' : ''}`}>
                        <td className="py-2 px-3 text-xs font-light text-fg-muted tabular-nums w-8">{idx + 1}</td>
                        <td className="py-2 px-3 text-xs font-light text-fg-heading">{item.description}</td>
                        <td className="py-2 px-3">
                          <span className="text-2xs text-amber-400/80 border border-amber-400/40 px-1.5 py-0.5 rounded-sm">Variation</span>
                        </td>
                        <td className="py-2 px-3 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap">
                          {formatCurrency(item.contractAmount)}
                        </td>
                        <td className="py-2 px-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">
                          {formatCurrency(item.claimedToDate)}
                        </td>
                        <td className="py-2 px-3 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">
                          {formatCurrency(item.remaining)}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-fg-muted">$</span>
                            <input
                              type="number"
                              value={item.claimAmount || ''}
                              onChange={e => updateLineItem(globalIdx, { claimAmount: parseFloat(e.target.value) || 0 })}
                              placeholder="0.00"
                              step="0.01"
                              className="w-24 px-2 py-1 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums"
                            />
                            <button
                              onClick={() => fillRemaining(globalIdx)}
                              title="Fill remaining amount"
                              className="p-1 text-fg-muted hover:text-fg-heading border border-fg-border hover:border-fg-heading transition-colors"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <ClaimInput value={item.claimPercent} placeholder="0" className="w-20" onCommit={v => updateLineItem(globalIdx, { claimPercent: v, claimAmount: (v / 100) * item.remaining })} />
                            <span className="text-xs text-fg-muted">%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {categoryItems.length === 0 && variationItems.length === 0 && (
          <div className="border border-fg-border py-12 text-center mb-8">
            <p className="text-sm font-light text-fg-muted">No accepted estimate found for this project.</p>
            <p className="text-xs font-light text-fg-muted/60 mt-1">Accept an estimate first to create a progress claim.</p>
          </div>
        )}

        {/* Comments */}
        <div className="mb-8">
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
            Comments (visible to customer)
          </label>
          <textarea
            value={comments}
            onChange={e => setComments(e.target.value)}
            rows={3}
            placeholder="Optional comments for the client…"
            className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40"
          />
        </div>

        {/* Footer totals */}
        <div className="border border-fg-border p-6 mb-6 bg-fg-card/10">
          <div className="flex flex-col items-end gap-2 text-sm font-light">
            <div className="flex items-center justify-between w-full max-w-xs">
              <span className="text-fg-muted text-xs">Subtotal (Ex GST)</span>
              <span className="text-fg-heading tabular-nums">{formatCurrency(subtotalEx)}</span>
            </div>
            <div className="flex items-center justify-between w-full max-w-xs">
              <span className="text-fg-muted text-xs">GST (10%)</span>
              <span className="text-fg-heading tabular-nums">{formatCurrency(gst)}</span>
            </div>
            <div className="flex items-center justify-between w-full max-w-xs">
              <span className="text-fg-muted text-xs flex items-center gap-2">
                Rounding
                <input
                  type="number"
                  value={roundingAdjustment}
                  onChange={e => setRoundingAdjustment(parseFloat(e.target.value) || 0)}
                  step="0.01"
                  className="w-20 px-2 py-0.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums"
                />
              </span>
              <span className="text-fg-muted tabular-nums text-xs">{formatCurrency(roundingAdjustment)}</span>
            </div>
            <div className="flex items-center justify-between w-full max-w-xs border-t border-fg-border pt-2">
              <span className="text-fg-heading text-2xs uppercase tracking-architectural">Total (Inc GST)</span>
              <span className="text-fg-heading tabular-nums font-medium">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="px-5 py-2 border border-fg-border text-fg-heading text-xs font-light tracking-architectural uppercase hover:border-fg-heading transition-colors"
            >
              Save &amp; Close
            </button>
            <div className="relative group">
              <button
                disabled
                className="px-5 py-2 border border-fg-border/40 text-fg-muted/40 text-xs font-light tracking-architectural uppercase cursor-not-allowed flex items-center gap-1.5"
              >
                Save &amp; Send →Xero
              </button>
              <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-fg-darker border border-fg-border text-2xs font-light text-fg-muted whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Connect Xero to enable
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Invoices Sub-tab ──────────────────────────────────────────────────────────

function InvoicesSubTab({
  projectId,
  projectName,
  estimates,
}: {
  projectId: string
  projectName: string
  estimates: Estimate[]
}) {
  const [claims, setClaims] = useState<ProgressClaim[]>(() => loadProgressClaims(projectId))
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingClaim, setEditingClaim] = useState<ProgressClaim | null>(null)

  const refreshClaims = () => setClaims(loadProgressClaims(projectId))

  const handleSave = (claim: ProgressClaim) => {
    saveProgressClaim(claim)
    refreshClaims()
    setShowBuilder(false)
    setEditingClaim(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this invoice?')) return
    deleteProgressClaim(id)
    refreshClaims()
  }

  const handleMarkPaid = (claim: ProgressClaim) => {
    const updated: ProgressClaim = {
      ...claim,
      status: 'paid',
      paidAt: new Date().toISOString(),
    }
    saveProgressClaim(updated)
    refreshClaims()
  }

  const handleEdit = (claim: ProgressClaim) => {
    setEditingClaim(claim)
    setShowBuilder(true)
  }

  const handleCreate = () => {
    setEditingClaim(null)
    setShowBuilder(true)
  }

  // Totals
  const baseEstimates = estimates.filter(e => !e.parentEstimateId && e.status === 'accepted')
  const variationEstimates = estimates.filter(e => !!e.parentEstimateId && (e.status === 'accepted' || e.status === 'variation'))
  const totalContract = [...baseEstimates, ...variationEstimates].reduce(
    (s, e) => s + getEstimateTotals(e).totalRevenue, 0
  )
  const totalClaimed = claims.reduce((s, c) => s + c.subtotalEx, 0)
  const totalRemaining = totalContract - totalClaimed

  const STATUS_BADGE: Record<ProgressClaim['status'], string> = {
    draft: 'text-fg-muted border-fg-border',
    pending: 'text-amber-400/80 border-amber-400/40',
    sent: 'text-blue-400/80 border-blue-400/40',
    paid: 'text-green-400/80 border-green-400/40',
  }

  return (
    <>
      {showBuilder && (
        <ProgressClaimBuilder
          projectId={projectId}
          projectName={projectName}
          estimates={estimates}
          existingClaims={claims.filter(c => c.id !== editingClaim?.id)}
          editingClaim={editingClaim}
          onSave={handleSave}
          onCancel={() => { setShowBuilder(false); setEditingClaim(null) }}
        />
      )}

      <div>
        <div className="flex items-baseline justify-between mb-6">
          <p className="text-xs font-light tracking-wide text-fg-muted">
            {claims.length} invoice{claims.length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
          >
            <Plus className="w-3 h-3" /> Create Invoice
          </button>
        </div>

        {claims.length === 0 ? (
          <div className="border border-fg-border py-12 text-center">
            <Receipt className="w-8 h-8 text-fg-muted/30 mx-auto mb-3" />
            <p className="text-sm font-light text-fg-muted">No invoices yet.</p>
            <p className="text-xs font-light text-fg-muted/60 mt-1">Create a progress claim invoice to get started.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-fg-border">
                    {['Invoice #', 'Description', 'Amount (Ex)', 'GST', 'Total', 'Status', 'Date', 'Actions'].map(h => (
                      <th key={h} className="pb-3 pr-4 text-left text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap last:pr-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {claims
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map(claim => (
                      <tr key={claim.id} className="border-b border-fg-border/40 group">
                        <td className="py-3 pr-4 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap font-mono">
                          {claim.invoiceNumber}
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-heading max-w-[200px]">
                          {claim.description || <span className="text-fg-muted/40">—</span>}
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap">
                          {formatCurrency(claim.subtotalEx)}
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-muted tabular-nums whitespace-nowrap">
                          {formatCurrency(claim.gst)}
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-heading tabular-nums whitespace-nowrap">
                          {formatCurrency(claim.total)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`text-2xs font-light tracking-wide uppercase border rounded-sm px-1.5 py-0.5 whitespace-nowrap ${STATUS_BADGE[claim.status]}`}>
                            {claim.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-muted whitespace-nowrap">
                          {formatDateShort(claim.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(claim)}
                              className="text-2xs font-light tracking-wide uppercase text-fg-muted border border-fg-border px-2 py-0.5 hover:text-fg-heading hover:border-fg-heading transition-colors whitespace-nowrap"
                            >
                              Edit
                            </button>
                            {claim.status !== 'paid' && (
                              <button
                                onClick={() => handleMarkPaid(claim)}
                                className="text-2xs font-light tracking-wide uppercase text-green-400/80 border border-green-400/40 px-2 py-0.5 hover:bg-green-400/10 transition-colors whitespace-nowrap"
                              >
                                Mark Paid
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(claim.id)}
                              className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-red-400/60 transition-all"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Running totals */}
            <div className="mt-6 grid grid-cols-3 gap-px bg-fg-border border border-fg-border">
              {[
                { label: 'Total Contract', value: formatCurrency(totalContract) },
                { label: 'Total Claimed', value: formatCurrency(totalClaimed) },
                { label: 'Total Remaining', value: formatCurrency(totalRemaining), highlight: totalRemaining > 0 },
              ].map(item => (
                <div key={item.label} className="bg-fg-bg px-4 py-3">
                  <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{item.label}</p>
                  <p className={`text-sm font-light tabular-nums ${item.highlight ? 'text-amber-500' : 'text-fg-heading'}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Variations Sub-tab ────────────────────────────────────────────────────────

function VariationsSubTab({
  projectId,
  variations,
  onVariationsChange,
}: {
  projectId: string
  variations: Estimate[]
  onVariationsChange: () => void
}) {
  const router = useRouter()

  const handleApprove = (v: Estimate) => {
    const all = loadEstimates()
    const idx = all.findIndex(e => e.id === v.id)
    if (idx < 0) return
    all[idx] = { ...all[idx], status: 'accepted', updatedAt: new Date().toISOString() }
    saveEstimate(all[idx])
    onVariationsChange()
  }

  const handleReject = (v: Estimate) => {
    const all = loadEstimates()
    const idx = all.findIndex(e => e.id === v.id)
    if (idx < 0) return
    all[idx] = { ...all[idx], status: 'declined', updatedAt: new Date().toISOString() }
    saveEstimate(all[idx])
    onVariationsChange()
  }

  const handleNewVariation = () => {
    const reason = prompt('Reason for variation (e.g. Additional retaining wall):')
    if (!reason?.trim()) return

    // Find accepted base estimate for this project
    const allEstimates = loadEstimates()
    const acceptedBase = allEstimates.find(e => e.projectId === projectId && !e.parentEstimateId && e.status === 'accepted')
    if (!acceptedBase) {
      alert('Accept an estimate first before creating variations.')
      return
    }

    const existingVariations = allEstimates.filter(e => e.parentEstimateId === acceptedBase.id)
    const variationNumber = existingVariations.length + 1
    const now = new Date().toISOString()
    const newId = generateId()
    const variation: Estimate = {
      id: newId,
      projectId: acceptedBase.projectId,
      projectName: acceptedBase.projectName,
      name: `VMO-${variationNumber} - ${reason.trim()}`,
      version: 1,
      status: 'variation',
      defaultMarkupFormation: acceptedBase.defaultMarkupFormation,
      defaultMarkupSubcontractor: acceptedBase.defaultMarkupSubcontractor,
      lineItems: [],
      notes: acceptedBase.notes,
      categoryNotes: {},
      createdAt: now,
      updatedAt: now,
      parentEstimateId: acceptedBase.id,
      variationNumber,
      variationReason: reason.trim(),
      variationAmount: 0,
    }
    saveEstimate(variation)
    router.push(`/estimates/${newId}`)
  }

  const netVariations = variations.reduce((sum, v) => {
    if (v.status === 'accepted') return sum + getEstimateTotals(v).totalRevenue
    return sum
  }, 0)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <p className="text-xs font-light tracking-wide text-fg-muted">
          {variations.length} variation{variations.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={handleNewVariation}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
        >
          <Plus className="w-3 h-3" /> New Variation
        </button>
      </div>

      {variations.length === 0 ? (
        <div className="border border-fg-border py-12 text-center">
          <GitBranch className="w-8 h-8 text-fg-muted/30 mx-auto mb-3" />
          <p className="text-sm font-light text-fg-muted">No variations yet.</p>
          <p className="text-xs font-light text-fg-muted/60 mt-1">Create variations from the Estimates tab or use the button above.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-fg-border">
                  {['VMO #', 'Description', 'Status', 'Amount', 'Date', 'Actions'].map(h => (
                    <th key={h} className="pb-3 pr-4 text-left text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variations
                  .sort((a, b) => (a.variationNumber ?? 0) - (b.variationNumber ?? 0))
                  .map(v => {
                    const totals = getEstimateTotals(v)
                    const statusLabel = mapVariationStatus(v.status)
                    const statusColor = variationStatusColor(v.status)
                    return (
                      <tr key={v.id} className="border-b border-fg-border/40 group">
                        <td className="py-3 pr-4 text-xs font-light text-amber-400/80 whitespace-nowrap">
                          VMO-{v.variationNumber ?? '?'}
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-heading max-w-[220px]">
                          {v.variationReason || v.name || '—'}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`text-2xs font-light tracking-wide uppercase border rounded-sm px-1.5 py-0.5 whitespace-nowrap ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs font-light tabular-nums whitespace-nowrap">
                          <span className={totals.totalRevenue >= 0 ? 'text-green-400/80' : 'text-red-400/80'}>
                            {totals.totalRevenue >= 0 ? '+' : ''}{formatCurrency(totals.totalRevenue)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-xs font-light text-fg-muted whitespace-nowrap">
                          {formatDateShort(v.createdAt)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/estimates/${v.id}`}
                              className="flex items-center gap-1 text-2xs font-light tracking-wide uppercase text-fg-muted border border-fg-border px-2 py-0.5 hover:text-fg-heading hover:border-fg-heading transition-colors whitespace-nowrap"
                            >
                              <Eye className="w-2.5 h-2.5" /> View
                            </Link>
                            {(v.status === 'variation' || v.status === 'draft' || v.status === 'sent') && (
                              <button
                                onClick={() => handleApprove(v)}
                                className="flex items-center gap-1 text-2xs font-light tracking-wide uppercase text-green-400/80 border border-green-400/40 px-2 py-0.5 hover:bg-green-400/10 transition-colors whitespace-nowrap"
                              >
                                <Check className="w-2.5 h-2.5" /> Approve
                              </button>
                            )}
                            {(v.status === 'variation' || v.status === 'draft' || v.status === 'sent') && (
                              <button
                                onClick={() => handleReject(v)}
                                className="flex items-center gap-1 text-2xs font-light tracking-wide uppercase text-red-400/80 border border-red-400/40 px-2 py-0.5 hover:bg-red-400/10 transition-colors whitespace-nowrap"
                              >
                                <X className="w-2.5 h-2.5" /> Reject
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* Net variations total */}
          <div className="mt-6 grid grid-cols-2 gap-px bg-fg-border border border-fg-border max-w-sm">
            <div className="bg-fg-bg px-4 py-3">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Net Approved Variations</p>
              <p className={`text-sm font-light tabular-nums ${netVariations >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
                {netVariations >= 0 ? '+' : ''}{formatCurrency(netVariations)}
              </p>
            </div>
            <div className="bg-fg-bg px-4 py-3">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Total Variations</p>
              <p className="text-sm font-light tabular-nums text-fg-heading">{variations.length}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Activity Feed Sub-tab ─────────────────────────────────────────────────────

function ActivityFeedSubTab({
  projectId,
  variations,
  actuals,
}: {
  projectId: string
  variations: Estimate[]
  actuals: WeeklyActual[]
}) {
  const claims = loadProgressClaims(projectId)
  const events = buildActivityFeed(claims, variations, actuals)

  if (events.length === 0) {
    return (
      <div className="border border-fg-border py-12 text-center">
        <p className="text-sm font-light text-fg-muted">No financial activity yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={i} className="flex items-start gap-4 py-3.5 border-b border-fg-border/40">
          <span className="text-xs font-light text-fg-muted tabular-nums whitespace-nowrap w-28 shrink-0 mt-0.5">
            {formatDateShort(event.date)}
          </span>
          <span className="text-base leading-none shrink-0 mt-0.5">{event.icon}</span>
          <span className="text-xs font-light text-fg-heading leading-relaxed">{event.description}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function FinancialOperations({
  projectId,
  projectName,
  stages,
  estimates,
  onStagesChange,
  onEstimatesChange,
}: {
  projectId: string
  projectName: string
  stages: ProgressPaymentStage[]
  estimates: Estimate[]
  onStagesChange: (stages: ProgressPaymentStage[]) => void
  onEstimatesChange: () => void
}) {
  const [subTab, setSubTab] = useState<OpsSubTab>('invoices')

  const variations = estimates.filter(e => !!e.parentEstimateId)
  const actuals = loadWeeklyActuals(projectId)

  const SUB_TABS: { key: OpsSubTab; label: string }[] = [
    { key: 'invoices', label: 'Invoices' },
    { key: 'variations', label: 'Variations' },
    { key: 'activity', label: 'Activity' },
  ]

  return (
    <div>
      {/* Sub-tab row */}
      <div className="flex gap-2 mb-8">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 text-2xs font-light tracking-architectural uppercase transition-colors border ${
              subTab === t.key
                ? 'bg-fg-dark text-white/90 border-fg-dark'
                : 'bg-transparent text-fg-muted border-fg-border hover:text-fg-heading hover:border-fg-heading'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'invoices' && (
        <InvoicesSubTab
          projectId={projectId}
          projectName={projectName}
          estimates={estimates}
        />
      )}

      {subTab === 'variations' && (
        <VariationsSubTab
          projectId={projectId}
          variations={variations}
          onVariationsChange={onEstimatesChange}
        />
      )}

      {subTab === 'activity' && (
        <ActivityFeedSubTab
          projectId={projectId}
          variations={variations}
          actuals={actuals}
        />
      )}
    </div>
  )
}
