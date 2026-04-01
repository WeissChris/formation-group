'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { saveTakeoff, loadTakeoff } from '@/lib/storage'
import { generateId } from '@/lib/utils'
import type {
  TakeoffData,
  TakeoffGroup,
  TakeoffItem,
  TakeoffMeasurement,
  TakeoffPlan,
  EstimateLineItem,
} from '@/types'

interface TakeoffTabProps {
  estimateId: string
  lineItems: EstimateLineItem[]
  onUpdateLineItemQty: (lineItemId: string, qty: number, unit: string) => void
}

// ── Calibration state ──────────────────────────────────────────────────────
type CalibrationStep = 'idle' | 'picking-p1' | 'picking-p2' | 'entering-distance'

interface CalibrationState {
  step: CalibrationStep
  p1?: { x: number; y: number }  // normalised
  p2?: { x: number; y: number }
  distanceInput: string
}

const WASTAGE_PRESETS = [0, 5, 10, 15]

// ── Helpers ────────────────────────────────────────────────────────────────

/** Raw qty = sum of measurements (no wastage) */
function getRawQty(item: TakeoffItem): number {
  if (item.manualOverride !== undefined) return item.manualOverride
  return Math.round(item.measurements.reduce((s, m) => s + m.value, 0) * 100) / 100
}

/** Final qty = rawQty × (1 + wastage/100) */
function getFinalQty(item: TakeoffItem): number {
  const raw = getRawQty(item)
  return Math.round(raw * (1 + (item.wastagePercent ?? 0) / 100) * 100) / 100
}

/**
 * Calculate area from normalised points given image natural dimensions and scale (px/m).
 * Shoelace formula on pixel coords, divide by scale².
 */
function calcArea(
  points: { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number,
  scale: number
): number {
  if (points.length < 3 || scale <= 0) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const xi = points[i].x * imageWidth
    const yi = points[i].y * imageHeight
    const xj = points[j].x * imageWidth
    const yj = points[j].y * imageHeight
    area += xi * yj - xj * yi
  }
  return Math.round((Math.abs(area) / 2 / (scale * scale)) * 100) / 100
}

/**
 * Calculate polyline length from normalised points.
 * Sum pixel distances, divide by scale (px/m).
 */
function calcLength(
  points: { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number,
  scale: number
): number {
  if (points.length < 2 || scale <= 0) return 0
  let len = 0
  for (let i = 1; i < points.length; i++) {
    const dx = (points[i].x - points[i - 1].x) * imageWidth
    const dy = (points[i].y - points[i - 1].y) * imageHeight
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return Math.round((len / scale) * 100) / 100
}

/**
 * Distance between two normalised points in pixels.
 */
function pixelDist(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  imageWidth: number,
  imageHeight: number
): number {
  const dx = (p2.x - p1.x) * imageWidth
  const dy = (p2.y - p1.y) * imageHeight
  return Math.sqrt(dx * dx + dy * dy)
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeoffTab({ estimateId, lineItems, onUpdateLineItemQty }: TakeoffTabProps) {
  const [takeoff, setTakeoff] = useState<TakeoffData>({
    estimateId,
    plans: [],
    groups: [],
    activePlanId: undefined,
  })
  const [activeTool, setActiveTool] = useState<'select' | 'area' | 'length' | 'count'>('select')
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState<{ groupId: string; itemId: string } | null>(null)

  // Two-point scale calibration
  const [calib, setCalib] = useState<CalibrationState>({ step: 'idle', distanceInput: '' })
  const distInputRef = useRef<HTMLInputElement>(null)

  // Load saved takeoff on mount
  useEffect(() => {
    const saved = loadTakeoff(estimateId)
    if (saved) setTakeoff(saved)
  }, [estimateId])

  const activePlan = takeoff.plans.find(p => p.id === takeoff.activePlanId) ?? null

  // ── Core updater ───────────────────────────────────────────────────────

  const updateTakeoff = useCallback((updater: (t: TakeoffData) => TakeoffData) => {
    setTakeoff(prev => {
      const next = updater(prev)
      saveTakeoff(next)
      // Push final qty (with wastage) to linked estimate items
      next.groups.forEach(group => {
        group.items.forEach(item => {
          if (item.linkedLineItemId) {
            onUpdateLineItemQty(item.linkedLineItemId, getFinalQty(item), item.unit)
          }
        })
      })
      return next
    })
  }, [onUpdateLineItemQty])

  // ── Group actions ──────────────────────────────────────────────────────

  const addGroup = () => {
    const id = generateId()
    updateTakeoff(t => ({
      ...t,
      groups: [...t.groups, { id, name: 'NEW GROUP', items: [], collapsed: false }],
    }))
  }

  const deleteGroup = (groupId: string) => {
    updateTakeoff(t => ({ ...t, groups: t.groups.filter(g => g.id !== groupId) }))
    if (selectedGroupId === groupId) { setSelectedGroupId(null); setSelectedItemId(null) }
  }

  const toggleGroup = (groupId: string) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g),
    }))
  }

  const updateGroupName = (groupId: string, name: string) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g => g.id === groupId ? { ...g, name } : g),
    }))
  }

  // ── Item actions ───────────────────────────────────────────────────────

  const addItem = (groupId: string) => {
    const id = generateId()
    const newItem: TakeoffItem = {
      id, name: 'New item', quantity: 0, unit: 'm2',
      measurements: [], wastagePercent: 0,
    }
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g => g.id === groupId ? { ...g, items: [...g.items, newItem] } : g),
    }))
    setSelectedGroupId(groupId)
    setSelectedItemId(id)
  }

  const deleteItem = (groupId: string, itemId: string) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g =>
        g.id === groupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g
      ),
    }))
    if (selectedItemId === itemId) setSelectedItemId(null)
  }

  const patchItem = (groupId: string, itemId: string, patch: Partial<TakeoffItem>) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g =>
        g.id === groupId
          ? { ...g, items: g.items.map(i => i.id === itemId ? { ...i, ...patch } : i) }
          : g
      ),
    }))
  }

  const clearManualOverride = (groupId: string, itemId: string) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g =>
        g.id === groupId
          ? {
              ...g,
              items: g.items.map(i => {
                if (i.id !== itemId) return i
                const { manualOverride: _mo, ...rest } = i
                return rest
              }),
            }
          : g
      ),
    }))
  }

  // ── Measurement ────────────────────────────────────────────────────────

  const addMeasurementToSelected = useCallback((m: Omit<TakeoffMeasurement, 'id'>) => {
    if (!selectedGroupId || !selectedItemId) return
    const id = generateId()
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g =>
        g.id === selectedGroupId
          ? {
              ...g,
              items: g.items.map(i =>
                i.id === selectedItemId
                  ? { ...i, measurements: [...i.measurements, { ...m, id }] }
                  : i
              ),
            }
          : g
      ),
    }))
  }, [selectedGroupId, selectedItemId, updateTakeoff])

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height

    // ── Calibration flow ───────────────────────────────────────────────
    if (calib.step === 'picking-p1') {
      setCalib(c => ({ ...c, step: 'picking-p2', p1: { x: nx, y: ny } }))
      return
    }
    if (calib.step === 'picking-p2') {
      setCalib(c => ({ ...c, step: 'entering-distance', p2: { x: nx, y: ny } }))
      setTimeout(() => distInputRef.current?.focus(), 100)
      return
    }

    // ── Measurement tools ──────────────────────────────────────────────
    if (activeTool === 'select') return
    if (e.detail === 2) return  // ignore second click of double-click

    if (activeTool === 'count') {
      if (!activePlan?.scaleSet) return
      addMeasurementToSelected({ type: 'count', points: [{ x: nx, y: ny }], value: 1, planId: activePlan.id })
      return
    }

    setIsDrawing(true)
    setDrawingPoints(pts => [...pts, { x: nx, y: ny }])
  }

  const handleCanvasDoubleClick = () => {
    if (calib.step !== 'idle') return
    if (!isDrawing || !activePlan) { setDrawingPoints([]); setIsDrawing(false); return }

    const { imageWidth, imageHeight, scale } = activePlan

    if (activeTool === 'area' && drawingPoints.length >= 3) {
      const value = calcArea(drawingPoints, imageWidth, imageHeight, scale)
      addMeasurementToSelected({ type: 'area', points: drawingPoints, value, planId: activePlan.id })
    } else if (activeTool === 'length' && drawingPoints.length >= 2) {
      const value = calcLength(drawingPoints, imageWidth, imageHeight, scale)
      addMeasurementToSelected({ type: 'length', points: drawingPoints, value, planId: activePlan.id })
    }

    setDrawingPoints([])
    setIsDrawing(false)
  }

  // ── Plan upload ────────────────────────────────────────────────────────

  const addPlan = (name: string, dataUrl: string, width: number, height: number) => {
    const id = generateId()
    const plan: TakeoffPlan = {
      id, name, dataUrl,
      scale: 0, scaleSet: false,
      imageWidth: width,
      imageHeight: height,
    }
    updateTakeoff(t => ({
      ...t,
      plans: [...t.plans, plan],
      activePlanId: t.activePlanId || id,
    }))
  }

  const handlePlanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      // Render PDF first page to canvas using PDF.js
      try {
        const arrayBuffer = await file.arrayBuffer()
        // Dynamically import pdfjs-dist
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const totalPages = pdf.numPages

        // Render each page as a separate plan
        for (let pageNum = 1; pageNum <= Math.min(totalPages, 10); pageNum++) {
          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale: 2.0 }) // 2x for quality

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!

          await page.render({ canvasContext: ctx as any, viewport, canvas }).promise

          const dataUrl = canvas.toDataURL('image/png')
          const planName = totalPages > 1
            ? `${file.name} — Page ${pageNum}`
            : file.name

          addPlan(planName, dataUrl, viewport.width, viewport.height)
        }
      } catch (err) {
        console.error('PDF render error:', err)
        alert('Could not render PDF. Please try a different file or convert to image first.')
      }
    } else {
      // Image file
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        const img = new window.Image()
        img.onload = () => addPlan(file.name, dataUrl, img.naturalWidth, img.naturalHeight)
        img.src = dataUrl
      }
      reader.readAsDataURL(file)
    }
  }

  const setActivePlan = (planId: string) => {
    updateTakeoff(t => ({ ...t, activePlanId: planId }))
    setCalib({ step: 'idle', distanceInput: '' })
    setDrawingPoints([])
    setIsDrawing(false)
  }

  // ── Calibration ────────────────────────────────────────────────────────

  const startCalibration = () => {
    setActiveTool('select')
    setDrawingPoints([])
    setIsDrawing(false)
    setCalib({ step: 'picking-p1', distanceInput: '' })
  }

  const cancelCalibration = () => setCalib({ step: 'idle', distanceInput: '' })

  const confirmCalibration = () => {
    if (!activePlan || !calib.p1 || !calib.p2) return
    const realDist = parseFloat(calib.distanceInput)
    if (!realDist || realDist <= 0) return
    const pxDist = pixelDist(calib.p1, calib.p2, activePlan.imageWidth, activePlan.imageHeight)
    const scale = pxDist / realDist  // pixels per metre
    updateTakeoff(t => ({
      ...t,
      plans: t.plans.map(p => p.id === activePlan.id ? { ...p, scale, scaleSet: true } : p),
    }))
    setCalib({ step: 'idle', distanceInput: '' })
  }

  // ── Link to estimate ───────────────────────────────────────────────────

  const linkToEstimate = (groupId: string, itemId: string) => {
    setLinkTarget({ groupId, itemId })
    setLinkModalOpen(true)
  }

  const confirmLink = (lineItemId: string) => {
    if (!linkTarget) return
    patchItem(linkTarget.groupId, linkTarget.itemId, { linkedLineItemId: lineItemId })
    setLinkModalOpen(false)
    setLinkTarget(null)
  }

  const unlinkItem = (groupId: string, itemId: string) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g =>
        g.id === groupId
          ? {
              ...g,
              items: g.items.map(i => {
                if (i.id !== itemId) return i
                const { linkedLineItemId: _id, ...rest } = i
                return rest
              }),
            }
          : g
      ),
    }))
  }

  // ── Active plan measurements ────────────────────────────────────────────

  const getActivePlanMeasurements = (): { measurement: TakeoffMeasurement; item: TakeoffItem; group: TakeoffGroup }[] => {
    if (!activePlan) return []
    const results: { measurement: TakeoffMeasurement; item: TakeoffItem; group: TakeoffGroup }[] = []
    takeoff.groups.forEach(group => {
      group.items.forEach(item => {
        item.measurements.filter(m => m.planId === activePlan.id)
          .forEach(measurement => results.push({ measurement, item, group }))
      })
    })
    return results
  }

  // ── SVG rendering ─────────────────────────────────────────────────────

  const renderMeasurement = (m: TakeoffMeasurement, item: TakeoffItem, _group: TakeoffGroup) => {
    const color = m.type === 'area' ? '#3B82F6' : m.type === 'length' ? '#F59E0B' : '#10B981'
    const pts = m.points.map(p => `${p.x * 100}% ${p.y * 100}%`).join(' ')

    if (m.type === 'area') {
      const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length * 100
      const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length * 100
      return (
        <>
          <polygon points={pts} fill={color} fillOpacity={0.15} stroke={color} strokeWidth="1.5" />
          <text x={`${cx}%`} y={`${cy}%`} fill={color} fontSize="10" textAnchor="middle" fontWeight="600" dominantBaseline="middle">
            {m.value.toFixed(2)} m²
          </text>
        </>
      )
    }
    if (m.type === 'length') {
      return (
        <>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
          {m.points.map((p, i) => (
            <circle key={i} cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="2.5" fill={color} />
          ))}
          <text x={`${m.points[0].x * 100}%`} y={`${m.points[0].y * 100}%`} fill={color} fontSize="10" fontWeight="600" dy="-4">
            {m.value.toFixed(2)} lm
          </text>
        </>
      )
    }
    // count
    return (
      <>
        {m.points.map((p, i) => (
          <g key={i}>
            <circle cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="8" fill={color} fillOpacity={0.85} />
            <text x={`${p.x * 100}%`} y={`${p.y * 100}%`} fill="white" fontSize="9" textAnchor="middle" dominantBaseline="middle" fontWeight="700">
              {i + 1}
            </text>
          </g>
        ))}
      </>
    )
  }

  // ── Tool blocked? ──────────────────────────────────────────────────────
  const toolBlocked = activeTool !== 'select' && activePlan && !activePlan.scaleSet

  // ── Cursor ─────────────────────────────────────────────────────────────
  const canvasCursor = (() => {
    if (calib.step === 'picking-p1' || calib.step === 'picking-p2') return 'crosshair'
    if (toolBlocked) return 'not-allowed'
    if (activeTool !== 'select') return 'crosshair'
    return 'default'
  })()

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[500px]">

      {/* ═══ LEFT PANEL ═══════════════════════════════════════════════════ */}
      <div className="w-[40%] border-r border-fg-border flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-fg-border flex items-center justify-between shrink-0">
          <p className="text-xs font-medium tracking-wide uppercase text-fg-heading">Takeoff Items</p>
          <button onClick={addGroup} className="text-xs text-fg-muted hover:text-fg-heading transition-colors">
            + Add Group
          </button>
        </div>

        {/* Groups list */}
        <div className="flex-1 overflow-y-auto">
          {takeoff.groups.map(group => (
            <div key={group.id}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-fg-card/30 border-b border-fg-border/30">
                <button onClick={() => toggleGroup(group.id)} className="text-fg-muted text-xs shrink-0">
                  {group.collapsed ? '▶' : '▼'}
                </button>
                <input
                  value={group.name}
                  onChange={e => updateGroupName(group.id, e.target.value)}
                  className="flex-1 text-xs font-medium text-fg-heading bg-transparent outline-none uppercase tracking-wide min-w-0"
                />
                <button onClick={() => addItem(group.id)} className="text-fg-muted hover:text-fg-heading text-xs shrink-0">+ Item</button>
                <button onClick={() => deleteGroup(group.id)} className="text-fg-muted hover:text-red-400 text-xs shrink-0">×</button>
              </div>

              {/* Items */}
              {!group.collapsed && group.items.map(item => {
                const rawQty = getRawQty(item)
                const finalQty = getFinalQty(item)
                const hasWastage = (item.wastagePercent ?? 0) > 0
                const isSelected = selectedItemId === item.id

                return (
                  <div key={item.id}>
                    {/* Item row */}
                    <div
                      onClick={() => { setSelectedGroupId(group.id); setSelectedItemId(item.id) }}
                      className={`flex items-center gap-1.5 px-4 py-2 border-b border-fg-border/20 cursor-pointer hover:bg-fg-card/20 transition-colors ${isSelected ? 'bg-fg-card/40 border-l-2 border-l-blue-500' : 'pl-6'}`}
                    >
                      {/* Measurement dot */}
                      {item.measurements.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      )}
                      {/* Name */}
                      <input
                        value={item.name}
                        onChange={e => patchItem(group.id, item.id, { name: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 text-xs text-fg-heading bg-transparent outline-none min-w-0"
                        placeholder="Item name..."
                      />
                      {/* Qty display */}
                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {hasWastage ? (
                          <span className="text-xs tabular-nums text-fg-muted">{rawQty.toFixed(2)}→</span>
                        ) : null}
                        <input
                          type="number"
                          value={item.manualOverride !== undefined ? item.manualOverride : rawQty}
                          onChange={e => patchItem(group.id, item.id, { manualOverride: parseFloat(e.target.value) || 0 })}
                          className={`w-14 text-xs text-right bg-fg-card/30 px-1 py-0.5 rounded outline-none tabular-nums ${item.manualOverride !== undefined ? 'text-amber-400' : 'text-fg-heading'}`}
                          title={item.manualOverride !== undefined ? 'Manual override active' : 'Qty from measurements'}
                        />
                        {item.manualOverride !== undefined && (
                          <button
                            onClick={() => clearManualOverride(group.id, item.id)}
                            title="Clear manual override"
                            className="text-amber-400 hover:text-fg-heading text-xs px-0.5"
                          >
                            ✏
                          </button>
                        )}
                        {hasWastage && (
                          <span className="text-xs tabular-nums text-green-400 font-medium">=&nbsp;{finalQty.toFixed(2)}</span>
                        )}
                      </div>
                      {/* Unit */}
                      <select
                        value={item.unit}
                        onChange={e => patchItem(group.id, item.id, { unit: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-fg-muted bg-transparent outline-none shrink-0"
                      >
                        {['m2', 'lm', 'ea', 'm3', 'hour', 'Allowance'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                      {/* Link */}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (item.linkedLineItemId) unlinkItem(group.id, item.id)
                          else linkToEstimate(group.id, item.id)
                        }}
                        title={item.linkedLineItemId ? 'Linked — click to unlink' : 'Link to estimate line item'}
                        className={`text-xs px-1 shrink-0 ${item.linkedLineItemId ? 'text-green-500' : 'text-fg-muted hover:text-fg-heading'}`}
                      >
                        {item.linkedLineItemId ? '✓' : '→'}
                      </button>
                      {/* Delete */}
                      <button onClick={e => { e.stopPropagation(); deleteItem(group.id, item.id) }} className="text-fg-muted hover:text-red-400 text-xs shrink-0">×</button>
                    </div>

                    {/* Wastage row — only shown when item is selected */}
                    {isSelected && (
                      <div className="flex items-center gap-2 px-6 py-1.5 bg-fg-card/20 border-b border-fg-border/20" onClick={e => e.stopPropagation()}>
                        <span className="text-2xs text-fg-muted shrink-0">Wastage:</span>
                        {WASTAGE_PRESETS.map(pct => (
                          <button
                            key={pct}
                            onClick={() => patchItem(group.id, item.id, { wastagePercent: pct })}
                            className={`text-2xs px-1.5 py-0.5 border rounded transition-colors ${
                              item.wastagePercent === pct
                                ? 'bg-fg-dark text-white border-fg-dark'
                                : 'border-fg-border text-fg-muted hover:text-fg-heading'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                        <input
                          type="number"
                          value={item.wastagePercent ?? 0}
                          onChange={e => patchItem(group.id, item.id, { wastagePercent: parseFloat(e.target.value) || 0 })}
                          className="w-12 text-2xs bg-fg-card/30 px-1 py-0.5 rounded outline-none border border-fg-border tabular-nums text-right"
                          placeholder="%"
                        />
                        <span className="text-2xs text-fg-muted">%</span>
                        {hasWastage && (
                          <span className="ml-auto text-2xs text-fg-muted">
                            {rawQty.toFixed(2)} + {item.wastagePercent}% = <span className="text-green-400 font-medium">{finalQty.toFixed(2)} {item.unit}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {takeoff.groups.length === 0 && (
            <div className="p-8 text-center text-xs text-fg-muted">
              <p className="mb-3">No takeoff groups yet.</p>
              <button
                onClick={addGroup}
                className="px-3 py-1.5 border border-fg-border text-fg-muted hover:text-fg-heading transition-colors text-xs uppercase tracking-wide"
              >
                + Add First Group
              </button>
            </div>
          )}
        </div>

        {/* Footer status */}
        <div className="px-4 py-2 border-t border-fg-border shrink-0">
          {selectedItemId ? (
            <p className="text-2xs text-blue-400">
              ● {takeoff.groups.flatMap(g => g.items).find(i => i.id === selectedItemId)?.name ?? 'item'} — draw on plan to add measurements
            </p>
          ) : (
            <p className="text-2xs text-fg-muted">Select an item, then use measurement tools →</p>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL ══════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-fg-border flex items-center gap-2 flex-wrap shrink-0 min-h-[44px]">
          {/* Upload */}
          <label className="text-xs text-fg-muted hover:text-fg-heading cursor-pointer transition-colors shrink-0">
            📄 Upload Plan
            <input type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={handlePlanUpload} />
          </label>

          {/* Plan selector */}
          {takeoff.plans.length > 1 && (
            <select
              value={takeoff.activePlanId ?? ''}
              onChange={e => setActivePlan(e.target.value)}
              className="text-xs text-fg-muted bg-transparent outline-none border border-fg-border px-2 py-1"
            >
              {takeoff.plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {activePlan && calib.step === 'idle' && (
            <>
              <div className="w-px h-5 bg-fg-border mx-1 shrink-0" />

              {/* Measurement tools — blocked if no scale */}
              {([
                { tool: 'select' as const, label: '↖ Select' },
                { tool: 'area' as const, label: '⬡ Area' },
                { tool: 'length' as const, label: '↔ Length' },
                { tool: 'count' as const, label: '# Count' },
              ]).map(({ tool, label }) => (
                <button
                  key={tool}
                  onClick={() => {
                    if (tool !== 'select' && !activePlan.scaleSet) return
                    setActiveTool(tool)
                    setDrawingPoints([])
                    setIsDrawing(false)
                  }}
                  title={tool !== 'select' && !activePlan.scaleSet ? 'Set scale before measuring' : undefined}
                  className={`text-xs px-2 py-1 border transition-colors shrink-0 ${
                    activeTool === tool
                      ? 'bg-fg-dark text-white border-fg-dark'
                      : tool !== 'select' && !activePlan.scaleSet
                        ? 'border-fg-border/30 text-fg-muted/30 cursor-not-allowed'
                        : 'border-fg-border text-fg-muted hover:text-fg-heading'
                  }`}
                >
                  {label}
                </button>
              ))}

              <div className="w-px h-5 bg-fg-border mx-1 shrink-0" />

              {/* Scale calibration button */}
              <button
                onClick={startCalibration}
                className={`text-xs px-2 py-1 border transition-colors shrink-0 ${
                  activePlan.scaleSet
                    ? 'border-green-500/40 text-green-500'
                    : 'border-amber-500/60 text-amber-500 animate-pulse'
                }`}
              >
                {activePlan.scaleSet ? `Scale ✓ (${activePlan.scale.toFixed(1)} px/m)` : '⚠ Set Scale'}
              </button>
            </>
          )}

          {/* Calibration UI */}
          {activePlan && calib.step !== 'idle' && (
            <div className="flex items-center gap-2 flex-1">
              {calib.step === 'picking-p1' && (
                <span className="text-xs text-amber-400 font-medium">Click point 1 on plan…</span>
              )}
              {calib.step === 'picking-p2' && (
                <span className="text-xs text-amber-400 font-medium">Click point 2 on plan…</span>
              )}
              {calib.step === 'entering-distance' && (
                <>
                  <span className="text-xs text-fg-muted shrink-0">Real distance (m):</span>
                  <input
                    ref={distInputRef}
                    type="number"
                    value={calib.distanceInput}
                    onChange={e => setCalib(c => ({ ...c, distanceInput: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') confirmCalibration() }}
                    className="w-20 text-xs bg-fg-card/30 px-2 py-1 rounded outline-none border border-amber-500/60 tabular-nums"
                    placeholder="e.g. 5"
                    step="0.1"
                  />
                  <button onClick={confirmCalibration} className="text-xs px-3 py-1 bg-amber-500 text-white hover:bg-amber-600 transition-colors">
                    Confirm
                  </button>
                </>
              )}
              <button onClick={cancelCalibration} className="text-xs text-fg-muted hover:text-fg-heading ml-auto">
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden bg-[#F8F8F6]">
          {activePlan ? (
            <div className="relative w-full h-full overflow-auto">
              <div className="relative inline-block" style={{ minWidth: '100%', minHeight: '100%' }}>
                <img
                  src={activePlan.dataUrl}
                  alt="Plan"
                  className="max-w-none select-none block"
                  draggable={false}
                />
                <svg
                  className="absolute inset-0 w-full h-full"
                  style={{ cursor: canvasCursor, userSelect: 'none' }}
                  onClick={handleCanvasClick}
                  onDoubleClick={handleCanvasDoubleClick}
                >
                  {/* Existing measurements */}
                  {getActivePlanMeasurements().map(({ measurement, item, group }) => (
                    <g key={measurement.id} opacity={selectedItemId === item.id ? 1 : 0.45}>
                      {renderMeasurement(measurement, item, group)}
                    </g>
                  ))}

                  {/* Current drawing preview */}
                  {isDrawing && drawingPoints.length > 0 && (
                    <g>
                      <polyline
                        points={drawingPoints.map(p => `${p.x * 100}% ${p.y * 100}%`).join(' ')}
                        fill="none" stroke="#3B82F6" strokeWidth="2" strokeDasharray="5 3"
                      />
                      {activeTool === 'area' && drawingPoints.length >= 2 && (
                        <line
                          x1={`${drawingPoints[drawingPoints.length - 1].x * 100}%`}
                          y1={`${drawingPoints[drawingPoints.length - 1].y * 100}%`}
                          x2={`${drawingPoints[0].x * 100}%`}
                          y2={`${drawingPoints[0].y * 100}%`}
                          stroke="#3B82F6" strokeWidth="1" strokeDasharray="3 3" opacity={0.4}
                        />
                      )}
                      {drawingPoints.map((p, i) => (
                        <circle key={i} cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r="3" fill="#3B82F6" />
                      ))}
                    </g>
                  )}

                  {/* Calibration overlay */}
                  {(calib.step === 'picking-p2' || calib.step === 'entering-distance') && calib.p1 && (
                    <g>
                      <circle cx={`${calib.p1.x * 100}%`} cy={`${calib.p1.y * 100}%`} r="5" fill="#F59E0B" />
                      <text x={`${calib.p1.x * 100}%`} y={`${calib.p1.y * 100}%`} fill="#F59E0B" fontSize="10" dy="-8" textAnchor="middle">P1</text>
                    </g>
                  )}
                  {calib.step === 'entering-distance' && calib.p1 && calib.p2 && (
                    <g>
                      <line
                        x1={`${calib.p1.x * 100}%`} y1={`${calib.p1.y * 100}%`}
                        x2={`${calib.p2.x * 100}%`} y2={`${calib.p2.y * 100}%`}
                        stroke="#F59E0B" strokeWidth="2" strokeDasharray="6 3"
                      />
                      <circle cx={`${calib.p2.x * 100}%`} cy={`${calib.p2.y * 100}%`} r="5" fill="#F59E0B" />
                      <text x={`${calib.p2.x * 100}%`} y={`${calib.p2.y * 100}%`} fill="#F59E0B" fontSize="10" dy="-8" textAnchor="middle">P2</text>
                    </g>
                  )}
                </svg>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-fg-muted text-sm font-light mb-4">No plan uploaded</p>
                <label className="px-4 py-2 border border-fg-border text-fg-muted text-xs uppercase tracking-wide hover:text-fg-heading cursor-pointer transition-colors">
                  Upload Plan
                  <input type="file" accept="image/*,.pdf,application/pdf" className="hidden" onChange={handlePlanUpload} />
                </label>
                <p className="text-xs text-fg-muted mt-3">Supports JPG, PNG</p>
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="px-4 py-1.5 border-t border-fg-border shrink-0 flex items-center gap-4">
          {isDrawing && (
            <p className="text-2xs text-blue-400">
              {activeTool === 'area'
                ? `Drawing area — ${drawingPoints.length} point${drawingPoints.length !== 1 ? 's' : ''}. Double-click to close.`
                : `Drawing length — ${drawingPoints.length} point${drawingPoints.length !== 1 ? 's' : ''}. Double-click to finish.`}
            </p>
          )}
          {!isDrawing && activePlan && toolBlocked && (
            <p className="text-2xs text-amber-500">⚠ Set scale before using measurement tools</p>
          )}
          {!isDrawing && activePlan && activePlan.scaleSet && !toolBlocked && !selectedItemId && (
            <p className="text-2xs text-fg-muted">Select an item in the left panel, then choose a tool to measure</p>
          )}
        </div>
      </div>

      {/* ═══ Link modal ════════════════════════════════════════════════════ */}
      {linkModalOpen && linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-fg-darker/60 backdrop-blur-sm" onClick={() => setLinkModalOpen(false)} />
          <div className="relative bg-fg-bg border border-fg-border w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg-border">
              <h3 className="text-sm font-light tracking-wide text-fg-heading uppercase">Link to Estimate Line Item</h3>
              <button onClick={() => setLinkModalOpen(false)} className="text-fg-muted hover:text-fg-heading text-lg leading-none">×</button>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {lineItems.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm font-light text-fg-muted">No line items in estimate.</div>
              ) : (
                lineItems.map(li => (
                  <button
                    key={li.id}
                    onClick={() => confirmLink(li.id)}
                    className="w-full flex items-center justify-between px-5 py-3 border-b border-fg-border/40 hover:bg-fg-card/40 transition-colors text-left"
                  >
                    <div>
                      <p className="text-xs font-light text-fg-heading">{li.description}</p>
                      <p className="text-2xs font-light text-fg-muted mt-0.5">{li.category} · {li.uom} · {li.units} units</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
