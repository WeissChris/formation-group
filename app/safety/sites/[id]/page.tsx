'use client'

// Safety site detail (office): the board editor (line-for-line with the physical 600x900 board),
// the printable PDF, the QR sign-in link, the live register and induction records.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SafetySite, SiteBoard, SiteVisit, SiteInduction, BoardHazard } from '@/lib/safety'
import { DEFAULT_BOARD_HAZARDS } from '@/lib/safety'

interface Detail {
  site: SafetySite
  board: SiteBoard | null
  visits: SiteVisit[]
  inductions: SiteInduction[]
  projects: { id: string; name: string; entity: string }[]
}

const BOARD_FIELDS: { key: keyof SiteBoard; label: string }[] = [
  { key: 'principalContractor', label: 'Principal Contractor' },
  { key: 'principalContractorNumber', label: 'Principal Contractor Number' },
  { key: 'buildingSurveyor', label: 'Building Surveyor (name, contact, registration no.)' },
  { key: 'buildingRegistrationNumber', label: 'Building Registration Number' },
  { key: 'buildingPermit', label: 'Building Permit Number / Date of Issue' },
  { key: 'supervisorNameNumber', label: 'Site Supervisor Name and Number' },
  { key: 'hsManagerNameNumber', label: 'H&S Manager Name and Number' },
  { key: 'firstAider', label: 'Site First Aider' },
  { key: 'firstAidContact', label: 'First Aider Contact Number' },
  { key: 'firstAidLocation', label: 'First Aid Location' },
  { key: 'fireEquipmentLocation', label: 'Fire Fighting Equipment Location' },
  { key: 'emergencySignal', label: 'Site Emergency Signal' },
  { key: 'assemblyArea', label: 'Site Assembly Area' },
  { key: 'nearestMedical', label: 'Nearest Medical Centre' },
]

export default function SafetySiteDetail({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [board, setBoard] = useState<SiteBoard | null>(null)
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => fetch(`/api/safety/sites/${params.id}`, { cache: 'no-store' })
    .then(r => r.json())
    .then(d => {
      if (!d.ok) { setError('Site not found.'); return }
      setDetail(d)
      setAddress(d.site.address || '')
      setBoard(d.board ?? {
        siteId: params.id, principalContractor: '', principalContractorNumber: '', buildingSurveyor: '',
        buildingRegistrationNumber: '', buildingPermit: '', supervisorNameNumber: '', hsManagerNameNumber: '',
        firstAider: '', firstAidContact: '', firstAidLocation: '', fireEquipmentLocation: '',
        emergencySignal: '', assemblyArea: '', nearestMedical: '', hazards: DEFAULT_BOARD_HAZARDS, hazardsReviewedOn: '',
      })
    })

  useEffect(() => { refresh() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [params.id])

  const save = async () => {
    if (!board) return
    setSaving(true); setSaved(false); setError('')
    const res = await fetch(`/api/safety/sites/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board, address }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); refresh() }
    else setError('Save failed.')
  }

  if (error && !detail) return <Wrap><p className="text-sm text-fg-muted">{error} <Link href="/safety" className="underline">Back</Link></p></Wrap>
  if (!detail || !board) return <Wrap><p className="text-sm text-fg-muted">Loading...</p></Wrap>

  const { site, visits, inductions, projects } = detail
  const onSite = visits.filter(v => !v.signedOutAt)
  const signinUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/signin/${site.shortRef}`

  const setField = (key: keyof SiteBoard, value: string) => setBoard({ ...board, [key]: value } as SiteBoard)
  const setHazard = (i: number, patch: Partial<BoardHazard>) => {
    const hazards = board.hazards.map((h, idx) => idx === i ? { ...h, ...patch } : h)
    setBoard({ ...board, hazards })
  }

  return (
    <Wrap>
      <Link href="/safety" className="text-xs text-fg-muted">&larr; Safety</Link>
      <div className="flex items-end justify-between flex-wrap gap-4 mt-1 mb-6">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">{site.address}</h1>
          <p className="text-sm font-light text-fg-muted mt-1">
            {site.shortRef} · {site.entity === 'lume' ? 'Lume Pools' : 'Formation'}
            {projects.length > 0 && <> · {projects.map(p => p.name).join(' + ')}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/safety/sites/${site.id}/board-pdf`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase">
            Board PDF (600x900)
          </a>
          <a href={signinUrl} target="_blank" rel="noopener noreferrer"
            className="px-4 py-2 border border-fg-border text-fg-muted text-xs font-light tracking-wide uppercase hover:text-fg-heading">
            Sign-in page
          </a>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Board editor */}
        <div>
          <h2 className="text-sm font-medium text-fg-heading mb-3">Site board</h2>
          <div className="space-y-3 border border-fg-border bg-white p-4">
            <label className="block text-2xs uppercase tracking-wide text-fg-muted">
              Site Address (shown on the board + sign-in page)
              <input value={address} onChange={e => setAddress(e.target.value)}
                className="w-full border border-fg-border px-2 py-1.5 text-sm text-fg-heading bg-white mt-1 normal-case tracking-normal" />
            </label>
            {BOARD_FIELDS.map(f => (
              <label key={f.key} className="block text-2xs uppercase tracking-wide text-fg-muted">
                {f.label}
                <input value={(board[f.key] as string) || ''} onChange={e => setField(f.key, e.target.value)}
                  className="w-full border border-fg-border px-2 py-1.5 text-sm text-fg-heading bg-white mt-1 normal-case tracking-normal" />
              </label>
            ))}
            <div>
              <p className="text-2xs uppercase tracking-wide text-fg-muted mb-2">Current site hazards (tick = present on site)</p>
              <div className="space-y-1.5">
                {board.hazards.map((h, i) => (
                  <label key={i} className="flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={h.checked} onChange={e => setHazard(i, { checked: e.target.checked })}
                      className="mt-0.5 accent-fg-heading" />
                    <span className={h.checked ? 'text-fg-heading' : 'text-fg-muted'}>
                      <span className="font-medium">{h.label}</span> <span className="opacity-70">— {h.control}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-2xs uppercase tracking-wide text-fg-muted">
              Date hazard board reviewed
              <input type="date" value={board.hazardsReviewedOn || ''} onChange={e => setField('hazardsReviewedOn', e.target.value)}
                className="w-full border border-fg-border px-2 py-1.5 text-sm text-fg-heading bg-white mt-1" />
            </label>
            <div className="flex items-center gap-3 pt-1">
              <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase disabled:opacity-40">
                {saving ? 'Saving...' : 'Save board'}
              </button>
              {saved && <span className="text-xs text-green-600">Saved.</span>}
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          </div>
        </div>

        {/* Register + inductions */}
        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-medium text-fg-heading mb-3">On site now ({onSite.length})</h2>
            {onSite.length === 0 ? (
              <p className="text-xs text-fg-muted border border-dashed border-fg-border p-4 text-center">Nobody signed in.</p>
            ) : (
              <ul className="border border-fg-border divide-y divide-fg-border/60 bg-white">
                {onSite.map(v => (
                  <li key={v.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <span>{v.personName}{v.company ? <span className="text-fg-muted"> · {v.company}</span> : ''}</span>
                    <span className="text-xs text-fg-muted">{new Date(v.signedInAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-fg-heading mb-3">Sign-in history</h2>
            {visits.length === 0 ? (
              <p className="text-xs text-fg-muted">No visits recorded yet.</p>
            ) : (
              <div className="border border-fg-border bg-white max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-fg-card/60">
                    <tr className="text-left text-fg-muted">
                      <th className="px-3 py-2 font-normal">Person</th>
                      <th className="px-3 py-2 font-normal">In</th>
                      <th className="px-3 py-2 font-normal">Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-fg-border/40">
                    {visits.map(v => (
                      <tr key={v.id}>
                        <td className="px-3 py-1.5">{v.personName}{v.company ? <span className="text-fg-muted"> · {v.company}</span> : ''}{v.role === 'visitor' ? <span className="text-fg-muted/70"> (visitor)</span> : ''}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{new Date(v.signedInAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{v.signedOutAt ? new Date(v.signedOutAt).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }) : <span className="text-green-600">on site</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-fg-heading mb-3">Inductions ({inductions.length})</h2>
            {inductions.length === 0 ? (
              <p className="text-xs text-fg-muted">Nobody inducted yet - the first QR sign-in records it.</p>
            ) : (
              <ul className="border border-fg-border divide-y divide-fg-border/60 bg-white">
                {inductions.map(i => (
                  <li key={i.id} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span>{i.personName}{i.company ? <span className="text-fg-muted"> · {i.company}</span> : ''}</span>
                    <span className="text-fg-muted">{new Date(i.acceptedAt).toLocaleDateString('en-AU')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Wrap>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-24 pb-16">{children}</div>
}
