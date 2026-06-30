// Server-only helpers shared by the /api/site/* routes. Every cockpit read/write is authorised by a
// signed supervisor session cookie + an ownership check (project.foreman === session supervisor name),
// and runs through the service role (supabaseAdmin) so the browser never holds Supabase write access.
//
// Do NOT import from a client component.

import type { NextRequest } from 'next/server'
import { supabaseAdmin } from './supabaseAdmin'
import { verifySiteSession, SITE_SESSION_COOKIE, type SiteSessionPayload } from './siteAuth'

/** Resolve the supervisor session from a request, or null if missing/invalid/expired. */
export function siteSessionFrom(request: NextRequest): SiteSessionPayload | null {
  return verifySiteSession(request.cookies.get(SITE_SESSION_COOKIE)?.value)
}

/**
 * Load a project row IF it belongs to the session supervisor (foreman name match). Returns null if the
 * project doesn't exist, admin isn't configured, or it belongs to someone else. This is THE ownership
 * gate every project-scoped route shares.
 */
export async function loadOwnedProjectRow(
  session: SiteSessionPayload,
  projectId: string,
): Promise<Record<string, unknown> | null> {
  if (!supabaseAdmin) return null
  const { data } = await supabaseAdmin.from('fg_projects').select('*').eq('id', projectId).maybeSingle()
  if (!data) return null
  if (((data.foreman as string) || '') !== session.name) return null
  return data as Record<string, unknown>
}
