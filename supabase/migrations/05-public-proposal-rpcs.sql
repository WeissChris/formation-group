-- ── PUBLIC PROPOSAL RPCs (applied 2026-06-11) ───────────────────────────────
--
-- WHY THIS EXISTS SEPARATELY FROM 02-rls-lockdown.sql:
-- The /proposal/[token] page reads proposals via the SECURITY DEFINER function
-- get_proposal_by_token() (see lib/publicData.ts). That function was authored in
-- 02-rls-lockdown.sql, but 02 ALSO drops the "Allow all" anon policies and switches
-- the tables to authenticated-only — which would lock this app out, because it does
-- NOT use Supabase Auth (it uses custom auth + the anon key for admin writes).
--
-- So 02 was never applied, and the proposal RPCs went missing in production. The admin
-- browser masked it via its localStorage fallback; any external client / phone (empty
-- localStorage) got "This proposal link is invalid or has expired."
--
-- This migration applies JUST the two proposal functions — no policy changes, no lockout
-- risk. They bypass RLS only for the single row keyed by the secret token in the URL.
--
-- The foreman-timesheet RPCs in 02 (get_project_by_foreman_pin, get_gantt_by_foreman_pin,
-- get_actuals_by_foreman_pin, insert_foreman_actual) have the SAME latent bug and can be
-- applied the same way (additive, SECURITY DEFINER, no policy change) when needed.
-- ─────────────────────────────────────────────────────────────────────────────

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
