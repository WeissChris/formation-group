-- Per-proposal custom video URLs (applied 2026-06-11).
--
-- The proposal editor (app/design/[id]) has a "Proposal Videos" section that lets a welcome
-- video and a design-process video be set per proposal. Those values had no Supabase columns,
-- were not written by upsertProposal, and were not read by the public mapper — so a custom
-- video never reached the client, who always saw the two default Formation videos.
--
-- These columns + the matching write (storageAsync.upsertProposal) and reads
-- (publicData.mapProposalRow, storageAsync.mapProposal) close that gap. The public RPC
-- get_proposal_by_token returns SETOF fg_proposals, so it picks up the new columns with no change.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS welcome_video_url TEXT;
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS process_video_url TEXT;
