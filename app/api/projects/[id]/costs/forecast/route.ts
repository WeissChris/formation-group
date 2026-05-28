import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/**
 * POST /api/projects/:id/costs/forecast
 *
 * Body: { account_code, forecast_final?, comment? }
 *
 * Upserts a per-account forecast override for a project. NULL `forecast_final` is allowed
 * and means "clear the override, fall back to the derived value (MAX of actual/budget)".
 *
 * Same-origin gated. The aggregator (live-jobs route) reads from fg_project_cost_forecast
 * to compute the project's "Forecast final cost" column.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 })
  }

  let body: { account_code?: string; forecast_final?: number | null; comment?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }

  if (typeof body.account_code !== 'string' || !body.account_code.trim()) {
    return NextResponse.json({ ok: false, error: 'missing_account_code' }, { status: 400 })
  }

  // If both fields are null/empty, treat as a delete (no override, no comment)
  const forecastFinal = body.forecast_final == null ? null : Number(body.forecast_final)
  const comment = body.comment ?? null
  const isCleared = forecastFinal === null && (comment === null || comment.trim() === '')

  if (isCleared) {
    await supabaseAdmin
      .from('fg_project_cost_forecast')
      .delete()
      .eq('project_id', params.id)
      .eq('account_code', body.account_code)
    return NextResponse.json({ ok: true, cleared: true })
  }

  const { error } = await supabaseAdmin.from('fg_project_cost_forecast').upsert({
    project_id: params.id,
    account_code: body.account_code,
    forecast_final: forecastFinal,
    comment: comment,
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
