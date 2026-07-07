'use client'

// Client Introduction Pack - sent on job-planning day. Client + dates auto-fill from the project
// and the finished Gantt; every text block is editable and autosaves; the team roster is the shared
// company record. Print-styled A4 to match the Formation pack; pool pages appear only on pool jobs.

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { entrySegments } from '@/lib/ganttForecast'
import {
  siteMe, getSiteProject, getSiteGantt, getSiteIntroPack, saveSiteIntroPack, getIntroRoster, saveIntroRoster,
  type SiteProject, type IntroPackData, type IntroRoster,
} from '@/lib/siteData'
import {
  DEFAULT_ROSTER, DEFAULT_WELCOME_BODY, DEFAULT_SERVICE_PROMISE, DEFAULT_SERVICE_QUOTE,
  LANDSCAPE_PROCESS, POOL_PROCESS, COMPANY, type ProcessStep,
} from '@/lib/introPack'
import type { GanttEntry } from '@/types'
import { Printer, ArrowLeft } from 'lucide-react'

const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const BG_WARM = '#F0EEEB'

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' })
}

/** Auto-growing textarea that prints as clean text. */
function EditableText({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string
}) {
  return (
    <>
      <textarea
        value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={1}
        className={`print:hidden w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none resize-none transition-colors ${className}`}
        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }}
        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px` }}
      />
      <div className={`hidden print:block whitespace-pre-wrap ${className}`}>{value}</div>
    </>
  )
}

export default function IntroPackPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<SiteProject | null>(null)
  const [gantt, setGantt] = useState<GanttEntry[]>([])
  const [pack, setPack] = useState<IntroPackData | null>(null)
  const [roster, setRoster] = useState<IntroRoster>(DEFAULT_ROSTER)
  const [editTeam, setEditTeam] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    siteMe().then(m => {
      if (!m) { router.replace('/site'); return }
      getSiteProject(id).then(p => { if (!p) { router.replace('/site'); return } setProject(p) })
      getSiteGantt(id).then(setGantt)
      getSiteIntroPack(id).then(setPack)
      getIntroRoster().then(r => { if (r) setRoster(r) })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Debounced pack autosave (flush on leave).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<IntroPackData | null>(null)
  const mutate = (patch: Partial<IntroPackData>) => {
    setPack(prev => {
      const next = { ...(prev ?? {}), ...patch }
      pendingRef.current = next
      setSaveState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { pendingRef.current = null; void saveSiteIntroPack(id, next).then(() => setSaveState('saved')) }, 700)
      return next
    })
  }
  useEffect(() => {
    const flush = () => { if (pendingRef.current) void saveSiteIntroPack(id, pendingRef.current) }
    window.addEventListener('beforeunload', flush); window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); flush() }
  }, [id])

  // Roster autosave (shared company record - edits flow to every pack).
  const rosterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mutateRoster = (next: IntroRoster) => {
    setRoster(next)
    if (rosterTimer.current) clearTimeout(rosterTimer.current)
    rosterTimer.current = setTimeout(() => { void saveIntroRoster(next) }, 800)
  }

  if (!project || !pack) return <div className="max-w-2xl mx-auto px-6 py-12"><p className="text-sm text-gray-400">Loading…</p></div>

  // Auto-fills from the finished Gantt: first bar start, last bar end.
  let ganttStart = '', ganttEnd = ''
  for (const e of gantt) for (const s of entrySegments(e)) {
    if (s.startDate && (!ganttStart || s.startDate < ganttStart)) ganttStart = s.startDate
    if (s.endDate && s.endDate > ganttEnd) ganttEnd = s.endDate
  }
  const startDate = pack.startDate ?? ganttStart
  const completionDate = pack.completionDate ?? ganttEnd
  const greeting = pack.welcomeGreeting ?? (project.clientName ? `${project.clientName},` : '')
  const ptype = (project as unknown as { projectType?: string }).projectType
  const includePool = pack.includePool ?? (ptype === 'landscape_and_pool' || ptype === 'pool_only')

  const landscapeSteps: ProcessStep[] = pack.landscapeSteps ?? LANDSCAPE_PROCESS
  const poolSteps: ProcessStep[] = pack.poolSteps ?? POOL_PROCESS
  const managers = roster.contacts.filter(c => !c.pool || includePool)
  const grouped = {
    manager: roster.members.filter(m => m.group === 'manager'),
    foreman: roster.members.filter(m => m.group === 'foreman'),
    landscaper: roster.members.filter(m => m.group === 'landscaper'),
  }

  const pad2 = (n: number) => String(n).padStart(2, '0')

  return (
    <div className="min-h-screen bg-white" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{`
        @media print {
          .ip-page { break-after: page; }
          .ip-cover { height: 25cm; }
          .ip-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="print:hidden bg-fg-darker px-5 py-3 flex items-center justify-between">
        <Link href={`/site/${id}`} className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Cockpit
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-2xs text-white/40 w-12">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}</span>
          <button onClick={() => setEditTeam(v => !v)}
            className={`px-3 py-1.5 text-xs font-light tracking-architectural uppercase transition-colors ${editTeam ? 'bg-white/25 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
            {editTeam ? 'Done editing team' : 'Edit team'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* ── COVER ── */}
      <div className="ip-page ip-cover relative h-[70vh] min-h-[520px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/intro/cover.png" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 55%)' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/formation-logo-white.svg" alt="Formation" className="absolute top-8 left-10 h-6 w-auto" />
        <div className="absolute bottom-14 left-10 right-10">
          <h1 className="text-white font-light leading-tight" style={{ fontSize: 'clamp(34px, 5vw, 54px)' }}>
            Inspired design,<br />grounded in service.
          </h1>
          <p className="text-white/85 font-light text-lg mt-4">{project.clientName}</p>
          <p className="text-white/65 font-light">{project.address}</p>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto px-8 py-14 print:px-10 print:py-12">
        {/* ── WELCOME ── */}
        <div className="ip-page mb-16">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>Welcome</p>
          <div className="h-px w-16 mb-8" style={{ backgroundColor: GREEN }} />
          <input value={greeting} onChange={e => mutate({ welcomeGreeting: e.target.value })}
            className="print:hidden text-2xl font-light w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 outline-none mb-1" style={{ color: HEADING }} />
          <p className="hidden print:block text-2xl font-light mb-1" style={{ color: HEADING }}>{greeting}</p>
          <p className="text-base font-light mb-6" style={{ color: GREEN }}>Welcome to the Formation family</p>
          <EditableText value={pack.welcomeBody ?? DEFAULT_WELCOME_BODY} onChange={v => mutate({ welcomeBody: v })}
            placeholder="Welcome letter…" className="text-sm font-light leading-relaxed" />

          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { label: 'Job Address', value: project.address || '—', print: true },
              { label: 'Start Date', value: fmtDate(startDate) || 'TBC', edit: 'start' as const },
              { label: 'Completion (approx.)', value: fmtDate(completionDate) || 'TBC', edit: 'end' as const },
            ].map(f => (
              <div key={f.label} className="px-5 py-4" style={{ backgroundColor: BG_WARM }}>
                <p className="text-2xs tracking-widest uppercase mb-1.5" style={{ color: MUTED }}>{f.label}</p>
                {f.edit ? (
                  <>
                    <input type="date" value={f.edit === 'start' ? (startDate || '') : (completionDate || '')}
                      onChange={e => mutate(f.edit === 'start' ? { startDate: e.target.value } : { completionDate: e.target.value })}
                      className="print:hidden text-sm font-light bg-transparent border border-gray-200 px-1.5 py-0.5 rounded-none outline-none w-full" style={{ color: HEADING }} />
                    <p className="hidden print:block text-sm font-light" style={{ color: HEADING }}>{f.value}</p>
                  </>
                ) : <p className="text-sm font-light" style={{ color: HEADING }}>{f.value}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* ── CONTACTS ── */}
        <div className="ip-page mb-16">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>Your Team &amp; Contacts</p>
          <div className="h-px w-16 mb-6" style={{ backgroundColor: GREEN }} />
          <p className="text-sm font-light leading-relaxed mb-8" style={{ color: BODY }}>
            We&apos;re here at every step of the way. Throughout the project you&apos;ll have a consistent, dedicated team who can assist with any questions, queries or concerns.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {/* Job foreman - this job's supervisor */}
            <div className="px-5 py-4" style={{ backgroundColor: BG_WARM }}>
              <p className="text-2xs tracking-widest uppercase mb-1.5" style={{ color: GREEN }}>Job Foreman</p>
              <input value={pack.foremanName ?? project.foreman ?? ''} onChange={e => mutate({ foremanName: e.target.value })}
                className="print:hidden text-base font-normal w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 outline-none" style={{ color: HEADING }} />
              <p className="hidden print:block text-base font-normal" style={{ color: HEADING }}>{pack.foremanName ?? project.foreman}</p>
              <input value={pack.foremanPhone ?? ''} onChange={e => mutate({ foremanPhone: e.target.value })} placeholder="Phone"
                className="print:hidden block text-sm font-light mt-1 w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 outline-none" style={{ color: BODY }} />
              <input value={pack.foremanEmail ?? ''} onChange={e => mutate({ foremanEmail: e.target.value })} placeholder="Email"
                className="print:hidden block text-sm font-light w-full bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-400 outline-none" style={{ color: BODY }} />
              <p className="hidden print:block text-sm font-light mt-1" style={{ color: BODY }}>{pack.foremanPhone}</p>
              <p className="hidden print:block text-sm font-light" style={{ color: BODY }}>{pack.foremanEmail}</p>
            </div>
            {managers.map((c, i) => (
              <div key={i} className="px-5 py-4" style={{ backgroundColor: BG_WARM }}>
                <p className="text-2xs tracking-widest uppercase mb-1.5" style={{ color: GREEN }}>{c.role}</p>
                <p className="text-base font-normal" style={{ color: HEADING }}>{c.name}</p>
                <p className="text-sm font-light mt-1" style={{ color: BODY }}>{c.phone}</p>
                <p className="text-sm font-light" style={{ color: BODY }}>{c.email}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── SERVICE PROMISE ── */}
        <div className="ip-page mb-16 ip-avoid">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>Our Service Promise</p>
          <div className="h-px w-16 mb-6" style={{ backgroundColor: GREEN }} />
          <EditableText value={pack.servicePromise ?? DEFAULT_SERVICE_PROMISE} onChange={v => mutate({ servicePromise: v })}
            placeholder="Service promise…" className="text-base font-light leading-relaxed mb-8" />
          <div className="px-6 py-5" style={{ backgroundColor: BG_WARM }}>
            <EditableText value={pack.serviceQuote ?? DEFAULT_SERVICE_QUOTE} onChange={v => mutate({ serviceQuote: v })}
              placeholder="Testimonial…" className="text-sm font-light italic leading-relaxed" />
          </div>
        </div>

        {/* ── MEET THE TEAM ── */}
        <div className="ip-page mb-16">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>Meet Your Team</p>
          <div className="h-px w-16 mb-2" style={{ backgroundColor: GREEN }} />
          {editTeam && <p className="print:hidden text-2xs italic mb-6" style={{ color: MUTED }}>Editing here updates the company roster shown on every pack.</p>}
          {(['manager', 'foreman', 'landscaper'] as const).flatMap(g => grouped[g]).map(m => (
            <div key={m.id} className="ip-avoid flex gap-5 mb-6 items-start">
              {m.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.photo} alt={m.name} className="w-24 h-24 object-cover rounded-lg shrink-0" style={{ backgroundColor: BG_WARM }} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-base font-normal" style={{ color: HEADING }}>{m.name}</p>
                  <p className="text-2xs tracking-wide uppercase" style={{ color: GREEN }}>{m.role}</p>
                </div>
                {editTeam ? (
                  <EditableText value={m.bio}
                    onChange={v => mutateRoster({ ...roster, members: roster.members.map(x => x.id === m.id ? { ...x, bio: v } : x) })}
                    placeholder="Bio…" className="text-sm font-light leading-relaxed mt-1" />
                ) : (
                  <p className="text-sm font-light leading-relaxed mt-1" style={{ color: BODY }}>{m.bio}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── LANDSCAPE PROCESS ── */}
        <div className="ip-page mb-16">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>Our Process &mdash; Landscape</p>
          <div className="h-px w-16 mb-8" style={{ backgroundColor: GREEN }} />
          {landscapeSteps.map((s, i) => (
            <div key={i} className="ip-avoid mb-5 grid grid-cols-[52px_1fr] gap-4">
              <span className="text-sm font-light tabular-nums" style={{ color: GREEN }}>{pad2(i + 1)} &mdash;</span>
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: HEADING }}>{s.title}</p>
                <EditableText value={s.body}
                  onChange={v => mutate({ landscapeSteps: landscapeSteps.map((x, j) => j === i ? { ...x, body: v } : x) })}
                  placeholder="Step detail…" className="text-sm font-light leading-relaxed" />
              </div>
            </div>
          ))}
        </div>

        {/* ── POOL PROCESS (pool jobs only) ── */}
        {includePool && (
          <div className="ip-page mb-16">
            <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>Our Process &mdash; Pool &amp; Spa</p>
            <div className="h-px w-16 mb-8" style={{ backgroundColor: GREEN }} />
            {poolSteps.map((s, i) => (
              <div key={i} className="ip-avoid mb-5 grid grid-cols-[52px_1fr] gap-4">
                <span className="text-sm font-light tabular-nums" style={{ color: GREEN }}>{pad2(i + 1)} &mdash;</span>
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: HEADING }}>{s.title}</p>
                  <EditableText value={s.body}
                    onChange={v => mutate({ poolSteps: poolSteps.map((x, j) => j === i ? { ...x, body: v } : x) })}
                    placeholder="Step detail…" className="text-sm font-light leading-relaxed" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── THANK YOU ── */}
        <div className="ip-avoid text-center py-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/formation-primary-black.svg" alt="Formation" className="h-9 w-auto mx-auto mb-5"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <p className="text-lg font-light mb-6" style={{ color: HEADING }}>Thank you for choosing Formation. We&apos;re thrilled to be working with you.</p>
          <p className="text-sm font-light" style={{ color: BODY }}>{COMPANY.phone}</p>
          <p className="text-sm font-light" style={{ color: BODY }}>{COMPANY.email}</p>
          <p className="text-sm font-light" style={{ color: GREEN }}>{COMPANY.web}</p>
        </div>
      </div>

      {/* Pool toggle (screen only) */}
      <div className="print:hidden fixed bottom-4 right-4 bg-white border border-gray-200 shadow-lg px-3 py-2 text-2xs">
        <label className="flex items-center gap-2 text-gray-600">
          <input type="checkbox" checked={includePool}
            onChange={e => mutate({ includePool: e.target.checked })} className="accent-fg-heading" />
          Include Pool &amp; Spa pages
        </label>
      </div>
    </div>
  )
}
