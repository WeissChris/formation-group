'use client'

// Plans attached at estimate stage. Same bucket + folder scheme the foreman cockpit reads, so
// winning the job (convert to project) hands the whole set to site with no re-upload.

import { useEffect, useRef, useState } from 'react'
import { getEstimatePlans, uploadEstimatePlan, deleteEstimatePlan, type EstimatePlan } from '@/lib/estimatePlans'
import { FileText, Trash2, UploadCloud } from 'lucide-react'

function fileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EstimatePlansTab({ folder, converted }: {
  folder: string
  /** True once the estimate is a project - the same files are what the foreman's cockpit lists. */
  converted: boolean
}) {
  const [plans, setPlans] = useState<EstimatePlan[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const refresh = () => getEstimatePlans(folder).then(setPlans)
  useEffect(() => { void refresh() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [folder])

  const upload = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? [])
    if (!files.length) return
    setBusy(true)
    let failed = 0
    for (const f of files) { if (!(await uploadEstimatePlan(folder, f))) failed++ }
    setBusy(false)
    await refresh()
    if (failed) window.alert(`${failed} file${failed === 1 ? '' : 's'} failed to upload - try again.`)
  }

  const remove = async (p: EstimatePlan) => {
    if (!window.confirm(`Delete ${p.name}?`)) return
    await deleteEstimatePlan(p.path)
    await refresh()
  }

  return (
    <div className="max-w-2xl">
      <p className="text-xs font-light text-fg-muted mb-4">
        Drawings and specs for this quote. {converted
          ? 'This job is a project - these are the same files the foreman sees in the cockpit Plans tab.'
          : 'If the job is won, they move to the project automatically and appear in the foreman’s cockpit.'}
      </p>

      <label
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); void upload(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center gap-2 border border-dashed px-6 py-10 cursor-pointer transition-colors mb-6 ${
          dragOver ? 'border-fg-heading bg-fg-card/30' : 'border-fg-border hover:border-fg-heading/60'
        }`}
      >
        <UploadCloud className="w-5 h-5 text-fg-muted" />
        <span className="text-xs font-light text-fg-muted">
          {busy ? 'Uploading...' : 'Drop plan files here, or click to choose (PDF, images - 50MB each)'}
        </span>
        <input ref={fileInput} type="file" multiple className="hidden" disabled={busy}
          onChange={e => { void upload(e.target.files); e.target.value = '' }} />
      </label>

      {plans === null ? (
        <p className="text-sm font-light text-fg-muted py-6 text-center">Loading...</p>
      ) : plans.length === 0 ? (
        <p className="text-sm font-light text-fg-muted/60 py-6 text-center">No plans uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-fg-border/60 border-t border-b border-fg-border/60">
          {plans.map(p => (
            <li key={p.path} className="flex items-center justify-between gap-3 py-2.5 group">
              <a href={p.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 min-w-0 text-sm font-light text-fg-heading hover:underline">
                <FileText className="w-4 h-4 text-fg-muted shrink-0" />
                <span className="truncate">{p.name}</span>
                <span className="text-2xs text-fg-muted shrink-0">{fileSize(p.size)}</span>
              </a>
              <button onClick={() => void remove(p)} title="Delete"
                className="opacity-0 group-hover:opacity-100 text-fg-muted hover:text-red-400/60 transition-all shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
