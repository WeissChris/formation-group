'use client'

import { useEffect, useRef, useState } from 'react'
import { loadSupervisors, loadProjects } from '@/lib/storage'
import { getSupervisors, upsertSupervisor, deleteSupervisorAsync } from '@/lib/storageAsync'
import { useCrossTabRefresh } from '@/lib/useCrossTabRefresh'
import { nextSupervisorColour } from '@/lib/supervisors'
import { generateId } from '@/lib/utils'
import type { Supervisor } from '@/types'
import { Plus, Trash2 } from 'lucide-react'

// Settings section: manage the site supervisors / foremen and their Master-Programme colours. The list
// syncs cross-device (fg_supervisors). Projects link to a supervisor by name via project.foreman.
export function SupervisorsSection() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([])
  const [withPasscode, setWithPasscode] = useState<Set<string>>(new Set())
  const [pcInput, setPcInput] = useState<Record<string, string>>({})
  const [pcBusy, setPcBusy] = useState<string | null>(null)
  const seededRef = useRef(false)

  const reload = () => setSupervisors([...loadSupervisors()].sort((a, b) => a.name.localeCompare(b.name)))

  // Which supervisors have a /site login passcode set (the hash is server-only, so we ask the API).
  const reloadPasscodes = () => {
    fetch('/api/site/supervisors', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { supervisors: [] })
      .then((d: { supervisors: { id: string }[] }) => setWithPasscode(new Set(d.supervisors.map(s => s.id))))
      .catch(() => { /* leave as-is */ })
  }
  useEffect(reloadPasscodes, [])

  const setPasscode = async (id: string, clear = false) => {
    const passcode = clear ? '' : (pcInput[id] || '')
    if (!clear && passcode.length < 4) return
    setPcBusy(id)
    const res = await fetch('/api/site/set-passcode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisorId: id, passcode }),
    })
    setPcBusy(null)
    if (res.ok) { setPcInput(p => ({ ...p, [id]: '' })); reloadPasscodes() }
  }

  useEffect(() => {
    reload()
    ;(async () => {
      // Adopt any cloud rows, then seed once from existing project foremen so colours apply immediately.
      try { await getSupervisors() } catch { /* keep local */ }
      reload()
      if (!seededRef.current && loadSupervisors().length === 0) {
        seededRef.current = true
        const names = Array.from(new Set(loadProjects().map(p => p.foreman?.trim()).filter(Boolean))) as string[]
        const seeded: Supervisor[] = []
        for (const name of names) {
          const sup = { id: generateId(), name, colour: nextSupervisorColour(seeded) }
          seeded.push(sup)
          await upsertSupervisor(sup)
        }
        reload()
      }
    })()
  }, [])

  useCrossTabRefresh(['supervisors'], reload)

  const addSupervisor = () => {
    const sup = { id: generateId(), name: '', colour: nextSupervisorColour(supervisors) }
    void upsertSupervisor(sup)
    setSupervisors(prev => [...prev, sup])
  }

  // Debounced-ish: write straight through on each edit (upsert stamps + syncs).
  const patch = (id: string, field: 'name' | 'colour', value: string) => {
    setSupervisors(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    const cur = supervisors.find(s => s.id === id)
    if (cur) void upsertSupervisor({ ...cur, [field]: value })
  }

  const remove = (id: string) => {
    setSupervisors(prev => prev.filter(s => s.id !== id))
    void deleteSupervisorAsync(id)
  }

  return (
    <section>
      <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">Supervisors</p>
      <p className="text-xs font-light text-fg-muted/70 mb-4 leading-relaxed">
        Each supervisor&apos;s colour shades their jobs on the Master Programme. Assign a supervisor to a
        project on its edit screen (the Foreman field). Set a passcode to give them a phone login at
        <span className="text-fg-heading"> /site</span>.
      </p>

      <div className="space-y-3">
        {supervisors.map(s => (
          <div key={s.id} className="border border-fg-border/60 p-3 space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={s.colour}
                onChange={e => patch(s.id, 'colour', e.target.value)}
                className="w-8 h-8 flex-shrink-0 bg-transparent border border-fg-border cursor-pointer p-0.5"
                title="Programme colour"
              />
              <input
                type="text"
                value={s.name}
                onChange={e => patch(s.id, 'name', e.target.value)}
                placeholder="Supervisor name"
                className="flex-1 px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-[#8A8580]"
              />
              <button
                onClick={() => remove(s.id)}
                className="text-fg-muted hover:text-red-500 transition-colors flex-shrink-0 p-1.5"
                title="Remove supervisor"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="flex items-center gap-2 pl-11">
              <input
                type="password"
                value={pcInput[s.id] || ''}
                onChange={e => setPcInput(p => ({ ...p, [s.id]: e.target.value }))}
                placeholder={withPasscode.has(s.id) ? 'Login set — type to change' : 'Set /site passcode'}
                className="flex-1 px-3 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-[#8A8580]"
              />
              <button
                onClick={() => setPasscode(s.id)}
                disabled={pcBusy === s.id || (pcInput[s.id] || '').length < 4}
                className="text-xs px-2.5 py-1.5 border border-fg-border text-fg-heading hover:bg-fg-card/40 transition-colors disabled:opacity-40"
              >
                {pcBusy === s.id ? '...' : 'Set'}
              </button>
              {withPasscode.has(s.id) && (
                <button onClick={() => setPasscode(s.id, true)} className="text-xs text-fg-muted hover:text-red-500" title="Disable login">
                  Clear
                </button>
              )}
            </div>
            <p className="pl-11 text-2xs font-light text-fg-muted/60">
              {withPasscode.has(s.id) ? 'Login enabled.' : 'No login yet.'} Min 4 characters.
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={addSupervisor}
        className="mt-3 flex items-center gap-1.5 text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors"
      >
        <Plus size={14} /> Add supervisor
      </button>
    </section>
  )
}
