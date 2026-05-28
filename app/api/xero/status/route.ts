import { NextResponse } from 'next/server'
import { getStatus } from '@/lib/serverXero'

export const runtime = 'nodejs'

/**
 * Connection status for the Settings page.
 * Returns only safe public fields — never the tokens themselves.
 */
export async function GET() {
  const status = await getStatus()
  return NextResponse.json(status)
}
