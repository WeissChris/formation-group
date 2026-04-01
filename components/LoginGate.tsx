'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { checkPassword, setAuth, isAuthenticated } from '@/lib/auth'
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
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    setAuthed(isAuthenticated())
    setChecking(false)
  }, [])

  // Public routes skip auth entirely
  if (isPublic) return <>{children}</>

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
      if (checkPassword(password)) {
        setAuth()

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
      } else {
        setError(true)
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
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false) }}
                autoFocus
                className={[
                  'w-full px-4 py-3 bg-transparent border text-fg-heading placeholder-fg-muted/50',
                  'font-light text-sm tracking-wide rounded-none outline-none',
                  'focus:border-fg-heading transition-colors',
                  error ? 'border-red-400/50' : 'border-fg-border',
                ].join(' ')}
              />
              {error && (
                <p className="text-xs text-red-400/70 font-light tracking-wide">Incorrect password</p>
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

  return <>{children}</>
}
