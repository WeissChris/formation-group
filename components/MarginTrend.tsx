'use client'

import { useEffect, useState } from 'react'
import { getProjectSnapshots, type ProjectSnapshotRow } from '@/lib/xero'

/**
 * Forecast-GP fade trend for one project — "GP was 38% then, 35% now".
 *
 * Reads dated snapshots (fg_project_snapshots), captured automatically once a day from the
 * dashboard. Needs ≥2 snapshots to plot a trend; before then it shows the current position with a
 * note that the history is building. Quoted-margin + target reference lines come from the parent
 * so they render even with no history.
 */
export function MarginTrend({
  projectId,
  currentGpPct,
  quotedMarginPct,
  targetMarginPct,
}: {
  projectId: string
  currentGpPct: number
  quotedMarginPct?: number
  targetMarginPct: number
}) {
  const [snaps, setSnaps] = useState<ProjectSnapshotRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getProjectSnapshots(projectId).then(rows => { if (!cancelled) setSnaps(rows) })
    return () => { cancelled = true }
  }, [projectId])

  if (snaps === null) {
    return <div className="border border-fg-border p-5"><p className="text-xs font-light text-fg-muted">Loading margin trend…</p></div>
  }

  const GREEN = '#3D5A3A', AMBER = '#C8A870', RED = '#C0563B', GREY = '#9E9890'
  const toneFor = (gp: number) =>
    gp >= targetMarginPct - 2 ? GREEN : gp >= targetMarginPct - 10 ? AMBER : RED

  // Not enough history to draw a line yet — show the current position + a building-up note.
  if (snaps.length < 2) {
    const fade = quotedMarginPct != null ? currentGpPct - quotedMarginPct : null
    return (
      <div className="border border-fg-border p-5">
        <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted mb-3">Margin trend (fade)</p>
        <div className="flex items-baseline gap-6">
          <div>
            <p className="text-2xs text-fg-muted mb-0.5">Forecast GP now</p>
            <p className="text-base font-light tabular-nums" style={{ color: toneFor(currentGpPct) }}>{currentGpPct.toFixed(1)}%</p>
          </div>
          {fade != null && (
            <div>
              <p className="text-2xs text-fg-muted mb-0.5">vs {quotedMarginPct!.toFixed(0)}% quote</p>
              <p className="text-base font-light tabular-nums" style={{ color: fade >= 0 ? GREEN : RED }}>
                {fade >= 0 ? '+' : ''}{fade.toFixed(1)} pts
              </p>
            </div>
          )}
        </div>
        <p className="text-2xs font-light text-fg-muted/70 mt-3">
          {snaps.length === 0
            ? 'No history yet — a snapshot is captured automatically each day you open the dashboard. The fade trend will build here over the coming weeks.'
            : 'One snapshot so far — the trend line appears once there are at least two.'}
        </p>
      </div>
    )
  }

  // ── trend chart ──
  const pts = snaps
  const gps = pts.map(p => p.forecast_gp_pct)
  const refs = [quotedMarginPct, targetMarginPct].filter((v): v is number => v != null)
  const lo = Math.max(0, Math.floor((Math.min(...gps, ...refs) - 4) / 5) * 5)
  const hi = Math.ceil((Math.max(...gps, ...refs) + 4) / 5) * 5
  const span = Math.max(hi - lo, 1)

  const W = 680, H = 220, PAD = { l: 48, r: 16, t: 16, b: 30 }
  const innerW = W - PAD.l - PAD.r, innerH = H - PAD.t - PAD.b
  const n = pts.length
  const x = (i: number) => PAD.l + (i / (n - 1)) * innerW
  const y = (v: number) => PAD.t + innerH - ((v - lo) / span) * innerH
  const gpPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.forecast_gp_pct).toFixed(1)}`).join(' ')
  const latest = pts[n - 1]
  const first = pts[0]
  const change = latest.forecast_gp_pct - first.forecast_gp_pct

  const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })

  return (
    <div className="border border-fg-border p-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted">Margin trend (fade)</p>
        <p className="text-2xs font-light tabular-nums" style={{ color: change >= 0 ? GREEN : RED }}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)} pts since {fmtDate(first.snapshot_date)}
        </p>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img" aria-label="Forecast GP over time">
        {/* y bounds */}
        <line x1={PAD.l} y1={y(lo)} x2={W - PAD.r} y2={y(lo)} stroke="#E5E2DD" strokeWidth="1" />
        <text x={PAD.l - 8} y={y(hi) + 4} textAnchor="end" fontSize="10" fill="#8A8580">{hi}%</text>
        <text x={PAD.l - 8} y={y(lo) + 4} textAnchor="end" fontSize="10" fill="#8A8580">{lo}%</text>

        {/* reference lines: quoted margin (the bar to beat) + target */}
        {quotedMarginPct != null && (
          <>
            <line x1={PAD.l} y1={y(quotedMarginPct)} x2={W - PAD.r} y2={y(quotedMarginPct)} stroke={GREY} strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - PAD.r} y={y(quotedMarginPct) - 4} textAnchor="end" fontSize="9" fill={GREY}>quote {quotedMarginPct.toFixed(0)}%</text>
          </>
        )}
        {targetMarginPct != null && Math.abs((quotedMarginPct ?? -99) - targetMarginPct) > 1 && (
          <line x1={PAD.l} y1={y(targetMarginPct)} x2={W - PAD.r} y2={y(targetMarginPct)} stroke="#C8A870" strokeWidth="1" strokeDasharray="2 4" />
        )}

        {/* GP trend */}
        <path d={gpPath} fill="none" stroke={toneFor(latest.forecast_gp_pct)} strokeWidth="2.5" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.forecast_gp_pct)} r="2.5" fill={toneFor(p.forecast_gp_pct)} />
        ))}
        {/* end label */}
        <text x={x(n - 1)} y={y(latest.forecast_gp_pct) - 8} textAnchor="end" fontSize="10" fill={toneFor(latest.forecast_gp_pct)}>
          {latest.forecast_gp_pct.toFixed(1)}%
        </text>
      </svg>

      <div className="flex items-center gap-4 mt-2 flex-wrap">
        <span className="text-2xs font-light text-fg-muted">{fmtDate(first.snapshot_date)} → {fmtDate(latest.snapshot_date)}</span>
        <span className="flex items-center gap-1.5 text-2xs font-light text-fg-muted">
          <span className="inline-block w-4 border-t border-dashed" style={{ borderColor: GREY }} /> quoted margin
        </span>
      </div>
    </div>
  )
}
