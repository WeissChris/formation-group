#!/usr/bin/env node
/**
 * Generate an APP_PASSWORD_HASH value for the Formation Group server-side auth.
 *
 *   node scripts/hash-password.mjs <password>
 *
 * Prints `scrypt$<hex-salt>$<hex-hash>` — paste into your Vercel env var APP_PASSWORD_HASH
 * (NOT NEXT_PUBLIC_*, this must stay server-only). After it's set, the old plaintext
 * NEXT_PUBLIC_APP_PASSWORD can be removed and the password will no longer ship in the bundle.
 */
import { scryptSync, randomBytes } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs <password>')
  process.exit(1)
}

const salt = randomBytes(16)
const hash = scryptSync(password, salt, 64)

console.log(`scrypt$${salt.toString('hex')}$${hash.toString('hex')}`)
