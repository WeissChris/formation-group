'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  siteMe, siteLogin, siteLogout, listSiteSupervisors, getSiteProjects,
  type SiteProjectCard,
} from '@/lib/siteData'

export default function SiteHome() {
  const [me, setMe] = useState<{ supervisorId: string; name: string } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    siteMe().then(m => { setMe(m); setReady(true) })
  }, [])

  if (!ready) return <Splash>Loading...</Splash>
  return me ? <MyProjects me={me} onSignOut={() => setMe(null)} /> : <LoginScreen onLoggedIn={setMe} />
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-fg-muted">{children}</div>
  )
}

// ── Login ──────────────────────────────────────────────────────────────────────

function LoginScreen({ onLoggedIn }: { onLoggedIn: (m: { supervisorId: string; name: string }) => void }) {
  const [supervisors, setSupervisors] = useState<{ id: string; name: string }[]>([])
  const [supervisorId, setSupervisorId] = useState('')
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listSiteSupervisors().then(s => {
      setSupervisors(s)
      if (s.length === 1) setSupervisorId(s[0].id)
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supervisorId || !passcode) return
    setBusy(true); setError('')
    const ok = await siteLogin(supervisorId, passcode)
    if (ok) {
      const m = await siteMe()
      if (m) { onLoggedIn(m); return }
    }
    setBusy(false); setPasscode(''); setError('Wrong supervisor or passcode')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-[11px] tracking-[0.2em] uppercase text-fg-muted">Formation Landscapes</p>
        <h1 className="text-2xl font-light mt-1 mb-8">Site login</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-fg-muted mb-1.5">Who are you?</label>
            <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)}
              className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white">
              <option value="">Select your name...</option>
              {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-fg-muted mb-1.5">Passcode</label>
            <input type="password" inputMode="numeric" autoComplete="current-password"
              value={passcode} onChange={e => setPasscode(e.target.value)}
              className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy || !supervisorId || !passcode}
            className="w-full rounded-lg bg-fg-heading text-white py-3 text-base font-medium disabled:opacity-40">
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        {supervisors.length === 0 && (
          <p className="text-xs text-fg-muted mt-6 text-center">
            No site logins are set up yet. Ask the office to set your passcode.
          </p>
        )}
      </div>
    </div>
  )
}

// ── My Projects ─────────────────────────────────────────────────────────────────

function MyProjects({ me, onSignOut }: { me: { supervisorId: string; name: string }; onSignOut: () => void }) {
  const [projects, setProjects] = useState<SiteProjectCard[] | null>(null)

  useEffect(() => { getSiteProjects().then(setProjects) }, [])

  const signOut = async () => { await siteLogout(); onSignOut() }

  return (
    <div className="max-w-2xl lg:max-w-4xl mx-auto px-4 pb-16">
      <header className="flex items-center justify-between py-4 sticky top-0 bg-white border-b border-fg-border/60 z-10">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-fg-muted">My projects</p>
          <p className="text-lg font-light leading-tight">{me.name}</p>
        </div>
        <button onClick={signOut} className="text-xs text-fg-muted underline">Sign out</button>
      </header>

      {projects === null ? (
        <p className="text-sm text-fg-muted py-8 text-center">Loading...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-fg-muted py-8 text-center">No active projects assigned to you.</p>
      ) : (
        <ul className="space-y-3 mt-4">
          {projects.map(p => (
            <li key={p.id}>
              <Link href={`/site/${p.id}`}
                className="block rounded-xl border border-fg-border p-4 active:bg-fg-card/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-sm text-fg-muted truncate">{p.address || p.clientName}</p>
                  </div>
                  <StatusChip status={p.status} />
                </div>
                {p.plannedCompletion && (
                  <p className="text-xs text-fg-muted mt-2">Due {formatDate(p.plannedCompletion)}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const label = status === 'active' ? 'On site' : status === 'planning' ? 'Planning' : status
  return (
    <span className="shrink-0 text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-fg-card/60 text-fg-heading">
      {label}
    </span>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
