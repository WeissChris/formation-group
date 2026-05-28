import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Get all Fridays in a month (month is 0-indexed)
export function getFridaysInMonth(year: number, month: number): Date[] {
  const fridays: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getDay() !== 5) date.setDate(date.getDate() + 1)
  while (date.getMonth() === month) {
    fridays.push(new Date(date))
    date.setDate(date.getDate() + 7)
  }
  return fridays
}

// Format currency AUD
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Get financial year (Jul-Jun)
export function getFinancialYear(date: Date): string {
  const month = date.getMonth()
  const year = date.getFullYear()
  if (month >= 6) return `FY ${year}-${String(year + 1).slice(2)}`
  return `FY ${year - 1}-${String(year).slice(2)}`
}

// Generate a UUID
export function generateId(): string {
  return crypto.randomUUID()
}

// Snap date to "this working week's Friday".
// Sun-Thu → forward to upcoming Friday; Fri → stay; Sat → BACK one day to yesterday's Friday.
// (Previously Sat jumped forward 6 days to NEXT Friday, which silently landed cost-tracker entries
//  a week ahead of the user's intent.)
export function snapToFriday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // 0=Sun, 1=Mon, ... 5=Fri, 6=Sat
  const diff = day === 6 ? -1 : (5 - day)
  if (diff !== 0) d.setDate(d.getDate() + diff)
  return d
}

// Format a date as DD/MM
export function formatDayMonth(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Format a date as YYYY-MM-DD using LOCAL date components.
//
// The previous implementation `date.toISOString().split('T')[0]` produces a UTC-shifted date
// string. For a midnight-local Date (which is what `new Date(year, month, day)` creates),
// AEST (+10) shifts back 10h to the previous day. Net effect: every "day identifier" in dev
// was off-by-one relative to what the user typed — and production (UTC) didn't show the bug.
// Bugs that don't reproduce locally are the worst kind, so we use local components instead.
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Month names
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Generate a foreman PIN — a high-entropy URL-safe token (16 bytes / 128 bits, base32-ish).
 *
 * Previously this returned a guessable string like `BEACH-CAM-2026` derived from project + year.
 * That's a brute-force vector — anyone who guesses the slug can read schedule + budget AND
 * write cost rows that flow into P&L. The new format is unguessable in any reasonable time.
 *
 * Old links 404 once regenerated; that's the intended behaviour. Hand the new link to the
 * foreman by SMS/email after rotating.
 */
export function generateForemanPin(): string {
  // crypto.randomUUID() gives 122 bits of entropy; strip the dashes for a clean URL slug.
  return crypto.randomUUID().replace(/-/g, '').toUpperCase()
}

/**
 * Detect the legacy "SUBURB-FOREMAN-YEAR" PIN format so a one-time migration can replace it
 * with a crypto-random token. Matches strings like `BEACH-CAM-2026` exactly.
 */
export function isLegacyForemanPin(pin: string | undefined): boolean {
  if (!pin) return false
  return /^[A-Z0-9]+-[A-Z]+-\d{4}$/.test(pin)
}

// Extract suburb from address string
export function extractSuburb(address: string): string {
  if (!address) return ''
  // Try to extract suburb from common Australian address formats
  // e.g. "45 Beach Road, Mentone VIC" → "Mentone"
  // e.g. "45 Beach Rd, Mentone" → "Mentone"
  // e.g. "165 Serpells Road, Templestowe VIC 3107" → "Templestowe"
  const parts = address.split(',')
  if (parts.length >= 2) {
    // Second part usually contains suburb + state + postcode
    const suburbPart = parts[1].trim()
    // Remove state abbreviations and postcodes
    return suburbPart.replace(/\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\s*\d*/i, '').trim()
  }
  // Single part — try to find a word after the street
  const words = address.trim().split(' ')
  // Skip street number and street name (first 2-3 words typically)
  return words.length > 3 ? words.slice(-2, -1)[0] : ''
}

// Extract first name from client name string
export function extractFirstName(clientName: string): string {
  if (!clientName) return ''
  // Handle "First and Second Last" → use "First"
  // Handle "First Last" → use "First"
  const first = clientName.split(' ')[0]
  return first
}

// Extract last name from client name string
export function extractLastName(clientName: string): string {
  if (!clientName) return ''
  const parts = clientName.trim().split(' ')
  // Last word is typically the surname
  return parts[parts.length - 1]
}

// Generate standardised project name
export function generateProjectName(address: string, clientName: string): string {
  const suburb = extractSuburb(address)
  const firstName = extractFirstName(clientName)
  const lastName = extractLastName(clientName)

  if (!suburb && !firstName) return clientName || 'New Project'
  if (!suburb) return `${firstName} ${lastName}`.trim()
  if (!firstName) return suburb

  return `${suburb} \u2013 ${firstName} ${lastName}`.trim()
}
