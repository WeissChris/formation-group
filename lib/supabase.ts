import { createClient } from '@supabase/supabase-js'

// .trim() defends against a trailing newline/space pasted into the Vercel env UI — those get
// URL-encoded as %0D%0A on the realtime WebSocket's ?apikey=, which Supabase rejects ("HTTP
// Authentication failed"), silently killing cross-device realtime sync.
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseKey)
