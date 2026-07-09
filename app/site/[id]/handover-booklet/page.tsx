'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Plus } from 'lucide-react'
import {
  siteMe, getSiteProject, getSiteSubbies, getSiteIrrigation, getSiteBooklet, saveSiteBooklet,
  type SiteProject, type IrrigationPlan, type HandoverBookletData,
} from '@/lib/siteData'
import { generateId } from '@/lib/utils'
import { zoneCentroid } from '@/lib/irrigationPlan'
import { COMPANY } from '@/lib/introPack'
import {
  DEFAULT_WELCOME_BODY, DEFAULT_CONTROLLER_GUIDE, DEFAULT_WARRANTY, seedCareGuides, BOOKLET_TAGLINE,
  type CareGuide, type ZoneScheduleRow, type SupplierRow,
} from '@/lib/handoverBooklet'
import type { SubcontractorPackage } from '@/types'

const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const BG_WARM = '#F0EEEB'

// Auto-growing textarea that prints as clean wrapped text (edit affordance hidden in print).
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

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="text-2xs tracking-[0.25em] uppercase mb-3" style={{ color: GREEN }}>{n} - {children}</p>
  )
}

export default function HandoverBookletPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<SiteProject | null>(null)
  const [irrigation, setIrrigation] = useState<IrrigationPlan | null>(null)
  const [subbies, setSubbies] = useState<SubcontractorPackage[]>([])
  const [data, setData] = useState<HandoverBookletData | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [meName, setMeName] = useState('')

  useEffect(() => {
    siteMe().then(m => {
      if (!m) { router.replace('/site'); return }
      setMeName(m.name)
      getSiteProject(id).then(p => { if (!p) { router.replace('/site'); return } setProject(p) })
      getSiteIrrigation(id).then(setIrrigation)
      getSiteSubbies(id).then(s => setSubbies(s || []))
      getSiteBooklet(id).then(setData)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<HandoverBookletData | null>(null)
  const mutate = (patch: Partial<HandoverBookletData>) => {
    setData(prev => {
      const next = { ...(prev ?? {}), ...patch }
      pendingRef.current = next
      setSaveState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { pendingRef.current = null; void saveSiteBooklet(id, next).then(() => setSaveState('saved')) }, 700)
      return next
    })
  }
  useEffect(() => {
    const flush = () => { if (pendingRef.current) void saveSiteBooklet(id, pendingRef.current) }
    window.addEventListener('beforeunload', flush); window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); flush() }
  }, [id])

  if (!project || !data || !irrigation) return <div className="max-w-2xl mx-auto px-6 py-12"><p className="text-sm text-gray-400">Loading...</p></div>

  // Effective values: stored, else seeded from the plan / subbies / defaults.
  const greeting = data.welcomeGreeting ?? (project.clientName ? `${project.clientName},` : '')
  const welcomeBody = data.welcomeBody ?? DEFAULT_WELCOME_BODY
  const materials = data.materials ?? ''
  const controllerGuide = data.controllerGuide ?? DEFAULT_CONTROLLER_GUIDE
  const warranty = data.warranty ?? DEFAULT_WARRANTY
  const careGuides: CareGuide[] = data.careGuides ?? seedCareGuides(generateId)
  const zoneSchedule: ZoneScheduleRow[] = data.zoneSchedule
    ?? irrigation.zones.map(z => ({ id: z.id, zone: z.label, waters: '', runtime: '' }))
  const suppliers: SupplierRow[] = data.suppliers
    ?? subbies.map(s => ({ id: s.id, trade: s.trade || '', name: s.name || '', phone: '' }))

  const setCare = (rows: CareGuide[]) => mutate({ careGuides: rows })
  const setZones = (rows: ZoneScheduleRow[]) => mutate({ zoneSchedule: rows })
  const setSuppliers = (rows: SupplierRow[]) => mutate({ suppliers: rows })

  return (
    <div className="min-h-screen bg-white" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{`
        @media print {
          .hb-page { break-after: page; }
          .hb-cover { height: 25cm; }
          .hb-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="print:hidden bg-fg-darker px-5 py-3 flex items-center justify-between">
        <Link href={`/site/${id}`} className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Cockpit
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-2xs text-white/40 w-12">{saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : ''}</span>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors">
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto px-8 lg:px-14 py-10" style={{ color: BODY }}>
        {/* Cover */}
        <div className="hb-page hb-cover flex flex-col justify-between py-10" style={{ minHeight: '70vh' }}>
          <p className="text-xs tracking-[0.3em] uppercase" style={{ color: GREEN }}>Formation Landscapes</p>
          <div>
            <p className="text-3xl font-light leading-tight" style={{ color: HEADING }}>{BOOKLET_TAGLINE}</p>
            <div className="mt-8">
              <p className="text-lg font-light" style={{ color: HEADING }}>{project.name}</p>
              <p className="text-sm" style={{ color: MUTED }}>{project.clientName}{project.clientName && project.address ? ' - ' : ''}{project.address}</p>
              <p className="text-sm mt-6" style={{ color: MUTED }}>Handover booklet</p>
            </div>
          </div>
          <p className="text-2xs" style={{ color: MUTED }}>{COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email} &nbsp;|&nbsp; {COMPANY.web}</p>
        </div>

        {/* 01 Welcome */}
        <div className="hb-page mb-14">
          <SectionTitle n="01">Welcome</SectionTitle>
          <EditableText value={greeting} onChange={v => mutate({ welcomeGreeting: v })} placeholder="Client name,"
            className="text-2xl font-light mb-4" />
          <div style={{ color: HEADING }}>
            <EditableText value={welcomeBody} onChange={v => mutate({ welcomeBody: v })} placeholder="Welcome message..."
              className="text-sm leading-relaxed font-light" />
          </div>
        </div>

        {/* 02 Materials used */}
        <div className="hb-page mb-14">
          <SectionTitle n="02">Materials used</SectionTitle>
          <p className="text-xs mb-2" style={{ color: MUTED }}>The key materials and products in your landscape, so you know exactly what you have.</p>
          <EditableText value={materials} onChange={v => mutate({ materials: v })}
            placeholder="Paving & tiling: ...&#10;Concrete: ...&#10;Timber & decking: ...&#10;Lighting: ..."
            className="text-sm leading-relaxed font-light" />
        </div>

        {/* 03 Irrigation plan */}
        <div className="hb-page mb-14">
          <SectionTitle n="03">Irrigation plan</SectionTitle>
          {irrigation.planUrl ? (
            <>
              <div className="relative border" style={{ borderColor: BG_WARM }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={irrigation.planUrl} alt="Irrigation plan" className="block w-full" />
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {irrigation.zones.map(z => (
                    <polygon key={z.id} points={z.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill={`${z.color}44`} stroke={z.color} strokeWidth={0.003} strokeLinejoin="round" />
                  ))}
                </svg>
                {irrigation.zones.map(z => {
                  const c = zoneCentroid(z)
                  return (
                    <span key={z.id} style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, backgroundColor: z.color }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 text-white text-[9px] font-medium px-1 py-0.5 rounded whitespace-nowrap">
                      {z.label}
                    </span>
                  )
                })}
              </div>
              {irrigation.zones.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
                  {irrigation.zones.map(z => (
                    <span key={z.id} className="flex items-center gap-1.5 text-xs" style={{ color: BODY }}>
                      <span className="w-3 h-3 rounded" style={{ backgroundColor: z.color }} />{z.label}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: MUTED }}>No irrigation plan marked up yet. Add one in the cockpit Handover tab (Irrigation plan), then it appears here.</p>
          )}
        </div>

        {/* 04 Irrigation zones & controller */}
        <div className="hb-page mb-14">
          <SectionTitle n="04">Irrigation zones & controller</SectionTitle>
          <table className="w-full text-sm mb-5">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide" style={{ color: MUTED }}>
                <th className="py-1.5 pr-3 font-medium">Zone</th>
                <th className="py-1.5 pr-3 font-medium">What it waters</th>
                <th className="py-1.5 pr-3 font-medium">Run time / frequency</th>
                <th className="print:hidden" />
              </tr>
            </thead>
            <tbody>
              {zoneSchedule.map((r, i) => (
                <tr key={r.id} className="border-t hb-avoid" style={{ borderColor: BG_WARM }}>
                  <td className="py-1.5 pr-3 align-top">
                    <input value={r.zone} onChange={e => setZones(zoneSchedule.map((x, j) => j === i ? { ...x, zone: e.target.value } : x))}
                      className="w-full bg-transparent outline-none print:hidden" placeholder="Zone" />
                    <span className="hidden print:block">{r.zone}</span>
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <input value={r.waters} onChange={e => setZones(zoneSchedule.map((x, j) => j === i ? { ...x, waters: e.target.value } : x))}
                      className="w-full bg-transparent outline-none print:hidden" placeholder="e.g. Front garden beds" />
                    <span className="hidden print:block">{r.waters}</span>
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <input value={r.runtime} onChange={e => setZones(zoneSchedule.map((x, j) => j === i ? { ...x, runtime: e.target.value } : x))}
                      className="w-full bg-transparent outline-none print:hidden" placeholder="e.g. 10 min, 3x / week" />
                    <span className="hidden print:block">{r.runtime}</span>
                  </td>
                  <td className="print:hidden align-top">
                    <button onClick={() => setZones(zoneSchedule.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-xs">&#10005;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setZones([...zoneSchedule, { id: generateId(), zone: '', waters: '', runtime: '' }])}
            className="print:hidden flex items-center gap-1 text-xs mb-5" style={{ color: GREEN }}>
            <Plus className="w-3 h-3" /> Add zone
          </button>
          <p className="text-2xs tracking-[0.2em] uppercase mb-1.5" style={{ color: MUTED }}>Using your controller</p>
          <EditableText value={controllerGuide} onChange={v => mutate({ controllerGuide: v })} placeholder="Controller instructions..."
            className="text-sm leading-relaxed font-light" />
        </div>

        {/* 05 Care & maintenance */}
        <div className="hb-page mb-14">
          <SectionTitle n="05">Care & maintenance</SectionTitle>
          <p className="text-xs mb-4" style={{ color: MUTED }}>How to look after each part of your landscape. Remove any that don&apos;t apply to your job.</p>
          <div className="space-y-5">
            {careGuides.map((g, i) => (
              <div key={g.id} className="hb-avoid">
                <div className="flex items-center gap-2">
                  <input value={g.element} onChange={e => setCare(careGuides.map((x, j) => j === i ? { ...x, element: e.target.value } : x))}
                    className="text-sm font-medium bg-transparent outline-none print:hidden flex-1" style={{ color: HEADING }} placeholder="Element" />
                  <span className="hidden print:block text-sm font-medium" style={{ color: HEADING }}>{g.element}</span>
                  <button onClick={() => setCare(careGuides.filter((_, j) => j !== i))} className="print:hidden text-gray-300 hover:text-red-500 text-xs">&#10005;</button>
                </div>
                <EditableText value={g.body} onChange={v => setCare(careGuides.map((x, j) => j === i ? { ...x, body: v } : x))}
                  placeholder="Care instructions..." className="text-sm leading-relaxed font-light mt-0.5" />
              </div>
            ))}
          </div>
          <button onClick={() => setCare([...careGuides, { id: generateId(), element: '', body: '' }])}
            className="print:hidden flex items-center gap-1 text-xs mt-4" style={{ color: GREEN }}>
            <Plus className="w-3 h-3" /> Add element
          </button>
        </div>

        {/* 06 Warranty */}
        <div className="hb-page mb-14">
          <SectionTitle n="06">Warranty</SectionTitle>
          <EditableText value={warranty} onChange={v => mutate({ warranty: v })} placeholder="Warranty terms..."
            className="text-sm leading-relaxed font-light" />
        </div>

        {/* 07 Suppliers & subcontractors */}
        <div className="hb-page mb-14">
          <SectionTitle n="07">Suppliers & subcontractors</SectionTitle>
          <p className="text-xs mb-3" style={{ color: MUTED }}>The trades and suppliers who helped build your landscape.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide" style={{ color: MUTED }}>
                <th className="py-1.5 pr-3 font-medium">Trade / supply</th>
                <th className="py-1.5 pr-3 font-medium">Company</th>
                <th className="py-1.5 pr-3 font-medium">Phone</th>
                <th className="print:hidden" />
              </tr>
            </thead>
            <tbody>
              {suppliers.map((r, i) => (
                <tr key={r.id} className="border-t hb-avoid" style={{ borderColor: BG_WARM }}>
                  <td className="py-1.5 pr-3 align-top">
                    <input value={r.trade} onChange={e => setSuppliers(suppliers.map((x, j) => j === i ? { ...x, trade: e.target.value } : x))}
                      className="w-full bg-transparent outline-none print:hidden" placeholder="Trade" />
                    <span className="hidden print:block">{r.trade}</span>
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <input value={r.name} onChange={e => setSuppliers(suppliers.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      className="w-full bg-transparent outline-none print:hidden" placeholder="Company" />
                    <span className="hidden print:block">{r.name}</span>
                  </td>
                  <td className="py-1.5 pr-3 align-top">
                    <input value={r.phone} onChange={e => setSuppliers(suppliers.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))}
                      className="w-full bg-transparent outline-none print:hidden" placeholder="Phone" />
                    <span className="hidden print:block">{r.phone}</span>
                  </td>
                  <td className="print:hidden align-top">
                    <button onClick={() => setSuppliers(suppliers.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500 text-xs">&#10005;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setSuppliers([...suppliers, { id: generateId(), trade: '', name: '', phone: '' }])}
            className="print:hidden flex items-center gap-1 text-xs mt-2" style={{ color: GREEN }}>
            <Plus className="w-3 h-3" /> Add supplier
          </button>
        </div>

        {/* Thank you */}
        <div className="hb-page py-12 text-center" style={{ backgroundColor: BG_WARM }}>
          <p className="text-xl font-light" style={{ color: HEADING }}>Thank you for choosing Formation.</p>
          <p className="text-sm mt-2" style={{ color: MUTED }}>We are thrilled to have worked with you.</p>
          <p className="text-sm mt-6" style={{ color: GREEN }}>{COMPANY.phone} &nbsp;|&nbsp; {COMPANY.email}</p>
          <p className="text-xs mt-1" style={{ color: MUTED }}>{COMPANY.web}</p>
        </div>
      </div>
    </div>
  )
}
