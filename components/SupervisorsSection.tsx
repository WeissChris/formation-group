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
  const seededRef = useRef(false)

  const reload = () => setSupervisors([...loadSupervisors()].sort((a, b) => a.name.localeCompare(b.name)))

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
        project on its edit screen (the Foreman field).
      </p>

      <div className="space-y-2">
        {supervisors.map(s => (
          <div key={s.id} className="flex items-center gap-3">
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
