-- Company monthly P&L totals, pulled from the whole-company Xero Profit & Loss report
-- (lib/xeroPnlSync). This is the ONLY table in the app allowed to carry overheads / net
-- profit, and it is company-scope: the per-project cost feed stays GP-only (overheads are
-- still filtered out at the puller and NEVER stored per project).
--
-- Service-role only (RLS on, no policies) - surfaced exclusively through the director-gated
-- /api/company/pnl route.

create table if not exists fg_company_pnl_months (
  month date not null,                              -- first day of the month
  entity text not null default 'formation',
  revenue numeric not null default 0,               -- account class REVENUE
  cost_of_sales numeric not null default 0,         -- account type DIRECTCOSTS (same rule as the GP feed)
  gross_profit numeric not null default 0,          -- revenue - cost_of_sales
  overheads numeric not null default 0,             -- every other EXPENSE-class account
  net_profit numeric not null default 0,            -- gross_profit - overheads
  overheads_by_account jsonb not null default '{}'::jsonb,
  pulled_at timestamptz not null default now(),
  primary key (month, entity)
);

alter table fg_company_pnl_months enable row level security;
