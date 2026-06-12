'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, loadProposals, saveEstimate } from '@/lib/storage'
import { upsertEstimate, upsertProject, getEstimates } from '@/lib/storageAsync'
import { formatCurrency, generateId } from '@/lib/utils'
import { calculateLineItemRevenue, readLineItemRevenue, getMarginSummary, getEstimateTotals, getEstimateContract } from '@/lib/estimateCalculations'
import { getAllLibraryItems, getCategories, defaultMarkupForType } from '@/lib/itemLibrary'
import type { Estimate, EstimateLineItem, LibraryItem } from '@/types'
import { Plus, Trash2, X, Search, Save, ExternalLink, ChevronUp, ChevronDown, GitBranch, Copy, Eye, EyeOff } from 'lucide-react'
import TakeoffTab from '@/components/TakeoffTab'

const UOM_OPTIONS = ['m²', 'hour', 'm³', 'lm', 'EA', 'Allowance', 'Day', 'week', 'sheet', 'each']

function fmtCurrency(n: number) {
  return formatCurrency(n)
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`
}

// ── Item Picker Modal ───────────────────────────────────────────────────────

function ItemPickerModal({
  onAdd,
  onClose,
  defaultCategory,
}: {
  onAdd: (item: LibraryItem) => void
  onClose: () => void
  defaultCategory?: string | null
}) {
  const [search, setSearch] = useState(defaultCategory || '')
  const allItems = getAllLibraryItems()

  const filtered = allItems.filter(item => {
    const q = search.toLowerCase()
    return !q || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
  })

  // Group by category
  const grouped = filtered.reduce<Record<string, LibraryItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = []
    acc[item.category].push(item)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-fg-darker/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-fg-bg border border-fg-border w-full max-w-2xl mx-4 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fg-border shrink-0">
          <h3 className="text-sm font-light tracking-wide text-fg-heading uppercase">Add from Library</h3>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-heading transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-3 border-b border-fg-border shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted" />
            <input
              autoFocus
              type="text"
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-4 py-2 bg-transparent border border-fg-border text-fg-heading text-xs font-light placeholder-fg-muted/50 rounded-none outline-none focus:border-fg-heading transition-colors"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="px-6 py-2 bg-fg-card/30 border-b border-fg-border">
                <p className="text-2xs font-medium tracking-wide uppercase text-[#5A5550]">{category}</p>
              </div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => { onAdd(item); onClose() }}
                  className="w-full flex items-center justify-between px-6 py-3 border-b border-fg-border/40 hover:bg-fg-card/40 transition-colors text-left"
                >
                  <div>
                    <p className="text-xs font-light text-fg-heading">{item.description}</p>
                    <p className="text-2xs font-light text-fg-muted mt-0.5">
                      {item.type} · {item.crewType} · {item.defaultUom}
                    </p>
                  </div>
                  <p className="text-xs font-light text-fg-heading tabular-nums ml-4">
                    {fmtCurrency(item.defaultUnitCost)}/{item.defaultUom}
                  </p>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-light text-fg-muted">No items found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Margin Sidebar ─────────────────────────────────────────────────────────

function MarginSidebar({ estimate }: { estimate: Estimate }) {
  const margins = getMarginSummary(estimate)
  const totals = getEstimateTotals(estimate)

  const marginColor = (meets: boolean) => meets ? 'text-green-600' : 'text-amber-600'
  const marginLabel = (meets: boolean) => meets ? '✓ MEETS' : '⚠ BELOW'

  return (
    <div className="bg-fg-card/20 border border-fg-border p-5 space-y-6">
      <h3 className="text-2xs font-medium tracking-wide uppercase text-[#5A5550]">Margin Checker</h3>

      {/* Formation vs Sub split */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Formation', cost: totals.formationCost, revenue: totals.formationRevenue, margin: totals.formationMargin, target: 0.40 },
          { label: 'Subcontractor', cost: totals.subCost, revenue: totals.subRevenue, margin: totals.subMargin, target: 0.34 },
        ].map(col => (
          <div key={col.label} className="bg-fg-darker/50 p-2.5 min-w-0">
            <p className="text-2xs font-semibold uppercase text-white/70 mb-2 truncate" title={col.label}>{col.label}</p>
            <div className="space-y-1.5">
              <div>
                <p className="text-2xs uppercase tracking-wide text-white/40">Cost</p>
                <p className="text-sm font-light text-white/90 tabular-nums">{fmtCurrency(col.cost)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-white/40">Revenue</p>
                <p className="text-sm font-light text-white/90 tabular-nums">{fmtCurrency(col.revenue)}</p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-wide text-white/40">Margin</p>
                <p className={`text-base font-medium tabular-nums ${col.revenue > 0 ? (col.margin >= col.target ? 'text-green-400' : 'text-amber-400') : 'text-white/40'}`}>
                  {col.revenue > 0 ? fmtPct(col.margin) : '—'}
                </p>
              </div>
              <p className={`text-xs font-medium tracking-wide ${col.revenue > 0 ? (col.margin >= col.target ? 'text-green-400' : 'text-amber-400') : 'text-white/40'}`}>
                {col.revenue > 0 ? marginLabel(col.margin >= col.target) : '—'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Per-category table */}
      {margins.length > 0 && (
        <div>
          <table className="w-full text-xs font-light">
            <thead>
              <tr className="border-b border-fg-border">
                <th className="text-left pb-2 text-2xs font-medium tracking-wide uppercase text-[#5A5550]">Category</th>
                <th className="text-right pb-2 text-2xs font-medium tracking-wide uppercase text-[#5A5550]">Margin</th>
                <th className="text-right pb-2 text-2xs font-medium tracking-wide uppercase text-[#5A5550]">Status</th>
              </tr>
            </thead>
            <tbody>
              {margins.map(m => (
                <tr key={m.category} className="border-b border-fg-border/30">
                  <td className="py-2 pr-2 text-fg-heading text-xs leading-tight">{m.category}</td>
                  <td className={`py-2 pr-2 text-right tabular-nums text-sm font-medium ${marginColor(m.meetsTarget)}`}>
                    {fmtPct(m.marginPercent)}
                  </td>
                  <td className={`py-2 text-right text-sm ${marginColor(m.meetsTarget)}`}>
                    {m.meetsTarget ? '✓' : '⚠'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="border-t border-fg-border pt-4 space-y-2">
        <div className="flex justify-between text-xs font-light">
          <span className="text-fg-muted">Total ex. GST</span>
          <span className="text-fg-heading tabular-nums">{fmtCurrency(totals.totalRevenue)}</span>
        </div>
        <div className="flex justify-between text-xs font-light">
          <span className="text-fg-muted">GST (10%)</span>
          <span className="text-fg-muted tabular-nums">{fmtCurrency(totals.gst)}</span>
        </div>
        <div className="flex justify-between text-sm font-light border-t border-fg-border pt-2 mt-2">
          <span className="text-fg-heading uppercase tracking-wide text-2xs">Total inc. GST</span>
          <span className="text-fg-heading tabular-nums">{fmtCurrency(totals.totalIncGst)}</span>
        </div>
        <div className="flex justify-between text-xs font-light pt-1">
          <span className="text-fg-muted">Overall margin</span>
          <span className={`tabular-nums ${totals.totalRevenue > 0 ? (totals.overallMargin >= 0.38 ? 'text-green-400' : 'text-amber-400') : 'text-fg-muted'}`}>
            {totals.totalRevenue > 0 ? fmtPct(totals.overallMargin) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Markup & Rounding ───────────────────────────────────────────────────────

function MarkupRoundingPanel({ estimate, onChange }: { estimate: Estimate; onChange: (patch: Partial<Estimate>) => void }) {
  const markups = estimate.projectMarkups ?? []
  const rows = Array.from({ length: 5 }, (_, i) => markups[i] ?? { id: '', description: '', percent: 0 })
  const c = getEstimateContract(estimate)

  const setRow = (idx: number, patch: Partial<{ description: string; percent: number }>) => {
    const next = rows.map((r, i) => {
      const base = { id: r.id || generateId(), description: r.description, percent: r.percent }
      return i === idx ? { ...base, ...patch } : base
    })
    onChange({ projectMarkups: next })
  }

  return (
    <div className="bg-fg-card/20 border border-fg-border p-5 mt-4 space-y-4">
      <div>
        <h3 className="text-xs font-medium tracking-wide uppercase text-fg-heading">Markup &amp; Rounding</h3>
        <p className="text-2xs text-fg-muted mt-1">Up to 5 project markups (e.g. waste, contingency), applied on top of the line totals.</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="text-2xs text-fg-muted w-3 text-right">{i + 1}</span>
            <input
              defaultValue={r.description}
              onBlur={e => setRow(i, { description: e.target.value })}
              placeholder="Description"
              className="flex-1 min-w-0 text-xs bg-fg-card/30 px-1.5 py-1 outline-none text-fg-heading placeholder-fg-muted/40"
            />
            <input
              type="number"
              defaultValue={r.percent || ''}
              onBlur={e => { const n = parseFloat(e.target.value); setRow(i, { percent: Number.isFinite(n) ? n : 0 }) }}
              className="w-12 text-xs bg-fg-card/30 px-1.5 py-1 outline-none text-fg-heading text-right tabular-nums"
            />
            <span className="text-2xs text-fg-muted">%</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-baseline border-t border-fg-border pt-2">
        <span className="text-2xs font-medium uppercase tracking-wide text-fg-muted">Total Markup</span>
        <span className="text-sm font-medium text-fg-heading tabular-nums">{c.markupPct.toFixed(1)}%</span>
      </div>
      <div>
        <p className="text-2xs text-fg-muted uppercase tracking-wide mb-1">Round ex-GST total to nearest</p>
        <select
          value={estimate.roundingMode ?? 'none'}
          onChange={e => onChange({ roundingMode: e.target.value as Estimate['roundingMode'] })}
          className="w-full text-xs bg-fg-bg border border-fg-border px-2 py-1.5 outline-none text-fg-heading"
        >
          <option value="none">None</option>
          <option value="ten">Ten</option>
          <option value="hundred">Hundred</option>
          <option value="thousand">Thousand</option>
        </select>
      </div>
      <div className="border-t border-fg-border pt-2 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-fg-muted">Line subtotal</span><span className="text-fg-heading tabular-nums">{fmtCurrency(c.lineRevenue)}</span></div>
        {c.markupAmount > 0.005 && <div className="flex justify-between"><span className="text-fg-muted">+ Markups</span><span className="text-fg-heading tabular-nums">{fmtCurrency(c.markupAmount)}</span></div>}
        {Math.abs(c.rounding) >= 0.005 && <div className="flex justify-between"><span className="text-fg-muted">Rounding</span><span className="text-fg-heading tabular-nums">{c.rounding >= 0 ? '+' : '−'}{fmtCurrency(Math.abs(c.rounding))}</span></div>}
        <div className="flex justify-between font-medium border-t border-fg-border/50 pt-1"><span className="text-fg-heading uppercase tracking-wide text-2xs">Total ex GST</span><span className="text-fg-heading tabular-nums">{fmtCurrency(c.exGst)}</span></div>
      </div>
    </div>
  )
}

// ── Line Item Row ───────────────────────────────────────────────────────────

function LineItemRow({
  item,
  categories,
  onChange,
  onDelete,
  onDuplicate,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  item: EstimateLineItem
  categories: string[]
  onChange: (updated: EstimateLineItem) => void
  onDelete: () => void
  onDuplicate: () => void
  onToggle: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const update = (patch: Partial<EstimateLineItem>) => {
    const updated = { ...item, ...patch }
    // Recalculate derived fields
    const total = updated.units * updated.unitCost
    const revenue = calculateLineItemRevenue({ ...updated, total })
    onChange({ ...updated, total, revenue })
  }

  const inputCls = 'w-full px-1.5 py-1 bg-transparent border border-transparent hover:border-fg-border focus:border-fg-heading text-[#292929] text-xs font-light rounded-none outline-none transition-colors'
  const numCls = inputCls + ' tabular-nums text-right'
  const off = item.enabled === false

  return (
    <tr
      className={`border-b border-fg-border/30 group hover:bg-fg-card/20 ${off ? 'opacity-45' : ''}`}
      title={off ? 'Turned off — kept for reference, not counted in totals' : undefined}
    >
      <td className="py-1.5 px-1">
        <input
          value={item.displayOrder}
          onChange={e => update({ displayOrder: e.target.value })}
          className={`${inputCls} w-12 text-center`}
          placeholder="1.0"
        />
      </td>
      <td className="py-1.5 px-1 min-w-[200px]">
        <input
          value={item.description}
          onChange={e => update({ description: e.target.value })}
          className={inputCls}
          placeholder="Description…"
        />
        <input
          value={item.subcategory ?? ''}
          onChange={e => update({ subcategory: e.target.value || undefined })}
          list="estimate-subcategories"
          className={`${inputCls} text-2xs text-fg-muted mt-0.5`}
          placeholder="Sub-category (Gantt posting)…"
        />
      </td>
      <td className="py-1.5 px-1">
        <select
          value={item.type}
          onChange={e => {
            const t = e.target.value as EstimateLineItem['type']
            // Markup follows the item type — re-apply the type's default on change.
            update({ type: t, markupPercent: defaultMarkupForType(t) })
          }}
          className={`${inputCls} bg-fg-bg appearance-none`}
        >
          <option>Material</option>
          <option>Labour</option>
          <option>Subcontractor</option>
          <option>Equipment</option>
        </select>
      </td>
      <td className="py-1.5 px-1">
        <button
          onClick={() => update({ crewType: item.crewType === 'Formation' ? 'Subcontractor' : 'Formation' })}
          className={`text-2xs font-light tracking-wide uppercase px-1.5 py-0.5 border rounded-sm transition-colors ${
            item.crewType === 'Formation'
              ? 'text-blue-400/80 border-blue-400/40 hover:bg-blue-400/10'
              : 'text-amber-400/80 border-amber-400/40 hover:bg-amber-400/10'
          }`}
        >
          {item.crewType === 'Formation' ? 'Form' : 'Sub'}
        </button>
      </td>
      <td className="py-1.5 px-1 w-16">
        <input
          type="number"
          value={item.units || ''}
          onChange={e => update({ units: parseFloat(e.target.value) || 0 })}
          className={numCls}
          placeholder="0"
        />
      </td>
      <td className="py-1.5 px-1 w-20">
        <select
          value={item.uom}
          onChange={e => update({ uom: e.target.value })}
          className={`${inputCls} bg-fg-bg appearance-none`}
        >
          {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          {!UOM_OPTIONS.includes(item.uom) && <option value={item.uom}>{item.uom}</option>}
        </select>
      </td>
      <td className="py-1.5 px-1 w-24">
        <input
          type="number"
          value={item.unitCost || ''}
          onChange={e => update({ unitCost: parseFloat(e.target.value) || 0 })}
          className={numCls}
          placeholder="0.00"
        />
      </td>
      <td className="py-1.5 px-1 w-24 text-right text-xs font-light text-[#5A5550] tabular-nums pr-2">
        {fmtCurrency(item.total)}
      </td>
      <td className="py-1.5 px-1 w-16">
        <input
          type="number"
          value={item.markupPercent || ''}
          onChange={e => update({ markupPercent: parseFloat(e.target.value) || 0 })}
          className={numCls}
          placeholder="40"
        />
      </td>
      <td className="py-1.5 px-1 w-24 text-right text-xs font-light text-fg-heading tabular-nums pr-2">
        {fmtCurrency(item.revenue)}
      </td>
      <td className="py-1.5 px-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggle}
            title={off ? 'Turn on (include in totals)' : 'Turn off (keep for reference, exclude from totals)'}
            className={`p-1 transition-colors ${off ? 'text-amber-500/80 hover:text-amber-500' : 'text-fg-muted/50 hover:text-fg-heading'}`}
          >
            {off ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          <button onClick={onMoveUp} title="Move up" className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-fg-heading transition-all p-1">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={onMoveDown} title="Move down" className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-fg-heading transition-all p-1">
            <ChevronDown className="w-3 h-3" />
          </button>
          <button onClick={onDuplicate} title="Duplicate" className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-fg-heading transition-all p-1">
            <Copy className="w-3 h-3" />
          </button>
          <button onClick={onDelete} title="Delete" className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-red-400/60 transition-all p-1">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function EstimateBuilderPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerCategory, setPickerCategory] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [parentEstimate, setParentEstimate] = useState<Estimate | null>(null)
  const [activeTab, setActiveTab] = useState<'estimate' | 'takeoff'>('estimate')

  // Warn user about unsaved changes before leaving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Read localStorage first; if the estimate isn't there, the local copy may have been cleared
      // (one-time purge / browser-data clear / another device). Fall back to Supabase — the durable
      // copy — and restore it locally so edits from here autosave normally. Only bounce to the list
      // if neither store has it.
      let found = loadEstimates().find(e => e.id === id)
      if (!found) {
        const remote = await getEstimates()
        found = remote.find(e => e.id === id)
        if (found) saveEstimate(found)
      }
      if (cancelled) return
      if (!found) { router.push('/estimates'); return }
      const est = found
      setEstimate(est)
      // Load parent estimate if this is a variation
      if (est.parentEstimateId) {
        let parent = loadEstimates().find(e => e.id === est.parentEstimateId)
        if (!parent) parent = (await getEstimates()).find(e => e.id === est.parentEstimateId)
        if (!cancelled) setParentEstimate(parent || null)
      }
    })()
    return () => { cancelled = true }
  }, [id, router])

  // Autosave — debounce a save ~1s after the last edit (local + Supabase). The initial load-set is
  // skipped so opening an estimate doesn't trigger a write.
  const didInitialLoad = useRef(false)
  useEffect(() => {
    if (!estimate) return
    if (!didInitialLoad.current) { didInitialLoad.current = true; return }
    const handle = setTimeout(() => {
      void upsertEstimate(estimate)
      setHasUnsavedChanges(false)
    }, 1000)
    return () => clearTimeout(handle)
  }, [estimate])

  const updateEstimate = useCallback((patch: Partial<Estimate>) => {
    setEstimate(prev => prev ? { ...prev, ...patch, updatedAt: new Date().toISOString() } : prev)
    setHasUnsavedChanges(true)
  }, [])

  const updateLineItem = useCallback((itemId: string, updated: EstimateLineItem) => {
    setEstimate(prev => {
      if (!prev) return prev
      return {
        ...prev,
        lineItems: prev.lineItems.map(i => i.id === itemId ? updated : i),
        updatedAt: new Date().toISOString(),
      }
    })
    setHasUnsavedChanges(true)
  }, [])

  const deleteLineItem = useCallback((itemId: string) => {
    setEstimate(prev => {
      if (!prev) return prev
      return {
        ...prev,
        lineItems: prev.lineItems.filter(i => i.id !== itemId),
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  // Duplicate a line item — exact copy dropped in right after the original. Use it to keep a previous
  // option for reference: duplicate, then turn one copy off.
  const duplicateLineItem = useCallback((itemId: string) => {
    setEstimate(prev => {
      if (!prev) return prev
      const idx = prev.lineItems.findIndex(i => i.id === itemId)
      if (idx === -1) return prev
      const copy: EstimateLineItem = { ...prev.lineItems[idx], id: generateId() }
      const next = [...prev.lineItems]
      next.splice(idx + 1, 0, copy)
      return { ...prev, lineItems: next, updatedAt: new Date().toISOString() }
    })
    setHasUnsavedChanges(true)
  }, [])

  // Turn a line on/off. Off lines stay visible for reference but drop out of all totals + the Gantt.
  const toggleLineItem = useCallback((itemId: string) => {
    setEstimate(prev => {
      if (!prev) return prev
      return {
        ...prev,
        lineItems: prev.lineItems.map(i => i.id === itemId ? { ...i, enabled: i.enabled === false } : i),
        updatedAt: new Date().toISOString(),
      }
    })
    setHasUnsavedChanges(true)
  }, [])

  // Move a line up/down within its own category + sub-category group (the unit the grid renders), by
  // swapping it with the nearest same-group neighbour in that direction.
  const moveLineItem = useCallback((itemId: string, dir: -1 | 1) => {
    setEstimate(prev => {
      if (!prev) return prev
      const items = prev.lineItems
      const idx = items.findIndex(i => i.id === itemId)
      if (idx === -1) return prev
      const me = items[idx]
      const sameGroup = (o: EstimateLineItem) => o.category === me.category && (o.subcategory || '') === (me.subcategory || '')
      let swap = -1
      for (let j = idx + dir; j >= 0 && j < items.length; j += dir) {
        if (sameGroup(items[j])) { swap = j; break }
      }
      if (swap === -1) return prev
      const next = [...items]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return { ...prev, lineItems: next, updatedAt: new Date().toISOString() }
    })
    setHasUnsavedChanges(true)
  }, [])

  const addFromLibrary = useCallback((libraryItem: LibraryItem) => {
    if (!estimate) return
    const category = pickerCategory || libraryItem.category
    const markup = defaultMarkupForType(libraryItem.type)   // per-type default (Material 45 / Labour 75 / Sub 35 / Equip 40)
    const total = 0
    const newItem: EstimateLineItem = {
      id: generateId(),
      estimateId: estimate.id,
      displayOrder: String(estimate.lineItems.length + 1),
      category,
      description: libraryItem.description,
      type: libraryItem.type,
      units: 0,
      uom: libraryItem.defaultUom,
      unitCost: libraryItem.defaultUnitCost,
      total,
      markupPercent: markup,
      revenue: 0,
      crewType: libraryItem.crewType,
    }
    setEstimate(prev => prev ? {
      ...prev,
      lineItems: [...prev.lineItems, newItem],
      updatedAt: new Date().toISOString(),
    } : prev)
    setShowPicker(false)
    setPickerCategory(null)
  }, [estimate, pickerCategory])

  const addBlankRow = useCallback((category: string) => {
    if (!estimate) return
    // Crew defaults to the dominant crew in the category; markup defaults by item TYPE (a blank row
    // starts as Material → 45%) and follows the type from there.
    const catItems = estimate.lineItems.filter(i => i.category === category)
    const subCount = catItems.filter(i => i.crewType === 'Subcontractor').length
    const formCount = catItems.filter(i => i.crewType === 'Formation').length
    const defaultCrew: 'Formation' | 'Subcontractor' = subCount > formCount ? 'Subcontractor' : 'Formation'
    const markup = defaultMarkupForType('Material')
    const newItem: EstimateLineItem = {
      id: generateId(),
      estimateId: estimate.id,
      displayOrder: String(estimate.lineItems.length + 1),
      category,
      description: '',
      type: 'Material',
      units: 0,
      uom: 'EA',
      unitCost: 0,
      total: 0,
      markupPercent: markup,
      revenue: 0,
      crewType: defaultCrew,
    }
    setEstimate(prev => prev ? {
      ...prev,
      lineItems: [...prev.lineItems, newItem],
      updatedAt: new Date().toISOString(),
    } : prev)
  }, [estimate])

  const handleUpdateLineItemQty = useCallback((lineItemId: string, qty: number, unit: string) => {
    setEstimate(prev => {
      if (!prev) return prev
      return {
        ...prev,
        lineItems: prev.lineItems.map(li => {
          if (li.id !== lineItemId) return li
          const total = (qty || 0) * (li.unitCost || 0)
          // Reuse the single revenue calculator so this path can't drift from the editor's.
          return { ...li, units: qty, uom: unit, total, revenue: calculateLineItemRevenue({ ...li, total }) }
        }),
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  const handleSave = () => {
    if (!estimate) return
    void upsertEstimate(estimate)   // "Save now" — autosave also runs on a debounce
    setHasUnsavedChanges(false)
  }

  const handleConvertToProject = async () => {
    if (!estimate) return
    if (!confirm('Convert this estimate to a project? The estimate will be locked as the financial baseline.')) return

    const totals = getEstimateTotals(estimate)
    const categories = Array.from(new Set(estimate.lineItems.filter(i => i.enabled !== false).map(i => i.category).filter(Boolean)))

    // Derive project name and client name — prefer linked proposal if available
    const projectName = estimate.projectName || estimate.name || 'New Project'
    const linkedProposal = estimate.proposalId
      ? loadProposals().find(p => p.id === estimate.proposalId)
      : null
    const clientName = linkedProposal?.clientName || projectName
    const projectAddress = linkedProposal?.projectAddress || ''

    // Build baseline from estimate. Scale each category's revenue by the contract factor so the
    // categories sum to the ex-GST contract (line revenue + project markups + rounding), not the
    // bare line subtotal.
    const factor = getEstimateContract(estimate).factor
    const categoryMap: Record<string, { revenue: number; cost: number }> = {}
    estimate.lineItems.filter(li => li.enabled !== false).forEach(li => {
      const cat = li.category || 'General'
      if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, cost: 0 }
      categoryMap[cat].revenue += readLineItemRevenue(li) * factor
      categoryMap[cat].cost += li.total
    })
    const baselineCategories = Object.entries(categoryMap).map(([name, v]) => ({ name, ...v }))
    const baselineCost = estimate.lineItems.reduce((s, li) => s + li.total, 0)
    const baselineRevenue = totals.totalRevenue
    const baselineGP = baselineRevenue > 0 ? ((baselineRevenue - baselineCost) / baselineRevenue) * 100 : 0

    const projectType = (estimate.projectType || 'landscape_only') as 'landscape_only' | 'landscape_and_pool' | 'pool_only'
    const entity = projectType === 'pool_only' ? 'lume' as const : 'formation' as const
    const scopes = projectType === 'landscape_and_pool'
      ? [
          { id: generateId(), name: 'Landscape', entity: 'formation' as const, invoiceModel: 'progress_claim' as const },
          { id: generateId(), name: 'Pool', entity: 'lume' as const, invoiceModel: 'stage_based' as const },
        ]
      : projectType === 'pool_only'
        ? [{ id: generateId(), name: 'Pool', entity: 'lume' as const, invoiceModel: 'stage_based' as const }]
        : [{ id: generateId(), name: 'Landscape', entity: 'formation' as const, invoiceModel: 'progress_claim' as const }]

    const newProject = {
      id: generateId(),
      entity,
      name: projectName,
      clientName,
      address: projectAddress,
      contractValue: baselineRevenue,
      startDate: new Date().toISOString().split('T')[0],
      plannedCompletion: '',
      foreman: '',
      status: 'planning' as const,
      notes: `Created from estimate ${estimate.id}`,
      projectType,
      scopes,
      invoiceModel: entity === 'formation' ? 'progress_claim' as const : 'stage_based' as const,
      stage: 'contracted' as const,
      stageChecklist: [],
      baseline: {
        capturedAt: new Date().toISOString(),
        sourceEstimateId: estimate.id,
        contractValue: baselineRevenue,
        costEstimate: baselineCost,
        grossProfit: baselineRevenue - baselineCost,
        gpPercent: baselineGP,
        categories: baselineCategories,
      },
      createdAt: new Date().toISOString(),
    }

    // Project first (estimate.project_id has an FK to fg_projects), then the estimate.
    await upsertProject(newProject)

    // Lock estimate as baseline and link to project
    const updated = {
      ...estimate,
      projectId: newProject.id,
      projectName: newProject.name,
      status: 'accepted' as const,
      isBaseline: true,
      updatedAt: new Date().toISOString(),
    }
    await upsertEstimate(updated)
    setEstimate(updated)

    router.push(`/projects/${newProject.id}`)
  }

  const renameCategory = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return
    setEstimate(prev => {
      if (!prev) return prev
      // Move category notes to the new key
      const updatedNotes = { ...(prev.categoryNotes || {}) }
      if (updatedNotes[oldName] !== undefined) {
        updatedNotes[newName] = updatedNotes[oldName]
        delete updatedNotes[oldName]
      }
      return {
        ...prev,
        lineItems: prev.lineItems.map(i => i.category === oldName ? { ...i, category: newName } : i),
        categoryNotes: updatedNotes,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const moveCategoryUp = (category: string) => {
    if (!estimate) return
    const cats = Array.from(new Set(estimate.lineItems.map(i => i.category)))
    const idx = cats.indexOf(category)
    if (idx <= 0) return
    // Reorder by swapping items' positions — move all items of this category before the previous category
    const prevCat = cats[idx - 1]
    setEstimate(prev2 => {
      if (!prev2) return prev2
      const prevItems = prev2.lineItems.filter(i => i.category === prevCat)
      const currItems = prev2.lineItems.filter(i => i.category === category)
      const otherItems = prev2.lineItems.filter(i => i.category !== prevCat && i.category !== category)
      // Rebuild: everything before prevCat, then curr, then prev, then everything after
      const beforeIdx = prev2.lineItems.findIndex(i => i.category === prevCat)
      const before = prev2.lineItems.slice(0, beforeIdx).filter(i => i.category !== category)
      const afterLastPrev = prev2.lineItems.slice(beforeIdx).filter(i => i.category !== prevCat && i.category !== category)
      const reordered = [...before, ...currItems, ...prevItems, ...afterLastPrev]
      return {
        ...prev2,
        lineItems: reordered,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  const updateCategoryNote = (category: string, notes: string) => {
    setEstimate(prev => prev ? {
      ...prev,
      categoryNotes: { ...(prev.categoryNotes || {}), [category]: notes },
      updatedAt: new Date().toISOString(),
    } : prev)
  }

  const moveCategoryDown = (category: string) => {
    if (!estimate) return
    const cats = Array.from(new Set(estimate.lineItems.map(i => i.category)))
    const idx = cats.indexOf(category)
    if (idx >= cats.length - 1) return
    // Reorder by swapping items' positions — move all items of this category after the next category
    const nextCat = cats[idx + 1]
    setEstimate(prev2 => {
      if (!prev2) return prev2
      const currItems = prev2.lineItems.filter(i => i.category === category)
      const nextItems = prev2.lineItems.filter(i => i.category === nextCat)
      // Rebuild: everything before curr, then next, then curr, then everything after
      const beforeIdx = prev2.lineItems.findIndex(i => i.category === category)
      const before = prev2.lineItems.slice(0, beforeIdx)
      const afterBoth = prev2.lineItems.filter(i => i.category !== category && i.category !== nextCat).slice(before.length)
      const reordered = [...before, ...nextItems, ...currItems, ...afterBoth]
      return {
        ...prev2,
        lineItems: reordered,
        updatedAt: new Date().toISOString(),
      }
    })
  }

  // Copy a whole category (all its line items) as a new "<name> (copy)" category, dropped in right
  // after the original — for keeping a previous version of a section while you rework it.
  const duplicateCategory = (category: string) => {
    setEstimate(prev => {
      if (!prev) return prev
      const items = prev.lineItems
      const existing = new Set(items.map(i => i.category))
      let newName = `${category} (copy)`
      let n = 2
      while (existing.has(newName)) { newName = `${category} (copy ${n})`; n++ }
      const clones = items.filter(i => i.category === category).map(i => ({ ...i, id: generateId(), category: newName }))
      if (clones.length === 0) return prev
      let lastIdx = -1
      items.forEach((i, idx) => { if (i.category === category) lastIdx = idx })
      const next = [...items]
      next.splice(lastIdx + 1, 0, ...clones)
      return { ...prev, lineItems: next, updatedAt: new Date().toISOString() }
    })
    setHasUnsavedChanges(true)
  }

  // Hide/show a whole category by toggling all its line items. If every line is already off, showing
  // turns them all on; otherwise hiding turns them all off. Hidden categories stay visible (greyed)
  // for reference but drop out of every total and the Gantt.
  const toggleCategory = (category: string) => {
    setEstimate(prev => {
      if (!prev) return prev
      const catItems = prev.lineItems.filter(i => i.category === category)
      const allOff = catItems.length > 0 && catItems.every(i => i.enabled === false)
      return {
        ...prev,
        lineItems: prev.lineItems.map(i => i.category === category ? { ...i, enabled: allOff } : i),
        updatedAt: new Date().toISOString(),
      }
    })
    setHasUnsavedChanges(true)
  }

  if (!estimate) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const categories = Array.from(new Set(estimate.lineItems.map(i => i.category)))
  const allCategories = Array.from(new Set([...getCategories(), ...categories]))
  // Distinct sub-categories already used — fed to a shared <datalist> so each row can pick an
  // existing one (avoids typos splitting a sub-category into two Gantt postings).
  const allSubcategories = Array.from(
    new Set(estimate.lineItems.map(i => (i.subcategory || '').trim()).filter(Boolean)),
  ).sort()

  return (
    <div className="max-w-[1680px] mx-auto px-4 lg:px-8 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-xs font-light text-fg-muted">
        <Link href="/estimates" className="hover:text-fg-heading transition-colors">Estimates</Link>
        <span>/</span>
        <span className="text-fg-heading">{estimate.projectName} v{estimate.version}</span>
      </div>

      {/* Proposal link banner */}
      {estimate.proposalId && (
        <div className="mb-4 px-4 py-2.5 border border-fg-border/50 bg-fg-card/20 flex items-center justify-between">
          <p className="text-2xs text-fg-muted">Linked to design proposal</p>
          <Link href={`/design/${estimate.proposalId}`} className="text-2xs text-fg-heading hover:underline transition-colors">
            View proposal →
          </Link>
        </div>
      )}

      {/* Variation banner */}
      {estimate.status === 'variation' && (
        <div className="mb-6 border border-amber-400/30 bg-amber-400/5 px-5 py-3 flex items-center gap-3">
          <GitBranch className="w-4 h-4 text-amber-400/70 shrink-0" />
          <div>
            <p className="text-xs font-light text-amber-400/90">
              Variation to:{' '}
              {parentEstimate ? (
                <Link href={`/estimates/${parentEstimate.id}`} className="underline underline-offset-2 hover:text-amber-400 transition-colors">
                  {parentEstimate.name || `v${parentEstimate.version}`} — {parentEstimate.projectName}
                </Link>
              ) : (
                <span className="text-amber-400/60">loading…</span>
              )}
            </p>
            <p className="text-2xs font-light text-amber-400/60 mt-0.5">Changes here represent additional scope only</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Item
          </button>
          <button
            onClick={() => addBlankRow(categories[categories.length - 1] || 'General')}
            className="flex items-center gap-2 px-3 py-1.5 border border-fg-border text-fg-muted text-xs font-light tracking-architectural uppercase hover:text-fg-heading transition-colors"
          >
            <Plus className="w-3 h-3" /> Blank Row
          </button>
          <button
            onClick={handleSave}
            title="Autosaves automatically — click to save now"
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-light tracking-architectural uppercase transition-colors ${
              hasUnsavedChanges
                ? 'border border-fg-border text-fg-muted hover:text-fg-heading'
                : 'bg-green-500/15 text-green-600 border border-green-500/30'
            }`}
          >
            <Save className="w-3 h-3" /> {hasUnsavedChanges ? 'Saving…' : 'Saved'}
          </button>
          <Link
            href={`/estimates/${estimate.id}/quote`}
            className="flex items-center gap-2 px-3 py-1.5 border border-fg-border text-fg-muted text-xs font-light tracking-architectural uppercase hover:text-fg-heading transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Quote
          </Link>

          {estimate.lineItems.length > 0 && !estimate.isBaseline && (
            <button
              onClick={handleConvertToProject}
              className="flex items-center gap-2 px-3 py-1.5 border border-green-500/40 text-green-600 text-xs font-light tracking-architectural uppercase hover:bg-green-500/10 transition-colors"
            >
              Convert to Project →
            </button>
          )}

          {estimate.isBaseline && (
            <span className="text-2xs text-fg-muted border border-fg-border/50 px-2 py-1 rounded-sm">
              ✓ Baseline
            </span>
          )}

        </div>
        <div className="flex items-center gap-3">
          <select
            value={estimate.status}
            onChange={e => updateEstimate({ status: e.target.value as Estimate['status'] })}
            className="px-3 py-1.5 bg-fg-bg border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none"
          >
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            {/* "Variation" is always selectable for any estimate that's a variation (has a parent),
                or when status is already 'variation' — prevents the option silently disappearing on a
                re-save and dropping the variation marker. */}
            {(estimate.status === 'variation' || estimate.parentEstimateId) && (
              <option value="variation">Variation</option>
            )}
          </select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-fg-border mb-6">
        {(['estimate', 'takeoff'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-light tracking-wide uppercase transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'text-fg-heading border-fg-heading'
                : 'text-fg-muted border-transparent hover:text-fg-heading'
            }`}
          >
            {tab === 'estimate' ? 'Line Items' : 'Takeoff'}
          </button>
        ))}
      </div>

      {/* Takeoff tab */}
      {activeTab === 'takeoff' && (
        <TakeoffTab
          estimateId={estimate.id}
          lineItems={estimate.lineItems}
          onUpdateLineItemQty={handleUpdateLineItemQty}
        />
      )}

      {/* Two-panel layout */}
      <div className={`flex gap-6 items-start ${activeTab !== 'estimate' ? 'hidden' : ''}`}>
        {/* Main table */}
        <div className="flex-1 min-w-0 overflow-x-auto" style={{ overflowX: 'auto' }}>
          {/* Shared sub-category suggestions — every row's sub-category input picks from here. */}
          <datalist id="estimate-subcategories">
            {allSubcategories.map(s => <option key={s} value={s} />)}
          </datalist>
          {categories.length === 0 ? (
            <div className="border border-fg-border py-16 text-center">
              <p className="text-sm font-light text-fg-muted mb-4">No line items yet.</p>
              <button
                onClick={() => setShowPicker(true)}
                className="text-xs font-medium tracking-wide uppercase text-[#292929] border-b border-fg-border pb-px"
              >
                Add from library
              </button>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-fg-border">
                  {['#', 'Description', 'Type', 'Crew', 'Units', 'UOM', 'Unit Cost', 'Total', 'Mkup%', 'Revenue', ''].map(h => (
                    <th key={h} className="pb-2.5 px-1 text-left text-2xs font-medium tracking-architectural uppercase text-[#6B6560] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(category => {
                  const catItems = estimate.lineItems.filter(i => i.category === category)
                  const catActive = catItems.filter(i => i.enabled !== false)
                  const catHidden = catItems.length > 0 && catActive.length === 0
                  const catTotal = catActive.reduce((s, i) => s + i.total, 0)
                  const catRevenue = catActive.reduce((s, i) => s + readLineItemRevenue(i), 0)
                  const catIdx = categories.indexOf(category)

                  return [
                    // Category header row
                    <CategoryHeaderRow
                      key={`cat-${category}`}
                      category={category}
                      total={catTotal}
                      revenue={catRevenue}
                      hidden={catHidden}
                      isFirst={catIdx === 0}
                      isLast={catIdx === categories.length - 1}
                      onRename={(newName) => renameCategory(category, newName)}
                      onMoveUp={() => moveCategoryUp(category)}
                      onMoveDown={() => moveCategoryDown(category)}
                      onAddRow={() => addBlankRow(category)}
                      onDuplicate={() => duplicateCategory(category)}
                      onToggle={() => toggleCategory(category)}
                    />,
                    // Internal notes row
                    <tr key={`notes-${category}`}>
                      <td colSpan={11} className="px-2 pb-1.5">
                        <textarea
                          value={estimate.categoryNotes?.[category] || ''}
                          onChange={e => updateCategoryNote(category, e.target.value)}
                          placeholder="Add internal notes for this section…"
                          rows={1}
                          className="w-full bg-transparent text-xs font-light text-fg-muted placeholder-[#8A8580] border border-transparent hover:border-fg-border/50 focus:border-fg-border px-2 py-1 resize-none outline-none transition-colors rounded-none"
                          style={{ minHeight: '28px' }}
                          onInput={e => {
                            const target = e.target as HTMLTextAreaElement
                            target.style.height = 'auto'
                            target.style.height = target.scrollHeight + 'px'
                          }}
                        />
                      </td>
                    </tr>,
                    // Line items, grouped under sub-category sub-headings (no sub-category first).
                    ...(() => {
                      const bySub = new Map<string, EstimateLineItem[]>()
                      for (const item of catItems) {
                        const sub = (item.subcategory || '').trim()
                        if (!bySub.has(sub)) bySub.set(sub, [])
                        bySub.get(sub)!.push(item)
                      }
                      const subKeys = Array.from(bySub.keys()).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0))
                      const out: React.ReactNode[] = []
                      for (const sub of subKeys) {
                        const items = bySub.get(sub)!
                        if (sub) {
                          const subActive = items.filter(i => i.enabled !== false)
                          const subTotal = subActive.reduce((s, i) => s + i.total, 0)
                          const subRevenue = subActive.reduce((s, i) => s + readLineItemRevenue(i), 0)
                          out.push(
                            <tr key={`sub-${category}-${sub}`} className="bg-fg-card/10 border-b border-fg-border/20">
                              <td />
                              <td colSpan={6} className="py-1 px-2 text-2xs font-medium tracking-wide uppercase text-fg-muted">↳ {sub}</td>
                              <td className="py-1 px-1 text-right text-2xs text-fg-muted tabular-nums">{fmtCurrency(subTotal)}</td>
                              <td />
                              <td className="py-1 px-1 text-right text-2xs text-fg-muted tabular-nums">{fmtCurrency(subRevenue)}</td>
                              <td />
                            </tr>
                          )
                        }
                        for (const item of items) {
                          out.push(
                            <LineItemRow
                              key={item.id}
                              item={item}
                              categories={allCategories}
                              onChange={(updated) => updateLineItem(item.id, updated)}
                              onDelete={() => deleteLineItem(item.id)}
                              onDuplicate={() => duplicateLineItem(item.id)}
                              onToggle={() => toggleLineItem(item.id)}
                              onMoveUp={() => moveLineItem(item.id, -1)}
                              onMoveDown={() => moveLineItem(item.id, 1)}
                            />
                          )
                        }
                      }
                      return out
                    })(),
                    // Category action buttons
                    <tr key={`cat-actions-${category}`}>
                      <td colSpan={11} className="py-1.5 px-2">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => {
                              setPickerCategory(category)
                              setShowPicker(true)
                            }}
                            className="flex items-center gap-1 text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add Item
                          </button>
                          <button
                            onClick={() => addBlankRow(category)}
                            className="flex items-center gap-1 text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors"
                          >
                            <Plus className="w-3 h-3" /> Add Row
                          </button>
                        </div>
                      </td>
                    </tr>,
                  ]
                })}
                {/* Totals row */}
                {estimate.lineItems.length > 0 && (
                  <tr className="border-t-2 border-fg-heading bg-fg-card/30">
                    <td colSpan={7} className="py-3 px-2 text-xs font-medium text-fg-heading text-right uppercase tracking-wide">
                      Total
                    </td>
                    <td className="py-3 px-1 text-right text-sm font-semibold text-fg-heading tabular-nums">
                      {fmtCurrency(estimate.lineItems.reduce((s, i) => s + i.total, 0))}
                    </td>
                    <td />
                    <td className="py-3 px-1 text-right text-sm font-semibold text-fg-heading tabular-nums">
                      {fmtCurrency(estimate.lineItems.reduce((s, i) => s + readLineItemRevenue(i), 0))}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* Add new category */}
          <div className="mt-4">
            {addingCategory ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCategoryName.trim()) {
                      addBlankRow(newCategoryName.trim())
                      setNewCategoryName('')
                      setAddingCategory(false)
                    }
                    if (e.key === 'Escape') setAddingCategory(false)
                  }}
                  placeholder="Category name…"
                  className="px-3 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors"
                />
                <button
                  onClick={() => {
                    if (newCategoryName.trim()) {
                      addBlankRow(newCategoryName.trim())
                      setNewCategoryName('')
                    }
                    setAddingCategory(false)
                  }}
                  className="px-3 py-1.5 bg-fg-dark text-white/80 text-xs font-light uppercase tracking-architectural hover:bg-fg-darker transition-colors"
                >
                  Add
                </button>
                <button onClick={() => setAddingCategory(false)} className="text-xs font-light text-fg-muted hover:text-fg-heading transition-colors uppercase tracking-wide">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCategory(true)}
                className="flex items-center gap-1.5 text-xs font-light text-fg-muted hover:text-fg-heading transition-colors uppercase tracking-wide"
              >
                <Plus className="w-3 h-3" /> New Category
              </button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-96 shrink-0">
          <MarginSidebar estimate={estimate} />
          <MarkupRoundingPanel estimate={estimate} onChange={updateEstimate} />
        </div>
      </div>

      {showPicker && (
        <ItemPickerModal
          onAdd={addFromLibrary}
          onClose={() => { setShowPicker(false); setPickerCategory(null) }}
          defaultCategory={pickerCategory}
        />
      )}

    </div>
  )
}

// ── Category Header Row ─────────────────────────────────────────────────────

function CategoryHeaderRow({
  category,
  total,
  revenue,
  hidden,
  isFirst,
  isLast,
  onRename,
  onMoveUp,
  onMoveDown,
  onAddRow,
  onDuplicate,
  onToggle,
}: {
  category: string
  total: number
  revenue: number
  hidden: boolean
  isFirst: boolean
  isLast: boolean
  onRename: (newName: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onAddRow: () => void
  onDuplicate: () => void
  onToggle: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category)

  return (
    <tr className={`bg-fg-card/30 border-b border-fg-border border-t border-t-fg-border group/cat ${hidden ? 'opacity-50' : ''}`}>
      <td colSpan={8} className="py-2 px-2">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => { onRename(name); setEditing(false) }}
            onKeyDown={e => {
              if (e.key === 'Enter') { onRename(name); setEditing(false) }
              if (e.key === 'Escape') { setName(category); setEditing(false) }
            }}
            className="bg-transparent text-xs font-light text-fg-heading border-b border-fg-heading outline-none tracking-wide uppercase"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-2xs font-medium tracking-wide uppercase text-[#5A5550] hover:text-fg-heading transition-colors"
          >
            {category}
          </button>
        )}
      </td>
      <td className="py-2 px-1 text-right text-2xs text-fg-muted tabular-nums">
        {fmtCurrency(total)}
      </td>
      <td className="py-2 px-1 text-right text-2xs text-fg-heading tabular-nums font-light">
        {fmtCurrency(revenue)}
      </td>
      <td className="py-2 px-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={onToggle}
            title={hidden ? 'Show category (include in totals)' : 'Hide category (keep for reference, exclude from totals)'}
            className={`p-0.5 transition-colors ${hidden ? 'text-amber-500/80 hover:text-amber-500' : 'text-fg-muted/50 hover:text-fg-heading'}`}
          >
            {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cat:opacity-100 transition-opacity">
            <button onClick={onMoveUp} disabled={isFirst} title="Move up" className="p-0.5 text-fg-muted hover:text-fg-heading disabled:opacity-20 transition-colors">
              <ChevronUp className="w-3 h-3" />
            </button>
            <button onClick={onMoveDown} disabled={isLast} title="Move down" className="p-0.5 text-fg-muted hover:text-fg-heading disabled:opacity-20 transition-colors">
              <ChevronDown className="w-3 h-3" />
            </button>
            <button onClick={onDuplicate} title="Copy category" className="p-0.5 text-fg-muted hover:text-fg-heading transition-colors">
              <Copy className="w-3 h-3" />
            </button>
            <button onClick={onAddRow} title="Add row" className="p-0.5 text-fg-muted hover:text-fg-heading transition-colors">
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}
