'use client'

// Public subcontractor document upload - the page the emailed magic link opens. Token-gated,
// no account. One document per submit; the form resets so several can be uploaded in a row.

import { useEffect, useState } from 'react'

interface Info {
  companyName: string
  docTypes: { key: string; label: string; required: boolean }[]
  needs: string[]
}

export default function UploadPage({ params }: { params: { token: string } }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [docType, setDocType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [issuedOn, setIssuedOn] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [policy, setPolicy] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState<string[]>([])

  useEffect(() => {
    fetch(`/api/upload/${params.token}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setInfo(d); if (d.needs?.length) setDocType(d.needs[0]) })
      .catch(() => setError('This upload link is invalid or has expired. Please ask us for a fresh one.'))
  }, [params.token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file || !docType) return
    setBusy(true); setError('')
    const fd = new FormData()
    fd.set('file', file)
    fd.set('docType', docType)
    fd.set('issuedOn', issuedOn)
    fd.set('expiresOn', expiresOn)
    fd.set('policyNumber', policy)
    const res = await fetch(`/api/upload/${params.token}`, { method: 'POST', body: fd })
    setBusy(false)
    if (res.ok) {
      setUploaded(u => [...u, info?.docTypes.find(d => d.key === docType)?.label || docType])
      setFile(null); setIssuedOn(''); setExpiresOn(''); setPolicy('')
      const el = document.querySelector<HTMLInputElement>('input[type="file"]'); if (el) el.value = ''
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error === 'file_too_large' ? 'That file is over 15MB - please compress it.' : 'Upload failed - please try again.')
    }
  }

  if (error && !info) return <Shell><p className="text-sm text-center text-fg-muted py-10">{error}</p></Shell>
  if (!info) return <Shell><p className="text-sm text-center text-fg-muted py-10">Loading...</p></Shell>

  return (
    <Shell>
      <div className="text-center mb-6">
        <p className="text-[10px] uppercase tracking-widest text-fg-muted">Formation Landscapes / Lume Pools</p>
        <h1 className="text-xl font-light mt-1">Document upload</h1>
        <p className="text-sm text-fg-muted mt-1">{info.companyName}</p>
      </div>

      {info.needs.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 mb-5">
          <p className="text-xs font-medium text-amber-800 mb-1">We currently need:</p>
          <ul className="text-xs text-amber-800 list-disc pl-4">
            {info.needs.map(n => <li key={n}>{info.docTypes.find(d => d.key === n)?.label || n}</li>)}
          </ul>
        </div>
      )}

      {uploaded.length > 0 && (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 p-3 mb-5">
          <p className="text-xs font-medium text-green-700">Received: {uploaded.join(', ')}. Thank you.</p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs text-fg-muted">Document type
          <select value={docType} onChange={e => setDocType(e.target.value)}
            className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1">
            <option value="">Select...</option>
            {info.docTypes.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <label className="block text-xs text-fg-muted">File (PDF or photo, up to 15MB)
          <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="w-full border border-fg-border rounded-lg px-3 py-3 text-sm bg-white mt-1" />
        </label>
        <div className="flex gap-2">
          <label className="block text-xs text-fg-muted flex-1">Issue date
            <input type="date" value={issuedOn} onChange={e => setIssuedOn(e.target.value)}
              className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1" />
          </label>
          <label className="block text-xs text-fg-muted flex-1">Expiry date
            <input type="date" value={expiresOn} onChange={e => setExpiresOn(e.target.value)}
              className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1" />
          </label>
        </div>
        <label className="block text-xs text-fg-muted">Policy / licence number (optional)
          <input value={policy} onChange={e => setPolicy(e.target.value)}
            className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1" />
        </label>
        {error && <p className="text-xs text-red-600 text-center">{error}</p>}
        <button type="submit" disabled={busy || !file || !docType}
          className="w-full rounded-lg bg-fg-heading text-white py-3.5 text-sm font-medium disabled:opacity-40">
          {busy ? 'Uploading...' : 'Upload document'}
        </button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 py-8">{children}</div>
    </div>
  )
}
