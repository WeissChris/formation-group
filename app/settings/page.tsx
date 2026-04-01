'use client'

import { useState, useEffect } from 'react'
import {
  seedDemoData,
  seedAllDesignProposals,
  seedCachiaProposal,
  seedQ1371Estimate,
  seedQ1362Estimate,
  seedQ1356Estimate,
  seedQ1369Estimate,
  seedQ1331Estimate,
  seedQ1243Estimate,
  seedQ1266Estimate,
  seedQ1320Estimate,
} from '@/lib/seed'
import { isSupabaseConfigured } from '@/lib/supabase'
import { downloadBackup, restoreFromBackup } from '@/lib/backup'
import { getXeroAuthUrl, getXeroTokens, isXeroConnected, clearXeroTokens, saveXeroTokens } from '@/lib/xero'
import { Check } from 'lucide-react'

export default function SettingsPage() {
  const [seeded, setSeeded] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [reloaded, setReloaded] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [synced, setSynced] = useState(false)
  const [lastBackupText, setLastBackupText] = useState('No backup recorded')
  const [xeroConnected, setXeroConnected] = useState(false)
  const [xeroOrgName, setXeroOrgName] = useState('')
  const supabaseConnected = isSupabaseConfigured()

  useEffect(() => {
    const lastBackup = localStorage.getItem('fg_last_backup')
    if (lastBackup) {
      setLastBackupText(`Last backup: ${new Date(lastBackup).toLocaleString('en-AU')}`)
    }
    // Init Xero state
    setXeroConnected(isXeroConnected())
    const t = getXeroTokens()
    if (t) setXeroOrgName(t.tenantName)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('xero') === 'success') {
      const tokens = {
        accessToken: params.get('access_token') || '',
        refreshToken: params.get('refresh_token') || '',
        expiresAt: Date.now() + (parseInt(params.get('expires_in') || '1800') * 1000),
        tenantId: params.get('tenant_id') || '',
        tenantName: params.get('tenant_name') || 'Formation Landscapes',
      }
      saveXeroTokens(tokens)
      // Clean URL
      window.history.replaceState({}, '', '/settings')
      setXeroConnected(true)
      setXeroOrgName(tokens.tenantName)
    } else if (params.get('xero') === 'error') {
      window.history.replaceState({}, '', '/settings')
      alert('Xero connection failed. Please try again.')
    }
  }, [])

  const handleSyncToSupabase = async () => {
    setSyncing(true)
    try {
      const { upsertProject, upsertProposal, upsertEstimate, upsertRevenue } = await import('@/lib/storageAsync')
      const { loadProjects, loadProposals, loadEstimates, loadWeeklyRevenue } = await import('@/lib/storage')

      const projects = loadProjects()
      const proposals = loadProposals()
      const estimates = loadEstimates()
      const revenue = loadWeeklyRevenue()

      await Promise.all([
        ...projects.map(p => upsertProject(p)),
        ...proposals.map(p => upsertProposal(p)),
        ...estimates.map(e => upsertEstimate(e)),
        ...revenue.map(r => upsertRevenue(r)),
      ])

      setSynced(true)
      alert(`Synced ${projects.length} projects, ${proposals.length} proposals, ${estimates.length} estimates, ${revenue.length} revenue entries to Supabase.`)
      setTimeout(() => setSynced(false), 3000)
    } finally {
      setSyncing(false)
    }
  }

  const handleSeedData = () => {
    seedDemoData()
    setSeeded(true)
    setTimeout(() => setSeeded(false), 2500)
  }

  const handleClearData = () => {
    if (!confirm('Clear all data? This cannot be undone.')) return
    localStorage.removeItem('fg_projects')
    localStorage.removeItem('fg_revenue')
    localStorage.removeItem('fg_proposals')
    setCleared(true)
    setTimeout(() => setCleared(false), 2500)
  }

  const handleReloadAll = () => {
    seedDemoData()
    seedAllDesignProposals()
    seedCachiaProposal()
    seedQ1371Estimate()
    seedQ1362Estimate()
    seedQ1356Estimate()
    seedQ1369Estimate()
    seedQ1331Estimate()
    seedQ1243Estimate()
    seedQ1266Estimate()
    seedQ1320Estimate()
    setReloaded(true)
    setTimeout(() => setReloaded(false), 2500)
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      <h1 className="text-2xl font-light tracking-wide text-fg-heading mb-10">Settings</h1>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
        {/* Left column */}
        <div className="space-y-10">
          {/* Platform info */}
          <section>
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">Platform</p>
            <div className="space-y-px bg-fg-border">
              {[
                { label: 'Platform', value: 'Formation Group' },
                { label: 'Entities', value: 'Design · Formation Landscapes · Lume Pools' },
              ].map(item => (
                <div key={item.label} className="bg-fg-bg flex items-baseline justify-between px-5 py-4">
                  <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">{item.label}</p>
                  <p className="text-sm font-light text-fg-heading text-right max-w-xs">{item.value}</p>
                </div>
              ))}
              <div className="bg-fg-bg flex items-center justify-between px-5 py-4">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Storage</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${supabaseConnected ? 'bg-emerald-400' : 'bg-fg-muted/40'}`}
                    title={supabaseConnected ? 'Supabase connected' : 'localStorage only'}
                  />
                  <p className="text-sm font-light text-fg-heading">
                    {supabaseConnected ? 'Supabase + localStorage' : 'Browser localStorage'}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs font-light text-fg-muted/60 mt-3 leading-relaxed">
              {supabaseConnected
                ? 'Supabase connected — data syncs automatically across all devices'
                : 'Local storage only — connect Supabase for cloud sync'}
            </p>
          </section>

          {/* Access */}
          <section>
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">Access</p>
            <p className="text-xs font-light text-fg-muted leading-relaxed">
              Password is set via the <code className="font-mono text-fg-heading bg-fg-border/50 px-1.5 py-0.5">NEXT_PUBLIC_APP_PASSWORD</code> environment variable.
              Default: <code className="font-mono text-fg-heading bg-fg-border/50 px-1.5 py-0.5">formation2026</code>
            </p>
          </section>
        </div>

        {/* Right column — External Links */}
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">External Links</p>
          <div className="space-y-px bg-fg-border">
            {[
              { label: 'Formation Landscapes', url: 'https://www.formationlandscapes.com.au' },
              { label: 'Lume Pools',           url: 'https://www.lumepools.com.au' },
              { label: 'Lume Quoting App',     url: 'https://lume-quoting.vercel.app' },
            ].map(item => (
              <div key={item.label} className="bg-fg-bg flex items-center justify-between px-5 py-4">
                <p className="text-sm font-light text-fg-heading">{item.label}</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-light tracking-wide text-fg-muted hover:text-fg-heading transition-colors border-b border-fg-border pb-px"
                >
                  {item.url.replace('https://', '')}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Security — full width */}
      <div className="border-t border-fg-border pt-10 mb-10">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-6">Data Security</p>
        <div className="border border-fg-border p-6 max-w-lg">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-2 h-2 rounded-full ${supabaseConnected ? 'bg-emerald-400' : 'bg-amber-500'}`} />
            <h3 className="text-sm font-medium text-fg-heading">Backup &amp; Recovery</h3>
          </div>
          <p className="text-xs text-fg-muted mb-1">{lastBackupText}</p>
          <p className="text-xs text-fg-muted mb-5">
            {supabaseConnected
              ? 'Supabase connected — data syncs automatically across all devices'
              : 'Local storage only — connect Supabase for cloud sync'}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={downloadBackup}
              className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors"
            >
              Download Backup
            </button>
            <label className="px-4 py-2 border border-fg-border text-fg-muted text-xs font-light tracking-wide uppercase hover:text-fg-heading hover:border-fg-heading transition-colors cursor-pointer">
              Restore from Backup
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (!confirm('Restore from backup? This will overwrite current data.')) return
                  try {
                    await restoreFromBackup(file)
                    alert('Data restored successfully. Please reload the page.')
                    window.location.reload()
                  } catch {
                    alert('Restore failed. Please check the backup file.')
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Data Management — full width, clearly separated */}
      <div className="border-t border-fg-border pt-10">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-6">Data Management</p>
        <p className="text-xs font-light text-fg-muted mb-6 leading-relaxed max-w-lg">
          Reload all Formation data. Safe to run anytime — existing data won&apos;t be duplicated.
        </p>
        <div className="space-y-3 max-w-lg">
          <div className="flex items-center justify-between py-4 border-t border-b border-fg-border">
            <div>
              <p className="text-sm font-light text-fg-heading">Reload All Data</p>
              <p className="text-xs font-light text-fg-muted mt-0.5">
                Populates all projects, estimates, proposals and revenue entries
              </p>
            </div>
            <button
              onClick={handleReloadAll}
              className="flex items-center gap-2 px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors"
            >
              {reloaded ? <><Check className="w-3 h-3" /> Done</> : 'Reload All'}
            </button>
          </div>

          <div className="flex items-center justify-between py-4 border-b border-fg-border">
            <div>
              <p className="text-sm font-light text-fg-heading">Load demo data</p>
              <p className="text-xs font-light text-fg-muted mt-0.5">
                Populates sample projects and revenue entries only
              </p>
            </div>
            <button
              onClick={handleSeedData}
              className="flex items-center gap-2 px-4 py-2 border border-fg-border text-xs font-light tracking-wide uppercase text-fg-heading hover:border-fg-heading transition-colors"
            >
              {seeded ? <><Check className="w-3 h-3" /> Done</> : 'Load'}
            </button>
          </div>

          <div className="flex items-center justify-between py-4 border-b border-fg-border">
            <div>
              <p className="text-sm font-light text-fg-heading">Clear all data</p>
              <p className="text-xs font-light text-fg-muted mt-0.5">
                Removes all projects, revenue, and proposals
              </p>
            </div>
            <button
              onClick={handleClearData}
              className="flex items-center gap-2 px-4 py-2 border border-red-300/30 text-xs font-light tracking-wide uppercase text-red-400/60 hover:text-red-400 hover:border-red-400/40 transition-colors"
            >
              {cleared ? <><Check className="w-3 h-3" /> Cleared</> : 'Clear'}
            </button>
          </div>

          {/* Supabase sync */}
          <div className="flex items-center justify-between py-4 border-b border-fg-border">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-light text-fg-heading">Sync to Supabase</p>
                <span
                  className={`inline-block w-2 h-2 rounded-full ${supabaseConnected ? 'bg-emerald-400' : 'bg-fg-muted/40'}`}
                />
              </div>
              <p className="text-xs font-light text-fg-muted mt-0.5">
                {supabaseConnected
                  ? 'Push all local data to the cloud database'
                  : 'Connect Supabase to enable — see SUPABASE_SETUP.md'}
              </p>
            </div>
            {supabaseConnected ? (
              <button
                onClick={handleSyncToSupabase}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors disabled:opacity-50"
              >
                {synced ? <><Check className="w-3 h-3" /> Synced</> : syncing ? 'Syncing…' : 'Sync'}
              </button>
            ) : (
              <span className="text-xs font-light text-fg-muted/50 uppercase tracking-wide">Not connected</span>
            )}
          </div>
        </div>
      </div>

      {/* Xero Integration */}
      <div className="border border-fg-border p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-fg-heading">Xero Integration</h3>
            <p className="text-xs text-fg-muted mt-1">
              Connect to Xero to automatically import bills, invoices and financial data.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${xeroConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-fg-muted">{xeroConnected ? `Connected: ${xeroOrgName}` : 'Not connected'}</span>
          </div>
        </div>

        {xeroConnected ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                // TODO: trigger sync
                alert('Sync coming soon — connecting Xero data to projects')
              }}
              className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors"
            >
              Sync Now
            </button>
            <button
              onClick={() => { clearXeroTokens(); setXeroConnected(false) }}
              className="px-4 py-2 border border-red-200 text-red-400 text-xs font-light tracking-wide uppercase hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => { window.location.href = getXeroAuthUrl() }}
            className="px-4 py-2 bg-[#13B5EA] text-white text-xs font-light tracking-wide uppercase hover:bg-[#0EA5D4] transition-colors"
            disabled={!process.env.NEXT_PUBLIC_XERO_CLIENT_ID}
          >
            Connect Xero
          </button>
        )}

        {!process.env.NEXT_PUBLIC_XERO_CLIENT_ID && (
          <p className="text-xs text-amber-600 mt-2">
            Add NEXT_PUBLIC_XERO_CLIENT_ID and XERO_CLIENT_SECRET to Vercel environment variables to enable.
          </p>
        )}
      </div>

      {/* Footer version */}
      <p className="text-2xs font-light text-fg-muted/40 mt-12">v1.0.0</p>
    </div>
  )
}
