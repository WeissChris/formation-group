'use client'

// Public QR sign-in / sign-out page - what the site board's QR opens. No login: identity is
// name + phone, remembered on the device (localStorage) so returning workers are one tap.
// First visit at a site requires accepting the site induction (emergency info + current hazards).

import { useEffect, useState } from 'react'

interface SigninState {
  site: { shortRef: string; address: string; entity: string }
  induction: {
    supervisor: string; firstAider: string; firstAidContact: string; firstAidLocation: string
    assemblyArea: string; emergencySignal: string; nearestMedical: string
    hazards: { label: string; control: string }[]
  }
  inducted: boolean
  openVisitId: number | null
}

interface Identity { name: string; company: string; phone: string; role: 'worker' | 'visitor' }
const IDENTITY_KEY = 'sf_signin_identity'

function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (raw) return { role: 'worker', ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { name: '', company: '', phone: '', role: 'worker' }
}

export default function SigninPage({ params }: { params: { ref: string } }) {
  const [state, setState] = useState<SigninState | null>(null)
  const [error, setError] = useState('')
  const [identity, setIdentity] = useState<Identity>({ name: '', company: '', phone: '', role: 'worker' })
  const [accept, setAccept] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'in' | 'out' | null>(null)

  const refresh = async (phone: string) => {
    const res = await fetch(`/api/signin/${params.ref}?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
    if (!res.ok) {
      setError(res.status === 410 ? 'This site is no longer active.' : 'This sign-in code isn’t valid.')
      return
    }
    setState(await res.json())
  }

  useEffect(() => {
    const id = loadIdentity()
    setIdentity(id)
    refresh(id.phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ref])

  const submit = async (action: 'in' | 'out') => {
    setBusy(true); setError('')
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
    } catch { /* ignore */ }
    const res = await fetch(`/api/signin/${params.ref}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...identity, acceptInduction: accept }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      setDone(action)
      refresh(identity.phone)
    } else if (body.error === 'induction_required') {
      setError('Please read and accept the site induction below first.')
    } else if (body.error === 'name_and_phone_required') {
      setError('Enter your name and a valid phone number.')
    } else if (body.error === 'not_signed_in') {
      setError('No open sign-in found for this phone number.')
      refresh(identity.phone)
    } else {
      setError('Something went wrong - please try again.')
    }
  }

  if (error && !state) return <Shell><p className="text-sm text-center text-fg-muted py-10">{error}</p></Shell>
  if (!state) return <Shell><p className="text-sm text-center text-fg-muted py-10">Loading...</p></Shell>

  const signedIn = !!state.openVisitId
  const needsInduction = !state.inducted

  return (
    <Shell>
      <div className="text-center mb-6">
        <p className="text-[10px] uppercase tracking-widest text-fg-muted">{state.site.entity === 'lume' ? 'Lume Pools' : 'Formation Landscapes'} site sign-in</p>
        <h1 className="text-xl font-light mt-1">{state.site.address}</h1>
      </div>

      {done === 'in' && (
        <div className="rounded-xl border-2 border-green-500 bg-green-50 p-4 text-center mb-5">
          <p className="text-sm font-medium text-green-700">You&apos;re signed in. Work safe.</p>
        </div>
      )}
      {done === 'out' && (
        <div className="rounded-xl border-2 border-fg-border bg-fg-card/30 p-4 text-center mb-5">
          <p className="text-sm font-medium">Signed out. See you next time.</p>
        </div>
      )}

      <div className="space-y-3">
        <label className="block text-xs text-fg-muted">Full name
          <input value={identity.name} onChange={e => setIdentity({ ...identity, name: e.target.value })}
            className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1" autoComplete="name" />
        </label>
        <label className="block text-xs text-fg-muted">Company
          <input value={identity.company} onChange={e => setIdentity({ ...identity, company: e.target.value })}
            className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1" autoComplete="organization" />
        </label>
        <label className="block text-xs text-fg-muted">Mobile
          <input value={identity.phone} inputMode="tel" onChange={e => setIdentity({ ...identity, phone: e.target.value })}
            onBlur={() => refresh(identity.phone)}
            className="w-full border border-fg-border rounded-lg px-3 py-3 text-base bg-white mt-1" autoComplete="tel" placeholder="04xx xxx xxx" />
        </label>
        <div className="flex gap-2">
          {(['worker', 'visitor'] as const).map(r => (
            <button key={r} onClick={() => setIdentity({ ...identity, role: r })}
              className={`flex-1 rounded-lg border py-2.5 text-sm capitalize ${identity.role === r ? 'border-fg-heading bg-fg-heading text-white' : 'border-fg-border'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* First visit: the site induction, accepted before sign-in is recorded. */}
      {needsInduction && !signedIn && (
        <div className="mt-5 rounded-xl border border-fg-border p-4 space-y-3">
          <p className="text-sm font-medium">Site induction (first visit)</p>
          <div className="text-xs space-y-1 text-fg-heading/90">
            {state.induction.supervisor && <p><span className="text-fg-muted">Site supervisor:</span> {state.induction.supervisor}</p>}
            {state.induction.firstAider && <p><span className="text-fg-muted">First aider:</span> {state.induction.firstAider}{state.induction.firstAidContact ? ` · ${state.induction.firstAidContact}` : ''}</p>}
            {state.induction.firstAidLocation && <p><span className="text-fg-muted">First aid:</span> {state.induction.firstAidLocation}</p>}
            {state.induction.assemblyArea && <p><span className="text-fg-muted">Assembly area:</span> {state.induction.assemblyArea}</p>}
            {state.induction.emergencySignal && <p><span className="text-fg-muted">Emergency signal:</span> {state.induction.emergencySignal}</p>}
            {state.induction.nearestMedical && <p><span className="text-fg-muted">Nearest medical:</span> {state.induction.nearestMedical}</p>}
            <p><span className="text-fg-muted">Emergency:</span> 000 (112 from mobile)</p>
          </div>
          {state.induction.hazards.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Current site hazards</p>
              <ul className="space-y-1">
                {state.induction.hazards.map((h, i) => (
                  <li key={i} className="text-[11px] leading-snug"><span className="font-medium">{h.label}:</span> <span className="text-fg-muted">{h.control}</span></li>
                ))}
              </ul>
            </div>
          )}
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} className="mt-0.5 accent-fg-heading" />
            <span>I have read and understood the site induction. I will follow site rules, wear required PPE, and report hazards or incidents to the site supervisor.</span>
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}

      <div className="mt-5 space-y-2">
        {!signedIn ? (
          <button onClick={() => submit('in')} disabled={busy || (needsInduction && !accept)}
            className="w-full rounded-lg bg-fg-heading text-white py-3.5 text-sm font-medium disabled:opacity-40">
            {busy ? 'Signing in...' : 'Sign in to site'}
          </button>
        ) : (
          <button onClick={() => submit('out')} disabled={busy}
            className="w-full rounded-lg border-2 border-fg-heading text-fg-heading py-3.5 text-sm font-medium disabled:opacity-40">
            {busy ? 'Signing out...' : 'Sign out of site'}
          </button>
        )}
      </div>
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
