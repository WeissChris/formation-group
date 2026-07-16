'use client'

import { useEffect, useState } from 'react'
import {
  getProposalSamples, uploadProposalSample, deleteProposalSample, sampleUrl, formatSize,
  type ProposalSample,
} from '@/lib/proposalSamples'

// Manage the shared sample design packages (our generic 2D / 3D example PDFs). Uploaded once here,
// then each design proposal ticks which to show. Files go straight to the public proposal-samples
// bucket, so the client gets a permanent link that never expires.
export function ProposalSamplesSection() {
  const [samples, setSamples] = useState<ProposalSample[]>([])
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => getProposalSamples().then(setSamples)
  useEffect(() => { load() }, [])

  const upload = async () => {
    if (!file || !title.trim()) return
    setBusy(true); setMsg('')
    const ok = await uploadProposalSample(file, title.trim(), blurb.trim())
    setBusy(false)
    if (!ok) { setMsg('Upload failed. Try again.'); return }
    setTitle(''); setBlurb(''); setFile(null); setMsg('Sample uploaded.')
    load()
    setTimeout(() => setMsg(''), 3000)
  }

  const remove = async (s: ProposalSample) => {
    if (!confirm(`Remove "${s.title}"? It will disappear from any proposal showing it.`)) return
    await deleteProposalSample(s.id)
    load()
  }

  return (
    <div className="mt-12">
      <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-6">Proposal sample packages</p>
      <div className="border border-fg-border p-6 max-w-2xl">
        <p className="text-xs font-light text-fg-muted mb-5">
          Example design packages a client can open from their proposal (e.g. your 2D and 3D packages).
          Uploaded once and shared by every proposal, so each proposal just ticks which to show. The link
          is permanent - it never expires.
        </p>

        {samples.length > 0 && (
          <ul className="space-y-2 mb-6">
            {samples.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-3 border border-fg-border/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-light text-fg-heading truncate">{s.title}</p>
                  <p className="text-2xs font-light text-fg-muted truncate">
                    {s.blurb ? `${s.blurb} - ` : ''}{s.fileName}{s.sizeBytes ? ` (${formatSize(s.sizeBytes)})` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <a href={sampleUrl(s.path)} target="_blank" rel="noopener noreferrer" className="text-2xs underline text-fg-muted hover:text-fg-heading">View</a>
                  <button onClick={() => remove(s)} className="text-2xs underline text-red-400/70 hover:text-red-500">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-fg-border/60 pt-5">
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Title (shown to the client)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 2D Design Package"
              className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors" />
          </div>
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Blurb (optional)</label>
            <input value={blurb} onChange={e => setBlurb(e.target.value)} placeholder="e.g. A sample of the plans you receive at the end of Phase 1"
              className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="px-3 py-1.5 border border-fg-border text-fg-muted text-2xs font-light tracking-wide uppercase cursor-pointer hover:text-fg-heading transition-colors">
              {file ? 'Change file' : 'Choose PDF'}
              <input type="file" accept="application/pdf,image/*" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && <span className="text-2xs font-light text-fg-muted truncate">{file.name} ({formatSize(file.size)})</span>}
            <button onClick={upload} disabled={busy || !file || !title.trim()}
              className="px-4 py-1.5 bg-fg-dark text-white/80 text-2xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors disabled:opacity-40">
              {busy ? 'Uploading...' : 'Upload sample'}
            </button>
            {msg && <span className="text-2xs font-light text-fg-muted">{msg}</span>}
          </div>
          <p className="text-2xs font-light text-fg-muted/60">
            Large files upload straight to storage. Compressing an image-heavy PDF first keeps it quick for clients on mobile data.
          </p>
        </div>
      </div>
    </div>
  )
}
