'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects,
  loadEstimatesByProject,
  loadGanttEntries,
  saveGanttEntries,
  deleteWeeklyRevenueByProject,
  saveWeeklyRevenue,
} from '@/lib/storage'
import {
  formatCurrency,
  generateId,
  formatDayMonth,
  snapToFriday,
  toISODate,
  SHORT_MONTH_NAMES,
} from '@/lib/utils'
import type { Project, Estimate, GanttEntry, GanttSegment, GanttSubtask, WeeklyRevenue } from '@/types'
import { Check, Plus, X, ChevronDown, ChevronRight, Diamond } from 'lucide-react'

// ── constants ─────────────────────────────────────────────────────────────────
const CELL_W_WEEKS = 48
const CELL_W_DAYS = 24
const WEEK_COUNT = 52
const COL_CATEGORY = 200
const COL_CREW = 64
const COL_BUDGET = 76

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F']
const MILESTONE_PRESETS = ['Practical Completion', 'Pool Dig', 'Steel Complete', 'Handover', 'Concrete Pour']
const MILESTONE_COLOURS = ['#8A8580', '#C8A870', '#7A9E87', '#A07080', '#6A8CA0']

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
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getNextFridays(count: number): Date[] {
  const fridays: Date[] = []
  const d = new Date()
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
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
  const totalWeeks = Math.min(12, fridays.length)
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

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

function extractCategories(estimate: Estimate): CategorySummary[] {
  const map: Record<string, CategorySummary> = {}
  for (const item of estimate.lineItems) {
    if (!map[item.category]) {
      map[item.category] = { category: item.category, crewType: item.crewType, budgetedRevenue: 0, budgetedCost: 0 }
    }
    map[item.category].budgetedRevenue += item.revenue
    map[item.category].budgetedCost += item.total
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

function saveMilestones(projectId: string, milestones: Milestone[]) {
  localStorage.setItem(`fg_gantt_milestones_${projectId}`, JSON.stringify(milestones))
}

// ── Segment edit popover ──────────────────────────────────────────────────────

interface SegEditProps {
  seg: GanttSegment
  onUpdate: (seg: GanttSegment) => void
  onDelete: () => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}

function SegmentPopover({ seg, onUpdate, onDelete, onClose, anchorRef }: SegEditProps) {
  const [label, setLabel] = useState(seg.label ?? '')
  const [rev, setRev] = useState(String(Math.round(seg.revenueAllocation)))
  const [cost, setCost] = useState(String(Math.round(seg.costAllocation)))

  const apply = () => {
    onUpdate({
      ...seg,
      label: label || undefined,
      revenueAllocation: parseFloat(rev) || seg.revenueAllocation,
      costAllocation: parseFloat(cost) || seg.costAllocation,
    })
    onClose()
  }

  const rect = anchorRef.current?.getBoundingClientRect()
  const top = rect ? rect.bottom + window.scrollY + 4 : 100
  const left = rect ? rect.left + window.scrollX : 100

  return (
    <div
      className="fixed z-50 bg-fg-bg border border-fg-border shadow-xl p-4 w-64"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-light tracking-architectural uppercase text-fg-muted">Edit Segment</span>
        <button onClick={onClose}><X className="w-3 h-3 text-fg-muted" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-2xs font-light text-fg-muted block mb-1">Label (optional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Base prep"
            className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-2xs font-light text-fg-muted block mb-1">Revenue $</label>
            <input type="number" value={rev} onChange={e => setRev(e.target.value)}
              className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading tabular-nums" />
          </div>
          <div>
            <label className="text-2xs font-light text-fg-muted block mb-1">Cost $</label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)}
              className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading tabular-nums" />
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

  const rect = anchorRef.current?.getBoundingClientRect()
  const top = rect ? rect.bottom + window.scrollY + 4 : 100
  const left = rect ? rect.left + window.scrollX : 100

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

  const fridays = getNextFridays(WEEK_COUNT)
  const workingDays = getWorkingDays(fridays)
  const currentWeekIso = toISODate(fridays[0])
  const today = toISODate(new Date())

  const CELL_W = timeView === 'days' ? CELL_W_DAYS : CELL_W_WEEKS

  // Column set for current view
  const columns: Date[] = timeView === 'days' ? workingDays : fridays
  const colCount = columns.length

  useEffect(() => {
    const projs = loadProjects()
    const p = projs.find(p => p.id === id)
    if (!p) return router.push('/projects')
    setProject(p)
    const ests = loadEstimatesByProject(id)
    setEstimate(ests.find(e => e.status === 'accepted') ?? ests[0] ?? null)
    setEntries(loadGanttEntries(id))
    setMilestones(loadMilestones(id))
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

  const updateEntry = (updated: GanttEntry) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.category === updated.category)
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next }
      return [...prev, updated]
    })
  }

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

    // Check for existing segment hit
    if (subtaskId) {
      const subtask = entry.subtasks?.find(s => s.id === subtaskId)
      const hit = subtask?.segments.find(s => iso >= s.startDate && iso <= s.endDate)
      if (hit) return
    } else {
      const hit = entry.segments.find(s => iso >= s.startDate && iso <= s.endDate)
      if (hit) return
    }

    const newSegId = generateId()

    if (subtaskId) {
      const subtasks = entry.subtasks ?? []
      const updatedSubtasks = subtasks.map(st => {
        if (st.id !== subtaskId) return st
        const n = st.segments.length + 1
        const newSeg: GanttSegment = {
          id: newSegId, startDate: iso, endDate: iso, weekCount: 1,
          revenueAllocation: 0, costAllocation: 0,
        }
        return { ...st, segments: [...st.segments, newSeg] }
      })
      updateEntry({ ...entry, subtasks: updatedSubtasks })
    } else {
      const n = entry.segments.length + 1
      const newSeg: GanttSegment = {
        id: newSegId, startDate: iso, endDate: iso, weekCount: 1,
        revenueAllocation: evenSplit(entry.budgetedRevenue, n),
        costAllocation: evenSplit(entry.budgetedCost, n),
      }
      const updatedSegs = entry.segments.map(s => ({
        ...s,
        revenueAllocation: evenSplit(entry.budgetedRevenue, n),
        costAllocation: evenSplit(entry.budgetedCost, n),
      }))
      updateEntry({ ...entry, segments: [...updatedSegs, newSeg] })
    }

    setDrawing({ category, subtaskId, segId: newSegId, anchorIdx: colIdx })
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
        : Math.max(1, colIdx - drawing.anchorIdx + 1) // approximation for days

      if (subtaskId) {
        const updatedSubtasks = (entry.subtasks ?? []).map(st => {
          if (st.id !== subtaskId) return st
          return {
            ...st,
            segments: st.segments.map(s =>
              s.id === drawing.segId ? { ...s, startDate: startIso, endDate: endIso, weekCount: wc } : s
            ),
          }
        })
        updateEntry({ ...entry, subtasks: updatedSubtasks })
      } else {
        const updatedSegs = entry.segments.map(s =>
          s.id === drawing.segId ? { ...s, startDate: startIso, endDate: endIso, weekCount: wc } : s
        )
        updateEntry({ ...entry, segments: updatedSegs })
      }
    }

    // Handle moving
    if (moving) {
      const entry = entries.find(e => e.id === moving.entryId)
      if (!entry) return

      const offset = colIdx - moving.anchorColIdx

      // Calculate new dates by shifting
      const origStartIdx = colIndexForDate(moving.originalStart)
      const origEndIdx = colIndexForDate(moving.originalEnd)
      const newStartIdx = Math.max(0, Math.min(colCount - 1, origStartIdx + offset))
      const newEndIdx = Math.max(0, Math.min(colCount - 1, origEndIdx + offset))
      const newStart = dateForColIdx(newStartIdx)
      const newEnd = dateForColIdx(newEndIdx)
      const wc = weeksBetween(newStart, newEnd)

      if (moving.subtaskId) {
        const updatedSubtasks = (entry.subtasks ?? []).map(st => {
          if (st.id !== moving.subtaskId) return st
          return {
            ...st,
            segments: st.segments.map(s =>
              s.id === moving.segId ? { ...s, startDate: newStart, endDate: newEnd, weekCount: wc } : s
            ),
          }
        })
        updateEntry({ ...entry, subtasks: updatedSubtasks })
      } else {
        const updatedSegs = entry.segments.map(s =>
          s.id === moving.segId ? { ...s, startDate: newStart, endDate: newEnd, weekCount: wc } : s
        )
        updateEntry({ ...entry, segments: updatedSegs })
      }
    }
  }

  const handleMouseUp = () => {
    setDrawing(null)
    setMoving(null)
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
      updateEntry({ ...entry, segments: entry.segments.map(s => s.id === updated.id ? updated : s) })
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
    const n = entry.segments.length + 1
    const newSeg: GanttSegment = {
      id: generateId(), startDate: '', endDate: '', weekCount: 0,
      revenueAllocation: evenSplit(entry.budgetedRevenue, n),
      costAllocation: evenSplit(entry.budgetedCost, n),
    }
    const rebalanced = entry.segments.map(s => ({
      ...s,
      revenueAllocation: evenSplit(entry.budgetedRevenue, n),
      costAllocation: evenSplit(entry.budgetedCost, n),
    }))
    updateEntry({ ...entry, segments: [...rebalanced, newSeg] })
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
    saveMilestones(id, updated)
  }

  const handleMilestoneUpdate = (updated: Milestone) => {
    const next = milestones.map(m => m.id === updated.id ? updated : m)
    setMilestones(next)
    saveMilestones(id, next)
  }

  const handleMilestoneDelete = (milestoneId: string) => {
    const next = milestones.filter(m => m.id !== milestoneId)
    setMilestones(next)
    saveMilestones(id, next)
    setMilestonePopover(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = () => {
    const toSave = entries.filter(e => e.segments.length > 0 || (e.subtasks ?? []).some(st => st.segments.length > 0))
    saveGanttEntries(id, toSave)
    setSuccessMsg('Gantt saved')
    setTimeout(() => setSuccessMsg(''), 2000)
  }

  // ── Generate Revenue Forecast ─────────────────────────────────────────────

  const handleGenerateForecast = () => {
    if (!project) return
    const validEntries = entries.filter(e => e.segments.some(s => s.startDate && s.endDate && s.weekCount > 0))
    if (validEntries.length === 0) {
      setSuccessMsg('No Gantt segments with dates — draw some first')
      setTimeout(() => setSuccessMsg(''), 3000)
      return
    }

    deleteWeeklyRevenueByProject(id)

    const newEntries: WeeklyRevenue[] = []
    let totalWeekly = 0

    for (const entry of validEntries) {
      for (const seg of entry.segments) {
        if (!seg.startDate || !seg.endDate || seg.weekCount <= 0) continue
        const weeklyRev = seg.revenueAllocation / seg.weekCount
        const weeklyCost = seg.costAllocation / seg.weekCount
        const start = new Date(seg.startDate)
        for (let w = 0; w < seg.weekCount; w++) {
          const d = new Date(start)
          d.setDate(d.getDate() + w * 7)
          const snapped = snapToFriday(d)
          newEntries.push({
            id: generateId(),
            projectId: project.id,
            projectName: project.name,
            entity: project.entity,
            weekEnding: toISODate(snapped),
            weekNumber: w + 1,
            plannedRevenue: weeklyRev,
            actualInvoiced: 0,
            isDeposit: false,
            scheduledCost: weeklyCost,
            notes: `${entry.category}${seg.label ? ` — ${seg.label}` : ''} (Gantt)`,
          })
          totalWeekly++
        }
      }
    }

    for (const e of newEntries) saveWeeklyRevenue(e)
    saveGanttEntries(id, entries.filter(e => e.segments.length > 0))

    setSuccessMsg(`Revenue forecast generated — ${totalWeekly} weekly entries added to Revenue Calendar`)
    setTimeout(() => setSuccessMsg(''), 6000)
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
    const displayWeeks = Math.min(12, fridays.length)
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

  // ── Today indicator column index ──────────────────────────────────────────

  const todayColIdx = (() => {
    if (timeView === 'weeks') {
      // Find nearest Friday
      return fridays.findIndex(f => toISODate(f) === currentWeekIso)
    } else {
      return workingDays.findIndex(d => toISODate(d) === today)
    }
  })()

  // ── Month boundary column indices ──────────────────────────────────────────

  const monthBoundaryIndices = new Set<number>()
  for (let i = 1; i < columns.length; i++) {
    if (columns[i].getMonth() !== columns[i - 1].getMonth()) {
      monthBoundaryIndices.add(i)
    }
  }

  if (!project) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const fixedColsWidth = COL_CATEGORY + COL_CREW + COL_BUDGET + 80
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
      const isMonthBoundary = monthBoundaryIndices.has(i)
      const activeSegs = segs.filter(s => isSegmentActiveInCol(s, col))

      return (
        <td
          key={i}
          style={{
            width: CELL_W,
            minWidth: CELL_W,
            padding: 0,
            position: 'relative',
            borderLeft: isMonthBoundary ? '2px solid rgba(255,255,255,0.12)' : undefined,
          }}
          className={`border-r border-fg-border/30 cursor-crosshair ${isCurrentWeek && !activeSegs.length ? 'bg-fg-card/20' : ''}`}
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
                title={`Revenue: ${formatCurrency(weeklyRev)}/wk\nCost: ${formatCurrency(weeklyCost)}/wk\nMargin: ${marg}%${seg.label ? `\n${seg.label}` : ''}`}
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
      className="max-w-[1600px] mx-auto px-4 lg:px-8 py-12"
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
          <button onClick={handleSave}
            className="px-4 py-2 border border-fg-border text-fg-heading text-xs font-light tracking-architectural uppercase hover:border-fg-heading transition-colors">
            Save Gantt
          </button>
          <button onClick={handleGenerateForecast}
            className="px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors">
            Generate Revenue Forecast
          </button>
        </div>
      </div>

      {successMsg.includes('Revenue Calendar') && (
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
        <div className="overflow-x-auto border border-fg-border" style={{ userSelect: 'none' }}>
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
                    const isMonthBoundary = monthBoundaryIndices.has(i)
                    return (
                      <th key={i}
                        style={{
                          width: CELL_W_DAYS, minWidth: CELL_W_DAYS,
                          borderLeft: isMonthBoundary ? '2px solid rgba(255,255,255,0.12)' : undefined,
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
                <th className="bg-fg-bg border-b border-r border-fg-border px-2 py-2 text-right text-[10px] font-light tracking-wide uppercase text-fg-muted" style={{ width: COL_BUDGET }}>Budget Rev</th>
                <th className="bg-fg-bg border-b border-r border-fg-border px-2 py-2 text-center text-[10px] font-light tracking-wide uppercase text-fg-muted" style={{ width: 80 }}>Segs</th>
                {columns.map((col, i) => {
                  const iso = toISODate(col)
                  const isCurrentWeek = timeView === 'weeks' ? iso === currentWeekIso : iso === today
                  const isMonthBoundary = monthBoundaryIndices.has(i)
                  return (
                    <th key={i} style={{
                      width: CELL_W, minWidth: CELL_W,
                      borderLeft: isMonthBoundary ? '2px solid rgba(255,255,255,0.12)' : undefined,
                    }}
                      className={`border-b border-r border-fg-border py-1.5 text-center text-[10px] font-light text-fg-muted ${isCurrentWeek ? 'bg-fg-card/60' : 'bg-fg-bg'}`}>
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
                const revAllocated = segs.reduce((s, sg) => s + sg.revenueAllocation, 0)
                const revMismatch = segs.length > 0 && Math.abs(revAllocated - cat.budgetedRevenue) > 1
                const subtasks = entry.subtasks ?? []
                const isCollapsed = collapsedCategories.has(cat.category)
                const hasSubtasks = subtasks.length > 0

                return (
                  <>
                    {/* ── Category row ── */}
                    <tr key={cat.category} className="border-b border-fg-border/40 group" style={{ height: 44 }}>
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
                            {segs.length > 1 && (
                              <span className={`text-[10px] font-light ${revMismatch ? 'text-amber-600/70' : 'text-fg-muted/60'}`}>
                                {segs.length} segments{revMismatch ? ' ⚠ alloc mismatch' : ''}
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
                      {/* Budget */}
                      <td className="border-r border-fg-border px-2 py-2 text-right text-[11px] font-light text-fg-muted tabular-nums align-middle" style={{ width: COL_BUDGET }}>
                        <div>{formatCurrency(cat.budgetedRevenue)}</div>
                        <div className="text-[10px] text-fg-muted/50">{formatCurrency(cat.budgetedCost)} cost</div>
                      </td>
                      {/* + Split */}
                      <td className="border-r border-fg-border px-1 py-2 text-center align-middle" style={{ width: 80 }}>
                        <button
                          onClick={() => handleAddSplit(cat.category)}
                          title="Add another work period for this category"
                          className="flex items-center gap-0.5 text-[10px] font-light text-fg-muted hover:text-fg-heading transition-colors px-1.5 py-1 border border-fg-border/50 hover:border-fg-border"
                        >
                          <Plus className="w-2.5 h-2.5" /> Split
                        </button>
                      </td>
                      {/* Segment cells */}
                      {renderSegmentCells(entry, segs, cat.category, cat.crewType)}
                    </tr>

                    {/* ── Subtask rows ── */}
                    {!isCollapsed && subtasks.map(subtask => (
                      <tr key={subtask.id} className="border-b border-fg-border/20 group/sub" style={{ height: 36 }}>
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
                        <td className="border-r border-fg-border" style={{ width: 80 }} />
                        {renderSegmentCells(entry, subtask.segments, cat.category, cat.crewType, subtask.id, true)}
                      </tr>
                    ))}
                  </>
                )
              })}

              {/* ── Milestones row ── */}
              {milestones.length > 0 && (
                <tr className="border-t-2 border-fg-border/40" style={{ height: 48 }}>
                  <td colSpan={4} className="border-r border-fg-border px-3 py-2 text-[10px] font-light tracking-architectural uppercase text-fg-muted align-middle">
                    Milestones
                  </td>
                  {columns.map((col, i) => {
                    const iso = toISODate(col)
                    const isMonthBoundary = monthBoundaryIndices.has(i)
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
                          borderLeft: isMonthBoundary ? '2px solid rgba(255,255,255,0.12)' : undefined,
                        }}
                        className="border-r border-fg-border/30"
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
              <tr className="border-t-2 border-fg-border" style={{ height: 36 }}>
                <td colSpan={4} className="px-3 py-2 border-r border-fg-border text-[10px] font-light tracking-architectural uppercase text-fg-muted">
                  Weekly Cash Flow
                </td>
                {weekTotals.map((wt, i) => {
                  const net = wt.rev - wt.cost
                  const hasActivity = wt.rev > 0 || wt.cost > 0
                  const isMonthBoundary = monthBoundaryIndices.has(i)
                  return (
                    <td key={i} style={{
                      width: CELL_W,
                      borderLeft: isMonthBoundary ? '2px solid rgba(255,255,255,0.12)' : undefined,
                    }} className="border-r border-fg-border/30 px-0.5 py-1 align-top">
                      {hasActivity && (
                        <div className="text-center leading-tight">
                          <div className="text-[8px] text-fg-muted/80 tabular-nums truncate">{formatCurrency(wt.rev)}</div>
                          <div className="text-[8px] text-fg-muted/50 tabular-nums truncate">{formatCurrency(wt.cost)}</div>
                          <div className={`text-[8px] font-light tabular-nums truncate ${net >= 0 ? 'text-fg-muted/70' : 'text-amber-600/70'}`}>
                            {net >= 0 ? '+' : ''}{formatCurrency(net)}
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
        return (
          <SegmentPopover
            seg={seg}
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
