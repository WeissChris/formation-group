'use client'

import { useState, useEffect, ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { loginRemote, isAuthenticatedRemote, getLastAuthError } from '@/lib/auth'
import { isSupabaseAuthEnabled } from '@/lib/supabaseBrowser'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import NavBar from '@/components/NavBar'
import {
  seedDesignProjects,
  migrateProjectNames,
  migrateForemanPins,
} from '@/lib/seed'
import { recoverFromIndexedDB } from '@/lib/storage'
import { autoBackup } from '@/lib/backup'
import { isSupabaseConfigured } from '@/lib/supabase'
import { startLiveSync } from '@/lib/liveSync'
import { upsertProject, upsertProposal, upsertEstimate, upsertRevenue, upsertDesignProject, upsertPaymentStage, upsertActual } from '@/lib/storageAsync'

// Routes that are publicly accessible without auth
// '/site' is the supervisor cockpit — it has its OWN login (per-supervisor passcode) so it must skip
// the admin gate, exactly like the public token/PIN routes. '/signin/' is the safety board's QR
// sign-in page for workers/visitors — public by design (identity = name + phone, no account).
const PUBLIC_PATHS = ['/proposal/', '/foreman/', '/variation/', '/site', '/signin/']

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

  // Realtime cross-device sync — start once the user is authed (fresh login or already-authed on
  // load). Idempotent; stops on logout/unmount. Pulls newest-wins edits + live row changes so the
  // other computer reflects changes within ~1s instead of only on reload.
  useEffect(() => {
    if (!authed) return
    return startLiveSync()
  }, [authed])

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

        // One-time purge of the demo/test proposals. All proposals to date were tests and
        // were cleared from Supabase on 2026-06-11 (backup: fg_proposals_backup_20260611).
        // This clears the matching LOCAL copies so the auto-sync below can't re-push them.
        // Guarded by a flag so it never touches real proposals created after this date.
        if (!localStorage.getItem('fg_proposals_purged_2026_06_11')) {
          localStorage.removeItem('fg_proposals')
          localStorage.setItem('fg_proposals_purged_2026_06_11', '1')
        }

        // One-time purge of all projects + estimates (and their local-only collateral). All were
        // tests/old imports; cleared from Supabase on 2026-06-12 (backups: fg_projects_backup_,
        // fg_estimates_backup_, fg_revenue_projbackup_20260612). Clears the local copies BEFORE the
        // auto-sync below so it can't re-push them. Design-proposal revenue (design-*) is preserved.
        if (!localStorage.getItem('fg_projects_estimates_purged_2026_06_12')) {
          localStorage.removeItem('fg_projects')
          localStorage.removeItem('fg_estimates')
          localStorage.removeItem('fg_gantt')
          localStorage.removeItem('fg_actuals')
          localStorage.removeItem('fg_payment_stages')
          try {
            const rev = JSON.parse(localStorage.getItem('fg_revenue') || '[]')
            if (Array.isArray(rev)) {
              localStorage.setItem('fg_revenue', JSON.stringify(rev.filter((r: { projectId?: string }) => String(r?.projectId || '').startsWith('design-'))))
            }
          } catch { /* ignore */ }
          localStorage.setItem('fg_projects_estimates_purged_2026_06_12', '1')
        }

        // Seed Formation data (idempotent). Demo projects + estimates retired 2026-06-12 (all were
        // tests/old imports) — seeding disabled so they don't repopulate localStorage and re-sync:
        //   seedDemoData(); seedRamondettaPayments(); seedQ1371/1362/1356/1369/1331/1243/1266/1320Estimate()
        // Proposals were retired earlier (2026-06-11): seedAllDesignProposals(); seedCachiaProposal()
        seedDesignProjects()

        // Auto-backup after seeds complete
        migrateProjectNames()
        // One-time rotation of legacy `SUBURB-FOREMAN-YEAR` foreman PINs to crypto-random tokens.
        // Idempotent — only writes when a legacy PIN is found. Old foreman URLs 404 after this.
        migrateForemanPins()
        setTimeout(() => {
          autoBackup()
        }, 2000)

        // Recover data from Supabase into localStorage on login. The app only ever pushed local →
        // Supabase, never pulled back — so a cleared local copy (browser-data clear, fresh device, or a
        // one-time purge) looked like lost data even though Supabase still had it. For each dataset: if
        // the local copy is completely empty but Supabase has rows, restore them. "Only when empty"
        // means a full wipe / new device is rescued without resurrecting a record deleted during normal
        // use. Proposals additionally reconcile acceptance — a client accepts straight to Supabase and
        // the office browser never sees it, so a local "sent" is lifted to "accepted" when Supabase
        // says so (and a later push then can't downgrade it). Runs before the push-sync below.
        if (isSupabaseConfigured()) {
          setTimeout(async () => {
            try {
              const sa = await import('@/lib/storageAsync')
              const st = await import('@/lib/storage')

              // Proposals — restore-if-empty, otherwise reconcile acceptances on the rows we have
              const remoteProps = await sa.getProposals()
              const localProps = st.loadProposals()
              if (localProps.length === 0 && remoteProps.length > 0) {
                remoteProps.forEach(p => st.saveProposal(p))
                console.log(`[hydrate] restored ${remoteProps.length} proposal(s)`)
              } else {
                const byId = new Map(remoteProps.map(p => [p.id, p]))
                let reconciled = 0
                for (const local of localProps) {
                  const r = byId.get(local.id)
                  if (r && r.status === 'accepted' && local.status !== 'accepted') {
                    st.saveProposal({
                      ...local,
                      status: 'accepted',
                      acceptedAt: r.acceptedAt ?? local.acceptedAt,
                      acceptedByName: r.acceptedByName ?? local.acceptedByName,
                    })
                    reconciled++
                  }
                }
                if (reconciled) console.log(`[hydrate] reconciled ${reconciled} acceptance(s)`)
                // Add-missing: pull any proposal that exists remotely but not in this browser
                // (e.g. created on another device). The restore-if-empty branch above only rescues a
                // fully-wiped device.
                const localPropIds = new Set(localProps.map(p => p.id))
                const missingProps = remoteProps.filter(p => !localPropIds.has(p.id))
                if (missingProps.length) {
                  missingProps.forEach(x => st.saveProposal(x))
                  console.log(`[hydrate] added ${missingProps.length} missing proposal(s)`)
                }
              }

              // Projects — add-missing: pull any project that exists remotely but not in this
              // browser (e.g. created on another computer). Previously this only restored when local
              // was empty, so a device that already had projects never received new ones from elsewhere.
              {
                const remoteProj = await sa.getProjects()
                const localProjIds = new Set(st.loadProjects().map(p => p.id))
                const missingProj = remoteProj.filter(p => !localProjIds.has(p.id))
                if (missingProj.length) {
                  missingProj.forEach(x => st.saveProject(x))
                  console.log(`[hydrate] added ${missingProj.length} missing project(s)`)
                }
              }
              const remoteEst = await sa.getEstimates()
              const localEst = st.loadEstimates()
              // Add-missing: pull any estimate that exists in Supabase but not in this browser
              // (e.g. created on another computer). Previously this only restored when local was
              // empty, so a device that already had estimates never received new ones from elsewhere.
              const localEstIds = new Set(localEst.map(e => e.id))
              const missingEst = remoteEst.filter(e => !localEstIds.has(e.id))
              if (missingEst.length) {
                missingEst.forEach(x => st.saveEstimate(x))
                console.log(`[hydrate] added ${missingEst.length} missing estimate(s)`)
              }
              {
                // Reconcile variation approvals: the client approves/rejects on the public /variation
                // page (straight to Supabase), so lift a local 'sent' variation to the state the client
                // set — otherwise the office + project never see the approval.
                const byId = new Map(remoteEst.map(e => [e.id, e]))
                let reconciled = 0
                for (const local of st.loadEstimates()) {
                  if (!local.parentEstimateId) continue
                  const r = byId.get(local.id)
                  if (!r) continue
                  if (r.status === 'accepted' && local.status !== 'accepted') {
                    st.saveEstimate({ ...local, status: 'accepted', acceptedAt: r.acceptedAt ?? local.acceptedAt, acceptedByName: r.acceptedByName ?? local.acceptedByName, archived: false })
                    reconciled++
                  } else if (r.archived && !local.archived) {
                    st.saveEstimate({ ...local, status: r.status, archived: true, declinedAt: r.declinedAt, declinedByName: r.declinedByName })
                    reconciled++
                  }
                }
                if (reconciled) console.log(`[hydrate] reconciled ${reconciled} variation(s)`)
              }
              // Revenue — add-missing: pull any revenue row that exists remotely but not in this
              // browser. Design-generated rows carry stable ids (`design-<proposalId>-...`), so
              // diffing by id never duplicates them.
              {
                const remoteRev = await sa.getRevenue()
                const localRevIds = new Set(st.loadWeeklyRevenue().map(r => r.id))
                const missingRev = remoteRev.filter(r => !localRevIds.has(r.id))
                if (missingRev.length) {
                  missingRev.forEach(x => st.saveWeeklyRevenue(x))
                  console.log(`[hydrate] added ${missingRev.length} missing revenue row(s)`)
                }
              }

              // Design-delivery tracker — add-missing: pull any design project that exists remotely
              // but not in this browser (e.g. generated office-side on another device).
              {
                const remoteDP = await sa.getDesignProjects()
                const localDPIds = new Set(st.loadDesignProjects().map(d => d.id))
                const missingDP = remoteDP.filter(d => !localDPIds.has(d.id))
                if (missingDP.length) {
                  missingDP.forEach(x => st.saveDesignProject(x))
                  console.log(`[hydrate] added ${missingDP.length} missing design project(s)`)
                }
              }
              // Progress-claim stages — add-missing: pull any stage that exists remotely but not in
              // this browser, so a stage created/edited on another device surfaces here.
              {
                const remoteStages = await sa.getPaymentStages()
                const localStageIds = new Set(st.loadProgressPaymentStages().map(s => s.id))
                const missingStages = remoteStages.filter(s => !localStageIds.has(s.id))
                if (missingStages.length) {
                  missingStages.forEach(x => st.saveProgressPaymentStage(x))
                  console.log(`[hydrate] added ${missingStages.length} missing payment stage(s)`)
                }
              }

              // Gantt — restore per-project where that project's local copy is empty
              const remoteGantt = await sa.getAllGanttEntries()
              if (remoteGantt.length) {
                const byProject = new Map()
                for (const g of remoteGantt) {
                  const arr = byProject.get(g.projectId) || []
                  arr.push(g)
                  byProject.set(g.projectId, arr)
                }
                let restoredG = 0
                byProject.forEach((entries, pid) => {
                  if (st.loadGanttEntries(pid).length === 0) { st.saveGanttEntries(pid, entries); restoredG += entries.length }
                })
                if (restoredG) console.log(`[hydrate] restored ${restoredG} gantt row(s)`)
              }

              // Subcontractor packages — add-missing: pull any package that exists remotely but not in
              // this browser, so a package created/edited on another device surfaces here.
              {
                const remoteSubs = await sa.getSubcontractors()
                const localSubIds = new Set(st.loadSubcontractors().map(s => s.id))
                const missingSubs = remoteSubs.filter(s => !localSubIds.has(s.id))
                if (missingSubs.length) {
                  missingSubs.forEach(x => st.saveSubcontractor(x))
                  console.log(`[hydrate] added ${missingSubs.length} missing subcontractor package(s)`)
                }
              }

              // Progress claims — add-missing: pull any claim that exists remotely but not in this
              // browser, so a claim created/edited on another device surfaces here.
              {
                const remoteClaims = await sa.getProgressClaims()
                const localClaimIds = new Set(st.loadProgressClaims().map(c => c.id))
                const missingClaims = remoteClaims.filter(c => !localClaimIds.has(c.id))
                if (missingClaims.length) {
                  missingClaims.forEach(x => st.saveProgressClaim(x))
                  console.log(`[hydrate] added ${missingClaims.length} missing progress claim(s)`)
                }
              }

              // Gantt milestones — per-project, one row each. Write each project's
              // `fg_gantt_milestones_${projectId}` key when this browser doesn't already have it
              // (e.g. milestones set on another device).
              {
                const remoteMilestones = await sa.getAllGanttMilestones()
                let addedMilestoneProjects = 0
                for (const { projectId, milestones } of remoteMilestones) {
                  if (!localStorage.getItem(`fg_gantt_milestones_${projectId}`)) {
                    localStorage.setItem(`fg_gantt_milestones_${projectId}`, JSON.stringify(milestones))
                    addedMilestoneProjects++
                  }
                }
                if (addedMilestoneProjects) console.log(`[hydrate] added milestones for ${addedMilestoneProjects} project(s)`)
              }

              // Foreman actuals — add any the office hasn't seen. A foreman submits straight to the DB
              // from their phone, so add-missing (not restore-if-empty) is needed to surface new rows.
              const remoteActuals = await sa.getActuals()
              const localActualIds = new Set(st.loadWeeklyActuals().map(a => a.id))
              let addedActuals = 0
              for (const a of remoteActuals) {
                if (a?.id && !localActualIds.has(a.id)) { st.saveWeeklyActual(a); addedActuals++ }
              }
              if (addedActuals) console.log(`[hydrate] pulled ${addedActuals} foreman actual(s)`)
            } catch (e) {
              console.warn('[hydrate] recovery failed', e)
            }
          }, 1500)
        }

        // Auto-sync to Supabase if configured and not yet synced this session
        if (isSupabaseConfigured()) {
          const lastSync = localStorage.getItem('fg_supabase_last_sync')
          const now = Date.now()
          const oneHour = 60 * 60 * 1000

          if (!lastSync || now - parseInt(lastSync) > oneHour) {
            // Sync in background - don't block login
            setTimeout(async () => {
              try {
                const { loadProjects, loadProposals, loadEstimates, loadWeeklyRevenue, loadDesignProjects, loadProgressPaymentStages, loadWeeklyActuals } = await import('@/lib/storage')
                const projects = loadProjects()
                const proposals = loadProposals()
                const estimates = loadEstimates()
                const revenue = loadWeeklyRevenue()
                const designProjects = loadDesignProjects()
                const paymentStages = loadProgressPaymentStages()
                const actuals = loadWeeklyActuals()

                await Promise.all([
                  ...projects.map((p: any) => upsertProject(p)),
                  ...proposals.map((p: any) => upsertProposal(p)),
                  ...estimates.map((e: any) => upsertEstimate(e)),
                  ...revenue.map((r: any) => upsertRevenue(r)),
                  ...designProjects.map((d: any) => upsertDesignProject(d)),
                  ...paymentStages.map((s: any) => upsertPaymentStage(s)),
                  ...actuals.map((a: any) => upsertActual(a)),
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
