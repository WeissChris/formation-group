'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { entrySegments } from '@/lib/ganttForecast'
import { activeLineItems, estimateLabourHours, STD_LABOUR_RATE } from '@/lib/estimateCalculations'
import { computeScorecard, type ScoreStatus } from '@/lib/siteScorecard'
import {
  siteMe, getSiteProject, getSiteGantt, getSiteActuals, getSiteSubbies, getSiteBoq,
  getSitePlans, uploadSitePlan, deleteSitePlan, getSiteHours, getSiteMilestones, getSiteSafety,
  type SiteProject, type SitePlan, type SiteMilestone, type SiteSafety,
} from '@/lib/siteData'
import type { GanttEntry, WeeklyActual, SubcontractorPackage, Estimate } from '@/types'

type Tab = 'dashboard' | 'schedule' | 'boq' | 'plans' | 'subbies' | 'safety' | 'client' | 'score'
const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'boq', label: 'BOQ' },
  { key: 'subbies', label: 'Subbies' },
  { key: 'plans', label: 'Plans' },
  { key: 'safety', label: 'Safety' },
  { key: 'client', label: 'Client & site' },
  { key: 'score', label: 'Scorecard' },
]

export default function SiteProjectWorkspace({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [project, setProject] = useState<SiteProject | null>(null)
  const [gantt, setGantt] = useState<GanttEntry[]>([])
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState<Tab>('dashboard')
  // Shared scorecard/dashboard data — fetched once up front (the Dashboard needs it on landing),
  // consumed by both the Dashboard strip and the Scorecard tab.
  const [actuals, setActuals] = useState<WeeklyActual[] | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [subbies, setSubbies] = useState<SubcontractorPackage[]>([])
  const [xeroHours, setXeroHours] = useState<number | null>(null)
  const [xeroSupply, setXeroSupply] = useState<number | null>(null)
  const [milestones, setMilestones] = useState<SiteMilestone[]>([])

  useEffect(() => {
    siteMe().then(m => {
      if (!m) { router.replace('/site'); return }
      getSiteProject(params.id).then(p => {
        if (!p) { setDenied(true); return }
        setProject(p)
      })
      getSiteGantt(params.id).then(setGantt)
      getSiteActuals(params.id).then(setActuals)
      getSiteBoq(params.id).then(setEstimate)
      getSiteSubbies(params.id).then(s => setSubbies(s || []))
      getSiteHours(params.id).then(h => { setXeroHours(h.totalHours); setXeroSupply(h.supplyCost) })
      getSiteMilestones(params.id).then(setMilestones)
    })
  }, [params.id, router])

  const card = useMemo(() => computeScorecard({
    estimate, actuals: actuals || [], subbies, gantt, today: toISO(new Date()),
    actualLabourHours: xeroHours, actualSupplyCost: xeroSupply,
  }), [estimate, actuals, subbies, gantt, xeroHours, xeroSupply])

  if (denied) return (
    <Centered>
      <p className="text-sm text-fg-muted">This project isn&apos;t available to you.</p>
      <Link href="/site" className="text-sm underline mt-3">Back to my projects</Link>
    </Centered>
  )
  if (!project) return <Centered><p className="text-sm text-fg-muted">Loading...</p></Centered>

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 pb-24">
      <header className="sticky top-0 bg-white z-10 pt-4 pb-2 border-b border-fg-border/60">
        <Link href="/site" className="text-xs text-fg-muted">&larr; My projects</Link>
        <h1 className="text-xl font-light leading-tight mt-1">{project.name}</h1>
        <p className="text-sm text-fg-muted truncate">{project.address}</p>
        <nav className="flex gap-1 overflow-x-auto mt-3 -mx-4 px-4 no-scrollbar">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-fg-heading text-white' : 'bg-fg-card/50 text-fg-heading'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="mt-4">
        {tab === 'dashboard' && <Dashboard project={project} gantt={gantt} card={card} milestones={milestones} openTab={setTab} />}
        {tab === 'schedule' && <Schedule gantt={gantt} projectId={project.id} />}
        {tab === 'boq' && <Boq projectId={project.id} />}
        {tab === 'subbies' && <Subbies projectId={project.id} />}
        {tab === 'plans' && <Plans projectId={project.id} />}
        {tab === 'safety' && <Safety projectId={project.id} />}
        {tab === 'client' && <ClientAndSite project={project} />}
        {tab === 'score' && <Scorecard card={card} actuals={actuals} xeroHours={xeroHours} />}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">{children}</div>
}

// ── date helpers ────────────────────────────────────────────────────────────────
function toISO(d: Date): string { return d.toISOString().slice(0, 10) }
function thisMonday(): Date {
  const d = new Date(); const day = d.getDay(); const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff); d.setHours(0, 0, 0, 0); return d
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function fmt(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function money(n: number): string { return '$' + Math.round(n).toLocaleString('en-AU') }

// ── This week (dashboard strip; also reused at the top of Schedule) ────────────────
function ThisWeekStrip({ gantt }: { gantt: GanttEntry[] }) {
  const mon = thisMonday()
  const monIso = toISO(mon), friIso = toISO(addDays(mon, 4)), sunIso = toISO(addDays(mon, 6))
  const thisWeek = gantt.flatMap(e =>
    entrySegments(e)
      .filter(s => s.startDate && s.endDate && s.startDate <= sunIso && s.endDate >= monIso)
      .map(s => ({ category: e.category, seg: s })))

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-medium">This week</h2>
        <span className="text-xs text-fg-muted">{fmt(monIso)} &ndash; {fmt(friIso)}</span>
      </div>
      {thisWeek.length === 0 ? (
        <p className="text-sm text-fg-muted py-4 text-center rounded-lg border border-fg-border/60 border-dashed">
          No work scheduled this week.
        </p>
      ) : (
        <ul className="space-y-2">
          {thisWeek.map((a, i) => (
            <li key={i} className="rounded-lg border border-fg-border p-3 flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{a.category}</p>
                <p className="text-xs text-fg-muted">{fmt(a.seg.startDate)} &ndash; {fmt(a.seg.endDate)}{a.seg.label ? ` · ${a.seg.label}` : ''}</p>
              </div>
              <span className="text-xs text-fg-muted tabular-nums shrink-0">{money(a.seg.costAllocation)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Dashboard (default landing — the at-a-glance cockpit view) ─────────────────────
function Dashboard({ project, gantt, card, milestones, openTab }: {
  project: SiteProject; gantt: GanttEntry[]; card: ReturnType<typeof computeScorecard>
  milestones: SiteMilestone[]; openTab: (t: Tab) => void
}) {
  const todayIso = toISO(new Date())

  // Schedule tracking: the gantt's latest bar end (the live forecast completion) vs the office
  // planned completion. Positive diff = finishing later than planned = behind.
  const forecastEnd = useMemo(() => {
    let latest = ''
    for (const e of gantt) for (const s of entrySegments(e)) {
      if (s.endDate && s.endDate > latest) latest = s.endDate
    }
    return latest
  }, [gantt])
  const planned = project.plannedCompletion || ''
  const slipDays = forecastEnd && planned
    ? Math.round((new Date(forecastEnd).getTime() - new Date(planned).getTime()) / 86400000)
    : null

  const upcoming = useMemo(() =>
    milestones
      .filter(m => m.date && m.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3)
      .map(m => ({ ...m, inDays: Math.round((new Date(m.date).getTime() - new Date(todayIso).getTime()) / 86400000) })),
    [milestones, todayIso])

  const overall = STATUS_UI[card.status]

  return (
    <section className="space-y-6">
      {/* Job details */}
      <div className="rounded-xl border border-fg-border p-4 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{project.clientName || '-'}</p>
            <p className="text-xs text-fg-muted">{project.address || ''}</p>
          </div>
          <button onClick={() => openTab('client')} className="text-xs underline text-fg-muted shrink-0">Details</button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
          {project.clientPhone && <a href={`tel:${project.clientPhone}`} className="underline">{project.clientPhone}</a>}
          {project.clientEmail && <a href={`mailto:${project.clientEmail}`} className="underline break-all">{project.clientEmail}</a>}
          {project.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(project.address)}`} target="_blank" rel="noopener noreferrer"
              className="underline text-fg-heading">Map</a>
          )}
        </div>
      </div>

      {/* Scorecard strip */}
      <button onClick={() => openTab('score')} className="w-full text-left">
        <div className={`rounded-xl border-2 ${overall.ring} p-3 flex items-center gap-4`}>
          <div className="shrink-0">
            <p className="text-[9px] uppercase tracking-wide text-fg-muted">Score</p>
            <p className={`text-2xl font-light leading-none ${overall.text}`}>{card.score === null ? '--' : card.score}</p>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {card.levers.map(l => {
              const ui = STATUS_UI[l.status]
              return (
                <div key={l.key} className="flex items-center gap-2">
                  <span className="text-[10px] w-16 shrink-0 text-fg-muted">{l.label === 'Subcontractors' ? 'Subbies' : l.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-fg-border/40 overflow-hidden">
                    <div className={`h-full ${ui.bar}`} style={{ width: `${Math.round(Math.min(1, l.consumedPct) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-fg-muted w-9 text-right shrink-0">
                    {l.budget > 0 ? `${Math.round(l.consumedPct * 100)}%` : '-'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </button>

      {/* Schedule tracking */}
      <div className="rounded-xl border border-fg-border p-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-medium">Schedule</h2>
          {slipDays !== null ? (
            <span className={`text-xs font-medium ${slipDays > 2 ? 'text-red-600' : slipDays > 0 ? 'text-amber-600' : 'text-green-700'}`}>
              {slipDays > 0 ? `${slipDays} day${slipDays === 1 ? '' : 's'} behind` : slipDays < 0 ? `${-slipDays} day${slipDays === -1 ? '' : 's'} ahead` : 'On plan'}
            </span>
          ) : forecastEnd ? (
            <span className="text-xs text-fg-muted">Finishes {fmt(forecastEnd)}</span>
          ) : (
            <span className="text-xs text-fg-muted">Not scheduled yet</span>
          )}
        </div>
        <div className="flex justify-between text-[11px] text-fg-muted mb-1">
          <span>Job progress</span><span>{Math.round(card.progressPct * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-fg-border/50 overflow-hidden">
          <div className="h-full bg-fg-heading" style={{ width: `${Math.round(card.progressPct * 100)}%` }} />
        </div>
        {forecastEnd && planned && (
          <p className="text-[11px] text-fg-muted mt-2">Tracking to {fmt(forecastEnd)} &middot; planned {fmt(planned)}</p>
        )}
        <button onClick={() => openTab('schedule')} className="text-xs underline text-fg-muted mt-2">Open schedule</button>
      </div>

      {/* This week */}
      <ThisWeekStrip gantt={gantt} />

      {/* Next milestones */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">Next milestones</h2>
          <ul className="space-y-2">
            {upcoming.map(m => (
              <li key={m.id} className="rounded-lg border border-fg-border p-3 flex items-center justify-between">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-sm" style={{ color: m.colour ?? '#8A8580' }}>&#9670;</span>
                  <p className="font-medium truncate">{m.label}</p>
                </div>
                <span className="text-xs text-fg-muted tabular-nums shrink-0">
                  {fmt(m.date)} &middot; {m.inDays === 0 ? 'today' : `in ${m.inDays}d`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Schedule (programme summary + link to the editable gantt) ──────────────────────
function Schedule({ gantt, projectId }: { gantt: GanttEntry[]; projectId: string }) {
  // The full programme — every category's overall start/end, sorted by start.
  const rows = gantt.map(e => {
    const segs = entrySegments(e).filter(s => s.startDate && s.endDate)
    if (!segs.length) return null
    const start = segs.reduce((m, s) => s.startDate < m ? s.startDate : m, segs[0].startDate)
    const end = segs.reduce((m, s) => s.endDate > m ? s.endDate : m, segs[0].endDate)
    return { category: e.category, start, end }
  }).filter(Boolean) as { category: string; start: string; end: string }[]
  rows.sort((a, b) => a.start.localeCompare(b.start))

  return (
    <section className="space-y-6">
      {/* The this-week strip lives on the Dashboard now; Schedule is the programme + editor. */}
      {/* Editable programme */}
      <div>
        <Link href={`/site/${projectId}/schedule`}
          className="block rounded-lg bg-fg-heading text-white px-4 py-3 text-sm font-medium text-center mb-2">
          Open editable schedule
        </Link>
        <p className="text-xs text-fg-muted text-center mb-4">Best on a laptop or tablet in landscape. Your changes update the office forecast.</p>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-muted py-6 text-center">No schedule set yet.</p>
        ) : (
          <ul className="divide-y divide-fg-border/50">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <span className="font-medium truncate pr-3">{r.category}</span>
                <span className="text-xs text-fg-muted tabular-nums shrink-0">{fmt(r.start)} &ndash; {fmt(r.end)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// ── BOQ (read-only bill of quantities from the accepted estimate) ──────────────────
function Boq({ projectId }: { projectId: string }) {
  const [estimate, setEstimate] = useState<Estimate | null | undefined>(undefined)   // undefined = loading
  const [open, setOpen] = useState<Record<string, boolean>>({})
  useEffect(() => { getSiteBoq(projectId).then(setEstimate) }, [projectId])

  const view = useMemo(() => {
    if (!estimate) return null
    const items = activeLineItems(estimate)
    const cats = Array.from(new Set(items.map(i => i.category || 'Uncategorised')))
    const groups = cats.map(cat => {
      const rows = items.filter(i => (i.category || 'Uncategorised') === cat)
      return {
        cat,
        rows,
        cost: rows.reduce((s, i) => s + (i.total || 0), 0),
        hours: estimateLabourHours(rows),
      }
    }).sort((a, b) => b.cost - a.cost)
    return {
      groups,
      totalCost: items.reduce((s, i) => s + (i.total || 0), 0),
      totalHours: estimateLabourHours(items),
    }
  }, [estimate])

  if (estimate === undefined) return <p className="text-sm text-fg-muted py-6 text-center">Loading...</p>
  if (!estimate || !view || view.groups.length === 0) return (
    <p className="text-sm text-fg-muted py-6 text-center">No accepted estimate for this job yet.</p>
  )

  const typeTag = (t?: string) => t === 'Labour' ? 'L' : t === 'Subcontractor' ? 'S' : t === 'Equipment' ? 'E' : 'M'

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Cost allowance">{money(view.totalCost)}</Stat>
        <Stat label="Labour allowed">{Math.round(view.totalHours).toLocaleString('en-AU')} hrs</Stat>
      </div>
      <p className="text-[11px] text-fg-muted">Cost allowances from the accepted estimate. This is your budget to build to, not the client price.</p>

      <ul className="space-y-2">
        {view.groups.map(g => {
          const isOpen = !!open[g.cat]
          return (
            <li key={g.cat} className="rounded-lg border border-fg-border overflow-hidden">
              <button onClick={() => setOpen(o => ({ ...o, [g.cat]: !o[g.cat] }))}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left">
                <span className="min-w-0 flex items-center gap-2">
                  <span className={`shrink-0 text-fg-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                  <span className="font-medium truncate">{g.cat}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-sm tabular-nums">{money(g.cost)}</span>
                  {g.hours > 0 && <span className="block text-[10px] text-fg-muted tabular-nums">{Math.round(g.hours)} hrs</span>}
                </span>
              </button>
              {isOpen && (
                <ul className="border-t border-fg-border/50 divide-y divide-fg-border/40 bg-fg-card/20">
                  {g.rows.map(r => (
                    <li key={r.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm leading-snug">{r.description || '(no description)'}</p>
                        <p className="text-[11px] text-fg-muted">
                          <span className="inline-block w-4 font-medium">{typeTag(r.type)}</span>
                          {r.units ? `${Number(r.units).toLocaleString('en-AU')} ${r.uom || ''}`.trim() : ''}
                          {r.units && r.unitCost ? ` @ ${money(r.unitCost)}` : ''}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums shrink-0">{money(r.total || 0)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-fg-border px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="text-base font-light tabular-nums mt-0.5">{children}</p>
    </div>
  )
}

// ── Subbies ────────────────────────────────────────────────────────────────────────
function Subbies({ projectId }: { projectId: string }) {
  const [subbies, setSubbies] = useState<SubcontractorPackage[] | null>(null)
  useEffect(() => { getSiteSubbies(projectId).then(setSubbies) }, [projectId])

  const download = (s: SubcontractorPackage) => {
    if (!s.quoteFileData) return
    const a = document.createElement('a')
    a.href = s.quoteFileData; a.download = s.quoteFileName || `${s.name}-quote`
    document.body.appendChild(a); a.click(); a.remove()
  }

  if (subbies === null) return <p className="text-sm text-fg-muted py-6 text-center">Loading...</p>
  if (subbies.length === 0) return <p className="text-sm text-fg-muted py-6 text-center">No subcontractors on this job.</p>
  return (
    <ul className="space-y-2">
      {subbies.map(s => (
        <li key={s.id} className="rounded-lg border border-fg-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{s.name}</p>
              <p className="text-xs text-fg-muted">{s.trade}</p>
            </div>
            <span className="text-xs text-fg-muted tabular-nums shrink-0">{money(s.approvedValue + (s.variations || 0))}</span>
          </div>
          {s.quoteFileData && (
            <button onClick={() => download(s)} className="mt-2 text-xs underline text-fg-heading">
              Download quote ({s.quoteFileName || 'PDF'})
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// ── Plans (drag-drop to a private per-project Storage folder) ──────────────────────
function fileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
function Plans({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<SitePlan[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState('')

  const refresh = () => getSitePlans(projectId).then(setFiles)
  useEffect(() => { refresh() }, [projectId])

  const upload = async (list: FileList | File[] | null) => {
    const arr = Array.from(list || [])
    if (!arr.length) return
    setBusy(true); setErr('')
    let failed = 0
    for (const f of arr) { if (!(await uploadSitePlan(projectId, f))) failed++ }
    setBusy(false)
    if (failed) setErr(`${failed} file${failed > 1 ? 's' : ''} failed to upload.`)
    refresh()
  }

  const remove = async (p: SitePlan) => {
    if (!window.confirm(`Delete ${p.name}?`)) return
    await deleteSitePlan(projectId, p.path)
    refresh()
  }

  return (
    <section className="space-y-4">
      <label
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        className={`block rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
          drag ? 'border-fg-heading bg-fg-card/40' : 'border-fg-border'}`}>
        <input type="file" multiple className="hidden"
          onChange={e => { upload(e.target.files); e.target.value = '' }} />
        <p className="text-sm font-medium">{busy ? 'Uploading...' : 'Drop plans & specs here'}</p>
        <p className="text-xs text-fg-muted mt-1">or tap to choose files (PDF, images, up to 50MB each)</p>
      </label>
      {err && <p className="text-xs text-red-600 text-center">{err}</p>}

      {files === null ? (
        <p className="text-sm text-fg-muted py-4 text-center">Loading...</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-fg-muted py-4 text-center">No plans uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {files.map(f => (
            <li key={f.path} className="rounded-lg border border-fg-border p-3 flex items-center justify-between gap-3">
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate underline">{f.name}</p>
                <p className="text-[11px] text-fg-muted">{fileSize(f.size)}{f.updatedAt ? ` · ${fmt(f.updatedAt)}` : ''}</p>
              </a>
              <button onClick={() => remove(f)} aria-label={`Delete ${f.name}`}
                className="shrink-0 text-xs text-fg-muted hover:text-red-600 px-1">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Safety (linked sf_site: register, inductions, board + sign-in links) ───────────
function Safety({ projectId }: { projectId: string }) {
  const [safety, setSafety] = useState<SiteSafety | null>(null)
  useEffect(() => { getSiteSafety(projectId).then(setSafety) }, [projectId])

  if (safety === null) return <p className="text-sm text-fg-muted py-6 text-center">Loading...</p>
  if (!safety.site) return (
    <p className="text-sm text-fg-muted py-8 text-center">
      No safety site is linked to this job yet - ask the office to create one (Safety page in the main app).
    </p>
  )
  const { site, onSiteNow, today, inductionCount } = safety
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-fg-border p-4">
        <p className="text-[10px] uppercase tracking-wide text-fg-muted">Safety site</p>
        <p className="text-sm font-medium mt-0.5">{site.address}</p>
        <p className="text-xs text-fg-muted">{site.shortRef} · {inductionCount} inducted</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <a href={`/api/safety/sites/${site.id}/board-pdf`} target="_blank" rel="noopener noreferrer"
            className="rounded-lg bg-fg-heading text-white px-3 py-2 text-xs font-medium">Site board PDF</a>
          <a href={`/signin/${site.shortRef}`} target="_blank" rel="noopener noreferrer"
            className="rounded-lg border border-fg-border px-3 py-2 text-xs">Open sign-in page</a>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">On site now ({onSiteNow.length})</h2>
        {onSiteNow.length === 0 ? (
          <p className="text-sm text-fg-muted py-4 text-center rounded-lg border border-fg-border/60 border-dashed">Nobody signed in.</p>
        ) : (
          <ul className="space-y-2">
            {onSiteNow.map(v => (
              <li key={v.id} className="rounded-lg border border-fg-border p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">{v.personName}</p>
                  <p className="text-xs text-fg-muted">{v.company || v.role}{v.role === 'visitor' ? ' · visitor' : ''}</p>
                </div>
                <span className="text-xs text-fg-muted tabular-nums shrink-0">in {time(v.signedInAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">Today</h2>
        {today.length === 0 ? (
          <p className="text-sm text-fg-muted">No sign-ins today.</p>
        ) : (
          <ul className="divide-y divide-fg-border/50">
            {today.map(v => (
              <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate pr-2">{v.personName}{v.company ? <span className="text-fg-muted"> · {v.company}</span> : ''}</span>
                <span className="text-xs text-fg-muted tabular-nums shrink-0">
                  {time(v.signedInAt)}{v.signedOutAt ? ` – ${time(v.signedOutAt)}` : ' – on site'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// ── Client & site ────────────────────────────────────────────────────────────────
function ClientAndSite({ project }: { project: SiteProject }) {
  return (
    <section className="space-y-4">
      <Field label="Client">{project.clientName || '-'}</Field>
      {project.clientPhone && (
        <Field label="Phone"><a href={`tel:${project.clientPhone}`} className="underline">{project.clientPhone}</a></Field>
      )}
      {project.clientEmail && (
        <Field label="Email"><a href={`mailto:${project.clientEmail}`} className="underline break-all">{project.clientEmail}</a></Field>
      )}
      <Field label="Site address">{project.address || '-'}</Field>
      {project.address && (
        <a href={`https://maps.google.com/?q=${encodeURIComponent(project.address)}`} target="_blank" rel="noopener noreferrer"
          className="inline-block text-xs underline text-fg-heading">Open in Maps</a>
      )}
      <Field label="Site access notes">{project.siteAccessNotes || 'None recorded.'}</Field>
    </section>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="text-sm mt-0.5 whitespace-pre-wrap">{children}</p>
    </div>
  )
}

// ── Scorecard (delivery levers + score, over the cost-logging form that feeds it) ──
const STATUS_UI: Record<ScoreStatus, { bar: string; text: string; ring: string; label: string }> = {
  good:  { bar: 'bg-green-500', text: 'text-green-700', ring: 'border-green-500', label: 'On track' },
  watch: { bar: 'bg-amber-500', text: 'text-amber-700', ring: 'border-amber-500', label: 'Watch' },
  over:  { bar: 'bg-red-500',   text: 'text-red-700',   ring: 'border-red-500',   label: 'Over budget' },
  na:    { bar: 'bg-fg-border', text: 'text-fg-muted',  ring: 'border-fg-border', label: 'Too early' },
}

// Data is fetched once by the workspace (the Dashboard strip shares it) and passed in.
function Scorecard({ card, actuals, xeroHours }: {
  card: ReturnType<typeof computeScorecard>; actuals: WeeklyActual[] | null; xeroHours: number | null
}) {
  const overall = STATUS_UI[card.status]

  // Labour reads in HOURS (allowance and used). Labour is always priced at the standard rate, so
  // hours = $ / STD_LABOUR_RATE — the same conversion the BOQ + Labour Checker use. When Xero
  // timesheets connect, the actual becomes real logged hours instead of a $-derived equivalent.
  const hrs = (dollars: number) => `${Math.round(dollars / STD_LABOUR_RATE).toLocaleString('en-AU')}h`
  const leverAmount = (l: (typeof card.levers)[number]) =>
    l.key === 'labour' ? <>{hrs(l.actual)} <span className="opacity-60">/ {hrs(l.budget)}</span></>
      : <>{money(l.actual)} <span className="opacity-60">/ {money(l.budget)}</span></>

  return (
    <section className="space-y-5">
      {/* Overall score + progress */}
      <div className={`rounded-xl border-2 ${overall.ring} p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-fg-muted">Job score</p>
            <p className={`text-3xl font-light leading-none mt-1 ${overall.text}`}>
              {card.score === null ? '--' : card.score}
              {card.score !== null && (
                // Above 100 = projected to finish UNDER budget - "112 / 100" read like a bug, so
                // the suffix says what it means instead.
                card.score > 100
                  ? <span className="text-base text-fg-muted"> · target 100</span>
                  : <span className="text-base text-fg-muted"> / 100</span>
              )}
            </p>
          </div>
          <span className={`text-sm font-medium ${overall.text}`}>
            {card.score !== null && card.score > 100 ? 'Ahead of budget' : overall.label}
          </span>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-fg-muted mb-1">
            <span>Job progress</span><span>{Math.round(card.progressPct * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-fg-border/50 overflow-hidden">
            <div className="h-full bg-fg-heading" style={{ width: `${Math.round(card.progressPct * 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Levers */}
      {card.hasBudget ? (
        <div className="space-y-3">
          {card.levers.map(l => {
            const ui = STATUS_UI[l.status]
            const pct = Math.min(1, l.consumedPct)
            return (
              <div key={l.key}>
                <div className="flex justify-between items-baseline text-sm">
                  <span className="font-medium">{l.label}</span>
                  <span className="tabular-nums text-fg-muted text-xs">{leverAmount(l)}</span>
                </div>
                <div className="h-2 rounded-full bg-fg-border/40 overflow-hidden mt-1">
                  <div className={`h-full ${ui.bar}`} style={{ width: `${Math.round(pct * 100)}%` }} />
                </div>
                <p className={`text-[10px] mt-0.5 ${ui.text}`}>
                  {l.budget > 0 ? `${Math.round(l.consumedPct * 100)}% of allowance ${l.key === 'subbies' ? 'committed' : 'used'}` : 'No allowance'}
                </p>
              </div>
            )
          })}
          <p className="text-[11px] text-fg-muted">
            {xeroHours != null
              ? 'Labour hours are the crew’s logged Xero timesheets; costs flow in from Xero - nothing to log here.'
              : 'Costs and labour hours flow in from Xero - nothing to log here. (No timesheet hours synced for this job yet.)'}
          </p>
        </div>
      ) : (
        <p className="text-sm text-fg-muted text-center py-2">No estimate to score against yet.</p>
      )}

      {/* Read-only record of the costs counted above (fed from Xero / the office - no site logging). */}
      {actuals !== null && actuals.length > 0 && (
        <div>
          <p className="text-xs text-fg-muted mb-2">Costs recorded</p>
          <ul className="divide-y divide-fg-border/50">
            {[...actuals].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)).map(a => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate pr-2">{a.category}<span className="text-fg-muted"> · {fmt(a.weekEnding)}</span></span>
                <span className="tabular-nums shrink-0 text-fg-muted">{money(a.supplyCost + a.labourCost)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
