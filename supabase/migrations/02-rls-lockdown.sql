-- ── RLS LOCKDOWN ────────────────────────────────────────────────────────────
--
-- Run this AFTER you've:
--   1. Created your user in Supabase dashboard → Authentication → Users
--   2. Confirmed sign-in works in dev with NEXT_PUBLIC_AUTH_PROVIDER=supabase
--   3. Flipped that env var to 'supabase' on Vercel and confirmed login works there too
--
-- DO NOT run this before Supabase Auth is the active flow — every write would be denied
-- and you'd lock yourself out.
--
-- This migration:
--   - Replaces the "Allow all" anon-accessible policies with authenticated-only ones
--   - Adds SECURITY DEFINER RPC functions for the two public surfaces (proposal acceptance,
--     foreman timesheet) so anon access is constrained to the exact row keyed by the URL token
--   - Leaves fg_xero_tokens alone — it's already deny-all-anon (service role only)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the wide-open policies. These granted full CRUD to the anon role.
DROP POLICY IF EXISTS "Allow all" ON fg_projects;
DROP POLICY IF EXISTS "Allow all" ON fg_proposals;
DROP POLICY IF EXISTS "Allow all" ON fg_estimates;
DROP POLICY IF EXISTS "Allow all" ON fg_revenue;
DROP POLICY IF EXISTS "Allow all" ON fg_gantt;
DROP POLICY IF EXISTS "Allow all" ON fg_actuals;
DROP POLICY IF EXISTS "Allow all" ON fg_payment_stages;

-- Authenticated users get full CRUD. Single-user app — no per-row scoping needed today.
-- When you invite a second user, replace `true` with an `auth.uid() IN (…)` allow-list
-- or scope by an owner_id column.
CREATE POLICY "Authenticated full access" ON fg_projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON fg_proposals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON fg_estimates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON fg_revenue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON fg_gantt
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON fg_actuals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON fg_payment_stages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Public surfaces (anon access, narrowly scoped) ─────────────────────────

-- Proposal acceptance: anon can fetch a single proposal by its acceptance token via this RPC.
-- Using SECURITY DEFINER means the function runs with the owner's privileges, bypassing RLS
-- on the underlying table — but only the column projection here is exposed to the caller.
-- The token is the secret; possession of the URL = authorisation.
CREATE OR REPLACE FUNCTION public.get_proposal_by_token(p_token TEXT)
RETURNS SETOF fg_proposals
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM fg_proposals WHERE acceptance_token = p_token LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_proposal_by_token(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_proposal_by_token(TEXT) TO anon, authenticated;

-- Proposal acceptance: anon can UPDATE just the acceptance-related fields on a proposal
-- they hold the token for. Returns the updated row so the client can re-render.
CREATE OR REPLACE FUNCTION public.accept_proposal_by_token(
  p_token TEXT,
  p_accepted_by_name TEXT
)
RETURNS SETOF fg_proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE fg_proposals
  SET status = 'accepted',
      accepted_at = now()::TEXT,
      accepted_by_name = p_accepted_by_name,
      updated_at = now()
  WHERE acceptance_token = p_token
    AND status != 'accepted'  -- idempotent — don't re-stamp acceptedAt on re-submit
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_proposal_by_token(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_proposal_by_token(TEXT, TEXT) TO anon, authenticated;

-- Foreman timesheet: anon can fetch one project by its foreman PIN.
-- NOTE: requires a `foreman_pin` column on fg_projects — add if missing:
--   ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS foreman_pin TEXT;
ALTER TABLE fg_projects ADD COLUMN IF NOT EXISTS foreman_pin TEXT;
CREATE OR REPLACE FUNCTION public.get_project_by_foreman_pin(p_pin TEXT)
RETURNS SETOF fg_projects
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM fg_projects WHERE foreman_pin = p_pin LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_project_by_foreman_pin(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_project_by_foreman_pin(TEXT) TO anon, authenticated;

-- Foreman timesheet: anon can read the project's Gantt entries (so the schedule + budget
-- tabs render). Keyed by PIN — same authorisation rule as the project lookup itself.
CREATE OR REPLACE FUNCTION public.get_gantt_by_foreman_pin(p_pin TEXT)
RETURNS SETOF fg_gantt
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.* FROM fg_gantt g
  JOIN fg_projects p ON p.id = g.project_id
  WHERE p.foreman_pin = p_pin;
$$;
REVOKE ALL ON FUNCTION public.get_gantt_by_foreman_pin(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_gantt_by_foreman_pin(TEXT) TO anon, authenticated;

-- Foreman timesheet: anon can read the project's WeeklyActuals (so historic cost entries
-- show in the log-costs tab). Keyed by PIN.
CREATE OR REPLACE FUNCTION public.get_actuals_by_foreman_pin(p_pin TEXT)
RETURNS SETOF fg_actuals
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.* FROM fg_actuals a
  JOIN fg_projects p ON p.id = a.project_id
  WHERE p.foreman_pin = p_pin;
$$;
REVOKE ALL ON FUNCTION public.get_actuals_by_foreman_pin(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.get_actuals_by_foreman_pin(TEXT) TO anon, authenticated;

-- Foreman timesheet: anon can INSERT a WeeklyActual for the project keyed by their PIN.
-- This is the write side — the foreman needs to log supply + labour costs.
CREATE OR REPLACE FUNCTION public.insert_foreman_actual(
  p_pin TEXT,
  p_category TEXT,
  p_week_ending TEXT,
  p_supply_cost NUMERIC,
  p_labour_cost NUMERIC,
  p_notes TEXT
)
RETURNS SETOF fg_actuals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id TEXT;
BEGIN
  SELECT id INTO v_project_id FROM fg_projects WHERE foreman_pin = p_pin LIMIT 1;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Invalid PIN' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  INSERT INTO fg_actuals (id, project_id, category, week_ending, supply_cost, labour_cost, notes)
  VALUES (gen_random_uuid()::TEXT, v_project_id, p_category, p_week_ending, p_supply_cost, p_labour_cost, p_notes)
  RETURNING *;
END;
$$;
REVOKE ALL ON FUNCTION public.insert_foreman_actual(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.insert_foreman_actual(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO anon, authenticated;
