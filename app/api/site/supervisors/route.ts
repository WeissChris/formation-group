import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/site/supervisors -> [{ id, name }] for supervisors who have a passcode set (i.e. can log in).
 * Powers the /site login picker. Returns names + ids only (no hashes); exposing staff first names is
 * acceptable and avoids the foreman typing their exact name.
 */
export async function GET() {
  if (!supabaseAdmin) return NextResponse.json({ supervisors: [] })
  const { data } = await supabaseAdmin
    .from('fg_supervisors')
    .select('id, name, passcode_hash')
    .order('name')
  const supervisors = (data || [])
    .filter(s => !!s.passcode_hash)
    .map(s => ({ id: s.id as string, name: s.name as string }))
  return NextResponse.json({ supervisors })
}
