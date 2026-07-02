'use client'

// Office per-project safety docs: SWMS (instantiate from templates, PDF, ack counts),
// SSSP (schema-driven questionnaire, versioned, PDF), toolbox meetings + incidents (read).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Swms, Sssp, ToolboxMeeting, Incident } from '@/lib/safetyDocs'
import { SEVERITY_LABEL } from '@/lib/safetyDocs'
import { SSSP_SCHEMAS, type SsspField } from '@/lib/safetyContent'

interface Docs {
  project: { id: string; name: string; entity: 'formation' | 'lume'; address: string; foreman: string }
  swms: (Swms & { ackCount: number })[]
  sssps: Sssp[]
  toolbox: ToolboxMeeting[]
  incidents: Incident[]
  templates: { key: string; activityName: string; highRisk: string[]; approved: boolean }[]
}

export default function ProjectSafetyPage({ params }: { params: { id: string } }) {
  const [docs, setDocs] = useState<Docs | null>(null)
  const [error, setError] = useState('')
  const [tplPick, setTplPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [ssspOpen, setSsspOpen] = useState(false)

  const refresh = () => fetch(`/api/safety/projects/${params.id}/docs`, { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { if (d.ok) setDocs(d); else setError('Could not load.') })

  useEffect(() => { refresh() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [params.id])

  const addSwms = async () => {
    if (!tplPick) return
    setBusy(true)
    const res = await fetch(`/api/safety/projects/${params.id}/docs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'swms', templateKey: tplPick }),
    })
    setBusy(false)
    if (res.ok) { setTplPick(''); refresh() } else setError('Could not add the SWMS.')
  }

  if (error && !docs) return <Wrap><p className="text-sm text-fg-muted">{error}</p></Wrap>
  if (!docs) return <Wrap><p className="text-sm text-fg-muted">Loading...</p></Wrap>
  const { project, swms, sssps, toolbox, incidents, templates } = docs
  const usedKeys = new Set(swms.map(s => s.templateKey))
  const latestSssp = sssps[0] ?? null

  return (
    <Wrap>
      <Link href="/safety" className="text-xs text-fg-muted">&larr; Safety</Link>
      <div className="mt-1 mb-8">
        <h1 className="text-2xl font-light tracking-wide text-fg-heading">{project.name}</h1>
        <p className="text-sm font-light text-fg-muted mt-1">
          Safety docs · {project.entity === 'lume' ? 'Lume Pools' : 'Formation'}{project.foreman ? ` · ${project.foreman}` : ''}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          {/* SWMS */}
          <section>
            <h2 className="text-sm font-medium text-fg-heading mb-3">SWMS ({swms.length})</h2>
            <div className="flex items-center gap-2 mb-3">
              <select value={tplPick} onChange={e => setTplPick(e.target.value)}
                className="border border-fg-border px-3 py-2 text-xs bg-white flex-1 min-w-0">
                <option value="">Add a SWMS from a template...</option>
                {templates.map(t => (
                  <option key={t.key} value={t.key} disabled={usedKeys.has(t.key)}>
                    {t.activityName}{usedKeys.has(t.key) ? ' (added)' : ''}{t.approved ? '' : ' [draft]'}
                  </option>
                ))}
              </select>
              <button onClick={addSwms} disabled={!tplPick || busy}
                className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase disabled:opacity-40 shrink-0">
                Add
              </button>
            </div>
            {templates.some(t => !t.approved) && (
              <p className="text-2xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1.5 mb-3">
                Templates are AI-drafted v0 - a qualified WHS practitioner must review them before site use.
              </p>
            )}
            {swms.length === 0 ? (
              <p className="text-xs text-fg-muted border border-dashed border-fg-border p-4 text-center">No SWMS on this job yet.</p>
            ) : (
              <ul className="border border-fg-border divide-y divide-fg-border/60 bg-white">
                {swms.map(w => (
                  <li key={w.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{w.activityName}</p>
                      <p className="text-2xs text-fg-muted">{w.ackCount} acknowledged · added {new Date(w.createdAt).toLocaleDateString('en-AU')}</p>
                    </div>
                    <a href={`/api/safety/swms/${w.id}/pdf`} target="_blank" rel="noopener noreferrer"
                      className="text-xs underline text-fg-heading shrink-0">PDF</a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* SSSP */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-fg-heading">Site-specific safety plan</h2>
              <button onClick={() => setSsspOpen(o => !o)}
                className="px-3 py-1.5 border border-fg-border text-xs text-fg-muted hover:text-fg-heading uppercase tracking-wide">
                {ssspOpen ? 'Close' : latestSssp ? 'New version' : 'Create SSSP'}
              </button>
            </div>
            {sssps.length > 0 && (
              <ul className="border border-fg-border divide-y divide-fg-border/60 bg-white mb-3">
                {sssps.map(v => (
                  <li key={v.id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <span>Version {v.version} <span className="text-2xs text-fg-muted">· {new Date(v.createdAt).toLocaleDateString('en-AU')}</span></span>
                    <a href={`/api/safety/sssp/${v.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-xs underline text-fg-heading">PDF</a>
                  </li>
                ))}
              </ul>
            )}
            {ssspOpen && (
              <SsspForm projectId={project.id} entity={project.entity}
                seed={latestSssp?.answers} defaults={{ SITE_ADDRESS: project.address, SITE_SUPERVISOR_NAME: project.foreman }}
                onSaved={() => { setSsspOpen(false); refresh() }} />
            )}
          </section>
        </div>

        <div className="space-y-8">
          {/* Toolbox */}
          <section>
            <h2 className="text-sm font-medium text-fg-heading mb-3">Toolbox meetings ({toolbox.length})</h2>
            {toolbox.length === 0 ? (
              <p className="text-xs text-fg-muted">None recorded - the foreman runs these from the cockpit Safety tab.</p>
            ) : (
              <ul className="border border-fg-border divide-y divide-fg-border/60 bg-white">
                {toolbox.map(t => (
                  <li key={t.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm">{t.topic}</p>
                      <span className="text-2xs text-fg-muted shrink-0">{new Date(t.heldAt).toLocaleDateString('en-AU')}</span>
                    </div>
                    <p className="text-2xs text-fg-muted">{t.heldBy}{t.attendees.length ? ` · ${t.attendees.length} attendees` : ''}</p>
                    {t.notes && <p className="text-xs text-fg-heading/80 mt-1 whitespace-pre-wrap">{t.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Incidents */}
          <section>
            <h2 className="text-sm font-medium text-fg-heading mb-3">Incidents ({incidents.length})</h2>
            {incidents.length === 0 ? (
              <p className="text-xs text-fg-muted">None reported.</p>
            ) : (
              <ul className="border border-fg-border divide-y divide-fg-border/60 bg-white">
                {incidents.map(i => (
                  <li key={i.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm truncate">{i.description.slice(0, 80)}</p>
                      <span className={`text-2xs uppercase tracking-wide shrink-0 ${i.severity === 'critical' || i.severity === 'serious' ? 'text-red-600' : 'text-fg-muted'}`}>
                        {SEVERITY_LABEL[i.severity]}
                      </span>
                    </div>
                    <p className="text-2xs text-fg-muted">
                      {new Date(i.occurredAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {i.notifiable && <span className="text-red-600 font-medium"> · WorkSafe notifiable{i.worksafeNotified ? ' (notified)' : ' - NOT YET NOTIFIED'}</span>}
                      {` · ${i.status}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-2xs text-fg-muted mt-2">Triage (close / mark WorkSafe notified) lives on the <Link href="/safety" className="underline">Safety</Link> page.</p>
          </section>
        </div>
      </div>
    </Wrap>
  )
}

// ── SSSP schema-driven form ─────────────────────────────────────────────────────────
function SsspForm({ projectId, entity, seed, defaults, onSaved }: {
  projectId: string; entity: 'formation' | 'lume'
  seed?: Record<string, unknown>; defaults?: Record<string, string | undefined>
  onSaved: () => void
}) {
  const schema = SSSP_SCHEMAS[entity]
  const initial = useMemo(() => {
    const a: Record<string, unknown> = {}
    for (const g of schema.groups) for (const f of g.fields) {
      a[f.key] = seed?.[f.key] ?? defaults?.[f.key] ?? f.default ?? (f.type === 'boolean' ? false : f.type === 'multienum' || f.type === 'table' ? [] : '')
    }
    return a
  }, [schema, seed, defaults])
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: unknown) => setAnswers(a => ({ ...a, [k]: v }))

  const save = async () => {
    setBusy(true); setError('')
    const res = await fetch(`/api/safety/projects/${projectId}/docs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'sssp', answers }),
    })
    setBusy(false)
    if (res.ok) onSaved()
    else setError('Save failed.')
  }

  return (
    <div className="border border-fg-border bg-white p-4 space-y-5">
      <p className="text-xs text-fg-muted">{schema.title} · {schema.brandName}</p>
      {schema.groups.map(g => (
        <div key={g.id}>
          <p className="text-xs font-medium text-fg-heading border-b border-fg-border pb-1 mb-2">{g.title}</p>
          <div className="space-y-2.5">
            {g.fields.map(f => <FieldInput key={f.key} field={f} value={answers[f.key]} onChange={v => set(f.key, v)} />)}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase disabled:opacity-40">
          {busy ? 'Saving...' : 'Save version'}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}

function optionList(f: SsspField): { value: string; label: string }[] {
  return (f.options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o)
}

function FieldInput({ field, value, onChange }: { field: SsspField; value: unknown; onChange: (v: unknown) => void }) {
  const base = 'w-full border border-fg-border px-2 py-1.5 text-sm text-fg-heading bg-white mt-1'
  const label = <span className="text-2xs uppercase tracking-wide text-fg-muted">{field.label}{field.required ? ' *' : ''}</span>

  if (field.type === 'boolean') return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="accent-fg-heading" />
      <span className="text-xs text-fg-heading">{field.label}</span>
    </label>
  )
  if (field.type === 'longtext') return (
    <label className="block">{label}
      <textarea value={`${value ?? ''}`} onChange={e => onChange(e.target.value)} rows={3} className={base} />
    </label>
  )
  if (field.type === 'enum') return (
    <label className="block">{label}
      <select value={`${value ?? ''}`} onChange={e => onChange(e.target.value)} className={base}>
        <option value="">Select...</option>
        {optionList(field).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
  if (field.type === 'multienum') {
    const arr = Array.isArray(value) ? value as string[] : []
    return (
      <div>{label}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {optionList(field).map(o => (
            <label key={o.value} className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={arr.includes(o.value)} className="accent-fg-heading"
                onChange={e => onChange(e.target.checked ? [...arr, o.value] : arr.filter(x => x !== o.value))} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    )
  }
  if (field.type === 'table') {
    const cols = field.columns || []
    const rows = Array.isArray(value) ? value as Record<string, string>[] : []
    return (
      <div>{label}
        <div className="mt-1 space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-1 items-center">
              {cols.map(c => (
                <input key={c.key} value={row[c.key] ?? ''} placeholder={c.label}
                  onChange={e => onChange(rows.map((r, j) => j === i ? { ...r, [c.key]: e.target.value } : r))}
                  className="flex-1 border border-fg-border px-2 py-1 text-xs bg-white" />
              ))}
              <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-fg-muted text-xs px-1">&times;</button>
            </div>
          ))}
          <button onClick={() => onChange([...rows, {}])} className="text-2xs uppercase tracking-wide text-fg-muted hover:text-fg-heading">+ add row</button>
        </div>
      </div>
    )
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'
  return (
    <label className="block">{label}
      <input type={inputType} value={`${value ?? ''}`} onChange={e => onChange(e.target.value)} className={base} />
    </label>
  )
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-24 pb-16">{children}</div>
}
