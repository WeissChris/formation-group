-- ─────────────────────────────────────────────────────────────────────────────
-- 12 — Redact internal-only fields from the public proposal RPCs
--
-- get_proposal_by_token / accept_proposal_by_token run SECURITY DEFINER and return
-- SETOF fg_proposals (every column) to the anon role, so a client viewing their own
-- proposal link receives internal fields in the network response even though the page
-- never renders them: `notes` (internal commentary about the deal), `cc_emails` (who
-- at Formation is copied), and `email_message` (the internal cover-email text).
--
-- Fix: blank those three columns while preserving the SETOF fg_proposals shape via
-- jsonb_populate_record, so new columns still auto-pass-through (the reason these were
-- SELECT *). The public page consumes none of the three, so nothing breaks.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_proposal_by_token(p_token TEXT)
RETURNS SETOF fg_proposals
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (jsonb_populate_record(
            NULL::fg_proposals,
            to_jsonb(p) || jsonb_build_object('notes', NULL, 'cc_emails', NULL, 'email_message', NULL)
         )).*
  FROM fg_proposals p
  WHERE p.acceptance_token = p_token
  LIMIT 1;
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
  WITH updated AS (
    UPDATE fg_proposals
    SET status = 'accepted',
        accepted_at = now()::TEXT,
        accepted_by_name = p_accepted_by_name,
        updated_at = now()
    WHERE acceptance_token = p_token
      AND status != 'accepted'  -- idempotent — don't re-stamp acceptedAt on re-submit
    RETURNING *
  )
  SELECT (jsonb_populate_record(
            NULL::fg_proposals,
            to_jsonb(u) || jsonb_build_object('notes', NULL, 'cc_emails', NULL, 'email_message', NULL)
         )).*
  FROM updated u;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_proposal_by_token(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_proposal_by_token(TEXT, TEXT) TO anon, authenticated;
