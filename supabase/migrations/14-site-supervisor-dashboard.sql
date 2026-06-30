-- Site Supervisor / Foreman dashboard (/site) — schema additions.
-- Apply manually in the Supabase SQL editor (same flow as the other migrations here).
--
-- 1. Supervisors get a server-only login passcode hash (scrypt$salt$hash). The admin sets/resets it
--    from Settings; it is NEVER selected by the client supervisor flow — only the server reads it (via
--    supabaseAdmin) to verify a /site login. So no client mapper change is needed.
ALTER TABLE fg_supervisors ADD COLUMN IF NOT EXISTS passcode_hash TEXT;

-- 2. Projects gain client contact + site access details surfaced in the supervisor cockpit. These did
--    not exist before (a project held only client_name + address).
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS client_phone TEXT;
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS site_access_notes TEXT;

-- Note: all /site reads and writes go through server API routes using the service role
-- (supabaseAdmin), authorised by a signed supervisor session cookie and an ownership check
-- (project.foreman = session supervisor name). No new RLS policies or anon grants are required —
-- unlike the /foreman/[pin] portal, the cockpit never touches Supabase from the browser with the
-- anon role.
