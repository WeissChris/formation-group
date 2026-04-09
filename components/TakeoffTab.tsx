'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  saveTakeoff,
  loadTakeoff,
  loadTakeoffTemplates,
  saveTakeoffTemplate,
  deleteTakeoffTemplate,
} from '@/lib/storage'
import { generateId } from '@/lib/utils'
import type {
  TakeoffData,
  TakeoffGroup,
  TakeoffItem,
  TakeoffLayer,
  TakeoffMeasurement,
  TakeoffPlan,
  TakeoffTemplate,
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

// ── Viewport / history ─────────────────────────────────────────────────────
interface Viewport {
  x: number   // translate px (screen)
  y: number   // translate px (screen)
  zoom: number
}

const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
const MIN_ZOOM = 0.1
const MAX_ZOOM = 20
const HISTORY_LIMIT = 50

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ── Layers ─────────────────────────────────────────────────────────────────
const LAYER_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#84CC16', // lime
]

const DEFAULT_LAYER: TakeoffLayer = {
  id: 'default',
  name: 'Default',
  color: '#3B82F6',
  visible: true,
}

function getLayers(t: TakeoffData): TakeoffLayer[] {
  if (!t.layers || t.layers.length === 0) return [DEFAULT_LAYER]
  return t.layers
}

function getItemLayer(t: TakeoffData, item: TakeoffItem): TakeoffLayer {
  const layers = getLayers(t)
  const byId = layers.find(l => l.id === item.layerId)
  return byId ?? layers[0]
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Raw qty = sum of measurements minus deductions (no wastage) */
function getRawQty(item: TakeoffItem): number {
  if (item.manualOverride !== undefined) return item.manualOverride
  const sum = item.measurements.reduce(
    (s, m) => s + (m.isDeduction ? -m.value : m.value),
    0
  )
  return Math.round(Math.max(0, sum) * 100) / 100
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

/** Segment length in metres between two normalised points. */
function segLenM(
  a: { x: number; y: number },
  b: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  scale: number
): number {
  if (scale <= 0) return 0
  return pixelDist(a, b, imageWidth, imageHeight) / scale
}

/** Snap a point so the line from anchor → point is on a 0/45/90° axis (shift-snap). */
function axisSnap(
  anchor: { x: number; y: number },
  p: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  const dx = (p.x - anchor.x) * imageWidth
  const dy = (p.y - anchor.y) * imageHeight
  const ang = Math.atan2(dy, dx)
  // Snap to nearest multiple of 45 degrees
  const step = Math.PI / 4
  const snappedAng = Math.round(ang / step) * step
  const len = Math.hypot(dx, dy)
  return {
    x: anchor.x + (Math.cos(snappedAng) * len) / imageWidth,
    y: anchor.y + (Math.sin(snappedAng) * len) / imageHeight,
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TakeoffTab({ estimateId, lineItems, onUpdateLineItemQty }: TakeoffTabProps) {
  const [takeoff, setTakeoff] = useState<TakeoffData>({
    estimateId,
    plans: [],
    groups: [],
    activePlanId: undefined,
  })
  const [activeTool, setActiveTool] = useState<'select' | 'area' | 'rect' | 'length' | 'count' | 'stamp'>('select')
  const [deductMode, setDeductMode] = useState(false)

  // Live drawing assistance
  const [cursorNorm, setCursorNorm] = useState<{ x: number; y: number } | null>(null)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [rectDrag, setRectDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null)
  const SNAP_CLOSE_PX = 12  // screen-pixel distance for polygon close-snap

  // Stamp / auto-count state
  const [stampState, setStampState] = useState<{
    phase: 'idle' | 'picking' | 'matching' | 'review'
    rect?: { x: number; y: number; w: number; h: number }   // normalised 0-1
    dragStart?: { x: number; y: number }
    hits: { x: number; y: number; score: number; accepted: boolean }[]
    scoreMax: number    // permissive threshold used during match run
    scoreFilter: number // user-adjustable filter (<= this score is kept)
  }>({ phase: 'idle', hits: [], scoreMax: 40, scoreFilter: 40 })
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState<{ groupId: string; itemId: string } | null>(null)

  // Two-point scale calibration
  const [calib, setCalib] = useState<CalibrationState>({ step: 'idle', distanceInput: '' })
  const distInputRef = useRef<HTMLInputElement>(null)

  // Viewport (pan/zoom)
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT)
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const panStateRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number; moved: boolean }>({
    active: false, startX: 0, startY: 0, origX: 0, origY: 0, moved: false,
  })
  const spaceDownRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  // Measurement selection
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null)
  const [hoveredMeasurementId, setHoveredMeasurementId] = useState<string | null>(null)

  // Templates
  const [templates, setTemplates] = useState<TakeoffTemplate[]>([])
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [saveTemplateTarget, setSaveTemplateTarget] = useState<{ groupId: string; name: string } | null>(null)

  useEffect(() => {
    setTemplates(loadTakeoffTemplates())
  }, [])

  // Undo / redo history
  const historyRef = useRef<{ past: TakeoffData[]; future: TakeoffData[] }>({ past: [], future: [] })
  const [historySizes, setHistorySizes] = useState<{ past: number; future: number }>({ past: 0, future: 0 })
  const syncHistorySizes = () => setHistorySizes({
    past: historyRef.current.past.length,
    future: historyRef.current.future.length,
  })

  // Load saved takeoff on mount
  useEffect(() => {
    const saved = loadTakeoff(estimateId)
    if (saved) setTakeoff(saved)
  }, [estimateId])

  const activePlan = takeoff.plans.find(p => p.id === takeoff.activePlanId) ?? null
  const layers = getLayers(takeoff)

  // ── Core updater ───────────────────────────────────────────────────────

  const commitTakeoff = useCallback((next: TakeoffData) => {
    saveTakeoff(next)
    next.groups.forEach(group => {
      group.items.forEach(item => {
        if (item.linkedLineItemId) {
          onUpdateLineItemQty(item.linkedLineItemId, getFinalQty(item), item.unit)
        }
      })
    })
  }, [onUpdateLineItemQty])

  const updateTakeoff = useCallback((updater: (t: TakeoffData) => TakeoffData, opts?: { skipHistory?: boolean }) => {
    setTakeoff(prev => {
      const next = updater(prev)
      if (next === prev) return prev
      if (!opts?.skipHistory) {
        const past = historyRef.current.past
        past.push(prev)
        if (past.length > HISTORY_LIMIT) past.shift()
        historyRef.current.future = []
        syncHistorySizes()
      }
      commitTakeoff(next)
      return next
    })
  }, [commitTakeoff])

  const undo = useCallback(() => {
    setTakeoff(current => {
      const past = historyRef.current.past
      if (past.length === 0) return current
      const prev = past.pop()!
      historyRef.current.future.push(current)
      if (historyRef.current.future.length > HISTORY_LIMIT) historyRef.current.future.shift()
      syncHistorySizes()
      commitTakeoff(prev)
      return prev
    })
  }, [commitTakeoff])

  const redo = useCallback(() => {
    setTakeoff(current => {
      const future = historyRef.current.future
      if (future.length === 0) return current
      const next = future.pop()!
      historyRef.current.past.push(current)
      if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift()
      syncHistorySizes()
      commitTakeoff(next)
      return next
    })
  }, [commitTakeoff])

  // ── Pan / zoom ─────────────────────────────────────────────────────────

  const fitToScreen = useCallback(() => {
    if (!activePlan || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pad = 24
    const zoom = Math.min(
      (rect.width - pad * 2) / activePlan.imageWidth,
      (rect.height - pad * 2) / activePlan.imageHeight,
    )
    const clamped = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
    const x = (rect.width - activePlan.imageWidth * clamped) / 2
    const y = (rect.height - activePlan.imageHeight * clamped) / 2
    setViewport({ x, y, zoom: clamped })
  }, [activePlan])

  // Fit on plan change
  useEffect(() => {
    if (!activePlan) return
    // Defer so container has measured dimensions
    const id = requestAnimationFrame(() => fitToScreen())
    return () => cancelAnimationFrame(id)
  }, [activePlan?.id, fitToScreen])

  const zoomAtPoint = useCallback((factor: number, cx: number, cy: number) => {
    setViewport(v => {
      const newZoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (newZoom === v.zoom) return v
      const ratio = newZoom / v.zoom
      return {
        zoom: newZoom,
        x: cx - (cx - v.x) * ratio,
        y: cy - (cy - v.y) * ratio,
      }
    })
  }, [])

  // Native non-passive wheel listener — required to call preventDefault().
  // (React's onWheel is passive, so e.preventDefault() is a no-op there.)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!activePlan) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      zoomAtPoint(factor, cx, cy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [activePlan, zoomAtPoint])

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Middle mouse or space-held = pan
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      e.preventDefault()
      panStateRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: viewport.x,
        origY: viewport.y,
        moved: false,
      }
      setIsPanning(true)
    }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panStateRef.current.active) return
      const dx = e.clientX - panStateRef.current.startX
      const dy = e.clientY - panStateRef.current.startY
      if (!panStateRef.current.moved && Math.hypot(dx, dy) > 3) {
        panStateRef.current.moved = true
      }
      setViewport(v => ({ ...v, x: panStateRef.current.origX + dx, y: panStateRef.current.origY + dy }))
    }
    const onUp = () => {
      if (!panStateRef.current.active) return
      panStateRef.current.active = false
      setIsPanning(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Stamp / auto-count ────────────────────────────────────────────────

  /**
   * Run grayscale template matching against the active plan's rendered image.
   * Returns hit centres in normalised 0-1 coords with a SAD-after-mean-centering
   * score (lower is better match).
   */
  const runStampMatch = useCallback(async (rect: { x: number; y: number; w: number; h: number }) => {
    if (!activePlan) return
    setStampState(s => ({ ...s, phase: 'matching' }))

    try {
      // Load the plan image
      const planImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = activePlan.dataUrl
      })

      // Work at a reduced resolution for speed
      const maxWork = 900
      const scale = Math.min(1, maxWork / Math.max(activePlan.imageWidth, activePlan.imageHeight))
      const workW = Math.max(1, Math.floor(activePlan.imageWidth * scale))
      const workH = Math.max(1, Math.floor(activePlan.imageHeight * scale))

      const planCanvas = document.createElement('canvas')
      planCanvas.width = workW
      planCanvas.height = workH
      const planCtx = planCanvas.getContext('2d')
      if (!planCtx) return
      planCtx.drawImage(planImg, 0, 0, workW, workH)
      const planImgData = planCtx.getImageData(0, 0, workW, workH).data

      // Build grayscale buffer
      const planGray = new Uint8ClampedArray(workW * workH)
      for (let i = 0, j = 0; i < planGray.length; i++, j += 4) {
        planGray[i] = (planImgData[j] + planImgData[j + 1] + planImgData[j + 2]) / 3
      }

      // Template region in work coords
      const rx = Math.max(0, Math.floor(rect.x * workW))
      const ry = Math.max(0, Math.floor(rect.y * workH))
      const rw = Math.min(workW - rx, Math.max(4, Math.floor(rect.w * workW)))
      const rh = Math.min(workH - ry, Math.max(4, Math.floor(rect.h * workH)))
      if (rw < 4 || rh < 4) {
        setStampState(s => ({ ...s, phase: 'idle' }))
        alert('Stamp region too small. Try drawing a larger box around the symbol.')
        return
      }

      // Extract template buffer
      const tplSize = rw * rh
      const tpl = new Uint8ClampedArray(tplSize)
      let tplSum = 0
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const v = planGray[(ry + y) * workW + (rx + x)]
          tpl[y * rw + x] = v
          tplSum += v
        }
      }
      const tplMean = tplSum / tplSize

      // Slide template with stride
      const stride = Math.max(2, Math.floor(Math.min(rw, rh) / 5))
      const hits: { x: number; y: number; score: number }[] = []
      const maxY = workH - rh
      const maxX = workW - rw
      const permissiveThreshold = 50  // avg abs diff per pixel (0-255 scale)

      for (let y = 0; y <= maxY; y += stride) {
        for (let x = 0; x <= maxX; x += stride) {
          // Compute plan-window mean in one pass
          let planSum = 0
          for (let dy = 0; dy < rh; dy++) {
            const pRowBase = (y + dy) * workW + x
            for (let dx = 0; dx < rw; dx++) {
              planSum += planGray[pRowBase + dx]
            }
          }
          const planMean = planSum / tplSize

          // Mean-centered SAD
          let sad = 0
          for (let dy = 0; dy < rh; dy++) {
            const pRowBase = (y + dy) * workW + x
            const tRowBase = dy * rw
            for (let dx = 0; dx < rw; dx++) {
              const diff = (tpl[tRowBase + dx] - tplMean) - (planGray[pRowBase + dx] - planMean)
              sad += diff < 0 ? -diff : diff
            }
          }
          const avgDiff = sad / tplSize
          if (avgDiff < permissiveThreshold) {
            hits.push({ x: x + rw / 2, y: y + rh / 2, score: avgDiff })
          }
        }
      }

      // Non-max suppression — keep the best hit within a radius of ~ template size
      const radius = Math.min(rw, rh) * 0.75
      hits.sort((a, b) => a.score - b.score)
      const kept: { x: number; y: number; score: number }[] = []
      for (const h of hits) {
        let suppress = false
        for (const k of kept) {
          if (Math.hypot(h.x - k.x, h.y - k.y) < radius) { suppress = true; break }
        }
        if (!suppress) kept.push(h)
      }

      // Convert back to normalised coords
      const normalised = kept.map(h => ({
        x: h.x / workW,
        y: h.y / workH,
        score: h.score,
        accepted: true,
      }))

      // Default filter: keep everything within 1.8× of the best score (or permissive cap)
      const bestScore = normalised.length > 0 ? normalised[0].score : permissiveThreshold
      const defaultFilter = Math.min(permissiveThreshold, Math.max(bestScore * 1.8, bestScore + 5))

      setStampState(s => ({
        ...s,
        phase: 'review',
        hits: normalised.map(h => ({ ...h, accepted: h.score <= defaultFilter })),
        scoreMax: permissiveThreshold,
        scoreFilter: defaultFilter,
      }))
    } catch (err) {
      console.error('Stamp match failed:', err)
      setStampState(s => ({ ...s, phase: 'idle' }))
      alert('Auto-count failed. See console for details.')
    }
  }, [activePlan])

  const acceptStampHits = () => {
    if (!selectedGroupId || !selectedItemId || !activePlan) {
      alert('Select an item in the left panel first.')
      return
    }
    const accepted = stampState.hits.filter(h => h.accepted && h.score <= stampState.scoreFilter)
    if (accepted.length === 0) {
      setStampState({ phase: 'idle', hits: [], scoreMax: 40, scoreFilter: 40 })
      return
    }
    // Create one count measurement per hit (consistent with handleCanvasClick for count tool)
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g =>
        g.id === selectedGroupId
          ? {
              ...g,
              items: g.items.map(i => {
                if (i.id !== selectedItemId) return i
                const additions: TakeoffMeasurement[] = accepted.map(h => ({
                  id: generateId(),
                  type: 'count' as const,
                  points: [{ x: h.x, y: h.y }],
                  value: 1,
                  planId: activePlan.id,
                }))
                return { ...i, measurements: [...i.measurements, ...additions] }
              }),
            }
          : g
      ),
    }))
    setStampState({ phase: 'idle', hits: [], scoreMax: 40, scoreFilter: 40 })
  }

  const cancelStamp = () => setStampState({ phase: 'idle', hits: [], scoreMax: 40, scoreFilter: 40 })

  // ── Measurement selection / delete ─────────────────────────────────────

  const selectMeasurement = useCallback((measurementId: string | null) => {
    setSelectedMeasurementId(measurementId)
    if (measurementId) {
      // Also focus the parent item
      for (const g of takeoff.groups) {
        for (const i of g.items) {
          if (i.measurements.some(m => m.id === measurementId)) {
            setSelectedGroupId(g.id)
            setSelectedItemId(i.id)
            return
          }
        }
      }
    }
  }, [takeoff])

  const deleteMeasurement = useCallback((measurementId: string) => {
    updateTakeoff(t => ({
      ...t,
      groups: t.groups.map(g => ({
        ...g,
        items: g.items.map(i => ({
          ...i,
          measurements: i.measurements.filter(m => m.id !== measurementId),
        })),
      })),
    }))
    setSelectedMeasurementId(null)
  }, [updateTakeoff])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // Track shift for axis-snap regardless of focus
      if (e.key === 'Shift') setShiftHeld(true)
      // Space for pan — track even when typing? No, only outside inputs
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        if (!spaceDownRef.current) {
          spaceDownRef.current = true
          setSpaceHeld(true)
        }
        e.preventDefault()
        return
      }
      if (isTypingTarget(e.target)) return

      const mod = e.ctrlKey || e.metaKey
      // Undo / redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      // Tools
      if (!mod) {
        if (e.key === 'v' || e.key === 'V') { setActiveTool('select'); setDrawingPoints([]); setIsDrawing(false); return }
        if (e.key === 'a' || e.key === 'A') { if (activePlan?.scaleSet) { setActiveTool('area'); setDrawingPoints([]); setIsDrawing(false) }; return }
        if (e.key === 'r' || e.key === 'R') { if (activePlan?.scaleSet) { setActiveTool('rect'); setDrawingPoints([]); setIsDrawing(false); setRectDrag(null) }; return }
        if (e.key === 'l' || e.key === 'L') { if (activePlan?.scaleSet) { setActiveTool('length'); setDrawingPoints([]); setIsDrawing(false) }; return }
        if (e.key === 'c' || e.key === 'C') { if (activePlan?.scaleSet) { setActiveTool('count'); setDrawingPoints([]); setIsDrawing(false) }; return }
        if (e.key === 's' || e.key === 'S') { if (activePlan?.scaleSet) { setActiveTool('stamp'); setDrawingPoints([]); setIsDrawing(false) }; return }
        if (e.key === 'f' || e.key === 'F' || e.key === '0') { fitToScreen(); return }
        if (e.key === 'd' || e.key === 'D') { setDeductMode(d => !d); return }
        if (e.key === 'Enter' && isDrawing && activePlan) {
          // Finish current drawing
          const { imageWidth, imageHeight, scale } = activePlan
          if (activeTool === 'area' && drawingPoints.length >= 3) {
            const value = calcArea(drawingPoints, imageWidth, imageHeight, scale)
            addMeasurementToSelected({ type: 'area', points: drawingPoints, value, planId: activePlan.id, isDeduction: deductMode || undefined })
          } else if (activeTool === 'length' && drawingPoints.length >= 2) {
            const value = calcLength(drawingPoints, imageWidth, imageHeight, scale)
            addMeasurementToSelected({ type: 'length', points: drawingPoints, value, planId: activePlan.id, isDeduction: deductMode || undefined })
          }
          setDrawingPoints([])
          setIsDrawing(false)
          return
        }
        if (e.key === 'Escape') {
          if (calib.step !== 'idle') { cancelCalibration(); return }
          if (stampState.phase !== 'idle') { cancelStamp(); return }
          if (rectDrag) { setRectDrag(null); return }
          if (isDrawing) { setDrawingPoints([]); setIsDrawing(false); return }
          setSelectedMeasurementId(null)
          setActiveTool('select')
          return
        }
        if (e.key === 'Backspace' && isDrawing && drawingPoints.length > 0) {
          e.preventDefault()
          setDrawingPoints(pts => {
            const next = pts.slice(0, -1)
            if (next.length === 0) setIsDrawing(false)
            return next
          })
          return
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedMeasurementId) {
          e.preventDefault()
          deleteMeasurement(selectedMeasurementId)
          return
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false)
      if (e.code === 'Space') {
        spaceDownRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activePlan?.scaleSet, calib.step, isDrawing, selectedMeasurementId, stampState.phase, undo, redo, fitToScreen, deleteMeasurement])

  // ── Layer actions ──────────────────────────────────────────────────────

  const ensureLayers = (t: TakeoffData): TakeoffLayer[] => {
    if (t.layers && t.layers.length > 0) return t.layers
    return [DEFAULT_LAYER]
  }

  const addLayer = () => {
    updateTakeoff(t => {
      const current = ensureLayers(t)
      const name = `Layer ${current.length + 1}`
      const color = LAYER_COLORS[current.length % LAYER_COLORS.length]
      const id = generateId()
      return { ...t, layers: [...current, { id, name, color, visible: true }] }
    })
  }

  const patchLayer = (layerId: string, patch: Partial<TakeoffLayer>) => {
    updateTakeoff(t => ({
      ...t,
      layers: ensureLayers(t).map(l => l.id === layerId ? { ...l, ...patch } : l),
    }))
  }

  const deleteLayer = (layerId: string) => {
    updateTakeoff(t => {
      const current = ensureLayers(t)
      if (current.length <= 1) return t  // never delete the last layer
      const remaining = current.filter(l => l.id !== layerId)
      const fallbackId = remaining[0].id
      return {
        ...t,
        layers: remaining,
        groups: t.groups.map(g => ({
          ...g,
          items: g.items.map(i => i.layerId === layerId ? { ...i, layerId: fallbackId } : i),
        })),
      }
    })
  }

  // ── Template actions ───────────────────────────────────────────────────

  const applyTemplate = (template: TakeoffTemplate) => {
    updateTakeoff(t => {
      let layers = ensureLayers(t)
      // Ensure every template layer name exists; create if missing
      const nextLayers = [...layers]
      for (const tplItem of template.items) {
        if (!tplItem.layerName) continue
        const existing = nextLayers.find(l => l.name.toLowerCase() === tplItem.layerName!.toLowerCase())
        if (!existing) {
          nextLayers.push({
            id: generateId(),
            name: tplItem.layerName,
            color: tplItem.layerColor ?? LAYER_COLORS[nextLayers.length % LAYER_COLORS.length],
            visible: true,
          })
        }
      }
      const resolveLayerId = (name?: string): string | undefined => {
        if (!name) return undefined
        return nextLayers.find(l => l.name.toLowerCase() === name.toLowerCase())?.id
      }
      const newGroup: TakeoffGroup = {
        id: generateId(),
        name: template.name.toUpperCase(),
        collapsed: false,
        items: template.items.map(ti => ({
          id: generateId(),
          name: ti.name,
          quantity: 0,
          unit: ti.unit,
          measurements: [],
          wastagePercent: ti.wastagePercent,
          layerId: resolveLayerId(ti.layerName),
        })),
      }
      return {
        ...t,
        layers: nextLayers,
        groups: [...t.groups, newGroup],
      }
    })
    setTemplatePickerOpen(false)
  }

  const saveGroupAsTemplate = (groupId: string, templateName: string) => {
    const group = takeoff.groups.find(g => g.id === groupId)
    if (!group || !templateName.trim()) return
    const tpl: TakeoffTemplate = {
      id: generateId(),
      name: templateName.trim(),
      description: `Saved from group '${group.name}'`,
      createdAt: new Date().toISOString(),
      items: group.items.map(i => {
        const layer = getItemLayer(takeoff, i)
        return {
          name: i.name,
          unit: i.unit,
          wastagePercent: i.wastagePercent,
          layerName: layer.name,
          layerColor: layer.color,
        }
      }),
    }
    saveTakeoffTemplate(tpl)
    setTemplates(loadTakeoffTemplates())
    setSaveTemplateTarget(null)
  }

  const removeTemplate = (templateId: string) => {
    deleteTakeoffTemplate(templateId)
    setTemplates(loadTakeoffTemplates())
  }

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

  const getNormalisedFromEvent = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    if (spaceDownRef.current) return

    // Stamp drag
    if (activeTool === 'stamp') {
      if (stampState.phase === 'matching' || stampState.phase === 'review') return
      e.stopPropagation()
      const { x, y } = getNormalisedFromEvent(e)
      setStampState(s => ({ ...s, phase: 'picking', dragStart: { x, y }, rect: { x, y, w: 0, h: 0 }, hits: [] }))
      return
    }

    // Rectangle area drag
    if (activeTool === 'rect') {
      if (!activePlan?.scaleSet) return
      if (!selectedGroupId || !selectedItemId) {
        alert('Select an item in the left panel first.')
        return
      }
      e.stopPropagation()
      const { x, y } = getNormalisedFromEvent(e)
      setRectDrag({ start: { x, y }, current: { x, y } })
      return
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // Always track cursor for live HUD
    const n = getNormalisedFromEvent(e)
    setCursorNorm(n)

    if (activeTool === 'stamp' && stampState.phase === 'picking' && stampState.dragStart) {
      const s = stampState.dragStart
      const rx = Math.min(s.x, n.x)
      const ry = Math.min(s.y, n.y)
      const rw = Math.abs(n.x - s.x)
      const rh = Math.abs(n.y - s.y)
      setStampState(ss => ({ ...ss, rect: { x: rx, y: ry, w: rw, h: rh } }))
      return
    }

    if (activeTool === 'rect' && rectDrag) {
      setRectDrag(rd => rd ? { ...rd, current: n } : rd)
      return
    }
  }

  const handleCanvasMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'stamp' && stampState.phase === 'picking' && stampState.rect) {
      e.stopPropagation()
      const rect = stampState.rect
      if (rect.w < 0.01 || rect.h < 0.01) {
        setStampState(s => ({ ...s, phase: 'idle', rect: undefined, dragStart: undefined }))
        return
      }
      runStampMatch(rect)
      return
    }

    if (activeTool === 'rect' && rectDrag && activePlan) {
      e.stopPropagation()
      const { start, current } = rectDrag
      const rx = Math.min(start.x, current.x)
      const ry = Math.min(start.y, current.y)
      const rw = Math.abs(current.x - start.x)
      const rh = Math.abs(current.y - start.y)
      setRectDrag(null)
      // Sanity check
      if (rw < 0.002 || rh < 0.002) return
      const corners = [
        { x: rx, y: ry },
        { x: rx + rw, y: ry },
        { x: rx + rw, y: ry + rh },
        { x: rx, y: ry + rh },
      ]
      const { imageWidth, imageHeight, scale } = activePlan
      const value = calcArea(corners, imageWidth, imageHeight, scale)
      addMeasurementToSelected({
        type: 'area',
        points: corners,
        value,
        planId: activePlan.id,
        isDeduction: deductMode || undefined,
      })
      return
    }
  }

  const handleCanvasMouseLeave = () => {
    setCursorNorm(null)
  }

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // Stamp / rect modes consume mouse via mouseup
    if (activeTool === 'stamp' || activeTool === 'rect') return
    // Ignore clicks that concluded a pan drag
    if (panStateRef.current.moved) {
      panStateRef.current.moved = false
      return
    }
    if (spaceDownRef.current) return  // space-drag mode consumes clicks
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
    if (activeTool === 'select') {
      // Click on empty canvas clears measurement selection
      setSelectedMeasurementId(null)
      return
    }
    if (e.detail === 2) return  // ignore second click of double-click

    // Guard: no active plan or unscaled
    if (!activePlan?.scaleSet) return
    // Guard: need a selected item before measuring
    if (!selectedGroupId || !selectedItemId) {
      alert('Select an item in the left panel first.')
      return
    }

    if (activeTool === 'count') {
      addMeasurementToSelected({ type: 'count', points: [{ x: nx, y: ny }], value: 1, planId: activePlan.id, isDeduction: deductMode || undefined })
      return
    }

    // Area / Length polygon/polyline
    const { imageWidth, imageHeight } = activePlan
    // Click-to-close: if drawing an area with >=3 pts and close to the first point, finish
    if (activeTool === 'area' && drawingPoints.length >= 3) {
      const dPx = pixelDist({ x: nx, y: ny }, drawingPoints[0], imageWidth, imageHeight) * (rect.width / imageWidth)
      if (dPx < SNAP_CLOSE_PX) {
        const value = calcArea(drawingPoints, imageWidth, imageHeight, activePlan.scale)
        addMeasurementToSelected({ type: 'area', points: drawingPoints, value, planId: activePlan.id, isDeduction: deductMode || undefined })
        setDrawingPoints([])
        setIsDrawing(false)
        return
      }
    }

    // Compute next point with axis-snap if Shift is held
    let next = { x: nx, y: ny }
    if (shiftHeld && drawingPoints.length > 0) {
      next = axisSnap(drawingPoints[drawingPoints.length - 1], next, imageWidth, imageHeight)
    }

    setIsDrawing(true)
    setDrawingPoints(pts => [...pts, next])
  }

  const handleCanvasDoubleClick = () => {
    if (calib.step !== 'idle') return
    if (!isDrawing || !activePlan) { setDrawingPoints([]); setIsDrawing(false); return }

    const { imageWidth, imageHeight, scale } = activePlan

    if (activeTool === 'area' && drawingPoints.length >= 3) {
      const value = calcArea(drawingPoints, imageWidth, imageHeight, scale)
      addMeasurementToSelected({ type: 'area', points: drawingPoints, value, planId: activePlan.id, isDeduction: deductMode || undefined })
    } else if (activeTool === 'length' && drawingPoints.length >= 2) {
      const value = calcLength(drawingPoints, imageWidth, imageHeight, scale)
      addMeasurementToSelected({ type: 'length', points: drawingPoints, value, planId: activePlan.id, isDeduction: deductMode || undefined })
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
      // Load PDF.js from CDN at runtime (bypasses webpack bundling issues entirely)
      const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155'
      try {
        const arrayBuffer = await file.arrayBuffer()

        // Dynamic import from CDN — the webpackIgnore comment prevents webpack from processing it
        const cdnUrl = `${PDFJS_CDN}/pdf.min.mjs`
        const pdfjsLib: any = await import(/* webpackIgnore: true */ cdnUrl)
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
        const pdf = await loadingTask.promise
        const totalPages = pdf.numPages

        // Render each page as a separate plan (cap at 20 to keep things sane)
        for (let pageNum = 1; pageNum <= Math.min(totalPages, 20); pageNum++) {
          const page = await pdf.getPage(pageNum)
          const vp = page.getViewport({ scale: 2.0 }) // 2x for quality

          const canvas = document.createElement('canvas')
          canvas.width = vp.width
          canvas.height = vp.height
          const ctx = canvas.getContext('2d')!

          await page.render({ canvasContext: ctx, viewport: vp }).promise

          const dataUrl = canvas.toDataURL('image/png')
          const planName = totalPages > 1
            ? `${file.name} — Page ${pageNum}`
            : file.name

          addPlan(planName, dataUrl, vp.width, vp.height)
        }
      } catch (err) {
        console.error('PDF render error:', err)
        alert(`Could not render PDF.\n\n${err instanceof Error ? err.message : String(err)}\n\nIf this persists, try converting the PDF to PNG/JPG and uploading that instead.`)
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
        const layer = getItemLayer(takeoff, item)
        if (!layer.visible) return
        item.measurements.filter(m => m.planId === activePlan.id)
          .forEach(measurement => results.push({ measurement, item, group }))
      })
    })
    return results
  }

  // ── SVG rendering ─────────────────────────────────────────────────────

  const renderMeasurement = (
    m: TakeoffMeasurement,
    item: TakeoffItem,
    _group: TakeoffGroup,
    opts?: { selected?: boolean; hovered?: boolean }
  ) => {
    const layer = getItemLayer(takeoff, item)
    const color = layer.color
    const pts = m.points.map(p => `${p.x * 100}% ${p.y * 100}%`).join(' ')
    const emphasis = opts?.selected ? 2.5 : opts?.hovered ? 2 : 1.5
    const fillAlpha = opts?.selected ? 0.28 : 0.15
    const isDeduct = !!m.isDeduction

    if (m.type === 'area') {
      const cx = m.points.reduce((s, p) => s + p.x, 0) / m.points.length * 100
      const cy = m.points.reduce((s, p) => s + p.y, 0) / m.points.length * 100
      return (
        <>
          <polygon
            points={pts}
            fill={isDeduct ? 'transparent' : color}
            fillOpacity={isDeduct ? 0 : fillAlpha}
            stroke={color}
            strokeWidth={emphasis}
            strokeDasharray={isDeduct ? '6 4' : undefined}
            vectorEffect="non-scaling-stroke"
          />
          <text x={`${cx}%`} y={`${cy}%`} fill={color} fontSize="10" textAnchor="middle" fontWeight="600" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
            {isDeduct ? '−' : ''}{m.value.toFixed(2)} m²
          </text>
        </>
      )
    }
    if (m.type === 'length') {
      return (
        <>
          <polyline
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth={emphasis + 0.5}
            strokeDasharray={isDeduct ? '6 4' : undefined}
            vectorEffect="non-scaling-stroke"
          />
          {m.points.map((p, i) => (
            <circle key={i} cx={`${p.x * 100}%`} cy={`${p.y * 100}%`} r={opts?.selected ? 4 : 2.5} fill={color} />
          ))}
          <text x={`${m.points[0].x * 100}%`} y={`${m.points[0].y * 100}%`} fill={color} fontSize="10" fontWeight="600" dy="-4" style={{ pointerEvents: 'none' }}>
            {isDeduct ? '−' : ''}{m.value.toFixed(2)} lm
          </text>
        </>
      )
    }
    // count
    return (
      <>
        {m.points.map((p, i) => (
          <g key={i}>
            <circle
              cx={`${p.x * 100}%`}
              cy={`${p.y * 100}%`}
              r={opts?.selected ? 10 : 8}
              fill={color}
              fillOpacity={0.85}
              stroke={opts?.selected ? '#000' : undefined}
              strokeWidth={opts?.selected ? 1 : 0}
              vectorEffect="non-scaling-stroke"
            />
            <text x={`${p.x * 100}%`} y={`${p.y * 100}%`} fill="white" fontSize="9" textAnchor="middle" dominantBaseline="middle" fontWeight="700" style={{ pointerEvents: 'none' }}>
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
      <div className="w-[34%] min-w-[340px] max-w-[520px] border-r border-fg-border flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-fg-border flex items-center justify-between shrink-0 gap-2">
          <p className="text-xs font-medium tracking-wide uppercase text-fg-heading">Takeoff Items</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setTemplatePickerOpen(true)} className="text-xs text-fg-muted hover:text-fg-heading transition-colors">
              ☰ Template
            </button>
            <button onClick={addGroup} className="text-xs text-fg-muted hover:text-fg-heading transition-colors">
              + Add Group
            </button>
          </div>
        </div>

        {/* Layers panel */}
        <div className="px-4 py-2 border-b border-fg-border bg-fg-card/10 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-2xs font-medium tracking-wide uppercase text-fg-muted">Layers</p>
            <button onClick={addLayer} className="text-2xs text-fg-muted hover:text-fg-heading transition-colors">
              + Layer
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {layers.map(layer => (
              <div key={layer.id} className="flex items-center gap-1.5 py-0.5">
                <button
                  onClick={() => patchLayer(layer.id, { visible: !layer.visible })}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                  className="text-2xs text-fg-muted hover:text-fg-heading w-4 text-center shrink-0"
                >
                  {layer.visible ? '👁' : '·'}
                </button>
                <input
                  type="color"
                  value={layer.color}
                  onChange={e => patchLayer(layer.id, { color: e.target.value })}
                  className="w-4 h-4 border border-fg-border cursor-pointer shrink-0 bg-transparent"
                  title="Layer colour"
                />
                <input
                  value={layer.name}
                  onChange={e => patchLayer(layer.id, { name: e.target.value })}
                  className="flex-1 text-2xs text-fg-heading bg-transparent outline-none min-w-0"
                />
                {layers.length > 1 && (
                  <button
                    onClick={() => deleteLayer(layer.id)}
                    title="Delete layer"
                    className="text-2xs text-fg-muted hover:text-red-400 shrink-0"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
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
                <button
                  onClick={() => setSaveTemplateTarget({ groupId: group.id, name: group.name })}
                  title="Save this group as a reusable template"
                  className="text-fg-muted hover:text-fg-heading text-xs shrink-0"
                >
                  ☆
                </button>
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
                      {/* Layer swatch */}
                      <span
                        className="w-2 h-2 rounded-full shrink-0 border border-black/20"
                        style={{ background: getItemLayer(takeoff, item).color }}
                        title={`Layer: ${getItemLayer(takeoff, item).name}`}
                      />
                      {/* Measurement dot */}
                      {item.measurements.length > 0 && (
                        <span className="w-1 h-1 rounded-full bg-fg-heading/60 shrink-0" />
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

                    {/* Wastage + layer row — only shown when item is selected */}
                    {isSelected && (
                      <div className="flex items-center gap-2 px-6 py-1.5 bg-fg-card/20 border-b border-fg-border/20 flex-wrap" onClick={e => e.stopPropagation()}>
                        <span className="text-2xs text-fg-muted shrink-0">Layer:</span>
                        <select
                          value={item.layerId ?? layers[0].id}
                          onChange={e => patchItem(group.id, item.id, { layerId: e.target.value })}
                          className="text-2xs text-fg-heading bg-fg-card/30 border border-fg-border px-1 py-0.5 outline-none shrink-0"
                        >
                          {layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <span className="w-px h-3 bg-fg-border mx-1" />
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

              {/* View controls */}
              <button
                onClick={() => {
                  if (!containerRef.current) return
                  const r = containerRef.current.getBoundingClientRect()
                  zoomAtPoint(1.2, r.width / 2, r.height / 2)
                }}
                title="Zoom in (wheel up)"
                className="text-xs px-2 py-1 border border-fg-border text-fg-muted hover:text-fg-heading transition-colors shrink-0"
              >
                +
              </button>
              <button
                onClick={() => {
                  if (!containerRef.current) return
                  const r = containerRef.current.getBoundingClientRect()
                  zoomAtPoint(1 / 1.2, r.width / 2, r.height / 2)
                }}
                title="Zoom out (wheel down)"
                className="text-xs px-2 py-1 border border-fg-border text-fg-muted hover:text-fg-heading transition-colors shrink-0"
              >
                −
              </button>
              <button
                onClick={fitToScreen}
                title="Fit to screen (F)"
                className="text-xs px-2 py-1 border border-fg-border text-fg-muted hover:text-fg-heading transition-colors shrink-0"
              >
                ⤢ Fit
              </button>
              <span className="text-2xs text-fg-muted tabular-nums shrink-0 px-1">{Math.round(viewport.zoom * 100)}%</span>

              <div className="w-px h-5 bg-fg-border mx-1 shrink-0" />

              {/* Undo / redo */}
              <button
                onClick={undo}
                disabled={historySizes.past === 0}
                title="Undo (Ctrl+Z)"
                className="text-xs px-2 py-1 border border-fg-border text-fg-muted hover:text-fg-heading transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↶
              </button>
              <button
                onClick={redo}
                disabled={historySizes.future === 0}
                title="Redo (Ctrl+Shift+Z)"
                className="text-xs px-2 py-1 border border-fg-border text-fg-muted hover:text-fg-heading transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ↷
              </button>

              <div className="w-px h-5 bg-fg-border mx-1 shrink-0" />

              {/* Measurement tools — blocked if no scale */}
              {([
                { tool: 'select' as const, label: '↖ Select', hotkey: 'V' },
                { tool: 'area' as const, label: '⬡ Polygon', hotkey: 'A' },
                { tool: 'rect' as const, label: '▭ Rect', hotkey: 'R' },
                { tool: 'length' as const, label: '↔ Length', hotkey: 'L' },
                { tool: 'count' as const, label: '# Count', hotkey: 'C' },
                { tool: 'stamp' as const, label: '⊞ Stamp', hotkey: 'S' },
              ]).map(({ tool, label, hotkey }) => (
                <button
                  key={tool}
                  onClick={() => {
                    if (tool !== 'select' && !activePlan.scaleSet) return
                    setActiveTool(tool)
                    setDrawingPoints([])
                    setIsDrawing(false)
                  }}
                  title={tool !== 'select' && !activePlan.scaleSet ? 'Set scale before measuring' : `${label} (${hotkey})`}
                  className={`text-xs px-2 py-1 border transition-colors shrink-0 flex items-center gap-1 ${
                    activeTool === tool
                      ? 'bg-fg-dark text-white border-fg-dark'
                      : tool !== 'select' && !activePlan.scaleSet
                        ? 'border-fg-border/30 text-fg-muted/30 cursor-not-allowed'
                        : 'border-fg-border text-fg-muted hover:text-fg-heading'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`text-2xs ${activeTool === tool ? 'text-white/70' : 'text-fg-muted/60'}`}>{hotkey}</span>
                </button>
              ))}

              {/* Deduct toggle */}
              {activeTool !== 'select' && activePlan.scaleSet && (
                <button
                  onClick={() => setDeductMode(d => !d)}
                  title="Toggle deduct mode — next measurement will subtract from the selected item"
                  className={`text-xs px-2 py-1 border transition-colors shrink-0 ${
                    deductMode
                      ? 'bg-red-500/20 text-red-400 border-red-500/60'
                      : 'border-fg-border text-fg-muted hover:text-fg-heading'
                  }`}
                >
                  {deductMode ? '− Deducting' : '− Deduct'}
                </button>
              )}

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
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden bg-[#F8F8F6]"
          onMouseDown={activePlan ? handleContainerMouseDown : undefined}
          style={{ cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : undefined }}
        >
          {activePlan ? (
            <div
              ref={stageRef}
              className="absolute top-0 left-0"
              style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                transformOrigin: '0 0',
                width: activePlan.imageWidth,
                height: activePlan.imageHeight,
              }}
            >
              <div className="relative" style={{ width: activePlan.imageWidth, height: activePlan.imageHeight }}>
                <img
                  src={activePlan.dataUrl}
                  alt="Plan"
                  width={activePlan.imageWidth}
                  height={activePlan.imageHeight}
                  className="select-none block"
                  draggable={false}
                />
                <svg
                  className="absolute inset-0 w-full h-full"
                  style={{ cursor: canvasCursor, userSelect: 'none' }}
                  onClick={handleCanvasClick}
                  onDoubleClick={handleCanvasDoubleClick}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseLeave}
                >
                  {/* Existing measurements */}
                  {getActivePlanMeasurements().map(({ measurement, item, group }) => {
                    const isSel = selectedMeasurementId === measurement.id
                    const isHov = hoveredMeasurementId === measurement.id
                    const dimmed = selectedItemId && selectedItemId !== item.id && !isSel && !isHov
                    return (
                      <g
                        key={measurement.id}
                        opacity={dimmed ? 0.35 : 1}
                        style={{ cursor: activeTool === 'select' ? 'pointer' : undefined }}
                        onClick={(e) => {
                          if (activeTool !== 'select') return
                          if (panStateRef.current.moved) return
                          e.stopPropagation()
                          selectMeasurement(measurement.id)
                        }}
                        onMouseEnter={() => setHoveredMeasurementId(measurement.id)}
                        onMouseLeave={() => setHoveredMeasurementId(prev => prev === measurement.id ? null : prev)}
                      >
                        {renderMeasurement(measurement, item, group, { selected: isSel, hovered: isHov })}
                      </g>
                    )
                  })}

                  {/* Current drawing preview with live HUD */}
                  {isDrawing && drawingPoints.length > 0 && activePlan && (() => {
                    const { imageWidth, imageHeight, scale } = activePlan
                    // Live cursor target with shift-axis-snap
                    const last = drawingPoints[drawingPoints.length - 1]
                    const rawCursor = cursorNorm
                    const liveCursor = rawCursor
                      ? (shiftHeld ? axisSnap(last, rawCursor, imageWidth, imageHeight) : rawCursor)
                      : null
                    // Would we snap-close if we clicked here?
                    const canClose = activeTool === 'area' && drawingPoints.length >= 3 && liveCursor
                      ? pixelDist(liveCursor, drawingPoints[0], imageWidth, imageHeight) * (viewport.zoom) < SNAP_CLOSE_PX
                      : false

                    // Segment labels (metres)
                    const segs: { mid: { x: number; y: number }; len: number }[] = []
                    for (let i = 1; i < drawingPoints.length; i++) {
                      const a = drawingPoints[i - 1]
                      const b = drawingPoints[i]
                      segs.push({
                        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                        len: segLenM(a, b, imageWidth, imageHeight, scale),
                      })
                    }

                    // Total + preview to cursor
                    let totalLen = drawingPoints.slice(1).reduce((s, p, i) => s + segLenM(drawingPoints[i], p, imageWidth, imageHeight, scale), 0)
                    const liveSeg = liveCursor ? segLenM(last, liveCursor, imageWidth, imageHeight, scale) : 0
                    const previewTotalLen = totalLen + liveSeg
                    const areaPts = liveCursor ? [...drawingPoints, liveCursor] : drawingPoints
                    const previewArea = activeTool === 'area' && areaPts.length >= 3
                      ? calcArea(areaPts, imageWidth, imageHeight, scale)
                      : 0

                    return (
                      <g>
                        {/* Preview line from last point → cursor */}
                        {liveCursor && (
                          <line
                            x1={`${last.x * 100}%`}
                            y1={`${last.y * 100}%`}
                            x2={`${liveCursor.x * 100}%`}
                            y2={`${liveCursor.y * 100}%`}
                            stroke="#3B82F6"
                            strokeWidth={2}
                            strokeDasharray="4 3"
                            vectorEffect="non-scaling-stroke"
                            opacity={0.8}
                          />
                        )}
                        {/* Committed polyline */}
                        <polyline
                          points={drawingPoints.map(p => `${p.x * 100}% ${p.y * 100}%`).join(' ')}
                          fill="none"
                          stroke="#3B82F6"
                          strokeWidth={2.2}
                          vectorEffect="non-scaling-stroke"
                        />
                        {/* Area fill preview */}
                        {activeTool === 'area' && areaPts.length >= 3 && (
                          <polygon
                            points={areaPts.map(p => `${p.x * 100}% ${p.y * 100}%`).join(' ')}
                            fill="#3B82F6"
                            fillOpacity={0.1}
                            stroke="none"
                          />
                        )}
                        {/* Closing hint line for area */}
                        {activeTool === 'area' && drawingPoints.length >= 2 && !liveCursor && (
                          <line
                            x1={`${drawingPoints[drawingPoints.length - 1].x * 100}%`}
                            y1={`${drawingPoints[drawingPoints.length - 1].y * 100}%`}
                            x2={`${drawingPoints[0].x * 100}%`}
                            y2={`${drawingPoints[0].y * 100}%`}
                            stroke="#3B82F6"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            opacity={0.4}
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {/* Segment length labels */}
                        {segs.map((s, i) => (
                          <text
                            key={i}
                            x={`${s.mid.x * 100}%`}
                            y={`${s.mid.y * 100}%`}
                            fill="#1D4ED8"
                            fontSize="10"
                            fontWeight="600"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            paintOrder="stroke"
                            stroke="white"
                            strokeWidth={3}
                            strokeLinejoin="round"
                            style={{ pointerEvents: 'none' }}
                          >
                            {s.len.toFixed(2)} m
                          </text>
                        ))}
                        {/* Committed vertices */}
                        {drawingPoints.map((p, i) => {
                          const isFirst = i === 0
                          const highlightStart = isFirst && canClose
                          return (
                            <circle
                              key={i}
                              cx={`${p.x * 100}%`}
                              cy={`${p.y * 100}%`}
                              r={highlightStart ? 6 : 3.5}
                              fill={highlightStart ? '#10B981' : '#3B82F6'}
                              stroke={highlightStart ? '#065F46' : 'white'}
                              strokeWidth={highlightStart ? 2 : 1}
                              vectorEffect="non-scaling-stroke"
                            />
                          )
                        })}
                        {/* Running total near cursor */}
                        {liveCursor && (() => {
                          const hudX = liveCursor.x * imageWidth + 14
                          const hudY = liveCursor.y * imageHeight - 30
                          const showArea = activeTool === 'area' && previewArea > 0
                          return (
                            <g style={{ pointerEvents: 'none' }}>
                              <rect
                                x={hudX}
                                y={hudY}
                                width={showArea ? 150 : 100}
                                height={showArea ? 36 : 20}
                                fill="rgba(17,24,39,0.92)"
                                rx={3}
                              />
                              <text
                                x={hudX + 8}
                                y={hudY + 14}
                                fill="white"
                                fontSize="12"
                                fontWeight="700"
                              >
                                {activeTool === 'area'
                                  ? `${previewArea.toFixed(2)} m²`
                                  : `${previewTotalLen.toFixed(2)} m`}
                              </text>
                              {showArea && (
                                <text
                                  x={hudX + 8}
                                  y={hudY + 28}
                                  fill="#9CA3AF"
                                  fontSize="10"
                                >
                                  perim {previewTotalLen.toFixed(2)} m
                                </text>
                              )}
                            </g>
                          )
                        })()}
                      </g>
                    )
                  })()}

                  {/* Rectangle tool drag preview */}
                  {activeTool === 'rect' && rectDrag && activePlan && (() => {
                    const { start, current } = rectDrag
                    const rx = Math.min(start.x, current.x)
                    const ry = Math.min(start.y, current.y)
                    const rw = Math.abs(current.x - start.x)
                    const rh = Math.abs(current.y - start.y)
                    const { imageWidth, imageHeight, scale } = activePlan
                    const widthM = (rw * imageWidth) / scale
                    const heightM = (rh * imageHeight) / scale
                    const areaM2 = widthM * heightM
                    return (
                      <g>
                        <rect
                          x={`${rx * 100}%`}
                          y={`${ry * 100}%`}
                          width={`${rw * 100}%`}
                          height={`${rh * 100}%`}
                          fill="#3B82F6"
                          fillOpacity={0.15}
                          stroke="#3B82F6"
                          strokeWidth={2}
                          strokeDasharray="5 3"
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={`${(rx + rw / 2) * 100}%`}
                          y={`${(ry + rh / 2) * 100}%`}
                          fill="#1D4ED8"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          paintOrder="stroke"
                          stroke="white"
                          strokeWidth={3}
                          strokeLinejoin="round"
                          style={{ pointerEvents: 'none' }}
                        >
                          {widthM.toFixed(2)} × {heightM.toFixed(2)} m
                        </text>
                        <text
                          x={`${(rx + rw / 2) * 100}%`}
                          y={`${(ry + rh / 2) * 100}%`}
                          fill="#1D4ED8"
                          fontSize="10"
                          fontWeight="600"
                          textAnchor="middle"
                          dy={14}
                          paintOrder="stroke"
                          stroke="white"
                          strokeWidth={3}
                          strokeLinejoin="round"
                          style={{ pointerEvents: 'none' }}
                        >
                          = {areaM2.toFixed(2)} m²
                        </text>
                      </g>
                    )
                  })()}

                  {/* Stamp region rectangle */}
                  {stampState.rect && (stampState.phase === 'picking' || stampState.phase === 'matching' || stampState.phase === 'review') && (
                    <rect
                      x={`${stampState.rect.x * 100}%`}
                      y={`${stampState.rect.y * 100}%`}
                      width={`${stampState.rect.w * 100}%`}
                      height={`${stampState.rect.h * 100}%`}
                      fill="rgba(236, 72, 153, 0.1)"
                      stroke="#EC4899"
                      strokeWidth="2"
                      strokeDasharray="6 3"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}

                  {/* Stamp hits preview */}
                  {stampState.phase === 'review' && stampState.hits.map((h, idx) => {
                    const visible = h.accepted && h.score <= stampState.scoreFilter
                    return (
                      <g key={idx} style={{ cursor: 'pointer' }} onClick={(ev) => {
                        ev.stopPropagation()
                        setStampState(s => ({
                          ...s,
                          hits: s.hits.map((hh, i) => i === idx ? { ...hh, accepted: !hh.accepted } : hh),
                        }))
                      }}>
                        <circle
                          cx={`${h.x * 100}%`}
                          cy={`${h.y * 100}%`}
                          r={visible ? 9 : 7}
                          fill={visible ? '#EC4899' : 'transparent'}
                          fillOpacity={visible ? 0.75 : 0}
                          stroke="#EC4899"
                          strokeWidth={visible ? 1 : 1.5}
                          strokeDasharray={visible ? undefined : '3 2'}
                          vectorEffect="non-scaling-stroke"
                        />
                        {visible && (
                          <text
                            x={`${h.x * 100}%`}
                            y={`${h.y * 100}%`}
                            fill="white"
                            fontSize="9"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontWeight="700"
                            style={{ pointerEvents: 'none' }}
                          >
                            ✓
                          </text>
                        )}
                      </g>
                    )
                  })}

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
          ) : null}
          {!activePlan && (
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
          {stampState.phase === 'picking' && (
            <p className="text-2xs text-pink-400">Drag a box around one symbol on the plan…</p>
          )}
          {stampState.phase === 'matching' && (
            <p className="text-2xs text-pink-400 animate-pulse">Matching stamps… (can take a couple of seconds)</p>
          )}
          {stampState.phase === 'review' && (() => {
            const accepted = stampState.hits.filter(h => h.accepted && h.score <= stampState.scoreFilter).length
            return (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-2xs text-pink-400">
                  ● Found <span className="font-medium">{stampState.hits.length}</span> matches — <span className="font-medium">{accepted}</span> accepted
                </p>
                <span className="text-2xs text-fg-muted">Sensitivity</span>
                <input
                  type="range"
                  min={5}
                  max={stampState.scoreMax}
                  step={1}
                  value={stampState.scoreFilter}
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    setStampState(s => ({
                      ...s,
                      scoreFilter: v,
                      hits: s.hits.map(h => ({ ...h, accepted: h.score <= v })),
                    }))
                  }}
                  className="w-32"
                />
                <button
                  onClick={acceptStampHits}
                  className="text-2xs bg-pink-500 hover:bg-pink-600 text-white px-2 py-0.5"
                >
                  Add {accepted} as count
                </button>
                <button
                  onClick={cancelStamp}
                  className="text-2xs text-fg-muted hover:text-fg-heading border border-fg-border px-2 py-0.5"
                >
                  Cancel
                </button>
              </div>
            )
          })()}
          {selectedMeasurementId && !isDrawing && stampState.phase === 'idle' && (() => {
            const found = takeoff.groups.flatMap(g => g.items.flatMap(i => i.measurements.map(m => ({ m, i })))).find(x => x.m.id === selectedMeasurementId)
            if (!found) return null
            const unitLabel = found.m.type === 'area' ? 'm²' : found.m.type === 'length' ? 'lm' : 'ea'
            return (
              <div className="flex items-center gap-3">
                <p className="text-2xs text-blue-400">
                  ● Selected: <span className="font-medium">{found.i.name}</span> — {found.m.value.toFixed(2)} {unitLabel}
                </p>
                <button
                  onClick={() => deleteMeasurement(selectedMeasurementId)}
                  className="text-2xs text-red-400 hover:text-red-300 border border-red-400/40 px-1.5 py-0.5"
                  title="Delete (Del)"
                >
                  Delete
                </button>
              </div>
            )
          })()}
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
          {/* Cursor coordinate readout (right-aligned) */}
          {activePlan && activePlan.scaleSet && cursorNorm && (
            <p className="ml-auto text-2xs text-fg-muted tabular-nums">
              x {((cursorNorm.x * activePlan.imageWidth) / activePlan.scale).toFixed(2)} m ·
              {' '}y {((cursorNorm.y * activePlan.imageHeight) / activePlan.scale).toFixed(2)} m
              {shiftHeld && isDrawing && <span className="ml-2 text-blue-400">⇧ axis-snap</span>}
            </p>
          )}
        </div>
      </div>

      {/* ═══ Template picker modal ════════════════════════════════════════ */}
      {templatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-fg-darker/60 backdrop-blur-sm" onClick={() => setTemplatePickerOpen(false)} />
          <div className="relative bg-fg-bg border border-fg-border w-full max-w-xl mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg-border">
              <h3 className="text-sm font-light tracking-wide text-fg-heading uppercase">New Group from Template</h3>
              <button onClick={() => setTemplatePickerOpen(false)} className="text-fg-muted hover:text-fg-heading text-lg leading-none">×</button>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {templates.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm font-light text-fg-muted">No templates yet. Save a group as a template to start.</div>
              ) : (
                templates.map(tpl => (
                  <div
                    key={tpl.id}
                    className="flex items-start gap-3 px-5 py-3 border-b border-fg-border/40 hover:bg-fg-card/40 transition-colors"
                  >
                    <button
                      onClick={() => applyTemplate(tpl)}
                      className="flex-1 text-left"
                    >
                      <p className="text-xs font-medium text-fg-heading">
                        {tpl.name}
                        {tpl.builtin && <span className="ml-2 text-2xs text-fg-muted uppercase tracking-wider">built-in</span>}
                      </p>
                      {tpl.description && (
                        <p className="text-2xs font-light text-fg-muted mt-0.5">{tpl.description}</p>
                      )}
                      <p className="text-2xs text-fg-muted mt-1 truncate">
                        {tpl.items.length} items: {tpl.items.slice(0, 4).map(i => i.name).join(', ')}{tpl.items.length > 4 ? '…' : ''}
                      </p>
                    </button>
                    {!tpl.builtin && (
                      <button
                        onClick={() => removeTemplate(tpl.id)}
                        title="Delete template"
                        className="text-fg-muted hover:text-red-400 text-xs shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ Save as template modal ═══════════════════════════════════════ */}
      {saveTemplateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-fg-darker/60 backdrop-blur-sm" onClick={() => setSaveTemplateTarget(null)} />
          <div className="relative bg-fg-bg border border-fg-border w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fg-border">
              <h3 className="text-sm font-light tracking-wide text-fg-heading uppercase">Save Group as Template</h3>
              <button onClick={() => setSaveTemplateTarget(null)} className="text-fg-muted hover:text-fg-heading text-lg leading-none">×</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <label className="text-2xs text-fg-muted">Template name</label>
              <input
                autoFocus
                value={saveTemplateTarget.name}
                onChange={e => setSaveTemplateTarget({ ...saveTemplateTarget, name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') saveGroupAsTemplate(saveTemplateTarget.groupId, saveTemplateTarget.name) }}
                className="text-xs bg-fg-card/30 px-2 py-1.5 rounded outline-none border border-fg-border"
              />
              <p className="text-2xs text-fg-muted">Measurements are not saved — only item names, units, wastage and layer.</p>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button onClick={() => setSaveTemplateTarget(null)} className="text-xs text-fg-muted hover:text-fg-heading px-3 py-1.5">Cancel</button>
                <button
                  onClick={() => saveGroupAsTemplate(saveTemplateTarget.groupId, saveTemplateTarget.name)}
                  disabled={!saveTemplateTarget.name.trim()}
                  className="text-xs bg-fg-dark text-white px-3 py-1.5 disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
