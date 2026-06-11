// Pure geometry + quantity helpers for the takeoff tool.
//
// Extracted from components/TakeoffTab.tsx so they can be unit-tested without instantiating
// the 2400-line component. These functions calculate the area / length / quantity values
// that flow directly into estimate line-item totals — money-affecting math.
//
// Coordinate system: measurement points are stored as `{x, y}` normalised 0..1 against the
// plan image's natural pixel dimensions. Pixel-to-metre conversion uses the plan's `scale`
// (pixels per metre, set during calibration).

import type { TakeoffData, TakeoffItem, TakeoffLayer } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

export const WASTAGE_PRESETS = [0, 5, 10, 15]

export interface Viewport {
  x: number      // translate px (screen)
  y: number      // translate px (screen)
  zoom: number
}

export const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 20
export const HISTORY_LIMIT = 50

export const LAYER_COLORS = [
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

export const DEFAULT_LAYER: TakeoffLayer = {
  id: 'default',
  name: 'Default',
  color: '#3B82F6',
  visible: true,
}

// ── Utilities ────────────────────────────────────────────────────────────────

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v))

// ── Layer helpers ────────────────────────────────────────────────────────────

export function getLayers(t: TakeoffData): TakeoffLayer[] {
  if (!t.layers || t.layers.length === 0) return [DEFAULT_LAYER]
  return t.layers
}

export function getItemLayer(t: TakeoffData, item: TakeoffItem): TakeoffLayer {
  const layers = getLayers(t)
  const byId = layers.find(l => l.id === item.layerId)
  return byId ?? layers[0]
}

// ── Quantity helpers ─────────────────────────────────────────────────────────

/**
 * Raw qty = sum of measurements minus deductions (no wastage).
 * Returns the manualOverride directly when set, ignoring measurements.
 * Negative sums clamp to 0 (deductions can't push a quantity below zero).
 */
export function getRawQty(item: TakeoffItem): number {
  if (item.manualOverride !== undefined) return Math.max(0, item.manualOverride)
  const sum = item.measurements.reduce(
    (s, m) => s + (m.isDeduction ? -m.value : m.value),
    0,
  )
  return Math.round(Math.max(0, sum) * 100) / 100
}

/** Final qty = rawQty × (1 + wastage/100), rounded to 2 dp. */
export function getFinalQty(item: TakeoffItem): number {
  const raw = getRawQty(item)
  return Math.round(raw * (1 + (item.wastagePercent ?? 0) / 100) * 100) / 100
}

// ── Geometry: area / length / distance ───────────────────────────────────────

/**
 * Polygon area in square metres from normalised points.
 * Shoelace formula on pixel coords, divide by scale².
 * Returns 0 for degenerate polygons (<3 points) or invalid scale.
 */
export function calcArea(
  points: { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number,
  scale: number,
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
 * Polyline length in metres from normalised points.
 * Sums pixel distances between consecutive points, divides by scale.
 * Returns 0 for <2 points or invalid scale.
 */
export function calcLength(
  points: { x: number; y: number }[],
  imageWidth: number,
  imageHeight: number,
  scale: number,
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

/** Distance between two normalised points in pixels. */
export function pixelDist(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): number {
  const dx = (p2.x - p1.x) * imageWidth
  const dy = (p2.y - p1.y) * imageHeight
  return Math.sqrt(dx * dx + dy * dy)
}

/** Segment length in metres between two normalised points. */
export function segLenM(
  a: { x: number; y: number },
  b: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  scale: number,
): number {
  if (scale <= 0) return 0
  return pixelDist(a, b, imageWidth, imageHeight) / scale
}

/**
 * Snap a point so the line from anchor → point lies on a 0 / 45 / 90° axis.
 * Used for shift-snap during drawing. Returns the snapped point in normalised coords.
 */
export function axisSnap(
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
