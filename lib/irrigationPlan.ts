// The foreman's marked-up irrigation plan: colour-coded zones drawn over the plan image, each a
// polygon of normalised (0..1) points plus a label. Feeds the client handover booklet (the plan +
// a zone legend). Points are normalised so they render correctly at any display/print size.

export interface IrrigationPoint { x: number; y: number }   // 0..1 relative to the plan image

export interface IrrigationZone {
  id: string
  label: string
  color: string
  points: IrrigationPoint[]
}

export interface IrrigationPlan {
  planUrl: string        // signed URL for the plan image ('' if none uploaded yet)
  planW: number          // plan image pixel width (for aspect ratio)
  planH: number
  zones: IrrigationZone[]
}

// A distinct, high-contrast palette for zones (works over a busy plan). First colours are the most legible.
export const ZONE_COLORS = [
  '#E11D48', '#2563EB', '#16A34A', '#D97706', '#7C3AED',
  '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5',
]

/** Next unused colour for a new zone, cycling once the palette is exhausted. */
export function nextZoneColor(zones: IrrigationZone[]): string {
  const used = new Set(zones.map(z => z.color))
  return ZONE_COLORS.find(c => !used.has(c)) || ZONE_COLORS[zones.length % ZONE_COLORS.length]
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Centroid of a zone's points (normalised), for placing its label. Falls back to the first point. */
export function zoneCentroid(z: IrrigationZone): IrrigationPoint {
  if (!z.points.length) return { x: 0.5, y: 0.5 }
  const s = z.points.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 })
  return { x: s.x / z.points.length, y: s.y / z.points.length }
}

/** Coerce arbitrary JSON into clean zones: valid points only, drops degenerate zones, caps counts. */
export function sanitizeZones(raw: unknown): IrrigationZone[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r): IrrigationZone => {
      const o = (r ?? {}) as Record<string, unknown>
      const pts = Array.isArray(o.points) ? o.points : []
      return {
        id: typeof o.id === 'string' && o.id ? o.id : '',
        label: typeof o.label === 'string' ? o.label.slice(0, 120) : '',
        color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : ZONE_COLORS[0],
        points: pts
          .map((p): IrrigationPoint => {
            const q = (p ?? {}) as Record<string, unknown>
            return { x: clamp01(Number(q.x) || 0), y: clamp01(Number(q.y) || 0) }
          })
          .slice(0, 200),
      }
    })
    .filter(z => z.id && z.points.length >= 2)   // a line at minimum; polygons need 3+
    .slice(0, 60)
}
