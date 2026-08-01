-- Company budget / targets, one row per Australian financial year (July-June).
-- Replaces the hardcoded 40% GP target literals and gives the yearly budget tracking on
-- /revenue something real to compare against. Edited from Settings via /api/company/budget.
--
-- Service-role only (RLS on, no policies) - reads and writes go through the API route.

create table if not exists fg_company_budget (
  fy_start_year int primary key,                     -- 2026 = FY 2026-27
  revenue_target_formation numeric not null default 0,
  revenue_target_lume numeric not null default 0,
  revenue_target_design numeric not null default 0,
  gp_target_pct numeric not null default 40,
  overhead_budget_monthly numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table fg_company_budget enable row level security;
