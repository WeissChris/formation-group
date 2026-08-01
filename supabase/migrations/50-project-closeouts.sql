-- Job closeout records - the frozen final result of every completed project, captured once
-- when a job reaches complete/invoiced (cron backstop in lib/serverCloseouts). This is the
-- estimating feedback loop: quoted margin vs final margin, job over job, forever.
--
-- Service-role only (RLS on, no policies) - read via /api/projects/closeouts.

create table if not exists fg_project_closeouts (
  project_id text primary key,
  entity text not null default 'formation',
  name text not null default '',
  closed_at date not null,
  final_revenue numeric not null default 0,      -- revised contract (base + accepted variations)
  invoiced_total numeric not null default 0,     -- sent + paid claims at closeout
  final_cost numeric not null default 0,
  final_gp_dollars numeric not null default 0,
  final_gp_pct numeric not null default 0,
  quoted_margin_pct numeric not null default 0,
  target_margin_pct numeric not null default 0,
  cost_basis text not null default 'estimate',   -- 'xero' when live cost data existed
  cost_by_account jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table fg_project_closeouts enable row level security;
