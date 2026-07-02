'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { entrySegments, entryClaimSegments, segmentWeekShare } from '@/lib/ganttForecast'
import { activeLineItems, estimateLabourHours, STD_LABOUR_RATE } from '@/lib/estimateCalculations'
import { computeScorecard, type ScoreStatus } from '@/lib/siteScorecard'
import { isVicPublicHoliday, vicPublicHolidayName } from '@/lib/publicHolidays'
import {
  siteMe, getSiteProject, getSiteGantt, getSiteActuals, getSiteSubbies, getSiteBoq,
  getSitePlans, uploadSitePlan, deleteSitePlan, getSiteHours, getSiteMilestones, getSiteSafety, postSiteSafety,
  getSiteBaseline, getSiteVariations, createSiteVariation,
  type SiteProject, type SitePlan, type SiteMilestone, type SiteSafety, type SiteBaseline, type SiteVariation,
} from '@/lib/siteData'
import { SEVERITY_LABEL } from '@/lib/safetyDocs'
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
  const [hoursWeeks, setHoursWeeks] = useState<{ weekEnding: string; hours: number }[]>([])
  const [milestones, setMilestones] = useState<SiteMilestone[]>([])
  const [safety, setSafety] = useState<SiteSafety | null>(null)
  const [plans, setPlans] = useState<SitePlan[]>([])
  const [baseline, setBaseline] = useState<SiteBaseline | null>(null)
  const [variations, setVariations] = useState<SiteVariation[]>([])

  const refreshSafety = () => getSiteSafety(params.id).then(setSafety)
  const refreshVariations = () => getSiteVariations(params.id).then(setVariations)

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
      getSiteHours(params.id).then(h => { setXeroHours(h.totalHours); setXeroSupply(h.supplyCost); setHoursWeeks(h.weeks) })
      getSiteMilestones(params.id).then(setMilestones)
      getSiteSafety(params.id).then(setSafety)
      getSitePlans(params.id).then(setPlans)
      getSiteBaseline(params.id).then(setBaseline)
      getSiteVariations(params.id).then(setVariations)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        {tab === 'dashboard' && (
          <Dashboard project={project} gantt={gantt} card={card} milestones={milestones} openTab={setTab}
            safety={safety} plans={plans} baseline={baseline} hoursWeeks={hoursWeeks}
            variations={variations} refreshVariations={refreshVariations} />
        )}
        {tab === 'schedule' && <Schedule gantt={gantt} projectId={project.id} />}
        {tab === 'boq' && <Boq projectId={project.id} />}
        {tab === 'subbies' && <Subbies projectId={project.id} />}
        {tab === 'plans' && <Plans projectId={project.id} />}
        {tab === 'safety' && <Safety projectId={project.id} safety={safety} refresh={refreshSafety} />}
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

// ── Variations (foreman-raised, capped at $1000, client approves digitally) ─────────
function VariationsCard({ projectId, variations, refresh }: {
  projectId: string; variations: SiteVariation[]; refresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const amt = parseFloat(amount) || 0
  const overCap = amt > 1000

  const submit = async () => {
    if (!description.trim() || !(amt > 0) || overCap) return
    setBusy(true); setError(''); setMsg('')
    const res = await createSiteVariation(projectId, { description: description.trim(), amount: amt })
    setBusy(false)
    if (res.ok) {
      setDescription(''); setAmount(''); setOpen(false)
      setMsg(res.emailed
        ? `Sent to ${res.clientEmail} for approval.`
        : res.clientEmail
          ? 'Created - email delivery is not configured yet, share the approval link below.'
          : 'Created - the client has no email on file, share the approval link below.')
      refresh()
    } else {
      setError(res.error === 'no_base_estimate' ? 'No estimate on this job yet - the office needs to set one up.' : 'Could not create the variation.')
    }
  }

  const share = async (url: string) => {
    try {
      if (navigator.share) await navigator.share({ title: 'Variation approval', url })
      else { await navigator.clipboard.writeText(url); setMsg('Approval link copied.') }
    } catch { /* cancelled */ }
  }

  const statusChip = (v: SiteVariation) =>
    v.status === 'accepted'
      ? <span className="text-[10px] uppercase tracking-wide text-green-700 shrink-0">Approved{v.acceptedByName ? ` · ${v.acceptedByName}` : ''}</span>
      : v.status === 'declined'
        ? <span className="text-[10px] uppercase tracking-wide text-fg-muted shrink-0">Declined</span>
        : <span className="text-[10px] uppercase tracking-wide text-amber-600 shrink-0">Awaiting client</span>

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">Variations</h2>
        <button onClick={() => setOpen(o => !o)} className="text-xs underline text-fg-heading">
          {open ? 'Cancel' : '+ New variation'}
        </button>
      </div>
      {msg && <p className="text-xs text-green-700 mb-2">{msg}</p>}

      {open && (
        <div className="rounded-xl border border-fg-border p-3 mb-3 space-y-2">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="What's the change? (e.g. Extra drainage run behind the western wall - 6lm ag pipe + gravel)"
            className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" inputMode="decimal" min={0}
            placeholder="Price ex GST ($)"
            className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
          {overCap && (
            <p className="text-xs text-red-600">
              Over $1,000 - variations this size go through the office to price and send.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={submit} disabled={busy || !description.trim() || !(amt > 0) || overCap}
            className="w-full rounded-lg bg-fg-heading text-white py-2.5 text-sm font-medium disabled:opacity-40">
            {busy ? 'Sending...' : 'Send to client for approval'}
          </button>
          <p className="text-[10px] text-fg-muted">The client gets a link to approve or decline online. The office sees it too.</p>
        </div>
      )}

      {variations.length === 0 ? (
        !open && <p className="text-sm text-fg-muted">None raised from site.</p>
      ) : (
        <ul className="space-y-2">
          {variations.map(v => (
            <li key={v.id} className="rounded-lg border border-fg-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium truncate">VMO-{v.number}{v.reason ? ` · ${v.reason.slice(0, 60)}` : ''}</p>
                {statusChip(v)}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-fg-muted tabular-nums">{money(v.amount)} ex GST</span>
                {v.approvalUrl && (
                  <button onClick={() => share(v.approvalUrl!)} className="text-xs underline text-fg-heading">
                    Share approval link
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Weather (Open-Meteo, keyless; geocodes the site suburb) ─────────────────────────
interface WeatherDay { date: string; code: number; tMax: number; rainMm: number; rainProb: number }
const weatherIcon = (code: number): string => {
  if (code === 0) return '☀'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫'
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧'
  if (code <= 77) return '❄'
  if (code >= 95) return '⛈'
  return '☁'
}
function WeatherStrip({ address }: { address: string }) {
  const [days, setDays] = useState<WeatherDay[] | null>(null)
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        // Street addresses don't geocode - use the suburb (the part after the last comma).
        const parts = (address || '').split(',').map(s => s.trim()).filter(Boolean)
        const suburb = parts[parts.length - 1]
        if (!suburb) return
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(suburb)}&count=1&language=en&countryCode=AU`)
          .then(r => r.json())
        const hit = geo?.results?.[0]
        if (!hit || !active) return
        const fc = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}` +
          `&daily=weather_code,temperature_2m_max,precipitation_sum,precipitation_probability_max&timezone=Australia%2FMelbourne&forecast_days=5`)
          .then(r => r.json())
        if (!active || !fc?.daily?.time) return
        setDays(fc.daily.time.map((date: string, i: number) => ({
          date,
          code: fc.daily.weather_code?.[i] ?? 0,
          tMax: Math.round(fc.daily.temperature_2m_max?.[i] ?? 0),
          rainMm: Math.round((fc.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
          rainProb: fc.daily.precipitation_probability_max?.[i] ?? 0,
        })))
      } catch { /* weather is a nicety - fail silently */ }
    })()
    return () => { active = false }
  }, [address])

  if (!days) return null
  return (
    <div className="rounded-xl border border-fg-border p-3">
      <div className="grid grid-cols-5 gap-1 text-center">
        {days.map((d, i) => {
          const wet = d.rainProb >= 60 || d.rainMm >= 5
          return (
            <div key={d.date} className={`rounded-lg py-1.5 ${wet ? 'bg-blue-50' : ''}`}>
              <p className="text-[10px] text-fg-muted">{i === 0 ? 'Today' : new Date(`${d.date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short' })}</p>
              <p className="text-base leading-tight">{weatherIcon(d.code)}</p>
              <p className="text-[11px] tabular-nums font-medium">{d.tMax}&deg;</p>
              <p className={`text-[9px] tabular-nums ${wet ? 'text-blue-700 font-medium' : 'text-fg-muted'}`}>
                {d.rainProb > 0 ? `${d.rainProb}%` : ''}{d.rainMm > 0 ? ` ${d.rainMm}mm` : ''}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week strip (dashboard: This week + Next week = the fortnight programme) ─────────
// ONE card per category (a split category's Materials/Labour/Sub lines each carry their own
// bar, which used to render as repeating cards) - combined dates + total cost on the card,
// with the individual scope lines in a tap-to-expand dropdown. `offset` = weeks from now.
function ThisWeekStrip({ gantt, offset = 0, title = 'This week' }: { gantt: GanttEntry[]; offset?: number; title?: string }) {
  const mon = addDays(thisMonday(), offset * 7)
  const monIso = toISO(mon), friIso = toISO(addDays(mon, 4)), sunIso = toISO(addDays(mon, 6))
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const groups = useMemo(() => {
    const out: { category: string; start: string; end: string; cost: number; items: { label: string; start: string; end: string; cost: number }[] }[] = []
    for (const e of gantt) {
      const claims = entryClaimSegments(e).filter(c =>
        c.seg.startDate && c.seg.endDate && c.seg.startDate <= sunIso && c.seg.endDate >= monIso)
      if (claims.length === 0) continue
      const items = claims.map(c => ({
        label: c.label || (c.costType ? c.costType.charAt(0).toUpperCase() + c.costType.slice(1) : 'Scope'),
        start: c.seg.startDate, end: c.seg.endDate, cost: c.seg.costAllocation || 0,
      }))
      out.push({
        category: e.category,
        start: items.reduce((m, i) => i.start < m ? i.start : m, items[0].start),
        end: items.reduce((m, i) => i.end > m ? i.end : m, items[0].end),
        cost: items.reduce((s, i) => s + i.cost, 0),
        items,
      })
    }
    return out.sort((a, b) => a.start.localeCompare(b.start))
  }, [gantt, monIso, sunIso])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-xs text-fg-muted">{fmt(monIso)} &ndash; {fmt(friIso)}</span>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted py-4 text-center rounded-lg border border-fg-border/60 border-dashed">
          No work scheduled {title === 'This week' ? 'this week' : title.toLowerCase()}.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map(g => {
            const expandable = g.items.length > 1
            const isOpen = !!open[g.category]
            return (
              <li key={g.category} className="rounded-lg border border-fg-border overflow-hidden">
                <button className="w-full p-3 flex items-center justify-between text-left"
                  onClick={() => expandable && setOpen(o => ({ ...o, [g.category]: !o[g.category] }))}>
                  <div className="min-w-0 flex items-center gap-1.5">
                    {expandable && (
                      <span className={`shrink-0 text-fg-muted text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                    )}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{g.category}</p>
                      <p className="text-xs text-fg-muted">
                        {fmt(g.start)} &ndash; {fmt(g.end)}{expandable ? ` · ${g.items.length} scopes` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-fg-muted tabular-nums shrink-0">{money(g.cost)}</span>
                </button>
                {expandable && isOpen && (
                  <ul className="border-t border-fg-border/50 divide-y divide-fg-border/40 bg-fg-card/20">
                    {g.items.map((it, i) => (
                      <li key={i} className="px-3 py-2 pl-8 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm truncate">{it.label}</p>
                          <p className="text-[11px] text-fg-muted">{fmt(it.start)} &ndash; {fmt(it.end)}</p>
                        </div>
                        <span className="text-[11px] text-fg-muted tabular-nums shrink-0">{money(it.cost)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Dashboard (default landing — the at-a-glance cockpit view) ─────────────────────
function Dashboard({ project, gantt, card, milestones, openTab, safety, plans, baseline, hoursWeeks, variations, refreshVariations }: {
  project: SiteProject; gantt: GanttEntry[]; card: ReturnType<typeof computeScorecard>
  milestones: SiteMilestone[]; openTab: (t: Tab) => void
  safety: SiteSafety | null; plans: SitePlan[]; baseline: SiteBaseline | null
  hoursWeeks: { weekEnding: string; hours: number }[]
  variations: SiteVariation[]; refreshVariations: () => void
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

  // Crew hours pulse: this week's logged Xero hours vs the labour hours the gantt scheduled
  // for this week (labour claims x their week share, at the standard rate).
  const hoursPulse = useMemo(() => {
    const mon = thisMonday()
    const monIso = toISO(mon), friIso = toISO(addDays(mon, 4))
    const logged = hoursWeeks.find(w => w.weekEnding === friIso)?.hours ?? 0
    let plannedCost = 0
    for (const e of gantt) for (const { costType, seg } of entryClaimSegments(e)) {
      if (costType !== 'labour') continue
      plannedCost += (seg.costAllocation || 0) * segmentWeekShare(seg, monIso, friIso)
    }
    const plannedHrs = plannedCost / STD_LABOUR_RATE
    return plannedHrs > 0 || logged > 0 ? { logged: Math.round(logged), planned: Math.round(plannedHrs) } : null
  }, [gantt, hoursWeeks])

  // Call-ups: work starting within the next ~2 weeks that hasn't begun - confirm subbies, order materials.
  const startingSoon = useMemo(() => {
    const horizon = toISO(addDays(new Date(), 14))
    const out: { category: string; label: string; start: string; inDays: number }[] = []
    for (const e of gantt) for (const { costType, seg } of entryClaimSegments(e)) {
      if (!seg.startDate || seg.startDate <= todayIso || seg.startDate > horizon) continue
      out.push({
        category: e.category,
        label: costType ? costType.charAt(0).toUpperCase() + costType.slice(1) : '',
        start: seg.startDate,
        inDays: Math.round((new Date(seg.startDate).getTime() - new Date(todayIso).getTime()) / 86400000),
      })
    }
    out.sort((a, b) => a.start.localeCompare(b.start))
    // One line per category (earliest start), max 5.
    const seen = new Set<string>()
    return out.filter(o => !seen.has(o.category) && seen.add(o.category)).slice(0, 5)
  }, [gantt, todayIso])

  // Per-category slip vs the latest office baseline (start-date slip, worst first).
  const slipList = useMemo(() => {
    if (!baseline) return null
    const currentStart = new Map<string, string>()
    for (const e of gantt) for (const s of entrySegments(e)) {
      if (!s.startDate) continue
      const ex = currentStart.get(e.category)
      if (!ex || s.startDate < ex) currentStart.set(e.category, s.startDate)
    }
    const rows: { category: string; days: number }[] = []
    for (const b of baseline.categories) {
      const cur = currentStart.get(b.category)
      if (!cur) continue
      const days = Math.round((new Date(cur).getTime() - new Date(b.start).getTime()) / 86400000)
      if (days > 0) rows.push({ category: b.category, days })
    }
    return rows.sort((a, b) => b.days - a.days).slice(0, 3)
  }, [baseline, gantt])

  // Heads up: the act-on-it list. Monday toolbox rule, SWMS ack gaps, subbie docs, holidays,
  // open incidents, freshly-updated drawings.
  const nudges = useMemo(() => {
    const out: { text: string; level: 'red' | 'amber' | 'info'; tab?: Tab }[] = []
    const now = new Date()
    const mon = thisMonday()

    if (safety) {
      // Toolbox talk every Monday.
      const monIso = toISO(mon)
      const hadThisWeek = safety.toolbox.some(t => toISO(new Date(t.heldAt)) >= monIso)
      if (!hadThisWeek) {
        const dow = now.getDay()
        if (dow === 1) out.push({ text: 'Toolbox talk due today (every Monday)', level: 'red', tab: 'safety' })
        else if (dow > 1 && dow <= 5) out.push({ text: 'Toolbox talk overdue - it was due Monday', level: 'red', tab: 'safety' })
      }
      // SWMS acknowledgement gaps: workers on site today who haven't accepted an active SWMS.
      const todaysWorkers = Array.from(new Set(
        safety.today.filter(v => v.role === 'worker').map(v => v.personName.trim().toLowerCase())))
      for (const w of safety.swms) {
        const acked = new Set(w.ackNames.map(n => n.trim().toLowerCase()))
        const missing = todaysWorkers.filter(n => !acked.has(n))
        if (missing.length > 0) {
          out.push({ text: `${missing.length} on site ${missing.length === 1 ? 'hasn’t' : 'haven’t'} acknowledged "${w.activityName}"`, level: 'amber', tab: 'safety' })
        }
      }
      // Subbie docs.
      for (const sc of safety.subbieCompliance) {
        if (sc.status === 'missing_or_expired') out.push({ text: `${sc.name}: compliance docs missing or expired`, level: 'red', tab: 'safety' })
        else if (sc.status === 'expiring') out.push({ text: `${sc.name}: compliance docs expiring soon`, level: 'amber', tab: 'safety' })
      }
      // Open incidents.
      const open = safety.incidents.filter(i => i.status === 'open').length
      if (open > 0) out.push({ text: `${open} open incident${open === 1 ? '' : 's'}`, level: 'amber', tab: 'safety' })
    }

    // VIC public holidays in the next fortnight.
    for (let i = 0; i <= 14; i++) {
      const d = addDays(new Date(), i)
      const iso = toISO(d)
      if (isVicPublicHoliday(iso)) {
        const name = vicPublicHolidayName(iso) || 'Public holiday'
        out.push({ text: `${name} ${i === 0 ? 'today' : `on ${fmt(iso)}`} - no work day`, level: 'info' })
      }
    }

    // Drawings updated in the last 7 days.
    const weekAgo = addDays(new Date(), -7).toISOString()
    const freshPlans = plans.filter(p => p.updatedAt && p.updatedAt >= weekAgo).length
    if (freshPlans > 0) out.push({ text: `${freshPlans} drawing${freshPlans === 1 ? '' : 's'} updated this week - check before building`, level: 'info', tab: 'plans' })

    return out
  }, [safety, plans])

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

      {/* Heads up - the act-on-it list */}
      {nudges.length > 0 && (
        <div className="rounded-xl border border-fg-border overflow-hidden">
          <p className="text-[10px] uppercase tracking-wide text-fg-muted px-3 pt-3">Heads up</p>
          <ul className="divide-y divide-fg-border/40 mt-1">
            {nudges.map((n, i) => (
              <li key={i}>
                <button onClick={() => n.tab && openTab(n.tab)} disabled={!n.tab}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.level === 'red' ? 'bg-red-500' : n.level === 'amber' ? 'bg-amber-500' : 'bg-fg-border'}`} />
                  <span className={`text-xs leading-snug ${n.level === 'red' ? 'text-red-700 font-medium' : n.level === 'amber' ? 'text-amber-700' : 'text-fg-muted'}`}>
                    {n.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
        {/* Crew hours pulse: logged Xero timesheet hours vs the labour hours scheduled this week */}
        {hoursPulse && (
          <div className="flex justify-between items-baseline text-[11px] mt-2 pt-2 border-t border-fg-border/40">
            <span className="text-fg-muted">Crew hours this week</span>
            <span className={`tabular-nums font-medium ${hoursPulse.planned > 0 && hoursPulse.logged < hoursPulse.planned * 0.7 ? 'text-amber-600' : 'text-fg-heading'}`}>
              {hoursPulse.logged}h logged{hoursPulse.planned > 0 ? ` · ~${hoursPulse.planned}h scheduled` : ''}
            </span>
          </div>
        )}
        {/* Categories running late vs the office baseline */}
        {slipList && slipList.length > 0 && (
          <div className="mt-2 pt-2 border-t border-fg-border/40 space-y-1">
            {slipList.map(sl => (
              <div key={sl.category} className="flex justify-between items-baseline text-[11px]">
                <span className="text-fg-muted truncate pr-2">{sl.category}</span>
                <span className={`tabular-nums shrink-0 ${sl.days > 5 ? 'text-red-600' : 'text-amber-600'}`}>+{sl.days}d vs baseline</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => openTab('schedule')} className="text-xs underline text-fg-muted mt-2">Open schedule</button>
      </div>

      {/* Weather (site suburb, next 5 days) */}
      <WeatherStrip address={project.address} />

      {/* The fortnight programme: this week + next week */}
      <ThisWeekStrip gantt={gantt} />
      <ThisWeekStrip gantt={gantt} offset={1} title="Next week" />

      {/* Call-ups: work starting soon - confirm subbies, order materials */}
      {startingSoon.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">Starting soon</h2>
          <ul className="space-y-2">
            {startingSoon.map((c, i) => (
              <li key={i} className="rounded-lg border border-fg-border p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.category}</p>
                  <p className="text-xs text-fg-muted">Confirm subbies / order materials</p>
                </div>
                <span className="text-xs text-fg-muted tabular-nums shrink-0">{fmt(c.start)} &middot; in {c.inDays}d</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Variations: the crew raise small ones (<= $1000) and the client approves digitally */}
      <VariationsCard projectId={project.id} variations={variations} refresh={refreshVariations} />

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

// ── Safety (site register + SWMS + toolbox + incidents - the foreman's WHS hub) ────
// Data is fetched once by the workspace (the Dashboard nudges share it) and passed in.
function Safety({ projectId, safety, refresh }: { projectId: string; safety: SiteSafety | null; refresh: () => void }) {
  const [ackFor, setAckFor] = useState<string | null>(null)   // swmsId with the ack form open
  const [showToolbox, setShowToolbox] = useState(false)
  const [showIncident, setShowIncident] = useState(false)

  if (safety === null) return <p className="text-sm text-fg-muted py-6 text-center">Loading...</p>
  const { site, onSiteNow, today, inductionCount, swms, toolbox, incidents, subbieCompliance } = safety
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
  const compDot: Record<string, string> = {
    ok: 'bg-green-500', expiring: 'bg-amber-500', missing_or_expired: 'bg-red-500', unlinked: 'bg-fg-border',
  }
  const compLabel: Record<string, string> = {
    ok: 'compliant', expiring: 'docs expiring', missing_or_expired: 'docs missing/expired', unlinked: 'not linked',
  }

  return (
    <section className="space-y-6">
      {site ? (
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
      ) : (
        <p className="text-xs text-fg-muted rounded-lg border border-dashed border-fg-border p-3 text-center">
          No safety site linked yet - ask the office to create one from the Safety page.
        </p>
      )}

      {site && (
        <div>
          <h2 className="text-sm font-medium mb-2">On site now ({onSiteNow.length})</h2>
          {onSiteNow.length === 0 ? (
            <p className="text-sm text-fg-muted py-3 text-center rounded-lg border border-fg-border/60 border-dashed">Nobody signed in.</p>
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
          {today.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-fg-muted cursor-pointer">Today&apos;s sign-ins ({today.length})</summary>
              <ul className="divide-y divide-fg-border/50 mt-1">
                {today.map(v => (
                  <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate pr-2">{v.personName}{v.company ? <span className="text-fg-muted"> · {v.company}</span> : ''}</span>
                    <span className="text-xs text-fg-muted tabular-nums shrink-0">
                      {time(v.signedInAt)}{v.signedOutAt ? ` – ${time(v.signedOutAt)}` : ' – on site'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Subbie compliance */}
      {subbieCompliance.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">Subbie compliance</h2>
          <ul className="space-y-1.5">
            {subbieCompliance.map((sc, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-fg-border px-3 py-2">
                <span className="text-sm truncate pr-2 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${compDot[sc.status]}`} />
                  {sc.name}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-fg-muted shrink-0">{compLabel[sc.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SWMS */}
      <div>
        <h2 className="text-sm font-medium mb-2">SWMS ({swms.length})</h2>
        {swms.length === 0 ? (
          <p className="text-sm text-fg-muted">No SWMS assigned - the office adds them from templates.</p>
        ) : (
          <ul className="space-y-2">
            {swms.map(w => (
              <li key={w.id} className="rounded-lg border border-fg-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">{w.activityName}</p>
                  <a href={`/api/safety/swms/${w.id}/pdf`} target="_blank" rel="noopener noreferrer"
                    className="text-xs underline text-fg-heading shrink-0">PDF</a>
                </div>
                <p className="text-[11px] text-fg-muted mt-0.5">{w.ackCount} acknowledged</p>
                {ackFor === w.id ? (
                  <SwmsAckForm projectId={projectId} swmsId={w.id}
                    onDone={() => { setAckFor(null); refresh() }} onCancel={() => setAckFor(null)} />
                ) : (
                  <button onClick={() => setAckFor(w.id)}
                    className="mt-2 text-xs underline text-fg-heading">Acknowledge (hand the phone over)</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Toolbox */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Toolbox meetings</h2>
          <button onClick={() => setShowToolbox(o => !o)} className="text-xs underline text-fg-heading">
            {showToolbox ? 'Cancel' : '+ New meeting'}
          </button>
        </div>
        {showToolbox && (
          <ToolboxForm projectId={projectId} suggested={today.map(v => ({ name: v.personName, company: v.company }))}
            onDone={() => { setShowToolbox(false); refresh() }} />
        )}
        {toolbox.length === 0 ? (
          !showToolbox && <p className="text-sm text-fg-muted">None recorded yet.</p>
        ) : (
          <ul className="divide-y divide-fg-border/50">
            {toolbox.map(t => (
              <li key={t.id} className="py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate pr-2">{t.topic}</span>
                  <span className="text-xs text-fg-muted shrink-0">{fmt(t.heldAt)}</span>
                </div>
                <p className="text-[11px] text-fg-muted">{t.attendees.length} attendees{t.notes ? ` · ${t.notes.slice(0, 80)}` : ''}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Incidents */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium">Incidents</h2>
          <button onClick={() => setShowIncident(o => !o)} className="text-xs underline text-fg-heading">
            {showIncident ? 'Cancel' : '+ Report incident'}
          </button>
        </div>
        {showIncident && (
          <IncidentForm projectId={projectId} onDone={() => { setShowIncident(false); refresh() }} />
        )}
        {incidents.length === 0 ? (
          !showIncident && <p className="text-sm text-fg-muted">None reported.</p>
        ) : (
          <ul className="divide-y divide-fg-border/50">
            {incidents.map(i => (
              <li key={i.id} className="py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-2">{i.description.slice(0, 70)}</span>
                  <span className={`text-[10px] uppercase tracking-wide shrink-0 ${i.severity === 'serious' || i.severity === 'critical' ? 'text-red-600' : 'text-fg-muted'}`}>
                    {SEVERITY_LABEL[i.severity]}
                  </span>
                </div>
                <p className="text-[11px] text-fg-muted">{fmt(i.occurredAt)}{i.notifiable ? ' · WorkSafe notifiable' : ''} · {i.status}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function SwmsAckForm({ projectId, swmsId, onDone, onCancel }: {
  projectId: string; swmsId: string; onDone: () => void; onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    const ok = await postSiteSafety(projectId, { kind: 'swms_ack', swmsId, name, company })
    setBusy(false)
    if (ok) onDone()
  }
  return (
    <div className="mt-2 rounded-lg bg-fg-card/30 p-3 space-y-2">
      <p className="text-[11px] text-fg-muted">Read the SWMS (PDF above), then enter your name to acknowledge it.</p>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy || !name.trim()}
          className="flex-1 rounded-lg bg-fg-heading text-white py-2.5 text-sm font-medium disabled:opacity-40">
          {busy ? 'Saving...' : 'I have read and understood this SWMS'}
        </button>
        <button onClick={onCancel} className="px-3 text-xs text-fg-muted underline">Cancel</button>
      </div>
    </div>
  )
}

function ToolboxForm({ projectId, suggested, onDone }: {
  projectId: string; suggested: { name: string; company?: string }[]; onDone: () => void
}) {
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [attendees, setAttendees] = useState<{ name: string; company?: string }[]>(suggested)
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState(false)
  const toggle = (n: { name: string; company?: string }) =>
    setAttendees(a => a.some(x => x.name === n.name) ? a.filter(x => x.name !== n.name) : [...a, n])
  const submit = async () => {
    if (!topic.trim()) return
    setBusy(true)
    const all = [...attendees, ...extra.split(',').map(s => ({ name: s.trim() })).filter(a => a.name)]
    const ok = await postSiteSafety(projectId, { kind: 'toolbox', topic, notes, attendees: all })
    setBusy(false)
    if (ok) onDone()
  }
  return (
    <div className="rounded-xl border border-fg-border p-3 mb-3 space-y-2">
      <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Topic (e.g. Working near the excavation)"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="What was discussed / agreed"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      {suggested.length > 0 && (
        <div>
          <p className="text-[11px] text-fg-muted mb-1">Attendees (from today&apos;s sign-ins):</p>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map(sug => (
              <button key={sug.name} onClick={() => toggle(sug)}
                className={`px-2.5 py-1.5 rounded-full text-xs border ${attendees.some(a => a.name === sug.name) ? 'bg-fg-heading text-white border-fg-heading' : 'border-fg-border text-fg-muted'}`}>
                {sug.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <input value={extra} onChange={e => setExtra(e.target.value)} placeholder="Other attendees (comma separated)"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <button onClick={submit} disabled={busy || !topic.trim()}
        className="w-full rounded-lg bg-fg-heading text-white py-2.5 text-sm font-medium disabled:opacity-40">
        {busy ? 'Saving...' : 'Save toolbox meeting'}
      </button>
    </div>
  )
}

function IncidentForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [severity, setSeverity] = useState('minor')
  const [people, setPeople] = useState('')
  const [actions, setActions] = useState('')
  const [notifiable, setNotifiable] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!description.trim()) return
    setBusy(true)
    const ok = await postSiteSafety(projectId, {
      kind: 'incident', description, location, severity, notifiable, actionsTaken: actions,
      occurredAt: new Date().toISOString(),
      people: people.split(',').map(s => ({ name: s.trim() })).filter(p => p.name),
    })
    setBusy(false)
    if (ok) onDone()
  }
  return (
    <div className="rounded-xl border border-fg-border p-3 mb-3 space-y-2">
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What happened?"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Where on site"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <input value={people} onChange={e => setPeople(e.target.value)} placeholder="People involved (comma separated)"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <div className="flex gap-2">
        {(['near_miss', 'minor', 'serious', 'critical'] as const).map(sv => (
          <button key={sv} onClick={() => setSeverity(sv)}
            className={`flex-1 rounded-lg border py-2 text-xs ${severity === sv ? 'bg-fg-heading text-white border-fg-heading' : 'border-fg-border text-fg-muted'}`}>
            {SEVERITY_LABEL[sv]}
          </button>
        ))}
      </div>
      <textarea value={actions} onChange={e => setActions(e.target.value)} rows={2} placeholder="Immediate actions taken"
        className="w-full border border-fg-border rounded-lg px-3 py-2.5 text-base bg-white" />
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={notifiable} onChange={e => setNotifiable(e.target.checked)} className="mt-0.5 accent-fg-heading" />
        <span>
          <span className="font-medium">WorkSafe notifiable?</span> Tick if: a death; hospital in-patient treatment;
          amputation, serious head/eye injury, electric shock, serious laceration, spinal injury; or a dangerous
          incident (collapse, explosion, fire, uncontrolled escape, fall of person/object from 2m+).
          <span className="text-red-600"> If ticked, call the office immediately - WorkSafe must be notified without delay.</span>
        </span>
      </label>
      <button onClick={submit} disabled={busy || !description.trim()}
        className="w-full rounded-lg bg-fg-heading text-white py-2.5 text-sm font-medium disabled:opacity-40">
        {busy ? 'Saving...' : 'Save incident report'}
      </button>
    </div>
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
                  {l.budget > 0
                    ? l.key === 'subbies'
                      ? `${Math.round(l.consumedPct * 100)}% of allowance committed`
                      : `${Math.round(l.consumedPct * 100)}% of allowance used · ${Math.round(l.progressPct * 100)}% of its work elapsed`
                    : 'No allowance'}
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
