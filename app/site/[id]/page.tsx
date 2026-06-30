'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { entrySegments } from '@/lib/ganttForecast'
import {
  siteMe, getSiteProject, getSiteGantt, getSiteActuals, getSiteSubbies, saveSiteActual,
  type SiteProject,
} from '@/lib/siteData'
import type { GanttEntry, WeeklyActual, SubcontractorPackage } from '@/types'

type Tab = 'week' | 'schedule' | 'plans' | 'subbies' | 'client' | 'log'
const TABS: { key: Tab; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'subbies', label: 'Subbies' },
  { key: 'plans', label: 'Plans' },
  { key: 'client', label: 'Client & site' },
  { key: 'log', label: 'Cost Log' },
]

export default function SiteProjectWorkspace({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [project, setProject] = useState<SiteProject | null>(null)
  const [gantt, setGantt] = useState<GanttEntry[]>([])
  const [denied, setDenied] = useState(false)
  const [tab, setTab] = useState<Tab>('week')

  useEffect(() => {
    siteMe().then(m => {
      if (!m) { router.replace('/site'); return }
      getSiteProject(params.id).then(p => {
        if (!p) { setDenied(true); return }
        setProject(p)
      })
      getSiteGantt(params.id).then(setGantt)
    })
  }, [params.id, router])

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
        {tab === 'week' && <ThisWeek gantt={gantt} />}
        {tab === 'schedule' && <Schedule gantt={gantt} projectId={project.id} />}
        {tab === 'subbies' && <Subbies projectId={project.id} />}
        {tab === 'plans' && <Plans />}
        {tab === 'client' && <ClientAndSite project={project} />}
        {tab === 'log' && <CostLog projectId={project.id} gantt={gantt} />}
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

// ── This Week ────────────────────────────────────────────────────────────────────
function ThisWeek({ gantt }: { gantt: GanttEntry[] }) {
  const mon = thisMonday()
  const monIso = toISO(mon), friIso = toISO(addDays(mon, 4)), sunIso = toISO(addDays(mon, 6))
  const active = gantt.flatMap(e =>
    entrySegments(e)
      .filter(s => s.startDate && s.endDate && s.startDate <= sunIso && s.endDate >= monIso)
      .map(s => ({ category: e.category, seg: s })))

  return (
    <section>
      <p className="text-xs text-fg-muted mb-3">Week of {fmt(monIso)} &ndash; {fmt(friIso)}</p>
      {active.length === 0 ? (
        <p className="text-sm text-fg-muted py-6 text-center">No work scheduled this week.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((a, i) => (
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
    </section>
  )
}

// ── Schedule (read-only summary; full editing is the next build step) ──────────────
function Schedule({ gantt, projectId }: { gantt: GanttEntry[]; projectId: string }) {
  const rows = gantt.map(e => {
    const segs = entrySegments(e).filter(s => s.startDate && s.endDate)
    if (!segs.length) return null
    const start = segs.reduce((m, s) => s.startDate < m ? s.startDate : m, segs[0].startDate)
    const end = segs.reduce((m, s) => s.endDate > m ? s.endDate : m, segs[0].endDate)
    return { category: e.category, start, end }
  }).filter(Boolean) as { category: string; start: string; end: string }[]
  rows.sort((a, b) => a.start.localeCompare(b.start))

  return (
    <section>
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
    </section>
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

// ── Plans ────────────────────────────────────────────────────────────────────────
function Plans() {
  return (
    <section className="py-6 text-center">
      <p className="text-sm text-fg-muted">Plans aren&apos;t wired into the cockpit yet.</p>
      <p className="text-xs text-fg-muted mt-1">Ask the office for the latest drawings for now.</p>
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

// ── Cost Log ────────────────────────────────────────────────────────────────────
function CostLog({ projectId, gantt }: { projectId: string; gantt: GanttEntry[] }) {
  const categories = useMemo(() => gantt.map(e => e.category), [gantt])
  const [actuals, setActuals] = useState<WeeklyActual[] | null>(null)
  const [category, setCategory] = useState('')
  const [weekEnding, setWeekEnding] = useState(toISO(addDays(thisMonday(), 4)))
  const [supply, setSupply] = useState('')
  const [labour, setLabour] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const refresh = () => getSiteActuals(projectId).then(setActuals)
  useEffect(() => { refresh() }, [projectId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!category) return
    setBusy(true); setSaved(false)
    const ok = await saveSiteActual(projectId, {
      category, weekEnding, supplyCost: Number(supply) || 0, labourCost: Number(labour) || 0,
    })
    setBusy(false)
    if (ok) { setSupply(''); setLabour(''); setSaved(true); refresh() }
  }

  return (
    <section className="space-y-5">
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-fg-border p-4">
        <p className="text-sm font-medium">Log costs</p>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white">
          <option value="">Pick a category...</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="block text-xs text-fg-muted">Week ending
          <input type="date" value={weekEnding} onChange={e => setWeekEnding(e.target.value)}
            className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white mt-1" />
        </label>
        <div className="flex gap-2">
          <label className="block text-xs text-fg-muted flex-1">Supply $
            <input type="number" inputMode="decimal" value={supply} onChange={e => setSupply(e.target.value)}
              className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white mt-1" />
          </label>
          <label className="block text-xs text-fg-muted flex-1">Labour $
            <input type="number" inputMode="decimal" value={labour} onChange={e => setLabour(e.target.value)}
              className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white mt-1" />
          </label>
        </div>
        <button type="submit" disabled={busy || !category}
          className="w-full rounded-lg bg-fg-heading text-white py-2.5 text-sm font-medium disabled:opacity-40">
          {busy ? 'Saving...' : 'Save entry'}
        </button>
        {saved && <p className="text-xs text-green-600 text-center">Saved.</p>}
      </form>

      <div>
        <p className="text-xs text-fg-muted mb-2">Logged so far</p>
        {actuals === null ? (
          <p className="text-sm text-fg-muted">Loading...</p>
        ) : actuals.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-fg-border/50">
            {[...actuals].sort((a, b) => b.weekEnding.localeCompare(a.weekEnding)).map(a => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate pr-2">{a.category}<span className="text-fg-muted"> · {fmt(a.weekEnding)}</span></span>
                <span className="tabular-nums shrink-0 text-fg-muted">{money(a.supplyCost + a.labourCost)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
