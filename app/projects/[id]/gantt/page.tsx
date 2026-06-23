'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects,
  loadEstimatesByProject,
  loadGanttEntries,
  saveGanttEntries,
  deleteGanttGeneratedRevenueByProject,
  loadWeeklyRevenue,
  saveWeeklyRevenue,
} from '@/lib/storage'
import { upsertGanttEntries, replaceGanttRevenueRemote, getProjects, upsertProject, upsertGanttMilestones, getAllGanttMilestones, getAllGanttEntries } from '@/lib/storageAsync'
import { saveProject } from '@/lib/storage'
import {
  formatCurrency,
  generateId,
  formatDayMonth,
  snapToFriday,
  toISODate,
  SHORT_MONTH_NAMES,
} from '@/lib/utils'
import { readLineItemRevenue, getEstimateContract, lineContractValue, addLineCost, emptyCostBreakdown, STD_LABOUR_RATE, type CostBreakdown } from '@/lib/estimateCalculations'
import { normalizedPcts, rebalancedPcts, datedPeriodCount } from '@/lib/ganttAllocation'
import { labourWorkingDays } from '@/lib/ganttSchedule'
import type { Project, Estimate, GanttEntry, GanttSegment, GanttSubtask, WeeklyRevenue } from '@/types'
import { Check, Plus, X, ChevronDown, ChevronRight, Diamond } from 'lucide-react'

// ── constants ─────────────────────────────────────────────────────────────────
const CELL_W_WEEKS = 48
const CELL_W_DAYS = 24
const WEEK_COUNT = 52
const LOOKBACK_WEEKS = 4      // weeks shown BEFORE today so you can scroll back from "today"
const ZOOM_LEVELS = [0.6, 0.75, 1, 1.3, 1.6] as const
const DAYS_VIEW_WEEKS = 26   // Days view renders this many weeks of working-day columns (was 12 — too short for multi-month jobs)
const COL_CATEGORY = 200
const COL_CREW = 64
const COL_BUDGET = 124
const COL_SCHED = 158   // Start date + duration (weeks) — foreman scheduling without drawing (compact)

// Cost-type palette for the per-task cost split + project totals strip.
const COST_TYPE_META = {
  labour: { label: 'Labour', colour: '#7C9A92' },
  material: { label: 'Material', colour: '#B08D57' },
  subcontractor: { label: 'Sub', colour: '#9A7C9A' },
  equipment: { label: 'Equip', colour: '#9E9890' },
} as const
const COST_TYPE_KEYS = ['labour', 'material', 'subcontractor', 'equipment'] as const

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F']
const MILESTONE_PRESETS = ['Practical Completion', 'Pool Dig', 'Steel Complete', 'Handover', 'Concrete Pour']
const MILESTONE_COLOURS = ['#8A8580', '#C8A870', '#7A9E87', '#A07080', '#6A8CA0']

// Labour productivity target per crew size (Andrew): the revenue a crew of N should generate per week,
// and the labour cost budget that supports it. Budget = N × $2,720/wk (40h × $68 standard rate). Crew-2
// and crew-3 are Andrew's figures; crew-4 is extrapolated (adjust if needed).
const CREW_LABOUR_TARGET: Record<number, { revenue: number; budget: number }> = {
  2: { revenue: 9500, budget: 5440 },
  3: { revenue: 14000, budget: 8160 },
  4: { revenue: 18500, budget: 10880 },
}

// Compact currency for the dense cash-flow strip — "$192k", "$8.9k", "$420". Full figures like
// $192,452 overflow the narrow forecast columns and become unreadable; this keeps the strip glanceable.
function fmtK(n: number): string {
  const neg = n < 0
  const a = Math.abs(n)
  const body = a < 1000 ? `$${Math.round(a)}`
    : a < 10000 ? `$${(a / 1000).toFixed(1)}k`
    : `$${Math.round(a / 1000)}k`
  return neg ? `-${body}` : body
}

// ── types ─────────────────────────────────────────────────────────────────────

type TimeView = 'weeks' | 'days'

interface Milestone {
  id: string
  projectId: string
  label: string
  date: string    // ISO date
  colour?: string
}

interface CategorySummary {
  category: string
  crewType: 'Formation' | 'Subcontractor'
  budgetedRevenue: number
  budgetedCost: number
  cost: CostBreakdown   // cost split by type (labour / material / subcontractor / equipment)
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getNextFridays(count: number, lookbackWeeks = 0): Date[] {
  const fridays: Date[] = []
  const d = new Date()
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  d.setDate(d.getDate() - lookbackWeeks * 7)   // start N weeks before the upcoming Friday so you can scroll back
  for (let i = 0; i < count; i++) {
    fridays.push(new Date(d))
    d.setDate(d.getDate() + 7)
  }
  return fridays
}

/** Get all working days (Mon–Fri) for N weeks starting from the first Mon at/before first Friday */
function getWorkingDays(fridays: Date[]): Date[] {
  if (fridays.length === 0) return []
  // Find the Monday of the week containing the first Friday
  const firstFri = new Date(fridays[0])
  const monday = new Date(firstFri)
  monday.setDate(monday.getDate() - 4) // Friday - 4 = Monday
  const days: Date[] = []
  const totalWeeks = Math.min(DAYS_VIEW_WEEKS, fridays.length)
  for (let w = 0; w < totalWeeks; w++) {
    for (let d = 0; d < 5; d++) {
      const day = new Date(monday)
      day.setDate(monday.getDate() + w * 7 + d)
      days.push(day)
    }
  }
  return days
}

function weeksBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  return Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1)
}

function evenSplit(total: number, count: number): number {
  return count > 0 ? total / count : 0
}

function segmentMargin(seg: GanttSegment): number {
  if (seg.revenueAllocation <= 0) return 0
  return (seg.revenueAllocation - seg.costAllocation) / seg.revenueAllocation
}

function barColour(seg: GanttSegment, crewType: 'Formation' | 'Subcontractor'): string {
  const m = segmentMargin(seg)
  if (m < 0.3) return crewType === 'Formation' ? '#C8A870' : '#D4B880'
  if (m < 0.4) return crewType === 'Formation' ? '#9E9890' : '#C8BAA8'
  return crewType === 'Formation' ? '#8A8580' : '#B5A898'
}

function subtaskBarColour(crewType: 'Formation' | 'Subcontractor'): string {
  return crewType === 'Formation' ? '#ABA89880' : '#CFC2B080'
}

function daysBetweenIso(aIso: string, bIso: string): number {
  if (!aIso || !bIso) return 0
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 86400000)
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

// Place a position:fixed popover so it never opens off-screen. Coordinates are viewport-relative
// (fixed positioning ignores scroll — the old code added scrollX/scrollY, which pushed the popover
// off the bottom whenever the page was scrolled). Clamp horizontally to stay fully on screen, and flip
// above the anchor if it would spill past the bottom.
function popoverPosition(rect: DOMRect | undefined, width: number, estHeight = 360): { top: number; left: number } {
  if (!rect || typeof window === 'undefined') return { top: 100, left: 100 }
  const margin = 8
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
  let top = rect.bottom + 4
  if (top + estHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - estHeight - 4)
  }
  return { top, left }
}

// Per-period labour share from bar length (working days × crew × 8h), normalised to 100% across the
// dated periods. Seeds labourPct so a schedule's existing labour distribution carries over unchanged
// before the foreman starts entering the % directly.
function barLabourShares(segments: GanttSegment[], crew: number): number[] {
  const hours = segments.map(s => (s.startDate && s.endDate) ? labourWorkingDays(s.startDate, s.endDate, s.grain) * crew * 8 : 0)
  const total = hours.reduce((a, b) => a + b, 0)
  return total > 0 ? hours.map(h => (h / total) * 100) : segments.map(() => 0)
}

// Labour hours fall out of a bar's length: labourWorkingDays × crew × 8. labourWorkingDays lives in
// lib/ganttSchedule (a Weeks-view bar means 5 working days per week, not the Fri→Fri calendar count).

function extractCategories(estimate: Estimate): CategorySummary[] {
  // Each posting's budgeted revenue = its lines' contract value (line revenue + project markup on each
  // line's own cost), so the Gantt's budgeted revenue sums to the ex-GST contract, matching the baseline.
  const contract = getEstimateContract(estimate)
  const map: Record<string, CategorySummary> = {}
  for (const item of estimate.lineItems.filter(i => i.enabled !== false)) {
    // Each (category, sub-category) is its own Gantt posting so a sub-category's cost + labour can be
    // scheduled independently. No sub-category → the category itself (unchanged for existing estimates).
    const sub = (item.subcategory || '').trim()
    const key = `${item.category}||${sub}`
    const label = sub ? `${item.category} — ${sub}` : item.category
    if (!map[key]) {
      map[key] = { category: label, crewType: item.crewType, budgetedRevenue: 0, budgetedCost: 0, cost: emptyCostBreakdown() }
    }
    map[key].budgetedRevenue += lineContractValue(item, contract)
    map[key].budgetedCost += item.total
    addLineCost(map[key].cost, item)
  }
  return Object.values(map)
}

function loadMilestones(projectId: string): Milestone[] {
  try {
    const raw = localStorage.getItem(`fg_gantt_milestones_${projectId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// ── Segment edit popover ──────────────────────────────────────────────────────

interface SegEditProps {
  seg: GanttSegment
  siblingSegs: GanttSegment[]   // all periods of this scope (post-balance) for the live breakdown
  labourBudget: number
  materialsBudget: number
  subBudget: number
  equipmentBudget: number
  crew: number
  onUpdate: (seg: GanttSegment) => void
  onDelete: () => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}

function SegmentPopover({ seg, siblingSegs, labourBudget, materialsBudget, subBudget, equipmentBudget, onUpdate, onDelete, onClose, anchorRef }: SegEditProps) {
  // The foreman types this period's material/equipment % (0–100) and it updates LIVE: the other dated
  // periods auto-balance to fill the remainder so each resource always sums to 100%, and the totals/costs
  // recompute as you type — no Apply step. The breakdown below shows every period's share moving.
  const clampPct = (v: number) => Math.max(0, Math.min(100, v))

  const [label, setLabel] = useState(seg.label ?? '')
  const [labPct, setLabPct] = useState(seg.labourPct != null ? String(Math.round(seg.labourPct)) : '')
  const [matPct, setMatPct] = useState(seg.materialsPct != null ? String(Math.round(seg.materialsPct)) : '')
  const [subPct, setSubPct] = useState(seg.subPct != null ? String(Math.round(seg.subPct)) : '')
  const [eqPct, setEqPct] = useState(seg.equipmentPct != null ? String(Math.round(seg.equipmentPct)) : '')

  // Push the current state up immediately so the parent auto-balances + recomputes. The just-changed
  // field is passed as an override (its useState hasn't committed yet on this keystroke).
  const pushUpdate = (next: { label?: string; labPct?: string; matPct?: string; subPct?: string; eqPct?: string } = {}) => {
    onUpdate({
      ...seg,
      label: ((next.label ?? label) || undefined),
      labourPct: clampPct(parseFloat(next.labPct ?? labPct) || 0),
      materialsPct: clampPct(parseFloat(next.matPct ?? matPct) || 0),
      subPct: clampPct(parseFloat(next.subPct ?? subPct) || 0),
      equipmentPct: clampPct(parseFloat(next.eqPct ?? eqPct) || 0),
    })
  }

  // Only show the cost types this scope actually carries. Labour, material, subcontractor and equipment
  // are each a manual % of their own budget for this period.
  const hasLabour = labourBudget > 0
  const hasMaterials = materialsBudget > 0
  const hasSub = subBudget > 0
  const hasEquipment = equipmentBudget > 0
  const labCost = (parseFloat(labPct) || 0) / 100 * labourBudget
  const matCost = (parseFloat(matPct) || 0) / 100 * materialsBudget
  const subCost = (parseFloat(subPct) || 0) / 100 * subBudget
  const eqCost = (parseFloat(eqPct) || 0) / 100 * equipmentBudget
  const periodCost = labCost + matCost + subCost + eqCost

  // Live per-period breakdown — reads the post-balance sibling state, so as this period changes the
  // others visibly redistribute and the total stays on 100%.
  const datedSibs = siblingSegs.filter(s => s.startDate && s.endDate)
  // With a single scheduled period there's nowhere to push the balance, so the % is locked at 100% —
  // editing it would just snap back. The foreman splits the scope first to allocate across periods.
  const onlyPeriod = datedSibs.length <= 1
  const labTotal = Math.round(datedSibs.reduce((s, x) => s + (x.labourPct || 0), 0))
  const matTotal = Math.round(datedSibs.reduce((s, x) => s + (x.materialsPct || 0), 0))
  const subTotal = Math.round(datedSibs.reduce((s, x) => s + (x.subPct || 0), 0))
  const eqTotal = Math.round(datedSibs.reduce((s, x) => s + (x.equipmentPct || 0), 0))
  const totalClass = (t: number) => t === 100 ? 'text-green-600/70' : 'text-amber-600'
  const splitLine = (key: 'labourPct' | 'materialsPct' | 'subPct' | 'equipmentPct') =>
    datedSibs.map((s, i) => `${i + 1}: ${Math.round(s[key] || 0)}%`).join('  ')

  const { top, left } = popoverPosition(anchorRef.current?.getBoundingClientRect(), 288)

  return (
    <div
      className="fixed z-50 bg-fg-bg border border-fg-border shadow-xl p-4 w-72"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-light tracking-architectural uppercase text-fg-muted">Work period allocation</span>
        <button onClick={onClose}><X className="w-3 h-3 text-fg-muted" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-2xs font-light text-fg-muted block mb-1">Label (optional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} onBlur={() => pushUpdate()} placeholder="e.g. Slab prep"
            className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading" />
        </div>
        {(hasLabour || hasMaterials || hasSub || hasEquipment) && (
          <div className="grid grid-cols-2 gap-2">
            {hasLabour && (
              <div>
                <label className="text-2xs font-light text-fg-muted block mb-1">Labour %</label>
                <input type="number" min={0} max={100} value={onlyPeriod ? '100' : labPct} disabled={onlyPeriod}
                  onChange={e => { const v = e.target.value === '' ? '' : String(clampPct(parseFloat(e.target.value) || 0)); setLabPct(v); pushUpdate({ labPct: v }) }} placeholder="0"
                  className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading tabular-nums disabled:opacity-40 disabled:cursor-not-allowed" />
              </div>
            )}
            {hasMaterials && (
              <div>
                <label className="text-2xs font-light text-fg-muted block mb-1">Materials %</label>
                <input type="number" min={0} max={100} value={onlyPeriod ? '100' : matPct} disabled={onlyPeriod}
                  onChange={e => { const v = e.target.value === '' ? '' : String(clampPct(parseFloat(e.target.value) || 0)); setMatPct(v); pushUpdate({ matPct: v }) }} placeholder="0"
                  className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading tabular-nums disabled:opacity-40 disabled:cursor-not-allowed" />
              </div>
            )}
            {hasSub && (
              <div>
                <label className="text-2xs font-light text-fg-muted block mb-1">Sub %</label>
                <input type="number" min={0} max={100} value={onlyPeriod ? '100' : subPct} disabled={onlyPeriod}
                  onChange={e => { const v = e.target.value === '' ? '' : String(clampPct(parseFloat(e.target.value) || 0)); setSubPct(v); pushUpdate({ subPct: v }) }} placeholder="0"
                  className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading tabular-nums disabled:opacity-40 disabled:cursor-not-allowed" />
              </div>
            )}
            {hasEquipment && (
              <div>
                <label className="text-2xs font-light text-fg-muted block mb-1">Equipment %</label>
                <input type="number" min={0} max={100} value={onlyPeriod ? '100' : eqPct} disabled={onlyPeriod}
                  onChange={e => { const v = e.target.value === '' ? '' : String(clampPct(parseFloat(e.target.value) || 0)); setEqPct(v); pushUpdate({ eqPct: v }) }} placeholder="0"
                  className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading tabular-nums disabled:opacity-40 disabled:cursor-not-allowed" />
              </div>
            )}
          </div>
        )}
        {/* Single period holds the whole budget — nowhere to split a partial % to, so guide them to split */}
        {onlyPeriod && (hasLabour || hasMaterials || hasSub || hasEquipment) && (
          <p className="text-[9px] font-light text-amber-600/80 leading-snug">
            Only one period, so it holds 100% of the budget. To put e.g. 80% here and the rest later, add a
            second period with the ＋ in the Start / Duration column, then set the split.
          </p>
        )}
        {/* Live breakdown across all periods — auto-balances to 100% as you type */}
        {datedSibs.length > 1 && (hasLabour || hasMaterials || hasSub || hasEquipment) && (
          <div className="text-[9px] font-light text-fg-muted space-y-0.5 border-t border-fg-border/40 pt-2">
            {hasLabour && <div className="flex justify-between gap-2"><span className="tabular-nums">Lab {splitLine('labourPct')}</span><span className={`tabular-nums ${totalClass(labTotal)}`}>={labTotal}%</span></div>}
            {hasMaterials && <div className="flex justify-between gap-2"><span className="tabular-nums">Mat {splitLine('materialsPct')}</span><span className={`tabular-nums ${totalClass(matTotal)}`}>={matTotal}%</span></div>}
            {hasSub && <div className="flex justify-between gap-2"><span className="tabular-nums">Sub {splitLine('subPct')}</span><span className={`tabular-nums ${totalClass(subTotal)}`}>={subTotal}%</span></div>}
            {hasEquipment && <div className="flex justify-between gap-2"><span className="tabular-nums">Eq {splitLine('equipmentPct')}</span><span className={`tabular-nums ${totalClass(eqTotal)}`}>={eqTotal}%</span></div>}
          </div>
        )}
        {/* Period cost from the %s — only the cost types this scope carries */}
        <div className="text-[10px] text-fg-muted space-y-0.5 border-t border-fg-border/50 pt-2">
          {hasLabour && <div className="flex justify-between"><span>Labour</span><span className="tabular-nums text-fg-heading">{Math.round(labCost / STD_LABOUR_RATE)}h · {formatCurrency(labCost)}</span></div>}
          {hasMaterials && <div className="flex justify-between"><span>Materials</span><span className="tabular-nums">{formatCurrency(matCost)}</span></div>}
          {hasSub && <div className="flex justify-between"><span>Subcontractor</span><span className="tabular-nums">{formatCurrency(subCost)}</span></div>}
          {hasEquipment && <div className="flex justify-between"><span>Equipment</span><span className="tabular-nums">{formatCurrency(eqCost)}</span></div>}
          <div className="flex justify-between font-medium text-fg-heading pt-0.5"><span>Period cost</span><span className="tabular-nums">{formatCurrency(periodCost)}</span></div>
        </div>
        <div className="flex justify-between items-center pt-1">
          <button onClick={onDelete} className="text-[10px] text-red-400/60 hover:text-red-400 uppercase tracking-wide">Remove</button>
          <button onClick={() => { pushUpdate(); onClose() }} className="px-3 py-1.5 bg-fg-dark text-white/80 text-[10px] tracking-wide uppercase">Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Milestone popover ─────────────────────────────────────────────────────────

interface MilestonePopoverProps {
  milestone: Milestone
  onUpdate: (m: Milestone) => void
  onDelete: () => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}

function MilestonePopover({ milestone, onUpdate, onDelete, onClose, anchorRef }: MilestonePopoverProps) {
  const [label, setLabel] = useState(milestone.label)
  const [date, setDate] = useState(milestone.date)
  const [colour, setColour] = useState(milestone.colour ?? MILESTONE_COLOURS[0])

  const apply = () => {
    onUpdate({ ...milestone, label, date, colour })
    onClose()
  }

  const { top, left } = popoverPosition(anchorRef.current?.getBoundingClientRect(), 256, 300)

  return (
    <div
      className="fixed z-50 bg-fg-bg border border-fg-border shadow-xl p-4 w-64"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-light tracking-architectural uppercase text-fg-muted">Milestone</span>
        <button onClick={onClose}><X className="w-3 h-3 text-fg-muted" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-2xs font-light text-fg-muted block mb-1">Label</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading" />
        </div>
        <div>
          <label className="text-2xs font-light text-fg-muted block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading" />
        </div>
        <div>
          <label className="text-2xs font-light text-fg-muted block mb-1">Colour</label>
          <div className="flex gap-2 flex-wrap">
            {MILESTONE_COLOURS.map(c => (
              <button key={c} onClick={() => setColour(c)}
                className="w-5 h-5 rounded-full border-2 transition-all"
                style={{ background: c, borderColor: colour === c ? '#fff' : 'transparent' }} />
            ))}
          </div>
        </div>
        <div className="flex justify-between items-center pt-1">
          <button onClick={onDelete} className="text-[10px] text-red-400/60 hover:text-red-400 uppercase tracking-wide">Remove</button>
          <button onClick={apply} className="px-3 py-1.5 bg-fg-dark text-white/80 text-[10px] tracking-wide uppercase">Apply</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GanttPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [entries, setEntries] = useState<GanttEntry[]>([])
  const [successMsg, setSuccessMsg] = useState('')
  const [timeView, setTimeView] = useState<TimeView>('weeks')

  // Persistence safety: every bar/segment/subtask/schedule edit only calls setEntries — the only
  // persist path is the manual "Save Gantt" button. Track a dirty flag + the latest entries so we can
  // flush to localStorage + Supabase on navigate/unmount (otherwise unsaved edits are lost).
  const hasUnsavedChangesRef = useRef(false)
  const latestEntriesRef = useRef<GanttEntry[]>([])
  latestEntriesRef.current = entries

  // Drawing state
  const [drawing, setDrawing] = useState<{
    category: string
    subtaskId?: string
    segId: string
    anchorIdx: number
  } | null>(null)

  // Moving state
  const [moving, setMoving] = useState<{
    entryId: string
    subtaskId?: string
    segId: string
    anchorColIdx: number
    originalStart: string
    originalEnd: string
  } | null>(null)

  // Resizing state — dragging a bar's left (start) or right (end) edge to extend/shorten it.
  const [resizing, setResizing] = useState<{
    entryId: string
    subtaskId?: string
    segId: string
    edge: 'start' | 'end'
  } | null>(null)

  // Popover state
  const [popover, setPopover] = useState<{ category: string; subtaskId?: string; segId: string } | null>(null)
  const popoverAnchorRef = useRef<HTMLDivElement | null>(null)

  // Milestone state
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [milestonePopover, setMilestonePopover] = useState<string | null>(null) // milestone id
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('')
  const [newMilestoneDate, setNewMilestoneDate] = useState(() => new Date().toISOString().split('T')[0])
  const milestoneAnchorRef = useRef<HTMLDivElement | null>(null)

  // Collapsed subtask rows
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  // Zoom (column width multiplier) + the scroll container, so we can land the initial view on "today".
  const [zoom, setZoom] = useState(1)
  const gridScrollRef = useRef<HTMLDivElement | null>(null)
  const scrolledToToday = useRef(false)

  const fridays = getNextFridays(WEEK_COUNT, LOOKBACK_WEEKS)
  const workingDays = getWorkingDays(fridays)
  const currentWeekIso = toISODate(fridays[LOOKBACK_WEEKS])   // the current week sits LOOKBACK_WEEKS columns in
  const today = toISODate(new Date())

  const CELL_W = Math.round((timeView === 'days' ? CELL_W_DAYS : CELL_W_WEEKS) * zoom)

  // Column set for current view
  const columns: Date[] = timeView === 'days' ? workingDays : fridays
  const colCount = columns.length

  // Land the initial horizontal scroll on "today" (a few weeks of history sit to its left). Once only,
  // so zooming/re-rendering doesn't fight the user's scroll position.
  useEffect(() => {
    if (scrolledToToday.current || !gridScrollRef.current || colCount === 0) return
    const lookbackCols = timeView === 'days' ? LOOKBACK_WEEKS * 5 : LOOKBACK_WEEKS
    gridScrollRef.current.scrollLeft = Math.max(0, lookbackCols * CELL_W - 80)
    scrolledToToday.current = true
  }, [colCount, timeView, CELL_W])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let p = loadProjects().find(p => p.id === id)
      if (!p) {
        // Local copy may have been cleared — fall back to Supabase and restore it locally
        p = (await getProjects()).find(p => p.id === id)
        if (p) saveProject(p)
      }
      if (cancelled) return
      if (!p) { router.push('/projects'); return }
      setProject(p)
      const ests = loadEstimatesByProject(id)
      setEstimate(ests.find(e => e.status === 'accepted') ?? ests[0] ?? null)
      const localEntries = loadGanttEntries(id)
      setEntries(localEntries)
      const localMilestones = loadMilestones(id)
      setMilestones(localMilestones)
      // Cross-device: if this device never loaded this project the local gantt is empty — pull the
      // remote bars and adopt them, so the user's first Save here doesn't wipe another device's
      // schedule (the empty-clobber landmine). If local already has bars, keep them (this device may
      // hold unsaved edits) and let Save reconcile.
      if (localEntries.length === 0) {
        try {
          const allRemote = await getAllGanttEntries()
          if (cancelled) return
          const mine = allRemote.filter(e => e.projectId === id)
          if (mine.length > 0) {
            saveGanttEntries(id, mine)   // cache locally so subsequent loads/Saves see them
            setEntries(mine)
          }
        } catch { /* keep local (empty) copy on any sync error */ }
      }
      // Cross-device milestones: only adopt the remote copy when LOCAL is empty. If local already has
      // milestones, keep them — a milestone added on this device must not be wiped before it syncs.
      if (localMilestones.length === 0) {
        try {
          const remote = await getAllGanttMilestones()
          if (cancelled) return
          const mine = remote.find(r => r.projectId === id)
          if (mine && mine.milestones.length > 0) {
            localStorage.setItem(`fg_gantt_milestones_${id}`, JSON.stringify(mine.milestones))
            setMilestones(mine.milestones as Milestone[])
          }
        } catch { /* keep local copy on any sync error */ }
      }
    })()
    return () => { cancelled = true }
  }, [id, router])

  const categories: CategorySummary[] = estimate ? extractCategories(estimate) : []

  const getEntry = (category: string): GanttEntry => {
    const existing = entries.find(e => e.category === category)
    if (existing) return existing
    const cat = categories.find(c => c.category === category)!
    return {
      id: generateId(),
      projectId: id,
      estimateId: estimate?.id ?? '',
      category,
      crewType: cat.crewType,
      budgetedRevenue: cat.budgetedRevenue,
      budgetedCost: cat.budgetedCost,
      segments: [],
      subtasks: [],
    }
  }

  // Project-wide crew size (2/3/4): a crew of N works N × 8 labour hours/day, so a bar of D working
  // days consumes D × crew × 8 hours. Persisted on the project (syncs cross-device).
  const crewSize = project?.crewSize ?? 3

  // Re-derive each segment's allocation from its per-period inputs: labour, materials and equipment are
  // each a manual % of their own budget (auto-balanced to 100% across periods). Revenue follows progress
  // (cost-weighted), so the periods' revenue sums to the category revenue. costAllocation/
  // revenueAllocation — what the footer + forecast read — stay in step with the inputs.
  const recalcEntry = (entry: GanttEntry, crew: number = crewSize): GanttEntry => {
    const n = entry.segments.length
    if (n === 0) return entry
    const cat = categories.find(c => c.category === entry.category)
    const labourBudget = cat?.cost.labour ?? 0
    const materialBudget = cat?.cost.material ?? 0
    const subBudget = cat?.cost.subcontractor ?? 0
    const equipmentBudget = cat?.cost.equipment ?? 0
    // Refresh the scope's budget from the CURRENT estimate so a re-priced estimate flows through. The
    // saved snapshot otherwise goes stale (the 209 forecast-vs-estimate drift).
    const catRevenue = cat?.budgetedRevenue ?? entry.budgetedRevenue
    const catCost = cat?.cost.total ?? entry.budgetedCost
    // Each cost type's per-period % is ALWAYS normalised so the dated periods sum to exactly 100% — the
    // full budget is allocated, never 95% (cost silently lost) nor 110% (cost invented). Undated
    // placeholder periods get 0. Editing a period auto-balances the rest (see handleSegmentUpdate).
    const matPcts = normalizedPcts(entry.segments, 'materialsPct')
    const eqPcts = normalizedPcts(entry.segments, 'equipmentPct')
    // Subcontractor is its own % of the sub budget. Legacy segments (no subPct) are seeded from the
    // material % so the old material+sub combined split is preserved, then become independently editable.
    const subSeed = subBudget > 0 && entry.segments.every(s => s.subPct == null)
    const subPcts = subSeed ? matPcts.slice() : normalizedPcts(entry.segments, 'subPct')
    // Labour is a manual % of the labour budget (auto-balanced to 100% across periods, same as materials)
    // — more flexible than bar×crew×hours and it always allocates the full budget. Legacy segments with
    // no labourPct are seeded from their bar-length share so an existing schedule's labour split is
    // unchanged on first load, then becomes editable.
    const labourSeed = labourBudget > 0 && entry.segments.every(s => s.labourPct == null)
    const labPcts = labourSeed ? barLabourShares(entry.segments, crew) : normalizedPcts(entry.segments, 'labourPct')
    const derived = entry.segments.map((s, i) => {
      const hasDates = !!(s.startDate && s.endDate)
      // An undrawn period (no dates) carries no cost yet, so it can't over-allocate or dilute the split.
      const labPct = hasDates ? labPcts[i] : 0
      const labourCost = (labPct / 100) * labourBudget
      const matPct = matPcts[i]
      const subPct = subPcts[i]
      const eqPct = eqPcts[i]
      const cost = hasDates ? labourCost + (matPct / 100) * materialBudget + (subPct / 100) * subBudget + (eqPct / 100) * equipmentBudget : 0
      return { hasDates, labPct, labourHours: Math.round(labourCost / STD_LABOUR_RATE), matPct, subPct, eqPct, cost }
    })
    const totalCost = derived.reduce((sum, d) => sum + d.cost, 0)
    const datedCount = derived.filter(d => d.hasDates).length
    return {
      ...entry,
      budgetedRevenue: catRevenue,
      budgetedCost: catCost,
      segments: entry.segments.map((s, i) => ({
        ...s,
        materialsPct: derived[i].matPct,
        subPct: derived[i].subPct,
        equipmentPct: derived[i].eqPct,
        labourPct: derived[i].labPct,
        labourHours: derived[i].labourHours,
        costAllocation: derived[i].cost,
        // Revenue follows progress (cost-weighted). If a scope has revenue but no cost yet (zero-cost
        // allowance, or all periods undrawn), spread it evenly across the dated periods rather than
        // dropping the contract revenue to $0.
        revenueAllocation: totalCost > 0
          ? catRevenue * (derived[i].cost / totalCost)
          : (derived[i].hasDates && datedCount > 0 ? catRevenue / datedCount : 0),
      })),
    }
  }

  const setCrew = (n: number) => {
    // Re-read the freshest project (a crew/other change may have synced in from another device) so we
    // only override crewSize, not stale fields. Then upsert; safeUpsert's newer-guard still protects it.
    const fresh = loadProjects().find(p => p.id === id) ?? project
    if (!fresh) return
    const updatedProject = { ...fresh, crewSize: n }
    setProject(updatedProject)
    void upsertProject(updatedProject)
    // Labour hours depend on crew → re-derive every category's segments with the new crew.
    hasUnsavedChangesRef.current = true
    setEntries(prev => prev.map(e => recalcEntry(e, n)))
  }

  const updateEntry = (updated: GanttEntry) => {
    hasUnsavedChangesRef.current = true   // a user edit — mark dirty so flush persists it on leave
    const recalculated = recalcEntry(updated)
    setEntries(prev => {
      const idx = prev.findIndex(e => e.category === recalculated.category)
      if (idx >= 0) { const next = [...prev]; next[idx] = recalculated; return next }
      return [...prev, recalculated]
    })
  }

  // One-time on load: re-derive every loaded scope's allocation so the display + reconciliation are
  // right immediately (labour from bars, materials/equipment capped to ≤100% total). Cleans up any
  // saved over-allocation before the popover reads it. Idempotent for already-granular gantts; not
  // persisted until the user saves.
  const didInitialRecalc = useRef(false)
  useEffect(() => {
    if (didInitialRecalc.current || !estimate || entries.length === 0) return
    didInitialRecalc.current = true
    setEntries(prev => prev.map(e => recalcEntry(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimate, entries.length])

  const rebalanceEntry = (entry: GanttEntry): GanttEntry => {
    const n = entry.segments.length
    if (n === 0) return entry
    return {
      ...entry,
      segments: entry.segments.map(s => ({
        ...s,
        revenueAllocation: evenSplit(entry.budgetedRevenue, n),
        costAllocation: evenSplit(entry.budgetedCost, n),
      })),
    }
  }

  // ── Column index helpers ────────────────────────────────────────────────────

  /** Find column index for a given ISO date */
  const colIndexForDate = useCallback((iso: string): number => {
    return columns.findIndex(c => toISODate(c) === iso)
  }, [columns])

  /** Date from column index */
  const dateForColIdx = useCallback((idx: number): string => {
    if (idx < 0) return toISODate(columns[0])
    if (idx >= colCount) return toISODate(columns[colCount - 1])
    return toISODate(columns[idx])
  }, [columns, colCount])

  // ── Check if a date falls in a column's range ────────────────────────────

  /** For weeks view: iso matches Friday. For days view: iso matches that exact day */
  const isDateInColumn = useCallback((date: string, colDate: Date): boolean => {
    const colIso = toISODate(colDate)
    if (timeView === 'weeks') {
      // A segment spans from startDate to endDate (both Fridays)
      return date === colIso
    }
    return date === colIso
  }, [timeView])

  /** Check if a segment is "active" in a given column */
  const isSegmentActiveInCol = useCallback((seg: GanttSegment, colDate: Date): boolean => {
    if (!seg.startDate || !seg.endDate) return false
    const colIso = toISODate(colDate)
    return colIso >= seg.startDate && colIso <= seg.endDate
  }, [])

  // ── Cell interaction (drawing new segments) ────────────────────────────────

  const handleCellMouseDown = (category: string, colIdx: number, subtaskId?: string) => {
    const entry = getEntry(category)
    const iso = dateForColIdx(colIdx)

    const segsNow = subtaskId
      ? (entry.subtasks?.find(s => s.id === subtaskId)?.segments ?? [])
      : entry.segments

    // Clicking inside an existing (dated) bar starts a move, not a new draw — handled by the bar itself.
    if (segsNow.some(s => s.startDate && iso >= s.startDate && iso <= s.endDate)) return

    // Drawing on blank space sets this task's single bar (collapsing any stray bars) so the
    // Start/Duration fields always mirror what's on the grid. If a Split has added an empty
    // work-period slot, fill that instead (keeping the other periods) — that's how you draw a
    // genuine multi-period task: draw, click Split, draw again. Adjust existing bars by dragging them.
    const pendingIdx = segsNow.findIndex(s => !s.startDate)
    const drawId = pendingIdx >= 0 ? segsNow[pendingIdx].id : generateId()
    const nextSegs = (rev: number, cost: number): GanttSegment[] =>
      pendingIdx >= 0
        ? segsNow.map((s, i) => i === pendingIdx ? { ...s, startDate: iso, endDate: iso, weekCount: 1, grain: timeView } : s)
        : [{ id: drawId, startDate: iso, endDate: iso, weekCount: 1, grain: timeView, revenueAllocation: rev, costAllocation: cost }]

    if (subtaskId) {
      const subtasks = (entry.subtasks ?? []).map(st => st.id === subtaskId ? { ...st, segments: nextSegs(0, 0) } : st)
      updateEntry({ ...entry, subtasks })
    } else {
      updateEntry({ ...entry, segments: nextSegs(entry.budgetedRevenue, entry.budgetedCost) })
    }

    setDrawing({ category, subtaskId, segId: drawId, anchorIdx: colIdx })
  }

  const handleCellMouseEnter = (category: string, colIdx: number, subtaskId?: string) => {
    // Handle drawing
    if (drawing && drawing.category === category && drawing.subtaskId === subtaskId) {
      const entry = entries.find(e => e.category === category)
      if (!entry) return

      const anchorIso = dateForColIdx(drawing.anchorIdx)
      const currentIso = dateForColIdx(colIdx)
      const startIso = anchorIso <= currentIso ? anchorIso : currentIso
      const endIso = anchorIso <= currentIso ? currentIso : anchorIso
      const wc = timeView === 'weeks'
        ? weeksBetween(startIso, endIso)
        : Math.max(1, Math.ceil((daysBetweenIso(startIso, endIso) + 1) / 7)) // forecast still spreads weekly in days view

      if (subtaskId) {
        const updatedSubtasks = (entry.subtasks ?? []).map(st => {
          if (st.id !== subtaskId) return st
          return {
            ...st,
            segments: st.segments.map(s =>
              s.id === drawing.segId ? { ...s, startDate: startIso, endDate: endIso, weekCount: wc, grain: timeView } : s
            ),
          }
        })
        updateEntry({ ...entry, subtasks: updatedSubtasks })
      } else {
        const updatedSegs = entry.segments.map(s =>
          s.id === drawing.segId ? { ...s, startDate: startIso, endDate: endIso, weekCount: wc, grain: timeView } : s
        )
        updateEntry({ ...entry, segments: updatedSegs })
      }
    }

    // Handle moving
    if (moving) {
      const entry = entries.find(e => e.id === moving.entryId)
      if (!entry) return

      const offset = colIdx - moving.anchorColIdx

      // Calculate new dates by shifting. Clamp the OFFSET (not each end on its own) so the bar keeps its
      // length when dragged against either edge of the window — clamping ends independently let one end
      // hit the boundary while the other kept moving, squashing the bar. Off-window bars (start/end past
      // the rendered range, idx -1) fall back to the per-end clamp.
      const origStartIdx = colIndexForDate(moving.originalStart)
      const origEndIdx = colIndexForDate(moving.originalEnd)
      let newStart: string, newEnd: string
      if (origStartIdx >= 0 && origEndIdx >= 0) {
        const clampedOffset = Math.max(-origStartIdx, Math.min(colCount - 1 - origEndIdx, offset))
        newStart = dateForColIdx(origStartIdx + clampedOffset)
        newEnd = dateForColIdx(origEndIdx + clampedOffset)
      } else {
        newStart = dateForColIdx(Math.max(0, Math.min(colCount - 1, origStartIdx + offset)))
        newEnd = dateForColIdx(Math.max(0, Math.min(colCount - 1, origEndIdx + offset)))
      }
      // A move preserves the bar's length, so keep its weekCount (forecast spread) unchanged.

      if (moving.subtaskId) {
        const updatedSubtasks = (entry.subtasks ?? []).map(st => {
          if (st.id !== moving.subtaskId) return st
          return {
            ...st,
            segments: st.segments.map(s =>
              s.id === moving.segId ? { ...s, startDate: newStart, endDate: newEnd } : s
            ),
          }
        })
        updateEntry({ ...entry, subtasks: updatedSubtasks })
      } else {
        const updatedSegs = entry.segments.map(s =>
          s.id === moving.segId ? { ...s, startDate: newStart, endDate: newEnd } : s
        )
        updateEntry({ ...entry, segments: updatedSegs })
      }
    }

    // Handle resizing — drag one edge; the other stays put, the bar can't invert.
    if (resizing) {
      const entry = entries.find(e => e.id === resizing.entryId)
      if (!entry) return
      const enteredIso = dateForColIdx(colIdx)
      const segList = resizing.subtaskId
        ? (entry.subtasks?.find(st => st.id === resizing.subtaskId)?.segments ?? [])
        : entry.segments
      const seg = segList.find(s => s.id === resizing.segId)
      if (!seg) return
      const newStart = resizing.edge === 'start' ? (enteredIso <= seg.endDate ? enteredIso : seg.endDate) : seg.startDate
      const newEnd = resizing.edge === 'end' ? (enteredIso >= seg.startDate ? enteredIso : seg.startDate) : seg.endDate
      const wc = timeView === 'weeks'
        ? weeksBetween(newStart, newEnd)
        : Math.max(1, Math.ceil((daysBetweenIso(newStart, newEnd) + 1) / 7))
      const apply = (s: GanttSegment) => s.id === resizing.segId ? { ...s, startDate: newStart, endDate: newEnd, weekCount: wc, grain: timeView } : s
      if (resizing.subtaskId) {
        const updatedSubtasks = (entry.subtasks ?? []).map(st => st.id === resizing.subtaskId ? { ...st, segments: st.segments.map(apply) } : st)
        updateEntry({ ...entry, subtasks: updatedSubtasks })
      } else {
        updateEntry({ ...entry, segments: entry.segments.map(apply) })
      }
    }
  }

  const handleMouseUp = () => {
    setDrawing(null)
    setMoving(null)
    setResizing(null)
  }

  // ── Bar click / drag ──────────────────────────────────────────────────────

  const handleBarMouseDown = (
    e: React.MouseEvent,
    entry: GanttEntry,
    seg: GanttSegment,
    colIdx: number,
    subtaskId?: string,
  ) => {
    e.stopPropagation()
    // If it was a very short drag (just a click), treat as popover open
    // We start move; on mouseup if no movement, open popover
    setMoving({
      entryId: entry.id,
      subtaskId,
      segId: seg.id,
      anchorColIdx: colIdx,
      originalStart: seg.startDate,
      originalEnd: seg.endDate,
    })
  }

  // Drag a bar's start/end edge to extend or shorten it (Instagantt-style). Stops propagation so it
  // doesn't also start a whole-bar move.
  const handleResizeMouseDown = (
    e: React.MouseEvent,
    entry: GanttEntry,
    seg: GanttSegment,
    edge: 'start' | 'end',
    subtaskId?: string,
  ) => {
    e.stopPropagation()
    setResizing({ entryId: entry.id, subtaskId, segId: seg.id, edge })
  }

  const handleBarClick = (
    e: React.MouseEvent,
    category: string,
    segId: string,
    anchorEl: HTMLDivElement | null,
    subtaskId?: string,
  ) => {
    e.stopPropagation()
    popoverAnchorRef.current = anchorEl
    setPopover({ category, subtaskId, segId })
  }

  const handleSegmentUpdate = (category: string, updated: GanttSegment, subtaskId?: string) => {
    const entry = entries.find(e => e.category === category)
    if (!entry) return
    if (subtaskId) {
      const updatedSubtasks = (entry.subtasks ?? []).map(st =>
        st.id !== subtaskId ? st : { ...st, segments: st.segments.map(s => s.id === updated.id ? updated : s) }
      )
      updateEntry({ ...entry, subtasks: updatedSubtasks })
    } else {
      // Replace the edited period, then AUTO-BALANCE: pin this period's material/equipment % to what the
      // foreman set and scale the other dated periods to fill the rest, so each resource always sums to
      // exactly 100% (the "put 75% here, the balance later" model). recalcEntry then derives cost/revenue.
      const replaced = entry.segments.map(s => s.id === updated.id ? updated : s)
      const labPcts = rebalancedPcts(replaced, updated.id, 'labourPct', updated.labourPct ?? 0)
      const matPcts = rebalancedPcts(replaced, updated.id, 'materialsPct', updated.materialsPct ?? 0)
      const subPcts = rebalancedPcts(replaced, updated.id, 'subPct', updated.subPct ?? 0)
      const eqPcts = rebalancedPcts(replaced, updated.id, 'equipmentPct', updated.equipmentPct ?? 0)
      const balanced = replaced.map((s, i) => ({ ...s, labourPct: labPcts[i], materialsPct: matPcts[i], subPct: subPcts[i], equipmentPct: eqPcts[i] }))
      updateEntry({ ...entry, segments: balanced })
    }
  }

  const handleSegmentDelete = (category: string, segId: string, subtaskId?: string) => {
    const entry = entries.find(e => e.category === category)
    if (!entry) return
    if (subtaskId) {
      const updatedSubtasks = (entry.subtasks ?? []).map(st =>
        st.id !== subtaskId ? st : { ...st, segments: st.segments.filter(s => s.id !== segId) }
      )
      updateEntry({ ...entry, subtasks: updatedSubtasks })
    } else {
      const pruned = entry.segments.filter(s => s.id !== segId)
      updateEntry(rebalanceEntry({ ...entry, segments: pruned }))
    }
    setPopover(null)
  }

  const handleAddSplit = (category: string) => {
    const entry = getEntry(category)
    // A new period starts unallocated (0% materials/equipment, no dates) — you draw it and move the
    // allocation across. Existing periods keep their allocation, so the totals never jump past 100%.
    // recalcEntry (via updateEntry) re-derives cost/revenue from the per-period inputs.
    const newSeg: GanttSegment = {
      id: generateId(), startDate: '', endDate: '', weekCount: 0,
      revenueAllocation: 0, costAllocation: 0, materialsPct: 0, equipmentPct: 0,
    }
    updateEntry({ ...entry, segments: [...entry.segments, newSeg] })
  }

  // ── Subtask management ────────────────────────────────────────────────────

  const handleAddSubtask = (category: string) => {
    const entry = getEntry(category)
    const newSubtask: GanttSubtask = {
      id: generateId(),
      label: `Sub-task ${(entry.subtasks?.length ?? 0) + 1}`,
      segments: [],
    }
    updateEntry({ ...entry, subtasks: [...(entry.subtasks ?? []), newSubtask] })
  }

  const handleRenameSubtask = (category: string, subtaskId: string, label: string) => {
    const entry = entries.find(e => e.category === category)
    if (!entry) return
    const updatedSubtasks = (entry.subtasks ?? []).map(st =>
      st.id === subtaskId ? { ...st, label } : st
    )
    updateEntry({ ...entry, subtasks: updatedSubtasks })
  }

  const handleDeleteSubtask = (category: string, subtaskId: string) => {
    const entry = entries.find(e => e.category === category)
    if (!entry) return
    updateEntry({ ...entry, subtasks: (entry.subtasks ?? []).filter(st => st.id !== subtaskId) })
  }

  const toggleCollapse = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  // ── Milestone management ─────────────────────────────────────────────────

  const handleAddMilestone = (label?: string, date?: string) => {
    const newM: Milestone = {
      id: generateId(),
      projectId: id,
      label: label ?? 'Milestone',
      date: date ?? toISODate(fridays[4]),
      colour: MILESTONE_COLOURS[milestones.length % MILESTONE_COLOURS.length],
    }
    const updated = [...milestones, newM]
    setMilestones(updated)
    void upsertGanttMilestones(id, updated)   // localStorage (immediate) + Supabase (background)
  }

  const handleMilestoneUpdate = (updated: Milestone) => {
    const next = milestones.map(m => m.id === updated.id ? updated : m)
    setMilestones(next)
    void upsertGanttMilestones(id, next)   // localStorage (immediate) + Supabase (background)
  }

  const handleMilestoneDelete = (milestoneId: string) => {
    const next = milestones.filter(m => m.id !== milestoneId)
    setMilestones(next)
    void upsertGanttMilestones(id, next)   // localStorage (immediate) + Supabase (background)
    setMilestonePopover(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  // The revenue forecast is a DERIVED view of the schedule: regenerate the project's "(Gantt)" revenue
  // rows from the current segments so the Revenue Calendar always matches the timeline. Manual rows
  // (deposits, milestones — anything not tagged "(Gantt)") are never touched, and any actuals already
  // entered against a Gantt row are carried forward by week so re-saving never wipes them. Returns the
  // number of forecast weeks written.
  const syncForecast = useCallback((currentEntries: GanttEntry[]): number => {
    if (!project) return 0
    const prevGantt = loadWeeklyRevenue().filter(w => w.projectId === id && (w.notes ?? '').trim().endsWith('(Gantt)'))
    const actualByKey = new Map<string, number>()
    for (const r of prevGantt) if (r.actualInvoiced) actualByKey.set(`${r.weekEnding}|${r.notes}`, r.actualInvoiced)

    deleteGanttGeneratedRevenueByProject(id)   // only "(Gantt)" rows — manual entries survive

    const rows: WeeklyRevenue[] = []
    for (const entry of currentEntries) {
      for (const seg of entry.segments) {
        if (!seg.startDate || !seg.endDate || seg.weekCount <= 0) continue
        const weeklyRev = seg.revenueAllocation / seg.weekCount
        const weeklyCost = seg.costAllocation / seg.weekCount
        const start = new Date(seg.startDate)
        for (let w = 0; w < seg.weekCount; w++) {
          const d = new Date(start); d.setDate(d.getDate() + w * 7)
          const weekEnding = toISODate(snapToFriday(d))
          const notes = `${entry.category}${seg.label ? ` — ${seg.label}` : ''} (Gantt)`
          rows.push({
            id: generateId(), projectId: project.id, projectName: project.name, entity: project.entity,
            weekEnding, weekNumber: w + 1, plannedRevenue: weeklyRev,
            actualInvoiced: actualByKey.get(`${weekEnding}|${notes}`) ?? 0,
            isDeposit: false, scheduledCost: weeklyCost, notes,
          })
        }
      }
    }
    for (const e of rows) saveWeeklyRevenue(e)
    void replaceGanttRevenueRemote(id, rows)
    return rows.length
  }, [project, id])

  const handleSave = () => {
    const toSave = entries.filter(e => e.segments.length > 0 || (e.subtasks ?? []).some(st => st.segments.length > 0))
    void upsertGanttEntries(id, toSave)   // localStorage (immediate) + Supabase (background)
    const n = syncForecast(entries)       // build the revenue forecast in the same action
    hasUnsavedChangesRef.current = false   // persisted — nothing for flush to re-save
    setSuccessMsg(`Saved — timeline + revenue forecast (${n} forecast week${n === 1 ? '' : 's'})`)
    setTimeout(() => setSuccessMsg(''), 3000)
  }


  // Flush unsaved edits to localStorage + Supabase on navigate-away / tab close / unmount. Without
  // this, every edit lives only in React state until the manual Save button — so leaving the page
  // (in-app Link/router) loses the schedule. upsertGanttEntries' localStorage write is synchronous,
  // so it persists even on unmount.
  const flushGantt = useCallback(() => {
    if (!hasUnsavedChangesRef.current) return
    hasUnsavedChangesRef.current = false
    const toSave = latestEntriesRef.current.filter(e => e.segments.length > 0 || (e.subtasks ?? []).some(st => st.segments.length > 0))
    void upsertGanttEntries(id, toSave)
    syncForecast(latestEntriesRef.current)   // keep the forecast in step on navigate-away too
  }, [id, syncForecast])

  useEffect(() => {
    window.addEventListener('beforeunload', flushGantt)
    window.addEventListener('pagehide', flushGantt)
    return () => {
      window.removeEventListener('beforeunload', flushGantt)
      window.removeEventListener('pagehide', flushGantt)
      flushGantt()
    }
  }, [flushGantt])

  // ── Seed timeline from the estimate ─────────────────────────────────────────
  // Drops one starter bar per category (budget fully allocated), staggered in sequence, so the
  // user begins from a draft programme instead of drawing every bar by hand. Only fills EMPTY
  // categories — existing hand-drawn timelines are left untouched, so it's safe to click anytime.
  const handleSeedFromEstimate = () => {
    if (!estimate || categories.length === 0) {
      setSuccessMsg('No estimate categories to seed from')
      setTimeout(() => setSuccessMsg(''), 3000)
      return
    }
    const DEFAULT_WEEKS = 1   // no-labour scopes (materials/equipment only): 1-week placeholder
    const lastIdx = fridays.length - 1
    const crew = crewSize
    // Start at the project's start week if set, else the first column.
    let cursor = project?.startDate ? fridays.findIndex(f => toISODate(f) >= project.startDate) : 0
    if (cursor < 0) cursor = 0
    let seededCount = 0
    const seeded: GanttEntry[] = categories.map(cat => {
      const existing = entries.find(e => e.category === cat.category)
      if (existing && existing.segments.length > 0) return existing  // keep hand-drawn work
      // Size the bar from the category's LABOUR budget so a freshly seeded scope reconciles to the
      // estimate (scheduled labour hours ≈ budget) instead of every category getting the same length. A
      // weeks-view bar of W weeks now counts 5W labour days (labourWorkingDays), so W = budget days ÷ 5.
      // Sub-week scopes land on the 1-week minimum here — refine those in Days view. Scopes with no labour
      // keep the placeholder width (their cost is materials/equipment %, independent of bar length).
      const labourBudget = cat.cost.labour ?? 0
      const targetDays = labourBudget > 0 ? labourBudget / (STD_LABOUR_RATE * crew * 8) : 0
      const weeks = labourBudget > 0 ? Math.max(1, Math.round(targetDays / 5)) : DEFAULT_WEEKS
      const sIdx = Math.min(cursor, lastIdx)
      const eIdx = Math.min(sIdx + weeks - 1, lastIdx)
      cursor = eIdx + 1   // next category follows this one
      seededCount++
      const seg: GanttSegment = {
        id: generateId(),
        startDate: toISODate(fridays[sIdx]),
        endDate: toISODate(fridays[eIdx]),
        weekCount: eIdx - sIdx + 1,
        grain: 'weeks',
        revenueAllocation: cat.budgetedRevenue,
        costAllocation: cat.budgetedCost,
      }
      const base: GanttEntry = existing ?? {
        id: generateId(), projectId: id, estimateId: estimate.id, category: cat.category,
        crewType: cat.crewType, budgetedRevenue: cat.budgetedRevenue, budgetedCost: cat.budgetedCost,
        segments: [], subtasks: [],
      }
      return { ...base, budgetedRevenue: cat.budgetedRevenue, budgetedCost: cat.budgetedCost, segments: [seg] }
    })
    if (seededCount === 0) {
      setSuccessMsg('Every category already has a timeline — nothing to seed')
      setTimeout(() => setSuccessMsg(''), 4000)
      return
    }
    // Preserve any entries whose category is no longer in the estimate (defensive).
    const covered = new Set(categories.map(c => c.category))
    const next = [...seeded, ...entries.filter(e => !covered.has(e.category))]
    // Derive each seeded scope's allocation up front so the reconciliation + forecast are right from
    // the first click (not only after the scope is touched).
    const seededRecalc = next.map(e => recalcEntry(e))
    setEntries(seededRecalc)
    void upsertGanttEntries(id, seededRecalc.filter(e => e.segments.length > 0 || (e.subtasks ?? []).some(st => st.segments.length > 0)))
    const fc = syncForecast(seededRecalc)   // seed the revenue forecast alongside the timeline
    hasUnsavedChangesRef.current = false   // persisted — nothing for flush to re-save
    setSuccessMsg(`Seeded ${seededCount} ${seededCount === 1 ? 'category' : 'categories'} + ${fc} forecast week${fc === 1 ? '' : 's'} — adjust each task's start + duration and re-save to update both`)
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  // ── Schedule a task by start date + duration (foreman-friendly — no drawing) ──
  // Edits the task's primary (first) segment, creating one with the full budget if there are none.
  // Duration is in weeks; additional split work-periods are left untouched.
  // `duration` is in the current view's unit — weeks in Weeks view, days in Days view. weekCount is
  // kept as the number of weeks the span covers, so the revenue/cost forecast still spreads weekly.
  const setTaskSchedule = (category: string, startIso: string, duration: number, subtaskId?: string) => {
    const entry = getEntry(category)
    const n = Math.max(1, Math.floor(duration) || 1)
    // Snap the entered start onto the grid so the bar lands on real columns: weeks view → week-ending
    // Friday; days view → a working day (skip weekends). Off-grid starts otherwise render empty/short.
    if (startIso) {
      if (timeView === 'days') {
        const d = new Date(`${startIso}T00:00:00`)
        const dow = d.getDay()
        if (dow === 6) d.setDate(d.getDate() + 2)        // Sat → Mon
        else if (dow === 0) d.setDate(d.getDate() + 1)   // Sun → Mon
        startIso = toISODate(d)
      } else {
        startIso = toISODate(snapToFriday(new Date(`${startIso}T00:00:00`)))
      }
    }
    const endIso = startIso ? addDays(startIso, timeView === 'days' ? n - 1 : (n - 1) * 7) : ''
    const weekCount = timeView === 'days' ? Math.max(1, Math.ceil(n / 7)) : n
    // Set/clear the primary (first) segment; keep any extra split periods. Sub-task segments carry no
    // budget allocation (they sub-schedule a category), category segments carry the category budget.
    const applySeg = (segs: GanttSegment[], rev: number, cost: number): GanttSegment[] => {
      if (!startIso) return segs.slice(1)
      if (segs.length === 0) return [{ id: generateId(), startDate: startIso, endDate: endIso, weekCount, grain: timeView, revenueAllocation: rev, costAllocation: cost }]
      return segs.map((s, i) => i === 0 ? { ...s, startDate: startIso, endDate: endIso, weekCount, grain: timeView } : s)
    }
    if (subtaskId) {
      const subtasks = (entry.subtasks ?? []).map(st => st.id === subtaskId ? { ...st, segments: applySeg(st.segments, 0, 0) } : st)
      updateEntry({ ...entry, subtasks })
    } else {
      updateEntry({ ...entry, segments: applySeg(entry.segments, entry.budgetedRevenue, entry.budgetedCost) })
    }
  }

  // A task's current duration in the active view's unit (weeks or days), for the input.
  const durationOf = (segs: GanttSegment[]): number | '' => {
    const s = segs[0]
    if (!s) return ''
    return timeView === 'days' ? daysBetweenIso(s.startDate, s.endDate) + 1 : (s.weekCount || 1)
  }

  // ── Header groupings ──────────────────────────────────────────────────────

  const monthGroups: { month: string; count: number }[] = []
  if (timeView === 'weeks') {
    for (const friday of fridays) {
      const m = `${SHORT_MONTH_NAMES[friday.getMonth()]} ${friday.getFullYear()}`
      if (!monthGroups.length || monthGroups[monthGroups.length - 1].month !== m) {
        monthGroups.push({ month: m, count: 1 })
      } else {
        monthGroups[monthGroups.length - 1].count++
      }
    }
  } else {
    // For days view, group by week (5 days each)
    const displayWeeks = Math.min(DAYS_VIEW_WEEKS, fridays.length)
    for (let w = 0; w < displayWeeks; w++) {
      const fri = fridays[w]
      const m = `${SHORT_MONTH_NAMES[fri.getMonth()]} ${fri.getDate()}`
      monthGroups.push({ month: m, count: 5 })
    }
  }

  // ── Per-week totals ───────────────────────────────────────────────────────

  const weekTotals = columns.map(col => {
    const iso = toISODate(col)
    let rev = 0, cost = 0
    for (const entry of entries) {
      for (const seg of entry.segments) {
        if (seg.startDate && seg.endDate && iso >= seg.startDate && iso <= seg.endDate && seg.weekCount > 0) {
          rev += seg.revenueAllocation / seg.weekCount
          cost += seg.costAllocation / seg.weekCount
        }
      }
    }
    return { rev, cost }
  })

  // Collapse the cash-flow strip into runs: consecutive columns within the SAME week carrying the same
  // figures become one colSpan cell. In days view this turns five cramped 24px repeats of the weekly
  // figure into one wide, readable cell per week; in weeks view each column is its own week, so every
  // run stays a single cell (unchanged).
  const footerRuns = (() => {
    const runs: { startIdx: number; span: number; rev: number; cost: number; weekKey: string }[] = []
    for (let i = 0; i < weekTotals.length; i++) {
      const { rev, cost } = weekTotals[i]
      const weekKey = toISODate(snapToFriday(columns[i]))
      const last = runs[runs.length - 1]
      if (last && last.rev === rev && last.cost === cost && last.weekKey === weekKey) {
        last.span++
      } else {
        runs.push({ startIdx: i, span: 1, rev, cost, weekKey })
      }
    }
    return runs
  })()

  // ── Today indicator column index ──────────────────────────────────────────

  const todayColIdx = (() => {
    if (timeView === 'weeks') {
      // Find nearest Friday
      return fridays.findIndex(f => toISODate(f) === currentWeekIso)
    } else {
      return workingDays.findIndex(d => toISODate(d) === today)
    }
  })()

  // ── Month + week boundary column indices ────────────────────────────────────
  // Month boundaries get the strongest rule; week boundaries (days view only — every Monday) get a
  // medium rule so weeks read at a glance, per Andrew's "week gridlines in bold". In weeks view every
  // column IS a week, so the per-column border is strengthened directly instead.

  const monthBoundaryIndices = new Set<number>()
  const weekBoundaryIndices = new Set<number>()
  for (let i = 1; i < columns.length; i++) {
    if (columns[i].getMonth() !== columns[i - 1].getMonth()) {
      monthBoundaryIndices.add(i)
    }
    if (timeView === 'days' && i % 5 === 0) {
      weekBoundaryIndices.add(i)
    }
  }
  // Border rule for a column's left edge — month wins over week. Used by the body, header and footer
  // so the vertical rules line up top to bottom.
  const colBorderLeft = (i: number): string | undefined =>
    monthBoundaryIndices.has(i) ? '2px solid rgba(255,255,255,0.26)'
    : weekBoundaryIndices.has(i) ? '2px solid rgba(255,255,255,0.13)'
    : undefined

  if (!project) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  // Project totals (revenue + cost split by type) for the summary strip above the grid.
  const projTotals = categories.reduce((a, c) => {
    a.revenue += c.budgetedRevenue
    a.cost += c.cost.total
    a.labour += c.cost.labour
    a.material += c.cost.material
    a.subcontractor += c.cost.subcontractor
    a.equipment += c.cost.equipment
    return a
  }, { revenue: 0, cost: 0, labour: 0, material: 0, subcontractor: 0, equipment: 0 })
  const projGP = projTotals.revenue - projTotals.cost
  const projGPpct = projTotals.revenue > 0 ? projGP / projTotals.revenue : 0

  // Accuracy check (Andrew): total the forecast figures and reconcile against the real contract, so you
  // can see at a glance whether work is still unscheduled (under-claiming) before invoicing.
  const forecastRevenue = entries.reduce((s, e) => s + e.segments.reduce((ss, sg) => ss + (sg.revenueAllocation || 0), 0), 0)
  const unscheduledCats = categories.filter(c => {
    const e = entries.find(x => x.category === c.category)
    return !e || !e.segments.some(s => s.startDate && s.endDate)
  })
  const scheduledPct = projTotals.revenue > 0 ? Math.round((forecastRevenue / projTotals.revenue) * 100) : 0
  const reconciled = Math.abs(forecastRevenue - projTotals.revenue) < 1

  const fixedColsWidth = COL_CATEGORY + COL_CREW + COL_BUDGET + COL_SCHED
  const tableWidth = fixedColsWidth + columns.length * CELL_W

  // ── Render segment bar cells ──────────────────────────────────────────────

  const renderSegmentCells = (
    entry: GanttEntry,
    segs: GanttSegment[],
    category: string,
    crewType: 'Formation' | 'Subcontractor',
    subtaskId?: string,
    isSubtask?: boolean,
  ) => {
    return columns.map((col, i) => {
      const iso = toISODate(col)
      const isCurrentWeek = timeView === 'weeks' ? iso === currentWeekIso : iso === today
      const isTodayCol = i === todayColIdx
      const activeSegs = segs.filter(s => isSegmentActiveInCol(s, col))

      return (
        <td
          key={i}
          style={{
            width: CELL_W,
            minWidth: CELL_W,
            padding: 0,
            position: 'relative',
            borderLeft: colBorderLeft(i),
          }}
          className={`border-r ${timeView === 'weeks' ? 'border-fg-border/55' : 'border-fg-border/25'} cursor-crosshair ${isCurrentWeek && !activeSegs.length ? 'bg-fg-card/20' : ''}`}
          onMouseDown={() => handleCellMouseDown(category, i, subtaskId)}
          onMouseEnter={() => handleCellMouseEnter(category, i, subtaskId)}
        >
          {/* Today line */}
          {isTodayCol && (
            <div className="absolute inset-y-0 left-0 w-0.5 bg-red-500/50 z-10 pointer-events-none" />
          )}
          {activeSegs.map(seg => {
            const startIdx = columns.findIndex(c => toISODate(c) === seg.startDate)
            const endIdx = columns.findIndex(c => toISODate(c) === seg.endDate)
            const isStart = i === startIdx || (startIdx === -1 && i === 0)
            const isEnd = i === endIdx || (endIdx === -1 && i === columns.length - 1)
            const colour = isSubtask ? subtaskBarColour(crewType) : barColour(seg, crewType)
            const weeklyRev = seg.weekCount > 0 ? seg.revenueAllocation / seg.weekCount : 0
            const weeklyCost = seg.weekCount > 0 ? seg.costAllocation / seg.weekCount : 0
            const marg = seg.revenueAllocation > 0 ? ((seg.revenueAllocation - seg.costAllocation) / seg.revenueAllocation * 100).toFixed(1) : '0'
            const showText = isStart && seg.weekCount >= 2 && !isSubtask && timeView === 'weeks'

            return (
              <div
                key={seg.id}
                className="absolute inset-y-1 flex flex-col items-start justify-center overflow-hidden"
                style={{
                  left: isStart ? 2 : 0,
                  right: isEnd ? 2 : 0,
                  background: colour,
                  borderRadius: isStart && isEnd ? 3 : isStart ? '3px 0 0 3px' : isEnd ? '0 3px 3px 0' : 0,
                  cursor: (moving?.segId === seg.id) ? 'grabbing' : 'grab',
                }}
                onMouseDown={e => handleBarMouseDown(e, entry, seg, i, subtaskId)}
                onClick={e => {
                  if (!moving) {
                    handleBarClick(e as unknown as React.MouseEvent, category, seg.id, e.currentTarget as HTMLDivElement, subtaskId)
                  }
                }}
                title={`${category}${seg.label ? ` — ${seg.label}` : ''}\nRevenue: ${formatCurrency(weeklyRev)}/wk\nCost: ${formatCurrency(weeklyCost)}/wk\nMargin: ${marg}%`}
              >
                {showText && (
                  <div className="px-1.5 leading-tight">
                    <div className="text-[9px] text-white/85 font-light whitespace-nowrap truncate">
                      {formatCurrency(weeklyRev)} rev
                    </div>
                    <div className="text-[9px] text-white/55 font-light whitespace-nowrap truncate">
                      {formatCurrency(weeklyCost)} cost
                    </div>
                  </div>
                )}
                {/* Resize handles — drag an edge to extend/shorten. onClick-stop so it doesn't open the popover. */}
                {isStart && (
                  <div onMouseDown={e => handleResizeMouseDown(e, entry, seg, 'start', subtaskId)} onClick={e => e.stopPropagation()}
                    title="Drag to change the start" className="absolute inset-y-0 left-0 w-1.5 z-20 cursor-ew-resize hover:bg-white/40" />
                )}
                {isEnd && (
                  <div onMouseDown={e => handleResizeMouseDown(e, entry, seg, 'end', subtaskId)} onClick={e => e.stopPropagation()}
                    title="Drag to change the end" className="absolute inset-y-0 right-0 w-1.5 z-20 cursor-ew-resize hover:bg-white/40" />
                )}
              </div>
            )
          })}
          {!activeSegs.length && (
            <div className="absolute inset-0 hover:bg-fg-border/15 transition-colors" />
          )}
        </td>
      )
    })
  }

  return (
    <div
      className="w-full px-3 lg:px-5 py-6"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
        <Link href="/projects" className="hover:text-fg-heading transition-colors">Projects</Link>
        <span>/</span>
        <Link href={`/projects/${id}`} className="hover:text-fg-heading transition-colors">{project.name}</Link>
        <span>/</span>
        <span className="text-fg-heading">Gantt</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">Gantt &amp; Revenue Schedule</h1>
          <p className="text-sm font-light text-fg-muted mt-1">{project.name}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Time view toggle */}
          <div className="flex items-center border border-fg-border text-[10px] font-light tracking-wide uppercase overflow-hidden">
            <button
              onClick={() => setTimeView('weeks')}
              className={`px-3 py-2 transition-colors ${timeView === 'weeks' ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'}`}
            >
              Weeks
            </button>
            <button
              onClick={() => setTimeView('days')}
              className={`px-3 py-2 transition-colors ${timeView === 'days' ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'}`}
            >
              Days
            </button>
          </div>

          {/* Zoom — scales the column width */}
          <div className="flex items-center border border-fg-border text-fg-muted overflow-hidden">
            <button onClick={() => setZoom(z => ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(z as typeof ZOOM_LEVELS[number]) - 1)] ?? z)}
              disabled={zoom <= ZOOM_LEVELS[0]} title="Zoom out"
              className="px-2.5 py-2 text-sm leading-none hover:text-fg-heading disabled:opacity-30 disabled:cursor-not-allowed">−</button>
            <span className="px-1 text-[10px] font-light tabular-nums w-9 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(z as typeof ZOOM_LEVELS[number]) + 1)] ?? z)}
              disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} title="Zoom in"
              className="px-2.5 py-2 text-sm leading-none hover:text-fg-heading disabled:opacity-30 disabled:cursor-not-allowed">+</button>
          </div>

          {/* Crew size — drives the labour-hours model (2 = 16h/day, 3 = 24h, 4 = 32h) */}
          <div className="flex items-center gap-1.5 border border-fg-border px-2.5 py-1.5">
            <span className="text-[10px] font-light tracking-wide uppercase text-fg-muted">Crew</span>
            <select
              value={crewSize}
              onChange={e => setCrew(Number(e.target.value))}
              title="Project crew size — a crew of N works N × 8 labour hours per day"
              className="bg-transparent text-xs font-light text-fg-heading outline-none cursor-pointer"
            >
              <option value={2}>2 · 16h/day</option>
              <option value={3}>3 · 24h/day</option>
              <option value={4}>4 · 32h/day</option>
            </select>
            {CREW_LABOUR_TARGET[crewSize] && (
              <span className="text-[10px] font-light text-fg-muted/70 border-l border-fg-border pl-1.5 ml-0.5 whitespace-nowrap"
                title={`A crew of ${crewSize} should turn over ${formatCurrency(CREW_LABOUR_TARGET[crewSize].revenue)} of revenue per week on ${formatCurrency(CREW_LABOUR_TARGET[crewSize].budget)} of labour cost`}>
                target <span className="text-fg-heading tabular-nums">{fmtK(CREW_LABOUR_TARGET[crewSize].revenue)}</span>/wk
              </span>
            )}
          </div>

          {/* Add Milestone */}
          {addingMilestone ? (
            <div className="flex items-center gap-2 border border-fg-border px-2 py-1.5 bg-fg-bg">
              <span className="text-xs text-fg-muted">◆</span>
              <input
                autoFocus
                type="text"
                value={newMilestoneLabel}
                onChange={e => setNewMilestoneLabel(e.target.value)}
                placeholder="Milestone name..."
                className="bg-transparent outline-none text-[11px] font-light text-fg-heading placeholder-fg-muted/40 w-36"
                onKeyDown={e => {
                  if (e.key === 'Enter' && newMilestoneLabel.trim()) {
                    handleAddMilestone(newMilestoneLabel.trim(), newMilestoneDate)
                    setNewMilestoneLabel('')
                    setAddingMilestone(false)
                  }
                  if (e.key === 'Escape') { setAddingMilestone(false); setNewMilestoneLabel('') }
                }}
              />
              <input
                type="date"
                value={newMilestoneDate}
                onChange={e => setNewMilestoneDate(e.target.value)}
                className="bg-transparent outline-none text-[11px] font-light text-fg-muted w-28"
              />
              <button
                onClick={() => {
                  if (newMilestoneLabel.trim()) {
                    handleAddMilestone(newMilestoneLabel.trim(), newMilestoneDate)
                    setNewMilestoneLabel('')
                    setAddingMilestone(false)
                  }
                }}
                className="text-[10px] text-fg-heading font-light uppercase tracking-wide hover:text-green-600 transition-colors"
              >Add</button>
              <button onClick={() => { setAddingMilestone(false); setNewMilestoneLabel('') }}>
                <X className="w-3 h-3 text-fg-muted hover:text-fg-heading transition-colors" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingMilestone(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-fg-border text-fg-muted text-[10px] font-light tracking-wide uppercase hover:text-fg-heading hover:border-fg-heading transition-colors"
            >
              <span className="text-xs">◆</span> + Milestone
            </button>
          )}

          {successMsg && (
            <span className="text-xs font-light text-fg-muted flex items-center gap-1.5">
              <Check className="w-3 h-3" /> {successMsg}
            </span>
          )}
          {estimate && (
            <button onClick={handleSeedFromEstimate}
              className="px-4 py-2 border border-fg-border text-fg-heading text-xs font-light tracking-architectural uppercase hover:border-fg-heading transition-colors">
              Build timeline from estimate
            </button>
          )}
          <button onClick={handleSave}
            title="Saves the timeline and rebuilds the revenue forecast from it — they stay in sync"
            className="px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors">
            Save timeline + forecast
          </button>
        </div>
      </div>

      {successMsg.includes('forecast') && (
        <div className="mb-4">
          <Link href="/revenue" className="text-xs font-light text-fg-heading underline">
            View Revenue Calendar →
          </Link>
        </div>
      )}

      {!estimate && (
        <div className="border border-fg-border py-8 text-center mb-8">
          <p className="text-sm font-light text-fg-muted">No estimate found. Create one first.</p>
          <Link href={`/estimates/new?projectId=${id}`} className="text-xs font-light text-fg-heading underline mt-2 inline-block">New Estimate →</Link>
        </div>
      )}

      {estimate && categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 px-3 py-2.5 border border-fg-border bg-fg-bg/40 text-xs font-light">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">Revenue</span>
            <span className="text-fg-heading tabular-nums">{formatCurrency(projTotals.revenue)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">Cost</span>
            <span className="text-fg-heading tabular-nums">{formatCurrency(projTotals.cost)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">GP</span>
            <span className="text-fg-heading tabular-nums">{formatCurrency(projGP)}</span>
            <span className="text-fg-muted/70">({(projGPpct * 100).toFixed(0)}%)</span>
          </div>
          <div className="h-4 w-px bg-fg-border" />
          {COST_TYPE_KEYS.map(k => projTotals[k] > 0 ? (
            <div key={k} className="flex items-baseline gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full self-center" style={{ background: COST_TYPE_META[k].colour }} />
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">{COST_TYPE_META[k].label}</span>
              <span className="text-fg-heading tabular-nums">{formatCurrency(projTotals[k])}</span>
            </div>
          ) : null)}
          {/* Accuracy check — forecast scheduled vs contract; flags unscheduled (under-claim) work */}
          <div className="h-4 w-px bg-fg-border" />
          <div className="flex items-baseline gap-1.5" title="Total of the scheduled forecast figures vs the contract — anything short is work not yet on the programme">
            <span className="text-[10px] uppercase tracking-wide text-fg-muted">Scheduled</span>
            <span className={`tabular-nums ${reconciled ? 'text-green-600' : 'text-amber-600'}`}>
              {formatCurrency(forecastRevenue)} / {formatCurrency(projTotals.revenue)}
            </span>
            <span className={reconciled ? 'text-green-600/80' : 'text-amber-600/80'}>
              {reconciled ? '✓' : `${scheduledPct}%`}
            </span>
            {unscheduledCats.length > 0 && (
              <span className="text-amber-600/80 text-[10px]">· {unscheduledCats.length} to schedule</span>
            )}
          </div>
        </div>
      )}

      {estimate && categories.length > 0 && (
        <div ref={gridScrollRef} className="overflow-auto border border-fg-border" style={{ userSelect: 'none', maxHeight: 'calc(100vh - 230px)' }}>
          <table className="border-collapse" style={{ minWidth: tableWidth, width: tableWidth }}>
            {/* ── Headers ── */}
            <thead>
              {/* Month / week group row */}
              <tr>
                <th colSpan={4} style={{ width: fixedColsWidth }} className="bg-fg-bg border-b border-r border-fg-border px-3 py-2 text-left" />
                {monthGroups.map((mg, i) => (
                  <th key={i} colSpan={mg.count} style={{ width: mg.count * CELL_W }}
                    className="bg-fg-bg border-b border-r border-fg-border px-2 py-2 text-left text-[10px] font-light tracking-widest uppercase text-fg-muted">
                    {mg.month}
                  </th>
                ))}
              </tr>

              {/* Day-of-week sub-header (days view only) */}
              {timeView === 'days' && (
                <tr>
                  <th colSpan={4} style={{ width: fixedColsWidth }} className="bg-fg-bg border-b border-r border-fg-border" />
                  {workingDays.map((d, i) => {
                    return (
                      <th key={i}
                        style={{
                          width: CELL_W_DAYS, minWidth: CELL_W_DAYS,
                          borderLeft: colBorderLeft(i),
                        }}
                        className="bg-fg-bg border-b border-r border-fg-border py-1 text-center text-[9px] font-light text-fg-muted/60">
                        {DAY_LABELS[d.getDay() === 0 ? 0 : d.getDay() - 1]}
                      </th>
                    )
                  })}
                </tr>
              )}

              {/* Date row */}
              <tr>
                <th className="bg-fg-bg border-b border-r border-fg-border px-3 py-2 text-left text-[10px] font-light tracking-wide uppercase text-fg-muted" style={{ width: COL_CATEGORY }}>Category</th>
                <th className="bg-fg-bg border-b border-r border-fg-border px-2 py-2 text-center text-[10px] font-light tracking-wide uppercase text-fg-muted" style={{ width: COL_CREW }}>Crew</th>
                <th className="bg-fg-bg border-b border-r border-fg-border px-2 py-2 text-right text-[10px] font-light tracking-wide uppercase text-fg-muted" style={{ width: COL_BUDGET }}>Budget / Cost</th>
                <th className="bg-fg-bg border-b border-r border-fg-border px-2 py-2 text-center text-[10px] font-light tracking-wide uppercase text-fg-muted" style={{ width: COL_SCHED }}>Start / Duration</th>
                {columns.map((col, i) => {
                  const iso = toISODate(col)
                  const isCurrentWeek = timeView === 'weeks' ? iso === currentWeekIso : iso === today
                  return (
                    <th key={i} style={{
                      width: CELL_W, minWidth: CELL_W,
                      borderLeft: colBorderLeft(i),
                    }}
                      className={`border-b border-r ${timeView === 'weeks' ? 'border-fg-border/55' : 'border-fg-border'} py-1.5 text-center text-[10px] font-light text-fg-muted ${isCurrentWeek ? 'bg-fg-card/60' : 'bg-fg-bg'}`}>
                      {timeView === 'weeks' ? formatDayMonth(col) : String(col.getDate())}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {categories.map(cat => {
                const entry = entries.find(e => e.category === cat.category) ?? {
                  id: generateId(), projectId: id, estimateId: estimate.id, category: cat.category,
                  crewType: cat.crewType, budgetedRevenue: cat.budgetedRevenue,
                  budgetedCost: cat.budgetedCost, segments: [], subtasks: [],
                }
                const segs = entry.segments
                const subtasks = entry.subtasks ?? []
                const isCollapsed = collapsedCategories.has(cat.category)
                const hasSubtasks = subtasks.length > 0
                // When collapsed, show the category's own bars PLUS a rollup bar spanning all its
                // subtasks' dates, so a condensed row still reads the full timeframe (Andrew). The rollup
                // carries the category budget so its colour/tooltip reflect the category, and its id isn't
                // a real segment so clicks/drags on it are no-ops.
                const collapsedRollup: GanttSegment[] = (() => {
                  if (!isCollapsed || !hasSubtasks) return segs
                  const dated = subtasks.flatMap(st => st.segments).filter(s => s.startDate && s.endDate)
                  if (dated.length === 0) return segs
                  const start = dated.map(s => s.startDate).sort()[0]
                  const end = dated.map(s => s.endDate).sort().slice(-1)[0]
                  const rollup: GanttSegment = {
                    id: `${entry.id}-rollup`, startDate: start, endDate: end, weekCount: Math.max(1, weeksBetween(start, end)),
                    grain: 'weeks', label: `${subtasks.length} subtasks`,
                    revenueAllocation: entry.budgetedRevenue, costAllocation: entry.budgetedCost,
                  }
                  return [...segs, rollup]
                })()
                // Allocation reconciliation: each cost type's % spread across the periods should total
                // 100%, so the foreman sees at a glance whether labour/materials/equipment are fully
                // allocated (amber when not). Labour is now a % like the others, not bar-derived hours.
                const labBudgetCat = cat.cost.labour ?? 0
                const labAlloc = Math.round(segs.reduce((s, sg) => s + (sg.labourPct ?? 0), 0))
                const matBudgetCat = cat.cost.material ?? 0
                const subBudgetCat = cat.cost.subcontractor ?? 0
                const eqBudgetCat = cat.cost.equipment ?? 0
                const matAlloc = Math.round(segs.reduce((s, sg) => s + (sg.materialsPct ?? 0), 0))
                const subAlloc = Math.round(segs.reduce((s, sg) => s + (sg.subPct ?? 0), 0))
                const eqAlloc = Math.round(segs.reduce((s, sg) => s + (sg.equipmentPct ?? 0), 0))
                const scheduled = segs.some(sg => sg.startDate)

                return (
                  <>
                    {/* ── Category row ── */}
                    <tr key={cat.category} className="border-b border-fg-border/40 group" style={{ height: 34 }}>
                      {/* Category label */}
                      <td className="border-r border-fg-border px-3 py-2 text-xs font-light text-fg-heading whitespace-nowrap align-middle" style={{ width: COL_CATEGORY }}>
                        <div className="flex items-center gap-1.5">
                          {hasSubtasks && (
                            <button onClick={() => toggleCollapse(cat.category)} className="text-fg-muted hover:text-fg-heading transition-colors flex-shrink-0">
                              {isCollapsed
                                ? <ChevronRight className="w-3 h-3" />
                                : <ChevronDown className="w-3 h-3" />
                              }
                            </button>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{cat.category}</span>
                            {scheduled && (
                              <span className="text-[10px] font-light tabular-nums flex flex-wrap gap-x-1.5 leading-tight">
                                {labBudgetCat > 0 && <span title="Labour allocated across periods" className={labAlloc !== 100 ? 'text-amber-600' : 'text-fg-muted/50'}>L {labAlloc}%</span>}
                                {matBudgetCat > 0 && <span title="Materials allocated" className={matAlloc !== 100 ? 'text-amber-600' : 'text-fg-muted/50'}>M {matAlloc}%</span>}
                                {subBudgetCat > 0 && <span title="Subcontractor allocated" className={subAlloc !== 100 ? 'text-amber-600' : 'text-fg-muted/50'}>S {subAlloc}%</span>}
                                {eqBudgetCat > 0 && <span title="Equipment allocated" className={eqAlloc !== 100 ? 'text-amber-600' : 'text-fg-muted/50'}>E {eqAlloc}%</span>}
                                {datedPeriodCount(segs) > 1 && <span className="text-fg-muted/40">· {datedPeriodCount(segs)} periods</span>}
                              </span>
                            )}
                          </div>
                          {/* Add subtask button (hover) */}
                          <button
                            onClick={() => handleAddSubtask(cat.category)}
                            title="Add subtask row"
                            className="opacity-0 group-hover:opacity-100 ml-auto flex-shrink-0 text-fg-muted/60 hover:text-fg-heading transition-all"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      {/* Crew */}
                      <td className="border-r border-fg-border px-2 py-2 text-center align-middle" style={{ width: COL_CREW }}>
                        <span className="text-[10px] font-light tracking-wide uppercase px-1.5 py-0.5"
                          style={{ background: cat.crewType === 'Formation' ? '#8A858520' : '#C5B8A820', color: cat.crewType === 'Formation' ? '#8A8580' : '#A09070' }}>
                          {cat.crewType === 'Formation' ? 'Form' : 'Sub'}
                        </span>
                      </td>
                      {/* Budget — revenue + an inline, compact cost split (was 4 stacked lines; that drove
                          the row height). Single-letter type tags with tooltips keep it to ~1 line. */}
                      <td className="border-r border-fg-border px-2 py-1.5 text-right text-[11px] font-light text-fg-muted tabular-nums align-middle" style={{ width: COL_BUDGET }}>
                        <div className="text-fg-heading">{formatCurrency(cat.budgetedRevenue)}</div>
                        <div className="mt-px flex flex-wrap justify-end gap-x-1.5 gap-y-0 text-[9px] leading-tight">
                          {COST_TYPE_KEYS.map(k => cat.cost[k] > 0 ? (
                            <span key={k} className="whitespace-nowrap" title={`${COST_TYPE_META[k].label}: ${formatCurrency(cat.cost[k])}${k === 'labour' ? ` · ${Math.round(cat.cost[k] / STD_LABOUR_RATE)}h` : ''}`}>
                              <span style={{ color: COST_TYPE_META[k].colour }}>{COST_TYPE_META[k].label[0]}</span>
                              <span className="text-fg-muted/60"> {fmtK(cat.cost[k])}</span>
                            </span>
                          ) : null)}
                        </div>
                      </td>
                      {/* Schedule: start date + duration — the bar places itself, no drawing */}
                      <td className="border-r border-fg-border px-1.5 py-1 align-middle" style={{ width: COL_SCHED }}>
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={segs[0]?.startDate ?? ''}
                            onChange={e => setTaskSchedule(cat.category, e.target.value, durationOf(segs) || 1)}
                            title="Start date — the bar places itself"
                            className="bg-transparent border border-fg-border/50 rounded-sm px-1 py-0.5 text-[10px] font-light text-fg-heading outline-none focus:border-fg-heading w-[92px]"
                          />
                          <input
                            type="number"
                            min={1}
                            value={durationOf(segs)}
                            onChange={e => { if (segs[0]?.startDate) { const n = parseInt(e.target.value); setTaskSchedule(cat.category, segs[0].startDate, Number.isFinite(n) ? n : 1) } }}
                            placeholder="–"
                            title={timeView === 'days' ? 'Duration in days' : 'Duration in weeks'}
                            className="bg-transparent border border-fg-border/50 rounded-sm px-1 py-0.5 text-[10px] font-light text-fg-heading text-right tabular-nums outline-none focus:border-fg-heading w-8"
                          />
                          <span className="text-[9px] text-fg-muted/60">{timeView === 'days' ? 'day' : 'wk'}</span>
                          <button
                            onClick={() => handleAddSplit(cat.category)}
                            title="Add another work period (split)"
                            className="opacity-0 group-hover:opacity-100 ml-auto flex-shrink-0 text-fg-muted/50 hover:text-fg-heading transition-all"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      {/* Segment cells — collapsed rows roll the subtask span into a summary bar */}
                      {renderSegmentCells(entry, collapsedRollup, cat.category, cat.crewType)}
                    </tr>

                    {/* ── Subtask rows ── */}
                    {!isCollapsed && subtasks.map(subtask => (
                      <tr key={subtask.id} className="border-b border-fg-border/20 group/sub" style={{ height: 28 }}>
                        <td className="border-r border-fg-border pl-8 pr-2 py-1.5 text-[11px] font-light text-fg-muted whitespace-nowrap align-middle" style={{ width: COL_CATEGORY }}>
                          <div className="flex items-center gap-1">
                            <span className="text-fg-muted/40 text-[10px]">└</span>
                            <input
                              value={subtask.label}
                              onChange={e => handleRenameSubtask(cat.category, subtask.id, e.target.value)}
                              className="bg-transparent border-none outline-none text-[11px] font-light text-fg-muted w-full min-w-0 hover:text-fg-heading focus:text-fg-heading"
                            />
                            <button
                              onClick={() => handleDeleteSubtask(cat.category, subtask.id)}
                              className="opacity-0 group-hover/sub:opacity-100 flex-shrink-0 text-fg-muted/40 hover:text-red-400/70 transition-all"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </td>
                        <td className="border-r border-fg-border" style={{ width: COL_CREW }} />
                        <td className="border-r border-fg-border" style={{ width: COL_BUDGET }} />
                        {/* Sub-task schedule: start date + duration, same as the category rows */}
                        <td className="border-r border-fg-border px-1.5 py-1 align-middle" style={{ width: COL_SCHED }}>
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={subtask.segments[0]?.startDate ?? ''}
                              onChange={e => setTaskSchedule(cat.category, e.target.value, durationOf(subtask.segments) || 1, subtask.id)}
                              title="Start date"
                              className="bg-transparent border border-fg-border/50 rounded-sm px-1 py-0.5 text-[10px] font-light text-fg-heading outline-none focus:border-fg-heading w-[92px]"
                            />
                            <input
                              type="number"
                              min={1}
                              value={durationOf(subtask.segments)}
                              onChange={e => { if (subtask.segments[0]?.startDate) { const n = parseInt(e.target.value); setTaskSchedule(cat.category, subtask.segments[0].startDate, Number.isFinite(n) ? n : 1, subtask.id) } }}
                              placeholder="–"
                              title={timeView === 'days' ? 'Duration in days' : 'Duration in weeks'}
                              className="bg-transparent border border-fg-border/50 rounded-sm px-1 py-0.5 text-[10px] font-light text-fg-heading text-right tabular-nums outline-none focus:border-fg-heading w-8"
                            />
                            <span className="text-[9px] text-fg-muted/60">{timeView === 'days' ? 'day' : 'wk'}</span>
                          </div>
                        </td>
                        {renderSegmentCells(entry, subtask.segments, cat.category, cat.crewType, subtask.id, true)}
                      </tr>
                    ))}
                  </>
                )
              })}

              {/* ── Milestones row ── */}
              {milestones.length > 0 && (
                <tr className="border-t-2 border-fg-border/40" style={{ height: 40 }}>
                  <td colSpan={4} className="border-r border-fg-border px-3 py-2 text-[10px] font-light tracking-architectural uppercase text-fg-muted align-middle">
                    Milestones
                  </td>
                  {columns.map((col, i) => {
                    const iso = toISODate(col)
                    const isTodayCol = i === todayColIdx
                    // Find milestones that fall in this column
                    const colMilestones = milestones.filter(m => {
                      if (timeView === 'weeks') {
                        // Match to nearest Friday
                        const mDate = new Date(m.date)
                        while (mDate.getDay() !== 5) mDate.setDate(mDate.getDate() + 1)
                        return toISODate(mDate) === iso
                      } else {
                        return m.date === iso
                      }
                    })

                    return (
                      <td key={i}
                        style={{
                          width: CELL_W, minWidth: CELL_W, padding: 0, position: 'relative',
                          borderLeft: colBorderLeft(i),
                        }}
                        className={`border-r ${timeView === 'weeks' ? 'border-fg-border/55' : 'border-fg-border/25'}`}
                      >
                        {isTodayCol && (
                          <div className="absolute inset-y-0 left-0 w-0.5 bg-red-500/50 z-10 pointer-events-none" />
                        )}
                        {colMilestones.map(m => (
                          <div
                            key={m.id}
                            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={e => {
                              milestoneAnchorRef.current = e.currentTarget as HTMLDivElement
                              setMilestonePopover(m.id)
                            }}
                            title={m.label}
                          >
                            <span className="text-base leading-none" style={{ color: m.colour ?? '#8A8580' }}>◆</span>
                            <span className="text-[8px] font-light text-fg-muted/80 mt-0.5 truncate max-w-full px-0.5 text-center leading-tight">
                              {m.label}
                            </span>
                          </div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              )}
            </tbody>

            {/* ── Totals footer ── */}
            <tfoot>
              <tr className="border-t-2 border-fg-border" style={{ height: 46 }}>
                <td colSpan={4} className="px-3 py-2 border-r border-fg-border align-top">
                  <div className="text-[10px] font-light tracking-architectural uppercase text-fg-muted">Weekly Cash Flow</div>
                  <div className="text-[8px] font-light text-fg-muted/50 mt-0.5">revenue · cost · net / wk</div>
                </td>
                {footerRuns.map((run, ri) => {
                  const net = run.rev - run.cost
                  const hasActivity = run.rev > 0 || run.cost > 0
                  return (
                    <td key={ri} colSpan={run.span} style={{
                      width: run.span * CELL_W,
                      borderLeft: colBorderLeft(run.startIdx),
                    }} className="border-r border-fg-border/30 px-1 py-1 align-top overflow-hidden">
                      {hasActivity && (
                        <div className="text-center leading-tight whitespace-nowrap">
                          <div className="text-[10px] text-fg-heading/80 tabular-nums">{fmtK(run.rev)}</div>
                          <div className="text-[10px] text-fg-muted/50 tabular-nums">{fmtK(run.cost)}</div>
                          <div className={`text-[10px] font-medium tabular-nums ${net >= 0 ? 'text-green-600/90' : 'text-amber-600/90'}`}>
                            {net >= 0 ? '+' : ''}{fmtK(net)}
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 rounded-sm" style={{ background: '#8A8580' }} />
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">Formation (≥40% margin)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-3 rounded-sm" style={{ background: '#C8A870' }} />
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">&lt;30% margin</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-4" style={{ background: '#ef444480' }} />
          <span className="text-[10px] font-light text-fg-muted uppercase tracking-wide">Today</span>
        </div>
        <span className="text-[10px] font-light text-fg-muted ml-4">
          Drag to draw · drag bar to move · click bar to edit · + to add subtask · ◆ for milestones
        </span>
      </div>

      {/* Segment Popover */}
      {popover && (() => {
        const entry = entries.find(e => e.category === popover.category)
        let seg: GanttSegment | undefined
        if (popover.subtaskId) {
          seg = entry?.subtasks?.find(st => st.id === popover.subtaskId)?.segments.find(s => s.id === popover.segId)
        } else {
          seg = entry?.segments.find(s => s.id === popover.segId)
        }
        if (!seg) return null
        const cat = categories.find(c => c.category === popover.category)
        const labBudget = cat?.cost.labour ?? 0
        const matBudget = cat?.cost.material ?? 0
        const subBudget = cat?.cost.subcontractor ?? 0
        const eqBudget = cat?.cost.equipment ?? 0
        // The scope's full period set (post-balance) so the popover's live breakdown shows every period.
        const siblingSegs = popover.subtaskId
          ? (entry?.subtasks?.find(st => st.id === popover.subtaskId)?.segments ?? [])
          : (entry?.segments ?? [])
        return (
          <SegmentPopover
            key={`${popover.subtaskId ?? 'main'}-${popover.segId}`}
            seg={seg}
            siblingSegs={siblingSegs}
            labourBudget={labBudget}
            materialsBudget={matBudget}
            subBudget={subBudget}
            equipmentBudget={eqBudget}
            crew={crewSize}
            anchorRef={popoverAnchorRef}
            onUpdate={updated => handleSegmentUpdate(popover.category, updated, popover.subtaskId)}
            onDelete={() => handleSegmentDelete(popover.category, popover.segId, popover.subtaskId)}
            onClose={() => setPopover(null)}
          />
        )
      })()}

      {/* Milestone Popover */}
      {milestonePopover && (() => {
        const m = milestones.find(m => m.id === milestonePopover)
        if (!m) return null
        return (
          <MilestonePopover
            milestone={m}
            anchorRef={milestoneAnchorRef}
            onUpdate={handleMilestoneUpdate}
            onDelete={() => handleMilestoneDelete(milestonePopover)}
            onClose={() => setMilestonePopover(null)}
          />
        )
      })()}
    </div>
  )
}
