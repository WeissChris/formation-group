import { NextResponse } from 'next/server'
import { getStatus } from '@/lib/serverXero'

export const runtime = 'nodejs'
// Reads live token state from the DB and takes no request input, so Next/Vercel would
// otherwise statically cache the response at build time and serve a frozen "connected"
// value forever (the reconnect would never show). force-dynamic = always run fresh.
export const dynamic = 'force-dynamic'

/**
 * Connection status for the Settings page.
 * Returns only safe public fields — never the tokens themselves.
 */
export async function GET() {
  const status = await getStatus()
  return NextResponse.json(status)
}
