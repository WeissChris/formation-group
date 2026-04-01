'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { loadProjects } from '@/lib/storage'
import { loadGanttEntries, loadWeeklyActuals, saveWeeklyActual } from '@/lib/storage'
import { generateId, toISODate, snapToFriday, formatCurrency } from '@/lib/utils'
import type { Project, GanttEntry, GanttSegment, WeeklyActual } from '@/types'
import { RefreshCw, Calendar, DollarSign, ClipboardList } from 'lucide-react'

type Tab = 'schedule' | 'budget' | 'log'

// Get the Friday of the current week
function getCurrentFriday(): Date {
  const today = new Date()
  const day = today.getDay() // 0=Sun, 5=Fri
  const diff = day <= 5 ? 5 - day : 7 - day + 5
  const friday = new Date(today)
  friday.setDate(today.getDate() + diff)
  return friday
}

// Get all Fridays for a gantt project range
function getProjectFridays(entries: GanttEntry[]): Date[] {
  if (entries.length === 0) return []
  let minDate: Date | null = null
  let maxDate: Date | null = null
  for (const entry of entries) {
    for (const seg of entry.segments) {
      const start = new Date(seg.startDate)
      const end = new Date(seg.endDate)
      if (!minDate || start < minDate) minDate = start
      if (!maxDate || end > maxDate) maxDate = end
    }
  }
  if (!minDate || !maxDate) return []
  const fridays: Date[] = []
  const cur = new Date(minDate)
  while (cur <= maxDate) {
    fridays.push(new Date(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return fridays
}

// Check if a date falls within a segment
function isWeekInSegment(friday: Date, seg: GanttSegment): boolean {
  const start = new Date(seg.startDate)
  const end = new Date(seg.endDate)
  return friday >= start && friday <= end
}

// Get week number within project
function getProjectWeekNumber(friday: Date, projectStart: string): number {
  const start = new Date(projectStart)
  const diff = (friday.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)
  return Math.floor(diff) + 1
}

// Get total project weeks
function getTotalProjectWeeks(projectStart: string, projectEnd: string): number {
  const start = new Date(projectStart)
  const end = new Date(projectEnd)
  return Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

// Format date as "Fri 21 Mar"
function formatFriday(date: Date): string {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Format date as "21 Mar"
function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// Get actuals for a category
function getCategoryActuals(actuals: WeeklyActual[], projectId: string, category: string) {
  return actuals.filter(a => a.projectId === projectId && a.category === category)
}

export default function ForemanPage() {
  const params = useParams()
  const pin = (params.pin as string || '').toUpperCase()

  const [project, setProject] = useState<Project | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [ganttEntries, setGanttEntries] = useState<GanttEntry[]>([])
  const [actuals, setActuals] = useState<WeeklyActual[]>([])
  const [tab, setTab] = useState<Tab>('schedule')
  const [refreshKey, setRefreshKey] = useState(0)

  // Log Costs state
  const currentFriday = getCurrentFriday()
  const [weekEnding, setWeekEnding] = useState(toISODate(currentFriday))
  const [costInputs, setCostInputs] = useState<Record<string, { supply: string; labour: string }>>({})
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    const projects = loadProjects()
    const found = projects.find(p => p.foremanPin && p.foremanPin.toUpperCase() === pin)
    if (!found) {
      setNotFound(true)
      return
    }
    setProject(found)
    const entries = loadGanttEntries(found.id)
    setGanttEntries(entries)
    setActuals(loadWeeklyActuals(found.id))
  }, [pin])

  useEffect(() => { load() }, [load, refreshKey])

  const handleRefresh = () => {
    setRefreshKey(k => k + 1)
    setSaved(false)
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#1a1a1a' }}>
        <div className="text-center max-w-xs">
          <div className="text-4xl mb-4">🔒</div>
          <p className="text-white font-light text-lg mb-2">Project not found.</p>
          <p className="text-gray-400 text-sm font-light">
            Please check your access code with your project manager.
          </p>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1a1a' }}>
        <div className="w-6 h-6 border border-gray-600 border-t-amber-400 rounded-full animate-spin" />
      </div>
    )
  }

  const currentFridayDate = getCurrentFriday()
  const currentWeek = getProjectWeekNumber(currentFridayDate, project.startDate)
  const totalWeeks = getTotalProjectWeeks(project.startDate, project.plannedCompletion)
  const fridays = getProjectFridays(ganttEntries)

  // Categories active this week (for log tab)
  const activeThisWeek = ganttEntries.filter(entry =>
    entry.segments.some(seg => isWeekInSegment(currentFridayDate, seg))
  )

  // For budget tab: compute spent per category
  function getCategorySpent(category: string): number {
    return actuals
      .filter(a => a.category === category)
      .reduce((s, a) => s + a.supplyCost + a.labourCost, 0)
  }

  function handleSaveCosts() {
    if (!project) return
    for (const entry of activeThisWeek) {
      const inputs = costInputs[entry.category] || { supply: '0', labour: '0' }
      const supplyCost = parseFloat(inputs.supply) || 0
      const labourCost = parseFloat(inputs.labour) || 0
      if (supplyCost === 0 && labourCost === 0) continue

      const actual: WeeklyActual = {
        id: generateId(),
        projectId: project.id,
        category: entry.category,
        weekEnding,
        supplyCost,
        labourCost,
      }
      saveWeeklyActual(actual)
    }
    setActuals(loadWeeklyActuals(project.id))
    setCostInputs({})
    setSaved(true)
    setTimeout(() => setSaved(false), 4000)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#1a1a1a', color: 'white', fontFamily: 'system-ui, sans-serif', fontSize: '16px' }}>

      {/* Header */}
      <div style={{ background: '#111', borderBottom: '1px solid #2a2a2a', padding: '12px 16px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* F logo */}
            <div style={{
              width: 32, height: 32, background: '#D4A017', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: '#111', flexShrink: 0,
            }}>
              F
            </div>
            <div>
              <div style={{ fontWeight: 500, letterSpacing: '0.08em', fontSize: 15 }}>
                {project.name} PROJECT
              </div>
              <div style={{ color: '#aaa', fontSize: 13, fontWeight: 300 }}>
                {project.foreman || 'Foreman'} · Week {Math.max(1, currentWeek)} of {totalWeeks}
              </div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            style={{ padding: 10, background: 'transparent', border: 'none', color: '#888', cursor: 'pointer' }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto pb-20">

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div>
            {ganttEntries.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p style={{ color: '#666', fontSize: 14 }}>No schedule data yet. Set up the Gantt in the admin portal.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Week header */}
                <div style={{ minWidth: fridays.length * 52 + 140, padding: '12px 0 0' }}>
                  {/* Column headers */}
                  <div style={{ display: 'flex', marginLeft: 140, marginBottom: 8 }}>
                    {fridays.map((friday, i) => {
                      const isCurrent = toISODate(friday) === toISODate(currentFridayDate)
                      return (
                        <div
                          key={i}
                          style={{
                            width: 52, flexShrink: 0, textAlign: 'center',
                            fontSize: 10, color: isCurrent ? '#D4A017' : '#555',
                            fontWeight: isCurrent ? 600 : 400,
                            padding: '0 2px',
                          }}
                        >
                          {formatShortDate(friday)}
                        </div>
                      )
                    })}
                  </div>

                  {/* Category rows */}
                  {ganttEntries.map((entry, ei) => (
                    <div key={ei} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                      {/* Category name */}
                      <div style={{
                        width: 140, flexShrink: 0, padding: '8px 12px',
                        fontSize: 13, color: '#ccc', fontWeight: 300,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {entry.category}
                      </div>
                      {/* Week cells */}
                      {fridays.map((friday, fi) => {
                        const isActive = entry.segments.some(seg => isWeekInSegment(friday, seg))
                        const isCurrent = toISODate(friday) === toISODate(currentFridayDate)
                        return (
                          <div
                            key={fi}
                            style={{
                              width: 52, flexShrink: 0, height: 36,
                              margin: '0 1px',
                              background: isActive
                                ? isCurrent ? '#D4A017' : '#3a3a3a'
                                : isCurrent ? '#2a2000' : 'transparent',
                              border: isCurrent ? '1px solid #D4A01760' : '1px solid transparent',
                              borderRadius: 3,
                            }}
                          />
                        )
                      })}
                    </div>
                  ))}

                  {/* Legend */}
                  <div style={{ display: 'flex', gap: 16, padding: '12px 16px', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666' }}>
                      <div style={{ width: 16, height: 12, background: '#D4A017', borderRadius: 2 }} />
                      This week active
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666' }}>
                      <div style={{ width: 16, height: 12, background: '#3a3a3a', borderRadius: 2 }} />
                      Scheduled
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#666' }}>
                      <div style={{ width: 16, height: 12, background: '#2a2000', border: '1px solid #D4A01760', borderRadius: 2 }} />
                      This week (off schedule)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* BUDGET TAB */}
        {tab === 'budget' && (
          <div style={{ padding: '16px' }}>
            {ganttEntries.length === 0 ? (
              <p style={{ color: '#666', fontSize: 14, textAlign: 'center', marginTop: 48 }}>No budget data yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {ganttEntries.map((entry, ei) => {
                  const budget = entry.budgetedCost
                  const spent = getCategorySpent(entry.category)
                  const remaining = budget - spent
                  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
                  const isOver = spent > budget

                  return (
                    <div key={ei} style={{ background: '#232323', borderRadius: 8, padding: '16px' }}>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 10, color: '#eee' }}>
                        {entry.category}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Budget</div>
                          <div style={{ fontSize: 14, color: '#eee', fontWeight: 300 }}>{formatCurrency(budget)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Spent</div>
                          <div style={{ fontSize: 14, color: isOver ? '#ef4444' : '#eee', fontWeight: 300 }}>{formatCurrency(spent)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Left</div>
                          <div style={{ fontSize: 14, color: isOver ? '#ef4444' : '#22c55e', fontWeight: 300 }}>
                            {isOver ? '-' : ''}{formatCurrency(Math.abs(remaining))}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ background: '#333', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: isOver ? '#ef4444' : '#22c55e',
                          borderRadius: 4,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <div style={{ fontSize: 11, color: '#666' }}>{pct}%</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* LOG COSTS TAB */}
        {tab === 'log' && (
          <div style={{ padding: '16px' }}>
            {/* Week ending picker */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                Week Ending
              </label>
              <input
                type="date"
                value={weekEnding}
                onChange={e => {
                  const snapped = snapToFriday(new Date(e.target.value))
                  setWeekEnding(toISODate(snapped))
                  setSaved(false)
                }}
                style={{
                  background: '#232323', border: '1px solid #333', color: 'white',
                  padding: '12px 14px', fontSize: 15, borderRadius: 6, width: '100%',
                  outline: 'none', minHeight: 52, boxSizing: 'border-box',
                }}
              />
            </div>

            {activeThisWeek.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <p style={{ color: '#666', fontSize: 14 }}>No categories scheduled for this week.</p>
                <p style={{ color: '#555', fontSize: 12, marginTop: 8 }}>Check the Schedule tab to see active weeks.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                {activeThisWeek.map((entry, ei) => {
                  const inputs = costInputs[entry.category] || { supply: '', labour: '' }
                  return (
                    <div key={ei} style={{ background: '#232323', borderRadius: 8, padding: '16px' }}>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 12, color: '#eee' }}>
                        {entry.category}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                            Supply Cost ($)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={inputs.supply}
                            onChange={e => setCostInputs(prev => ({
                              ...prev,
                              [entry.category]: { ...prev[entry.category] || { supply: '', labour: '' }, supply: e.target.value }
                            }))}
                            placeholder="0"
                            style={{
                              background: '#1a1a1a', border: '1px solid #444', color: 'white',
                              padding: '14px 12px', fontSize: 16, borderRadius: 6, width: '100%',
                              outline: 'none', minHeight: 52, boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                            Labour Cost ($)
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={inputs.labour}
                            onChange={e => setCostInputs(prev => ({
                              ...prev,
                              [entry.category]: { ...prev[entry.category] || { supply: '', labour: '' }, labour: e.target.value }
                            }))}
                            placeholder="0"
                            style={{
                              background: '#1a1a1a', border: '1px solid #444', color: 'white',
                              padding: '14px 12px', fontSize: 16, borderRadius: 6, width: '100%',
                              outline: 'none', minHeight: 52, boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Save button */}
            {activeThisWeek.length > 0 && (
              <button
                onClick={handleSaveCosts}
                style={{
                  width: '100%', minHeight: 56, background: '#D4A017', color: '#111',
                  border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
                  letterSpacing: '0.05em', cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                Save Costs
              </button>
            )}

            {/* Confirmation */}
            {saved && (
              <div style={{
                marginTop: 16, padding: '14px 16px', background: '#1a3a1a', border: '1px solid #2a5a2a',
                borderRadius: 8, color: '#22c55e', fontSize: 14, textAlign: 'center',
              }}>
                ✓ Costs saved for week ending{' '}
                {new Date(weekEnding + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#111', borderTop: '1px solid #2a2a2a',
        display: 'flex', height: 64, zIndex: 50,
      }}>
        {([
          { key: 'schedule', label: 'Schedule', Icon: Calendar },
          { key: 'budget', label: 'Budget', Icon: DollarSign },
          { key: 'log', label: 'Log Costs', Icon: ClipboardList },
        ] as const).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4, background: 'transparent', border: 'none',
              color: tab === key ? '#D4A017' : '#555', cursor: 'pointer', minHeight: 52,
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: 11, fontWeight: tab === key ? 600 : 400, letterSpacing: '0.05em' }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
