// Director gate for company-level P&L (overheads / net profit). The app has one shared
// office password and no user roles, so company financials get their own server-enforced
// key: routes require the x-director-key header to match DIRECTOR_ACCESS_KEY. Defensive-
// closed like CRON_SECRET - if the env var is not set, the gate refuses everything rather
// than opening up.

export function checkDirectorKey(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.DIRECTOR_ACCESS_KEY
  if (!expected) return { ok: false, status: 503, error: 'director_gate_not_configured' }
  const provided = request.headers.get('x-director-key') || ''
  if (!provided || provided !== expected) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true }
}
