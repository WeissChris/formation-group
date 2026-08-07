// Server-side Supabase client (service role). Used only inside API route handlers
// — the service role key must never reach the browser.
//
// When the env vars are absent the helpers return null and the booking store
// transparently falls back to an in-memory demo store, so the site still runs.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  if (_client) return _client;
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && serviceKey);
}
