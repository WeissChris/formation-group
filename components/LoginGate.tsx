'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { loginRemote, isAuthenticatedRemote, getLastAuthError } from '@/lib/auth'
import { isSupabaseAuthEnabled } from '@/lib/supabaseBrowser'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import NavBar from '@/components/NavBar'
import {
  seedDemoData,
  seedAllDesignProposals,
  seedCachiaProposal,
  seedQ1371Estimate,
  seedQ1362Estimate,
  seedQ1356Estimate,
  seedQ1369Estimate,
  seedDesignProjects,
  seedRamondettaPayments,
  seedQ1331Estimate,
  seedQ1243Estimate,
  seedQ1266Estimate,
  seedQ1320Estimate,
  migrateProjectNames,
  migrateForemanPins,
} from '@/lib/seed'
import { recoverFromIndexedDB } from '@/lib/storage'
import { autoBackup } from '@/lib/backup'
import { isSupabaseConfigured } from '@/lib/supabase'
import { upsertProject, upsertProposal, upsertEstimate, upsertRevenue } from '@/lib/storageAsync'

// Routes that are publicly accessible without auth
const PUBLIC_PATHS = ['/proposal/', '/foreman/']

export default function LoginGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_DEFAULT_EMAIL || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Email field only appears in Supabase Auth mode. Custom-auth mode stays password-only.
  const showEmailField = isSupabaseAuthEnabled()

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    let cancelled = false
    isAuthenticatedRemote().then(ok => {
      if (cancelled) return
      setAuthed(ok)
      setChecking(false)
    })
    return () => { cancelled = true }
  }, [])

  // Public routes skip auth entirely — still wrapped so a render crash on /proposal/[token]
  // (e.g. malformed proposal data) shows the recoverable fallback rather than a blank page
  // to the actual client.
  if (isPublic) return <ErrorBoundary label="public-route">{children}</ErrorBoundary>

  if (checking) {
    return (
      <div className="min-h-screen bg-fg-bg flex items-center justify-center">
        <div className="w-5 h-5 border border-fg-border border-t-fg-heading rounded-full animate-spin" />
      </div>
    )
  }

  if (!authed) {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      // In Supabase mode, pass `email:password` so loginRemote can split it.
      // In custom mode, pass password only.
      const input = showEmailField ? `${email}:${password}` : password
      const ok = await loginRemote(input)
      if (ok) {
        // Recover from IndexedDB if localStorage is empty
        const projectsExist = localStorage.getItem('fg_projects')
        if (!projectsExist) {
          const recovered = await recoverFromIndexedDB()
          if (recovered) {
            console.log('[Formation Group] Data recovered from IndexedDB backup')
          }
        }

        // Seed all Formation data (idempotent — safe to run on every login)
        seedDemoData()
        seedAllDesignProposals()
        seedCachiaProposal()
        seedQ1371Estimate()
        seedQ1362Estimate()
        seedQ1356Estimate()
        seedQ1369Estimate()
        seedDesignProjects()
        seedRamondettaPayments()
        seedQ1331Estimate()
        seedQ1243Estimate()
        seedQ1266Estimate()
        seedQ1320Estimate()

        // Auto-backup after seeds complete
        migrateProjectNames()
        // One-time rotation of legacy `SUBURB-FOREMAN-YEAR` foreman PINs to crypto-random tokens.
        // Idempotent — only writes when a legacy PIN is found. Old foreman URLs 404 after this.
        migrateForemanPins()
        setTimeout(() => {
          autoBackup()
        }, 2000)

        // Auto-sync to Supabase if configured and not yet synced this session
        if (isSupabaseConfigured()) {
          const lastSync = localStorage.getItem('fg_supabase_last_sync')
          const now = Date.now()
          const oneHour = 60 * 60 * 1000

          if (!lastSync || now - parseInt(lastSync) > oneHour) {
            // Sync in background - don't block login
            setTimeout(async () => {
              try {
                const { loadProjects, loadProposals, loadEstimates, loadWeeklyRevenue } = await import('@/lib/storage')
                const projects = loadProjects()
                const proposals = loadProposals()
                const estimates = loadEstimates()
                const revenue = loadWeeklyRevenue()

                await Promise.all([
                  ...projects.map((p: any) => upsertProject(p)),
                  ...proposals.map((p: any) => upsertProposal(p)),
                  ...estimates.map((e: any) => upsertEstimate(e)),
                  ...revenue.map((r: any) => upsertRevenue(r)),
                ])

                localStorage.setItem('fg_supabase_last_sync', now.toString())
                console.log('[Supabase] Auto-sync complete')
              } catch (e) {
                console.warn('[Supabase] Auto-sync failed:', e)
              }
            }, 3000) // 3 second delay to let UI settle
          }
        }

        setAuthed(true)
        setError(false)
        setErrorMsg(null)
      } else {
        setError(true)
        setErrorMsg(getLastAuthError())
        setPassword('')
      }
    }

    return (
      <div className="min-h-screen bg-fg-bg flex flex-col">
        {/* Nav strip */}
        <div className="bg-fg-darker px-8 py-4 flex items-center">
          <img src="/formation-primary-white.svg" alt="Formation" className="h-7 w-auto" />
        </div>

        {/* Centred login */}
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-xs">
            {/* Primary black logo — larger */}
            <div className="flex justify-center mb-10">
              <img src="/formation-primary-black.svg" alt="Formation" className="h-10 w-auto opacity-60" />
            </div>

            <p className="text-center text-xs font-light tracking-architectural uppercase text-fg-muted mb-8">
              Enter your password to continue
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {showEmailField && (
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(false); setErrorMsg(null) }}
                  autoFocus
                  autoComplete="email"
                  className={[
                    'w-full px-4 py-3 bg-transparent border text-fg-heading placeholder-fg-muted/50',
                    'font-light text-sm tracking-wide rounded-none outline-none',
                    'focus:border-fg-heading transition-colors',
                    error ? 'border-red-400/50' : 'border-fg-border',
                  ].join(' ')}
                />
              )}
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false); setErrorMsg(null) }}
                autoFocus={!showEmailField}
                autoComplete="current-password"
                className={[
                  'w-full px-4 py-3 bg-transparent border text-fg-heading placeholder-fg-muted/50',
                  'font-light text-sm tracking-wide rounded-none outline-none',
                  'focus:border-fg-heading transition-colors',
                  error ? 'border-red-400/50' : 'border-fg-border',
                ].join(' ')}
              />
              {error && (
                <p className="text-xs text-red-400/70 font-light tracking-wide">
                  {errorMsg || 'Incorrect password'}
                </p>
              )}
              <button
                type="submit"
                className="w-full py-3 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // Authenticated app shell — the NavBar (and its top padding) live here, NOT in the root layout,
  // so public routes (/proposal/[token], /foreman/[pin]) render full-bleed without the internal
  // Formation Group nav flashing in front of the client. Wrapped in a boundary so a render crash
  // in any page shows the recoverable fallback instead of blanking the whole app.
  return (
    <ErrorBoundary label="app">
      <NavBar />
      <main className="pt-14">{children}</main>
    </ErrorBoundary>
  )
}
