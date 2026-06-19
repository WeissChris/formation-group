-- ─────────────────────────────────────────────────────────────────────────────
-- 13 — Stop the public variation RPCs leaking Formation's cost & margin
--
-- get_variation_by_token / approve_variation_by_token / reject_variation_by_token
-- run SECURITY DEFINER and returned `SELECT *` / `RETURNING *` of fg_estimates to the
-- anon role. The line_items JSONB carries per-line `unitCost`, `total` (cost) and
-- `markupPercent` — so a client opening their variation link received Formation's cost
-- and markup on every line in the network response (e.g. unitCost 120 / total 360 /
-- markupPercent 45 next to the $522 price). default_markup_* and category_notes leaked
-- the pricing strategy too. The public page only ever renders description + the
-- customer contract value + the cover message.
--
-- These RPCs also never lived in a repo migration (created ad-hoc in the DB). This
-- migration is the canonical definition AND the fix.
--
-- Fix: `_redact_variation` rebuilds each row before it leaves the database —
--   • line_items reduced to {id, description, displayOrder, revenue}, dropping every
--     cost/markup field and any disabled (option) lines;
--   • `revenue` is set to the per-line CUSTOMER contract value — line revenue plus its
--     share of the project markup (on its own cost), times the rounding factor — so the
--     page's totals are unchanged WITHOUT the client ever seeing cost or markup;
--   • project_markups / rounding_mode are neutralised ([] / 'none') so the client-side
--     calc reproduces the same total purely from the baked revenue;
--   • default_markup_formation/subcontractor zeroed, notes / category_notes blanked.
-- The SETOF fg_estimates shape is preserved, so publicData.mapVariationRow is untouched.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: redact one variation row to its customer-facing shape. Operates purely on the
-- passed composite (no table access), so it stays SECURITY INVOKER and is revoked from
-- public — only the SECURITY DEFINER RPCs below (running as owner) may call it.
CREATE OR REPLACE FUNCTION public._redact_variation(v public.fg_estimates)
RETURNS public.fg_estimates
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  markup_pct numeric := 0;
  line_rev   numeric := 0;
  total_cost numeric := 0;
  marked_up  numeric := 0;
  ex_gst     numeric := 0;
  factor     numeric := 1;
  redacted   jsonb   := '[]'::jsonb;
BEGIN
  -- Sum the project markup percentages (waste/contingency etc.)
  SELECT coalesce(sum((m->>'percent')::numeric), 0) INTO markup_pct
  FROM jsonb_array_elements(coalesce(v.project_markups, '[]'::jsonb)) m;

  -- Active-line aggregates (a line is active unless enabled === false), mirroring the
  -- TS activeLineItems()/getEstimateContract() so the baked revenue lands on the same
  -- ex-GST contract the office sees.
  SELECT coalesce(sum((e->>'revenue')::numeric), 0),
         coalesce(sum((e->>'total')::numeric), 0)
  INTO line_rev, total_cost
  FROM jsonb_array_elements(coalesce(v.line_items, '[]'::jsonb)) e
  WHERE coalesce((e->>'enabled')::boolean, true);

  marked_up := line_rev + total_cost * markup_pct / 100;       -- BuildXact-style: markup on cost
  ex_gst := CASE v.rounding_mode
    WHEN 'ten'      THEN round(marked_up / 10) * 10
    WHEN 'hundred'  THEN round(marked_up / 100) * 100
    WHEN 'thousand' THEN round(marked_up / 1000) * 1000
    ELSE marked_up END;
  factor := CASE WHEN marked_up > 0 THEN ex_gst / marked_up ELSE 1 END;

  -- Rebuild line_items: customer-facing fields only, revenue = lineContractValue, active
  -- lines only, original order preserved.
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'id',           e->'id',
             'description',  e->'description',
             'displayOrder', e->'displayOrder',
             'revenue', round(
               ((coalesce((e->>'revenue')::numeric, 0)
                 + coalesce((e->>'total')::numeric, 0) * markup_pct / 100) * factor)::numeric, 2)
           ) ORDER BY ord
         ), '[]'::jsonb) INTO redacted
  FROM jsonb_array_elements(coalesce(v.line_items, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord)
  WHERE coalesce((e->>'enabled')::boolean, true);

  v.line_items                  := redacted;
  v.project_markups             := '[]'::jsonb;
  v.rounding_mode               := 'none';
  v.default_markup_formation    := 0;
  v.default_markup_subcontractor:= 0;
  v.notes                       := NULL;
  v.category_notes              := NULL;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public._redact_variation(public.fg_estimates) FROM public;

-- ── Public RPCs (canonical definitions) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_variation_by_token(p_token text)
RETURNS SETOF public.fg_estimates
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (public._redact_variation(e)).*
  FROM public.fg_estimates e
  WHERE e.acceptance_token = p_token
    AND e.parent_estimate_id IS NOT NULL AND e.parent_estimate_id <> ''
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.approve_variation_by_token(p_token text, p_approved_by_name text)
RETURNS SETOF public.fg_estimates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v public.fg_estimates;
BEGIN
  UPDATE public.fg_estimates
  SET status = 'accepted', accepted_at = now()::text, accepted_by_name = p_approved_by_name,
      archived = false, updated_at = now()
  WHERE acceptance_token = p_token
    AND parent_estimate_id IS NOT NULL AND parent_estimate_id <> ''
    AND status <> 'accepted'                 -- idempotent: don't re-stamp on re-submit
  RETURNING * INTO v;
  IF v.id IS NOT NULL THEN
    RETURN NEXT public._redact_variation(v);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_variation_by_token(p_token text, p_rejected_by_name text)
RETURNS SETOF public.fg_estimates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v public.fg_estimates;
BEGIN
  UPDATE public.fg_estimates
  SET status = 'declined', archived = true, declined_at = now()::text, declined_by_name = p_rejected_by_name,
      updated_at = now()
  WHERE acceptance_token = p_token
    AND parent_estimate_id IS NOT NULL AND parent_estimate_id <> ''
    AND status <> 'accepted'                 -- never overturn an accepted variation
  RETURNING * INTO v;
  IF v.id IS NOT NULL THEN
    RETURN NEXT public._redact_variation(v);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_variation_by_token(text) FROM public;
REVOKE ALL ON FUNCTION public.approve_variation_by_token(text, text) FROM public;
REVOKE ALL ON FUNCTION public.reject_variation_by_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_variation_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_variation_by_token(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_variation_by_token(text, text) TO anon, authenticated;
