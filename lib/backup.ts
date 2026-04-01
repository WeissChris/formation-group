export function autoBackup(): void {
  if (typeof window === 'undefined') return
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

    // Store as a rolling backup in localStorage (keeps last 3)
    const backupKey = `fg_backup_${Date.now()}`
    localStorage.setItem(backupKey, JSON.stringify(backup))

    // Clean up old backups (keep only last 3)
    const backupKeys = Object.keys(localStorage)
      .filter(k => k.startsWith('fg_backup_'))
      .sort()
    while (backupKeys.length > 3) {
      localStorage.removeItem(backupKeys.shift()!)
    }

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
