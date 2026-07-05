import { backupToIndexedDB, loadKeyFromIndexedDB } from './storage'

export function autoBackup(): void {
  if (typeof window === 'undefined') return
  try {
    // One-time migration first (unconditional): purge old localStorage rolling backups — over 1MB
    // each on real data, duplicated inside the same ~5MB quota they were meant to protect. Their
    // presence pushed real saves (estimates, takeoffs) into silent QuotaExceeded failures.
    Object.keys(localStorage)
      .filter(k => k.startsWith('fg_backup_'))
      .forEach(k => localStorage.removeItem(k))

    // Throttle: one snapshot per 12 hours is plenty (this now also runs on every authenticated load).
    const last = Date.parse(localStorage.getItem('fg_last_backup') || '') || 0
    if (Date.now() - last < 12 * 3600 * 1000) return

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        projects: JSON.parse(localStorage.getItem('fg_projects') || '[]'),
        proposals: JSON.parse(localStorage.getItem('fg_proposals') || '[]'),
        estimates: JSON.parse(localStorage.getItem('fg_estimates') || '[]'),
        revenue: JSON.parse(localStorage.getItem('fg_revenue') || '[]'),
        gantt: JSON.parse(localStorage.getItem('fg_gantt') || '[]'),
        actuals: JSON.parse(localStorage.getItem('fg_actuals') || '[]'),
        paymentStages: JSON.parse(localStorage.getItem('fg_payment_stages') || '[]'),
        designProjects: JSON.parse(localStorage.getItem('fg_design_projects') || '[]'),
      },
    }

    // Rolling backups (last 3) live in IndexedDB, which has its own multi-hundred-MB quota.
    // They used to be written INTO localStorage — duplicating every store inside the same ~5MB
    // budget they were meant to protect, which pushed real saves into QuotaExceeded failures.
    void loadKeyFromIndexedDB('fg_backup_rolling').then(existing => {
      const list = Array.isArray(existing) ? existing : []
      void backupToIndexedDB('fg_backup_rolling', [...list, backup].slice(-3))
    })

    // Also store last backup timestamp
    localStorage.setItem('fg_last_backup', new Date().toISOString())

    console.log('[Formation Group] Auto-backup complete at', new Date().toLocaleString())
  } catch (e) {
    console.warn('[Formation Group] Backup failed:', e)
  }
}

export function downloadBackup(): void {
  try {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        projects: JSON.parse(localStorage.getItem('fg_projects') || '[]'),
        proposals: JSON.parse(localStorage.getItem('fg_proposals') || '[]'),
        estimates: JSON.parse(localStorage.getItem('fg_estimates') || '[]'),
        revenue: JSON.parse(localStorage.getItem('fg_revenue') || '[]'),
        gantt: JSON.parse(localStorage.getItem('fg_gantt') || '[]'),
        actuals: JSON.parse(localStorage.getItem('fg_actuals') || '[]'),
        paymentStages: JSON.parse(localStorage.getItem('fg_payment_stages') || '[]'),
        designProjects: JSON.parse(localStorage.getItem('fg_design_projects') || '[]'),
      },
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `formation-group-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('Backup download failed: ' + e)
  }
}

export function restoreFromBackup(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target?.result as string)
        if (!backup.data) throw new Error('Invalid backup file')

        const { data } = backup
        if (data.projects?.length) localStorage.setItem('fg_projects', JSON.stringify(data.projects))
        if (data.proposals?.length) localStorage.setItem('fg_proposals', JSON.stringify(data.proposals))
        if (data.estimates?.length) localStorage.setItem('fg_estimates', JSON.stringify(data.estimates))
        if (data.revenue?.length) localStorage.setItem('fg_revenue', JSON.stringify(data.revenue))
        if (data.gantt?.length) localStorage.setItem('fg_gantt', JSON.stringify(data.gantt))
        if (data.actuals?.length) localStorage.setItem('fg_actuals', JSON.stringify(data.actuals))
        if (data.paymentStages?.length) localStorage.setItem('fg_payment_stages', JSON.stringify(data.paymentStages))
        if (data.designProjects?.length) localStorage.setItem('fg_design_projects', JSON.stringify(data.designProjects))

        resolve()
      } catch (err) {
        reject(err)
      }
    }
    reader.readAsText(file)
  })
}
